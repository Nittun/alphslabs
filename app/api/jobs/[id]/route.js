/**
 * Job Status API - GET /api/jobs/:id
 * 
 * Returns status, progress, and result of a specific job.
 * Used for polling job completion.
 */

// Force dynamic rendering - this route uses headers/session
export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getIdentifier } from '@/lib/rateLimit'
import { getJob, getJobSummary, cancelJob, JobStatus } from '@/lib/jobQueue'
import { now } from '@/lib/trafficUtils'

/**
 * GET /api/jobs/:id - Get job status
 * 
 * Response:
 * {
 *   success: true,
 *   job: {
 *     id, status, type, progress, result, error,
 *     createdAt, startedAt, completedAt,
 *     queuePosition, estimatedWaitMs
 *   }
 * }
 */
export async function GET(request, { params }) {
  try {
    const { id: jobId } = await params
    
    if (!jobId) {
      return Response.json(
        { error: 'Bad Request', message: 'Job ID is required' },
        { status: 400 }
      )
    }
    
    const job = getJobSummary(jobId)
    
    if (!job) {
      return Response.json(
        { error: 'Not Found', message: 'Job not found' },
        { status: 404 }
      )
    }
    
    // Determine if we should suggest polling
    const shouldPoll = job.status === JobStatus.QUEUED || job.status === JobStatus.RUNNING
    const pollIntervalMs = job.status === JobStatus.RUNNING ? 1000 : 2000
    
    return Response.json({
      success: true,
      job,
      shouldPoll,
      pollIntervalMs,
      timestamp: now(),
    })
    
  } catch (error) {
    console.error('[API/jobs/:id] GET error:', error)
    return Response.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/jobs/:id - Cancel a queued job
 * 
 * Only queued jobs can be cancelled.
 * User must own the job.
 */
export async function DELETE(request, { params }) {
  try {
    const { id: jobId } = await params
    const session = await getServerSession(authOptions)
    const identifier = getIdentifier(request, session)
    
    if (!jobId) {
      return Response.json(
        { error: 'Bad Request', message: 'Job ID is required' },
        { status: 400 }
      )
    }
    
    const job = getJob(jobId)
    
    if (!job) {
      return Response.json(
        { error: 'Not Found', message: 'Job not found' },
        { status: 404 }
      )
    }
    
    // Check ownership
    if (job.userId !== identifier) {
      return Response.json(
        { error: 'Forbidden', message: 'You do not own this job' },
        { status: 403 }
      )
    }
    
    // Check if cancellable
    if (job.status !== JobStatus.QUEUED) {
      return Response.json(
        { 
          error: 'Conflict', 
          message: `Cannot cancel job with status: ${job.status}. Only queued jobs can be cancelled.` 
        },
        { status: 409 }
      )
    }
    
    // Cancel the job
    const cancelled = cancelJob(jobId, identifier)
    
    if (!cancelled) {
      return Response.json(
        { error: 'Internal Server Error', message: 'Failed to cancel job' },
        { status: 500 }
      )
    }
    
    return Response.json({
      success: true,
      message: 'Job cancelled successfully',
      job: getJobSummary(jobId),
      timestamp: now(),
    })
    
  } catch (error) {
    console.error('[API/jobs/:id] DELETE error:', error)
    return Response.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    )
  }
}
