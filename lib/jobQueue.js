/**
 * Job Queue Module
 * 
 * Provides an in-memory job queue with:
 * - Global concurrency limiting
 * - Job status tracking
 * - Automatic job expiration
 * - Worker loop with backpressure
 * 
 * For production at scale, replace with Redis + Bull/BullMQ.
 * This in-memory implementation works well for single-instance deployments.
 */

import { 
  sleep, 
  jitter, 
  calculateSmoothingDelay, 
  generateJobId, 
  now,
  estimateWaitTime 
} from './trafficUtils'
import { unregisterJob } from './rateLimit'

// Configuration from environment
const CONFIG = {
  maxConcurrentJobsGlobal: parseInt(process.env.QUEUE_MAX_CONCURRENT_JOBS_GLOBAL || '5'),
  maxQueueSize: parseInt(process.env.QUEUE_MAX_SIZE || '100'),
  maxJitterMs: parseInt(process.env.QUEUE_MAX_JITTER_MS || '500'),
  jitterEnabled: process.env.QUEUE_JITTER_ENABLED !== 'false',
  jobExpirationMs: parseInt(process.env.QUEUE_JOB_EXPIRATION_MS || '3600000'), // 1 hour
  cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
}

// Job status enum
export const JobStatus = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
}

// In-memory job storage
// Structure: Map<jobId, Job>
const jobs = new Map()

// Queue of pending job IDs (FIFO)
const queue = []

// Set of currently running job IDs
const runningJobs = new Set()

// Metrics
const metrics = {
  totalJobsEnqueued: 0,
  totalJobsCompleted: 0,
  totalJobsFailed: 0,
  totalWaitTimeMs: 0,
  totalRuntimeMs: 0,
  lastCleanup: Date.now(),
}

// Worker state
let workerRunning = false

/**
 * Job object structure
 * @typedef {Object} Job
 * @property {string} id - Unique job ID
 * @property {string} status - Current status
 * @property {string} type - Job type (e.g., 'backtest', 'optimize')
 * @property {Object} payload - Job parameters
 * @property {string} userId - Identifier of user who created the job
 * @property {number} progress - Progress percentage (0-100)
 * @property {*} result - Job result when completed
 * @property {string|null} error - Error message if failed
 * @property {string} createdAt - ISO timestamp
 * @property {string|null} startedAt - ISO timestamp when started
 * @property {string|null} completedAt - ISO timestamp when completed
 * @property {number} queuePosition - Position in queue when enqueued
 */

/**
 * Create a new job object
 * @param {string} type - Job type
 * @param {Object} payload - Job parameters
 * @param {string} userId - User identifier
 * @returns {Job}
 */
function createJob(type, payload, userId) {
  return {
    id: generateJobId(),
    status: JobStatus.QUEUED,
    type,
    payload,
    userId,
    progress: 0,
    result: null,
    error: null,
    createdAt: now(),
    startedAt: null,
    completedAt: null,
    queuePosition: queue.length,
  }
}

/**
 * Enqueue a new job
 * Fast operation - returns immediately with job ID
 * 
 * @param {string} type - Job type
 * @param {Object} payload - Job parameters
 * @param {string} userId - User identifier
 * @returns {Object} - { success: boolean, job?: Job, error?: string }
 */
export async function enqueueJob(type, payload, userId) {
  // Check queue size limit (backpressure)
  if (queue.length >= CONFIG.maxQueueSize) {
    console.log(`[Queue] REJECTED: Queue full (${queue.length}/${CONFIG.maxQueueSize})`)
    return {
      success: false,
      error: 'Queue is full. Please try again later.',
      queueLength: queue.length,
    }
  }
  
  // Apply smoothing delay before enqueue (non-blocking)
  const delay = calculateSmoothingDelay(
    queue.length,
    CONFIG.maxJitterMs,
    CONFIG.jitterEnabled
  )
  
  if (delay > 0) {
    console.log(`[Queue] Applying smoothing delay: ${delay}ms`)
    await sleep(delay)
  }
  
  // Create and store job
  const job = createJob(type, payload, userId)
  jobs.set(job.id, job)
  queue.push(job.id)
  
  metrics.totalJobsEnqueued++
  
  console.log(`[Queue] ENQUEUED: ${job.id} (type: ${type}, position: ${queue.length}, user: ${userId})`)
  
  // Start worker if not running
  ensureWorkerRunning()
  
  // Calculate estimated wait time
  const avgRuntime = metrics.totalJobsCompleted > 0 
    ? metrics.totalRuntimeMs / metrics.totalJobsCompleted 
    : 5000 // Default 5s estimate
  
  return {
    success: true,
    job: getJobSummary(job.id),
    queueLength: queue.length,
    estimatedWaitMs: estimateWaitTime(queue.length, avgRuntime, CONFIG.maxConcurrentJobsGlobal),
  }
}

