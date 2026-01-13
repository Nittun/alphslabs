/**
 * useJobQueue Hook
 * 
 * React hook for submitting jobs and tracking their progress.
 * Handles:
 * - Job submission with loading states
 * - Automatic polling for status updates
 * - Error handling and rate limit feedback
 * - Estimated wait times
 */

import { useState, useCallback, useEffect, useRef } from 'react'

/**
 * Job status states
 */
export const JobStatus = {
  IDLE: 'idle',           // No job submitted
  SUBMITTING: 'submitting', // Submitting to queue
  QUEUED: 'queued',       // In queue waiting
  RUNNING: 'running',     // Currently executing
  COMPLETED: 'completed', // Finished successfully
  FAILED: 'failed',       // Finished with error
  CANCELLED: 'cancelled', // User cancelled
  RATE_LIMITED: 'rate_limited', // Hit rate limit
}

/**
 * useJobQueue hook
 * 
 * @param {Object} options
 * @param {Function} options.onComplete - Callback when job completes (receives result)
 * @param {Function} options.onError - Callback on error
 * @param {number} options.pollInterval - Polling interval in ms (default 2000)
 * @returns {Object}
 */
export function useJobQueue({ onComplete, onError, pollInterval = 2000 } = {}) {
  const [status, setStatus] = useState(JobStatus.IDLE)
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const [retryAfter, setRetryAfter] = useState(null)
  
  const pollRef = useRef(null)
  const mountedRef = useRef(true)
  
  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (pollRef.current) {
        clearTimeout(pollRef.current)
      }
    }
  }, [])
  
  /**
   * Poll for job status
   */
  const pollJobStatus = useCallback(async (jobId) => {
    if (!mountedRef.current) return
    
    try {
      const response = await fetch(`/api/jobs/${jobId}`)
      const data = await response.json()
      
      if (!mountedRef.current) return
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch job status')
      }
      
      setJob(data.job)
      
      // Update status
      if (data.job.status === 'queued') {
        setStatus(JobStatus.QUEUED)
      } else if (data.job.status === 'running') {
        setStatus(JobStatus.RUNNING)
      } else if (data.job.status === 'completed') {
        setStatus(JobStatus.COMPLETED)
        if (onComplete) {
          onComplete(data.job.result, data.job)
        }
        return // Stop polling
      } else if (data.job.status === 'failed') {
        setStatus(JobStatus.FAILED)
        setError(data.job.error)
        if (onError) {
          onError(new Error(data.job.error), data.job)
        }
        return // Stop polling
      } else if (data.job.status === 'cancelled') {
        setStatus(JobStatus.CANCELLED)
        return // Stop polling
      }
      
      // Continue polling if job is still active
      if (data.shouldPoll) {
        pollRef.current = setTimeout(
          () => pollJobStatus(jobId), 
          data.pollIntervalMs || pollInterval
        )
      }
      
    } catch (err) {
      if (!mountedRef.current) return
      
      console.error('Job polling error:', err)
      // Retry polling on transient errors
      pollRef.current = setTimeout(
        () => pollJobStatus(jobId), 
        pollInterval * 2
      )
    }
  }, [onComplete, onError, pollInterval])
  
  /**
   * Submit a new job
   */
  const submitJob = useCallback(async (type, payload) => {
    // Clear previous state
    setError(null)
    setRetryAfter(null)
    setJob(null)
    setStatus(JobStatus.SUBMITTING)
    
    // Cancel any existing polling
    if (pollRef.current) {
      clearTimeout(pollRef.current)
    }
    
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, payload }),
      })
      
      const data = await response.json()
      
      // Handle rate limiting
      if (response.status === 429) {
        setStatus(JobStatus.RATE_LIMITED)
        setRetryAfter(data.retryAfterSeconds)
        setError(data.message)
        
        if (onError) {
          onError(new Error(data.message), null)
        }
        
        // Auto-clear rate limit state after retry period
        setTimeout(() => {
          if (mountedRef.current && status === JobStatus.RATE_LIMITED) {
            setStatus(JobStatus.IDLE)
            setRetryAfter(null)
          }
        }, data.retryAfterSeconds * 1000)
        
        return { success: false, rateLimited: true, retryAfter: data.retryAfterSeconds }
      }
      
      // Handle other errors
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit job')
      }
      
      // Job queued successfully
      setJob(data.job)
      setStatus(data.job.status === 'running' ? JobStatus.RUNNING : JobStatus.QUEUED)
      
      // Start polling
      pollRef.current = setTimeout(
        () => pollJobStatus(data.job.id),
        1000
      )
      
      return { success: true, job: data.job }
      
    } catch (err) {
      setStatus(JobStatus.FAILED)
      setError(err.message)
      
      if (onError) {
        onError(err, null)
      }
      
      return { success: false, error: err.message }
    }
  }, [pollJobStatus, onError, status])
  
  /**
   * Cancel a queued job
   */
  const cancelJob = useCallback(async () => {
    if (!job?.id) return { success: false, error: 'No job to cancel' }
    
    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: 'DELETE',
      })
      
      const data = await response.json()
      
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to cancel job')
      }
      
      // Stop polling
      if (pollRef.current) {
        clearTimeout(pollRef.current)
      }
      
      setJob(data.job)
      setStatus(JobStatus.CANCELLED)
      
      return { success: true }
      
    } catch (err) {
      setError(err.message)
      return { success: false, error: err.message }
    }
  }, [job])
  
  /**
   * Reset to idle state
   */
  const reset = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
    }
    setStatus(JobStatus.IDLE)
    setJob(null)
    setError(null)
    setRetryAfter(null)
  }, [])
  
  // Computed properties
  const isLoading = status === JobStatus.SUBMITTING || 
                    status === JobStatus.QUEUED || 
                    status === JobStatus.RUNNING
  
  const isComplete = status === JobStatus.COMPLETED
  const isFailed = status === JobStatus.FAILED
  const isRateLimited = status === JobStatus.RATE_LIMITED
  const canSubmit = status === JobStatus.IDLE || 
                    status === JobStatus.COMPLETED || 
                    status === JobStatus.FAILED ||
                    status === JobStatus.CANCELLED
  
  return {
    // State
    status,
    job,
    error,
    retryAfter,
    
    // Computed
    isLoading,
    isComplete,
    isFailed,
    isRateLimited,
    canSubmit,
    progress: job?.progress || 0,
    queuePosition: job?.queuePosition || 0,
    estimatedWaitMs: job?.estimatedWaitMs || 0,
    result: job?.result || null,
    
    // Actions
    submitJob,
    cancelJob,
    reset,
  }
}

export default useJobQueue
