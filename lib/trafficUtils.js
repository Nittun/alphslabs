/**
 * Traffic Smoothing Utilities
 * 
 * WHY THIS APPROACH IS BETTER THAN FIXED DELAYS:
 * 
 * A naive fixed delay (e.g., sleep(3000) on every request) has several problems:
 * 1. It's UNFAIR - light users get the same delay as heavy users
 * 2. It DOESN'T PREVENT OVERLOAD - if 1000 requests come in simultaneously, 
 *    they all sleep then all execute together, creating a thundering herd
 * 3. It WASTES RESOURCES - server threads/connections are held during sleep
 * 4. It's NOT ADAPTIVE - can't respond to actual load conditions
 * 
 * Our approach instead uses:
 * - Rate limiting: Stops abuse at the source, returns 429 immediately
 * - Queue + backpressure: Decouples request acceptance from execution
 * - Small randomized jitter: Spreads load without blocking request threads
 * - Concurrency limits: Controls actual resource usage
 * 
 * This keeps the API responsive (fast 202 Accepted responses) while
 * protecting backend resources and being fair to all users.
 */

/**
 * Non-blocking sleep using Promise
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Generate random jitter delay
 * Uses uniform distribution for simplicity, could use exponential for more spread
 * @param {number} maxMs - Maximum jitter in milliseconds
 * @returns {number} - Random delay between 0 and maxMs
 */
export function jitter(maxMs) {
  return Math.floor(Math.random() * maxMs)
}

/**
 * Compute extra delay based on queue length
 * Uses logarithmic scaling to avoid excessive delays at high queue lengths
 * 
 * @param {number} queueLen - Current queue length
 * @param {number} baseDelayPerItem - Base delay per queued item (default 50ms)
 * @param {number} maxExtraDelay - Cap on extra delay (default 5000ms)
 * @returns {number} - Extra delay in milliseconds
 */
export function computeExtraDelay(queueLen, baseDelayPerItem = 50, maxExtraDelay = 5000) {
  if (queueLen <= 0) return 0
  
  // Logarithmic scaling: grows slowly as queue grows
  // log2(1) = 0, log2(10) ≈ 3.3, log2(100) ≈ 6.6
  const scaledDelay = Math.log2(queueLen + 1) * baseDelayPerItem * queueLen / 10
  
  return Math.min(scaledDelay, maxExtraDelay)
}

/**
 * Calculate total smoothing delay
 * Combines jitter with queue-based backpressure
 * 
 * @param {number} queueLen - Current queue length
 * @param {number} maxJitterMs - Maximum jitter (from config)
 * @param {boolean} jitterEnabled - Whether jitter is enabled
 * @returns {number} - Total delay in milliseconds
 */
export function calculateSmoothingDelay(queueLen, maxJitterMs = 500, jitterEnabled = true) {
  let delay = 0
  
  if (jitterEnabled) {
    delay += jitter(maxJitterMs)
  }
  
  delay += computeExtraDelay(queueLen)
  
  return delay
}

/**
 * Format milliseconds to human-readable string
 * @param {number} ms - Milliseconds
 * @returns {string} - Formatted string like "2.5s" or "150ms"
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

/**
 * Estimate wait time based on queue position and average runtime
 * @param {number} position - Position in queue (0-based)
 * @param {number} avgRuntimeMs - Average job runtime
 * @param {number} concurrency - Number of concurrent workers
 * @returns {number} - Estimated wait time in milliseconds
 */
export function estimateWaitTime(position, avgRuntimeMs, concurrency) {
  if (position <= 0) return 0
  
  // Each "batch" of jobs takes avgRuntimeMs
  const batches = Math.ceil(position / concurrency)
  return batches * avgRuntimeMs
}

/**
 * Generate a unique job ID
 * @returns {string} - Unique identifier
 */
export function generateJobId() {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `job_${timestamp}_${random}`
}

/**
 * Get current timestamp in ISO format
 * @returns {string}
 */
export function now() {
  return new Date().toISOString()
}