/**
 * Get job by ID
 * @param {string} jobId
 * @returns {Job|null}
 */
export function getJob(jobId) {
  return jobs.get(jobId) || null
}

/**
 * Get job summary (safe for client)
 * @param {string} jobId
 * @returns {Object|null}
 */
export function getJobSummary(jobId) {
  const job = jobs.get(jobId)
  if (!job) return null
  
  // Calculate position in queue if still queued
  const position = job.status === JobStatus.QUEUED 
    ? queue.indexOf(jobId) + 1 
    : 0
  
  // Calculate estimated wait time
  const avgRuntime = metrics.totalJobsCompleted > 0 
    ? metrics.totalRuntimeMs / metrics.totalJobsCompleted 
    : 5000
  
  return {
    id: job.id,
    status: job.status,
    type: job.type,
    progress: job.progress,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    queuePosition: position,
    estimatedWaitMs: estimateWaitTime(position, avgRuntime, CONFIG.maxConcurrentJobsGlobal),
  }
}

/**
 * Update job progress
 * @param {string} jobId
 * @param {number} progress - 0-100
 */
export function updateJobProgress(jobId, progress) {
  const job = jobs.get(jobId)
  if (job && job.status === JobStatus.RUNNING) {
    job.progress = Math.min(100, Math.max(0, progress))
  }
}

/**
 * Cancel a job
 * @param {string} jobId
 * @param {string} userId - Must match job owner
 * @returns {boolean}
 */
export function cancelJob(jobId, userId) {
  const job = jobs.get(jobId)
  if (!job) return false
  if (job.userId !== userId) return false
  if (job.status !== JobStatus.QUEUED) return false
  
  job.status = JobStatus.CANCELLED
  job.completedAt = now()
  
  // Remove from queue
  const queueIdx = queue.indexOf(jobId)
  if (queueIdx !== -1) {
    queue.splice(queueIdx, 1)
  }
  
  console.log(`[Queue] CANCELLED: ${jobId}`)
  return true
}

/**
 * Worker function to process a single job
 * Override this for actual job processing
 * 
 * @param {Job} job
 * @returns {Promise<*>} - Job result
 */
async function processJob(job) {
  // Default implementation - simulate work
  // In production, dispatch based on job.type
  
  const steps = 5
  for (let i = 1; i <= steps; i++) {
    await sleep(1000) // Simulate work
    updateJobProgress(job.id, (i / steps) * 100)
  }
  
  // Return simulated result
  return {
    message: 'Job completed successfully',
    type: job.type,
    processedAt: now(),
  }
}

// Job processor registry - allows registering custom handlers
const jobProcessors = new Map()

/**
 * Register a job processor for a specific type
 * @param {string} type - Job type
 * @param {Function} processor - Async function (job) => result
 */
export function registerJobProcessor(type, processor) {
  jobProcessors.set(type, processor)
  console.log(`[Queue] Registered processor for job type: ${type}`)
}

/**
 * Worker loop - processes jobs from queue
 */
async function workerLoop() {
  if (workerRunning) return
  workerRunning = true
  
  console.log('[Worker] Started')
  
  while (queue.length > 0 || runningJobs.size > 0) {
    // Check if we can start more jobs
    while (runningJobs.size < CONFIG.maxConcurrentJobsGlobal && queue.length > 0) {
      const jobId = queue.shift()
      if (!jobId) break
      
      const job = jobs.get(jobId)
      if (!job || job.status === JobStatus.CANCELLED) {
        continue
      }
      
      // Start job
      runningJobs.add(jobId)
      job.status = JobStatus.RUNNING
      job.startedAt = now()
      
      console.log(`[Worker] STARTED: ${jobId} (running: ${runningJobs.size}/${CONFIG.maxConcurrentJobsGlobal})`)
      
      // Process job asynchronously (don't await here to allow concurrency)
      processJobAsync(job)
    }
    
    // Small sleep to prevent tight loop
    await sleep(100)
    
    // Periodic cleanup
    maybeCleanup()
  }
  
  workerRunning = false
  console.log('[Worker] Stopped (queue empty)')
}

/**
 * Process a single job asynchronously
 * @param {Job} job
 */
