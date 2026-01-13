/**
 * Admin Metrics API - GET /api/admin/metrics
 * 
 * Provides observability metrics for the traffic smoothing system.
 * Includes queue stats, rate limit info, and job metrics.
 * 
 * Should be protected with admin authentication in production.
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getRateLimitMetrics } from '@/lib/rateLimit'
import { getQueueMetrics } from '@/lib/jobQueue'
import { now } from '@/lib/trafficUtils'

/**
 * GET /api/admin/metrics
 * 
 * Response:
 * {
 *   queue: { queueLength, runningCount, avgWaitMs, avgRuntimeMs, ... },
 *   rateLimit: { activeUsers, 429Count, config },
 *   timestamp
 * }
 */
export async function GET(request) {
  try {
    // Optional: Check for admin role
    const session = await getServerSession(authOptions)
    
    // In production, uncomment to restrict to admins:
    // if (!session?.user?.isAdmin) {
    //   return Response.json(
    //     { error: 'Forbidden', message: 'Admin access required' },
    //     { status: 403 }
    //   )
    // }
    
    const queueMetrics = getQueueMetrics()
    const rateLimitMetrics = getRateLimitMetrics()
    
    // Calculate system health indicators
    const health = calculateHealth(queueMetrics, rateLimitMetrics)
    
    return Response.json({
      success: true,
      queue: queueMetrics,
      rateLimit: rateLimitMetrics,
      health,
      serverTime: now(),
      uptime: process.uptime(),
    })
    
  } catch (error) {
    console.error('[API/admin/metrics] GET error:', error)
    return Response.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    )
  }
}

/**
 * Calculate system health based on metrics
 * @param {Object} queueMetrics
 * @param {Object} rateLimitMetrics
 * @returns {Object}
 */
function calculateHealth(queueMetrics, rateLimitMetrics) {
  const issues = []
  let status = 'healthy'
  
  // Check queue length
  const queueUsage = queueMetrics.queueLength / queueMetrics.config.maxQueueSize
  if (queueUsage > 0.9) {
    issues.push('Queue nearly full')
    status = 'critical'
  } else if (queueUsage > 0.7) {
    issues.push('Queue filling up')
    status = status === 'healthy' ? 'warning' : status
  }
  
  // Check rate limit hits
  if (rateLimitMetrics.rateLimitHits > 100) {
    issues.push('High rate limit hits')
    status = status === 'healthy' ? 'warning' : status
  }
  
  // Check average runtime (if unusually high)
  if (queueMetrics.avgRuntimeMs > 60000) {
    issues.push('High average job runtime')
    status = status === 'healthy' ? 'warning' : status
  }
  
  // Check failure rate
  const totalProcessed = queueMetrics.totalCompleted + queueMetrics.totalFailed
  if (totalProcessed > 10) {
    const failureRate = queueMetrics.totalFailed / totalProcessed
    if (failureRate > 0.2) {
      issues.push('High job failure rate')
      status = 'critical'
    } else if (failureRate > 0.1) {
      issues.push('Elevated job failure rate')
      status = status === 'healthy' ? 'warning' : status
    }
  }
  
  return {
    status,
    issues,
    queueUsagePercent: Math.round(queueUsage * 100),
    concurrencyUsagePercent: Math.round(
      (queueMetrics.runningCount / queueMetrics.config.maxConcurrentJobsGlobal) * 100
    ),
  }
}
