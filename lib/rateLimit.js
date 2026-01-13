/**
 * Rate Limiting Module
 * 
 * Implements a sliding window rate limiter with:
 * - Per-user limits (by user ID from session)
 * - Per-IP fallback (for unauthenticated requests)
 * - Concurrent job limits per user
 * 
 * Uses in-memory storage with automatic cleanup.
 * For production at scale, replace with Redis-based implementation.
 */

import { now } from './trafficUtils'

// Configuration from environment with secure defaults
const CONFIG = {
  maxRequestsPerMinute: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_PER_MINUTE || '30'),
  maxConcurrentJobsPerUser: parseInt(process.env.RATE_LIMIT_MAX_CONCURRENT_JOBS_PER_USER || '3'),
  windowSizeMs: 60 * 1000, // 1 minute sliding window
  cleanupIntervalMs: 5 * 60 * 1000, // Cleanup every 5 minutes
}

// In-memory storage for rate limit data
// Structure: { identifier: { requests: [timestamps], concurrentJobs: Set<jobId> } }
const rateLimitStore = new Map()

// Metrics tracking
const metrics = {
  rateLimitHits: 0,
  lastCleanup: Date.now(),
}

/**
 * Get identifier for rate limiting
 * Prefers user ID, falls back to IP address
 * 
 * @param {Request} request - Next.js request object
 * @param {Object|null} session - User session if available
 * @returns {string} - Identifier for rate limiting
 */
export function getIdentifier(request, session = null) {
  // Prefer user ID from session
  if (session?.user?.id) {
    return `user:${session.user.id}`
  }
  if (session?.user?.email) {
    return `user:${session.user.email}`
  }
  
  // Fallback to IP address
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
  return `ip:${ip}`
}

/**
 * Get or create rate limit entry for an identifier
 * @param {string} identifier
 * @returns {Object} - Rate limit data
 */
function getEntry(identifier) {
  if (!rateLimitStore.has(identifier)) {
    rateLimitStore.set(identifier, {
      requests: [],
      concurrentJobs: new Set(),
      createdAt: Date.now(),
    })
  }
  return rateLimitStore.get(identifier)
}

/**
 * Clean old entries from sliding window
 * @param {Array} requests - Array of request timestamps
 * @returns {Array} - Filtered array with only recent requests
 */
function cleanWindow(requests) {
  const cutoff = Date.now() - CONFIG.windowSizeMs
  return requests.filter(ts => ts > cutoff)
}

/**
 * Periodic cleanup to prevent memory growth
 */
function maybeCleanup() {
  if (Date.now() - metrics.lastCleanup < CONFIG.cleanupIntervalMs) {
    return
  }
  
  metrics.lastCleanup = Date.now()
  const cutoff = Date.now() - CONFIG.windowSizeMs * 2
  
  for (const [identifier, entry] of rateLimitStore.entries()) {
    // Remove entries with no recent activity
    if (entry.requests.length === 0 && entry.concurrentJobs.size === 0) {
      if (entry.createdAt < cutoff) {
        rateLimitStore.delete(identifier)
      }
    }
  }
  
  console.log(`[RateLimit] Cleanup complete. Active entries: ${rateLimitStore.size}`)
}

/**
 * Check if request should be rate limited
 * Uses sliding window algorithm for request count
 * 
 * @param {string} identifier - User/IP identifier
 * @returns {Object} - { allowed: boolean, remaining: number, resetAfterMs: number }
 */