async function processJobAsync(job) {
  const startTime = Date.now()
  
  try {
    // Apply jitter before processing (spreads load)
    if (CONFIG.jitterEnabled) {
      const preDelay = jitter(CONFIG.maxJitterMs / 2)
      if (preDelay > 0) {
        await sleep(preDelay)
      }
    }
    
    // Get processor for job type, or use default
    const processor = jobProcessors.get(job.type) || processJob
    
    // Execute job
    const result = await processor(job)
    
    // Mark completed
    job.status = JobStatus.COMPLETED
    job.progress = 100
    job.result = result
    job.completedAt = now()
    
    const runtime = Date.now() - startTime
    metrics.totalJobsCompleted++
    metrics.totalRuntimeMs += runtime
    
    console.log(`[Worker] COMPLETED: ${job.id} (runtime: ${runtime}ms)`)
    
  } catch (error) {
    // Mark failed
    job.status = JobStatus.FAILED
    job.error = error.message || 'Unknown error'
    job.completedAt = now()
    
    metrics.totalJobsFailed++
    
    console.error(`[Worker] FAILED: ${job.id}`, error.message)
    
  } finally {
    // Cleanup
    runningJobs.delete(job.id)
    unregisterJob(job.userId, job.id)
  }
}

/**
 * Ensure worker is running
 */
function ensureWorkerRunning() {
  if (!workerRunning) {
    // Start worker in next tick to not block enqueue
    setImmediate(() => workerLoop())
  }
}

/**
 * Periodic cleanup of old jobs to prevent memory growth
 */
function maybeCleanup() {
  if (Date.now() - metrics.lastCleanup < CONFIG.cleanupIntervalMs) {
    return
  }
  
  metrics.lastCleanup = Date.now()
  const cutoff = Date.now() - CONFIG.jobExpirationMs
  let cleaned = 0
  
  for (const [jobId, job] of jobs.entries()) {
    // Don't delete running jobs
    if (job.status === JobStatus.RUNNING) continue
    
    // Delete old completed/failed/cancelled jobs
    const completedTime = job.completedAt ? new Date(job.completedAt).getTime() : 0
    const createdTime = new Date(job.createdAt).getTime()
    
    if (completedTime > 0 && completedTime < cutoff) {
      jobs.delete(jobId)
      cleaned++
    } else if (completedTime === 0 && createdTime < cutoff) {
      // Old queued job that was never processed
      jobs.delete(jobId)
      cleaned++
    }
  }
  
  if (cleaned > 0) {
    console.log(`[Queue] Cleanup: removed ${cleaned} old jobs. Active: ${jobs.size}`)
  }
}

/**
 * Get queue metrics for observability
 * @returns {Object}
 */
export function getQueueMetrics() {
  const avgWaitMs = metrics.totalJobsCompleted > 0 
    ? metrics.totalWaitTimeMs / metrics.totalJobsCompleted 
    : 0
    
  const avgRuntimeMs = metrics.totalJobsCompleted > 0 
    ? metrics.totalRuntimeMs / metrics.totalJobsCompleted 
    : 0
  
  return {
    queueLength: queue.length,
    runningCount: runningJobs.size,
    totalJobs: jobs.size,
    totalEnqueued: metrics.totalJobsEnqueued,
    totalCompleted: metrics.totalJobsCompleted,
    totalFailed: metrics.totalJobsFailed,
    avgWaitMs: Math.round(avgWaitMs),
    avgRuntimeMs: Math.round(avgRuntimeMs),
    config: {
      maxConcurrentJobsGlobal: CONFIG.maxConcurrentJobsGlobal,
      maxQueueSize: CONFIG.maxQueueSize,
      jitterEnabled: CONFIG.jitterEnabled,
      maxJitterMs: CONFIG.maxJitterMs,
    },
  }
}

/**
 * Get jobs for a specific user
 * @param {string} userId
 * @returns {Array<Object>}
 */
export function getUserJobs(userId) {
  const userJobs = []
  
  for (const job of jobs.values()) {
    if (job.userId === userId) {
      userJobs.push(getJobSummary(job.id))
    }
  }
  
  // Sort by creation time (newest first)
  userJobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  
  // Limit to recent jobs
  return userJobs.slice(0, 20)
}

/**
 * Check if user has any active (queued/running) jobs
 * @param {string} userId
 * @returns {boolean}
 */
export function hasActiveJob(userId) {
  for (const job of jobs.values()) {
    if (job.userId === userId && 
        (job.status === JobStatus.QUEUED || job.status === JobStatus.RUNNING)) {
      return true
    }
  }
  return false
}
