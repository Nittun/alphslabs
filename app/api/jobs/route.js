/**
 * Job Queue API - POST /api/jobs
 * 
 * Enqueues a new job for background processing.
 * Returns quickly with job ID - actual processing happens async.
 * 
 * Features:
 * - Rate limiting per user/IP
 * - Concurrent job limits
 * - Queue backpressure
 * - Smoothing jitter
 */

// Force dynamic rendering - this route uses headers/session
export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { 
  getIdentifier, 
  checkRateLimit, 
  checkConcurrentLimit,
  recordRequest,
  registerJob,
  buildRateLimitResponse 
} from '@/lib/rateLimit'
import { enqueueJob, getUserJobs } from '@/lib/jobQueue'
import { now } from '@/lib/trafficUtils'

/**
 * POST /api/jobs - Enqueue a new job
 * 
 * Request body:
 * {
 *   type: string,     // Job type (e.g., 'backtest', 'optimize', 'resample')
 *   payload: object   // Job-specific parameters
 * }
 * 
 * Response (202 Accepted):
 * {
 *   success: true,
 *   job: { id, status, queuePosition, estimatedWaitMs, ... }
 * }
 */
export async function POST(request) {
  try {
    // Get session and identifier
    const session = await getServerSession(authOptions)
    const identifier = getIdentifier(request, session)
    
    // Check rate limit
    const rateCheck = checkRateLimit(identifier)
    if (!rateCheck.allowed) {
      return buildRateLimitResponse(rateCheck.resetAfterMs, rateCheck.reason)
    }
    
    // Check concurrent job limit
    const concurrentCheck = checkConcurrentLimit(identifier)
    if (!concurrentCheck.allowed) {
      return buildRateLimitResponse(30000, concurrentCheck.reason)
    }
    
    // Record this request
    recordRequest(identifier)
    
    // Parse request body
    const body = await request.json()
    const { type, payload } = body
    
    if (!type) {
      return Response.json(
        { error: 'Bad Request', message: 'Job type is required' },
        { status: 400 }
      )
    }
    
    // Enqueue job
    const result = await enqueueJob(type, payload || {}, identifier)
    
    if (!result.success) {
      return Response.json(
        { 
          error: 'Service Unavailable', 
          message: result.error,
          queueLength: result.queueLength,
        },
        { status: 503 }
      )
    }
    
    // Register job for concurrent tracking
    registerJob(identifier, result.job.id)
    
    // Return 202 Accepted with job info
    return Response.json(
      {
        success: true,
        message: 'Job queued successfully',
        job: result.job,
        queueLength: result.queueLength,
        estimatedWaitMs: result.estimatedWaitMs,
        timestamp: now(),
      },
      { 
        status: 202,
        headers: {
          'X-RateLimit-Remaining': rateCheck.remaining.toString(),
        },
      }
    )
    
  } catch (error) {
    console.error('[API/jobs] POST error:', error)
    return Response.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/jobs - List user's jobs
 * 
 * Response:
 * {
 *   jobs: [{ id, status, progress, ... }, ...]
 * }
 */
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    const identifier = getIdentifier(request, session)
    
    const jobs = getUserJobs(identifier)
    
    return Response.json({
      success: true,
      jobs,
      timestamp: now(),
    })
    
  } catch (error) {
    console.error('[API/jobs] GET error:', error)
    return Response.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    )
  }
}