export function checkRateLimit(identifier) {
  maybeCleanup()
  
  const entry = getEntry(identifier)
  entry.requests = cleanWindow(entry.requests)
  
  const requestCount = entry.requests.length
  
  if (requestCount >= CONFIG.maxRequestsPerMinute) {
    metrics.rateLimitHits++
    
    // Calculate when the oldest request will expire
    const oldestRequest = Math.min(...entry.requests)
    const resetAfterMs = Math.max(0, (oldestRequest + CONFIG.windowSizeMs) - Date.now())
    
    console.log(`[RateLimit] BLOCKED ${identifier}: ${requestCount}/${CONFIG.maxRequestsPerMinute} requests`)
    
    return {
      allowed: false,
      remaining: 0,
      resetAfterMs,
      reason: 'rate_limit_exceeded',
    }
  }
  
  return {
    allowed: true,
    remaining: CONFIG.maxRequestsPerMinute - requestCount - 1,
    resetAfterMs: CONFIG.windowSizeMs,
  }
}

/**
 * Record a request for rate limiting
 * @param {string} identifier
 */
export function recordRequest(identifier) {
  const entry = getEntry(identifier)
  entry.requests.push(Date.now())
}

/**
 * Check if user can start a new concurrent job
 * @param {string} identifier
 * @returns {Object} - { allowed: boolean, currentJobs: number }
 */
export function checkConcurrentLimit(identifier) {
  const entry = getEntry(identifier)
  const currentJobs = entry.concurrentJobs.size
  
  if (currentJobs >= CONFIG.maxConcurrentJobsPerUser) {
    console.log(`[RateLimit] CONCURRENT BLOCKED ${identifier}: ${currentJobs}/${CONFIG.maxConcurrentJobsPerUser} jobs`)
    
    return {
      allowed: false,
      currentJobs,
      maxJobs: CONFIG.maxConcurrentJobsPerUser,
      reason: 'concurrent_limit_exceeded',
    }
  }
  
  return {
    allowed: true,
    currentJobs,
    maxJobs: CONFIG.maxConcurrentJobsPerUser,
  }
}

/**
 * Register a job as running for concurrency tracking
 * @param {string} identifier
 * @param {string} jobId
 */
export function registerJob(identifier, jobId) {
  const entry = getEntry(identifier)
  entry.concurrentJobs.add(jobId)
}

/**
 * Unregister a completed/failed job
 * @param {string} identifier
 * @param {string} jobId
 */
export function unregisterJob(identifier, jobId) {
  const entry = getEntry(identifier)
  entry.concurrentJobs.delete(jobId)
}

/**
 * Get current jobs for an identifier
 * @param {string} identifier
 * @returns {Set<string>} - Set of job IDs
 */
export function getCurrentJobs(identifier) {
  const entry = getEntry(identifier)
  return new Set(entry.concurrentJobs)
}

/**
 * Get rate limit metrics
 * @returns {Object}
 */
export function getRateLimitMetrics() {
  return {
    activeUsers: rateLimitStore.size,
    rateLimitHits: metrics.rateLimitHits,
    config: {
      maxRequestsPerMinute: CONFIG.maxRequestsPerMinute,
      maxConcurrentJobsPerUser: CONFIG.maxConcurrentJobsPerUser,
    },
  }
}

/**
 * Build a 429 response with proper headers and retry-after
 * @param {number} retryAfterMs - Milliseconds until retry is allowed
 * @param {string} reason - Reason for rate limiting
 * @returns {Response}
 */
export function buildRateLimitResponse(retryAfterMs, reason = 'rate_limit_exceeded') {
  const retryAfterSeconds = Math.ceil(retryAfterMs / 1000)
  
  const messages = {
    rate_limit_exceeded: `You've made too many requests. Please wait ${retryAfterSeconds} seconds before trying again.`,
    concurrent_limit_exceeded: `You have too many jobs running. Please wait for some to complete before starting new ones.`,
  }
  
  return Response.json(
    {
      error: 'Too Many Requests',
      message: messages[reason] || messages.rate_limit_exceeded,
      retryAfterSeconds,
      timestamp: now(),
    },
    {
      status: 429,
      headers: {
        'Retry-After': retryAfterSeconds.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(Date.now() + retryAfterMs).toISOString(),
      },
    }
  )
}
