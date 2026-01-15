/**
 * Admin Metrics API - GET /api/admin/metrics
 * 
 * Comprehensive monitoring dashboard for the platform.
 * Includes DAU, job metrics, rate limits, feature usage, and more.
 */

// Force dynamic rendering - this route uses headers/session
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * GET /api/admin/metrics
 */
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin access
    if (prisma) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email }
      })
      
      const isAdmin = user?.id === 'cmjzbir7y0000eybbir608elt' || 
                     (user?.role && user.role.toLowerCase() === 'admin')
      
      if (!isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Get all metrics
    const metrics = await getComprehensiveMetrics()
    
    return NextResponse.json({
      success: true,
      ...metrics,
      serverTime: Date.now(),
      uptime: process.uptime(),
    })
    
  } catch (error) {
    console.error('[API/admin/metrics] GET error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    )
  }
}

async function getComprehensiveMetrics() {
  if (!prisma) {
    return getEmptyMetrics()
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const last7Days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
  const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

  try {
    // Run all queries in parallel for performance
    const [
      // User Activity
      dauToday,
      dauYesterday,
      activeBacktestUsers,
      totalUsers,
      newUsersToday,
      
      // Job Metrics
      jobStats,
      recentJobs,
      
      // Rate Limiting
      rateLimitStats,
      
      // Heavy Users
      heavyUsers,
      
      // Feature Usage
      featureUsageStats,

      // Landing Funnel
      landingFunnel,
      
      // Admin Audit Log
      recentAuditLogs,
      
      // System Alerts
      unresolvedAlerts,
      
      // Data Freshness
      dataStatus,
      
      // Backtest Stats
      backtestStats
    ] = await Promise.all([
      // DAU Today - users who logged in today
      prisma.loginHistory.findMany({
        where: { loginAt: { gte: today } },
        distinct: ['userId'],
        select: { userId: true }
      }).then(r => r.length).catch(() => 0),
      
      // DAU Yesterday
      prisma.loginHistory.findMany({
        where: { loginAt: { gte: yesterday, lt: today } },
        distinct: ['userId'],
        select: { userId: true }
      }).then(r => r.length).catch(() => 0),
      
      // Active Backtest Users (last 24h)
      prisma.backtestRun.findMany({
        where: { runAt: { gte: yesterday } },
        distinct: ['userId'],
        select: { userId: true }
      }).then(r => r.length).catch(() => 0),
      
      // Total Users
      prisma.user.count().catch(() => 0),
      
      // New Users Today
      prisma.user.count({
        where: { createdAt: { gte: today } }
      }).catch(() => 0),
      
      // Job Statistics
      getJobStats(),
      
      // Recent Jobs (last 10)
      getRecentJobs(),
      
      // Rate Limit Statistics
      getRateLimitStats(last7Days),
      
      // Heavy Users (top 5 by compute)
      getHeavyUsers(),
      
      // Feature Usage Statistics
      getFeatureUsageStats(last7Days),

      // Landing Funnel
      getLandingFunnelStats(),
      
      // Recent Admin Audit Logs
      getRecentAuditLogs(),
      
      // Unresolved System Alerts
      getUnresolvedAlerts(),
      
      // Data Ingestion Status
      getDataIngestionStatus(),
      
      // Backtest Statistics
      getBacktestStats(last30Days)
    ])

    return {
      userActivity: {
        dauToday,
        dauYesterday,
        dauChange: dauYesterday > 0 ? ((dauToday - dauYesterday) / dauYesterday * 100).toFixed(1) : 0,
        activeBacktestUsers,
        totalUsers,
        newUsersToday
      },
      jobMetrics: {
        ...jobStats,
        recentJobs
      },
      rateLimiting: rateLimitStats,
      heavyUsers,
      featureUsage: featureUsageStats,
      landingFunnel,
      auditLog: recentAuditLogs,
      alerts: unresolvedAlerts,
      dataFreshness: dataStatus,
      backtestStats
    }
  } catch (error) {
    console.error('[Metrics] Error fetching metrics:', error)
    return getEmptyMetrics()
  }
}

async function getJobStats() {
  if (!prisma) return getEmptyJobStats()
  
  try {
    // Check if Job table exists
    const jobs = await prisma.$queryRaw`
      SELECT 
        status,
        COUNT(*)::int as count,
        AVG(COALESCE("runtimeMs", 0))::float as avg_runtime,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY COALESCE("runtimeMs", 0))::float as p95_runtime,
        AVG(COALESCE("waitTimeMs", 0))::float as avg_wait
      FROM jobs
      WHERE "queuedAt" > NOW() - INTERVAL '24 hours'
      GROUP BY status
    `.catch(() => [])

    const stats = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      avgRuntimeMs: 0,
      p95RuntimeMs: 0,
      avgWaitTimeMs: 0
    }

    if (Array.isArray(jobs)) {
      jobs.forEach((row) => {
        stats[row.status] = row.count || 0
        if (row.status === 'completed') {
          stats.avgRuntimeMs = Math.round(row.avg_runtime || 0)
          stats.p95RuntimeMs = Math.round(row.p95_runtime || 0)
          stats.avgWaitTimeMs = Math.round(row.avg_wait || 0)
        }
      })
    }

    return stats
  } catch (error) {
    // Table might not exist yet
    return getEmptyJobStats()
  }
}

function getEmptyJobStats() {
  return {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    avgRuntimeMs: 0,
    p95RuntimeMs: 0,
    avgWaitTimeMs: 0
  }
}

async function getRecentJobs() {
  if (!prisma) return []
  
  try {
    return await prisma.job.findMany({
      take: 10,
      orderBy: { queuedAt: 'desc' },
      select: {
        id: true,
        type: true,
        status: true,
        runtimeMs: true,
        queuedAt: true,
        error: true
      }
    }).catch(() => [])
  } catch {
    return []
  }
}

async function getRateLimitStats(since) {
  if (!prisma) return { totalHits: 0, blockedRequests: 0, abuseFlags: 0, topEndpoints: [] }
  
  try {
    const [totalHits, blockedRequests, abuseFlags] = await Promise.all([
      prisma.rateLimitHit.count({
        where: { hitAt: { gte: since } }
      }).catch(() => 0),
      
      prisma.rateLimitHit.count({
        where: { hitAt: { gte: since }, blocked: true }
      }).catch(() => 0),
      
      prisma.rateLimitHit.count({
        where: { hitAt: { gte: since }, abuseFlag: true }
      }).catch(() => 0)
    ])

    // Get top endpoints hitting rate limits
    const topEndpoints = await prisma.$queryRaw`
      SELECT endpoint, COUNT(*)::int as count
      FROM rate_limit_hits
      WHERE "hitAt" > ${since}
      GROUP BY endpoint
      ORDER BY count DESC
      LIMIT 5
    `.catch(() => [])

    return {
      totalHits,
      blockedRequests,
      abuseFlags,
      topEndpoints: Array.isArray(topEndpoints) ? topEndpoints : []
    }
  } catch {
    return { totalHits: 0, blockedRequests: 0, abuseFlags: 0, topEndpoints: [] }
  }
}

async function getHeavyUsers() {
  if (!prisma) return []
  
  try {
    // Get top 5 users by backtest count (as proxy for compute usage)
    const heavyUsers = await prisma.user.findMany({
      take: 5,
      orderBy: {
        backtestRuns: {
          _count: 'desc'
        }
      },
      select: {
        id: true,
        email: true,
        name: true,
        _count: {
          select: { backtestRuns: true }
        }
      }
    }).catch(() => [])

    // Also try to get compute units from jobs table
    try {
      const computeHeavy = await prisma.$queryRaw`
        SELECT 
          "userId",
          SUM(COALESCE("computeUnits", 1))::float as total_compute,
          COUNT(*)::int as job_count
        FROM jobs
        WHERE "queuedAt" > NOW() - INTERVAL '7 days'
        GROUP BY "userId"
        ORDER BY total_compute DESC
        LIMIT 5
      `.catch(() => [])

      if (Array.isArray(computeHeavy) && computeHeavy.length > 0) {
        // Merge with user info
        const userIds = computeHeavy.map(u => u.userId).filter(Boolean)
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, name: true }
        })
        
        return computeHeavy.map(c => {
          const user = users.find(u => u.id === c.userId) || {}
          return {
            ...user,
            computeUnits: c.total_compute,
            jobCount: c.job_count
          }
        })
      }
    } catch {
      // Fall back to backtest-based heavy users
    }

    return heavyUsers.map(u => ({
      ...u,
      computeUnits: u._count.backtestRuns,
      jobCount: u._count.backtestRuns
    }))
  } catch {
    return []
  }
}

async function getFeatureUsageStats(since) {
  if (!prisma) return { topFeatures: [], totalUsage: 0 }
  
  try {
    const topFeatures = await prisma.$queryRaw`
      SELECT feature, COUNT(*)::int as count
      FROM feature_usage
      WHERE "usedAt" > ${since}
      GROUP BY feature
      ORDER BY count DESC
      LIMIT 5
    `.catch(() => [])

    const totalUsage = await prisma.featureUsage.count({
      where: { usedAt: { gte: since } }
    }).catch(() => 0)

    return {
      topFeatures: Array.isArray(topFeatures) ? topFeatures : [],
      totalUsage
    }
  } catch {
    return { topFeatures: [], totalUsage: 0 }
  }
}

async function getLandingFunnelStats() {
  if (!prisma) {
    return { landingVisits: 0, launchClicks: 0, loginFailures: 0 }
  }

  try {
    const [landingVisits, launchClicks, loginFailures] = await Promise.all([
      prisma.featureUsage.count({ where: { feature: 'landing_visit' } }).catch(() => 0),
      prisma.featureUsage.count({ where: { feature: 'landing_launch_click' } }).catch(() => 0),
      prisma.featureUsage.count({ where: { feature: 'login_failed' } }).catch(() => 0)
    ])

    return { landingVisits, launchClicks, loginFailures }
  } catch {
    return { landingVisits: 0, launchClicks: 0, loginFailures: 0 }
  }
}

async function getRecentAuditLogs() {
  if (!prisma) return []
  
  try {
    return await prisma.adminAuditLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        targetUserId: true,
        details: true,
        createdAt: true,
        adminId: true
      }
    }).catch(() => [])
  } catch {
    return []
  }
}

async function getUnresolvedAlerts() {
  if (!prisma) return []
  
  try {
    return await prisma.systemAlert.findMany({
      where: { resolved: false },
      orderBy: [
        { severity: 'desc' },
        { createdAt: 'desc' }
      ],
      take: 10
    }).catch(() => [])
  } catch {
    return []
  }
}

async function getDataIngestionStatus() {
  if (!prisma) return []
  
  try {
    return await prisma.dataIngestionStatus.findMany({
      orderBy: { source: 'asc' }
    }).catch(() => [])
  } catch {
    return []
  }
}

async function getBacktestStats(since) {
  if (!prisma) return { total: 0, avgPerUser: 0, topAssets: [], topIntervals: [] }
  
  try {
    const [total, topAssets, topIntervals] = await Promise.all([
      prisma.backtestRun.count({
        where: { runAt: { gte: since } }
      }).catch(() => 0),
      
      prisma.$queryRaw`
        SELECT asset, COUNT(*)::int as count
        FROM backtest_runs
        WHERE "runAt" > ${since}
        GROUP BY asset
        ORDER BY count DESC
        LIMIT 5
      `.catch(() => []),
      
      prisma.$queryRaw`
        SELECT interval, COUNT(*)::int as count
        FROM backtest_runs
        WHERE "runAt" > ${since}
        GROUP BY interval
        ORDER BY count DESC
        LIMIT 5
      `.catch(() => [])
    ])

    const userCount = await prisma.backtestRun.findMany({
      where: { runAt: { gte: since } },
      distinct: ['userId'],
      select: { userId: true }
    }).then(r => r.length).catch(() => 1)

    return {
      total,
      avgPerUser: userCount > 0 ? (total / userCount).toFixed(1) : 0,
      topAssets: Array.isArray(topAssets) ? topAssets : [],
      topIntervals: Array.isArray(topIntervals) ? topIntervals : []
    }
  } catch {
    return { total: 0, avgPerUser: 0, topAssets: [], topIntervals: [] }
  }
}

function getEmptyMetrics() {
  return {
    userActivity: {
      dauToday: 0,
      dauYesterday: 0,
      dauChange: 0,
      activeBacktestUsers: 0,
      totalUsers: 0,
      newUsersToday: 0
    },
    jobMetrics: {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      avgRuntimeMs: 0,
      p95RuntimeMs: 0,
      avgWaitTimeMs: 0,
      recentJobs: []
    },
    rateLimiting: {
      totalHits: 0,
      blockedRequests: 0,
      abuseFlags: 0,
      topEndpoints: []
    },
    heavyUsers: [],
    featureUsage: {
      topFeatures: [],
      totalUsage: 0
    },
    landingFunnel: {
      landingVisits: 0,
      launchClicks: 0,
      loginFailures: 0
    },
    auditLog: [],
    alerts: [],
    dataFreshness: [],
    backtestStats: {
      total: 0,
      avgPerUser: 0,
      topAssets: [],
      topIntervals: []
    }
  }
}

/**
 * POST /api/admin/metrics
 * Create an audit log entry
 */
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!prisma) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    // Verify admin access
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })
    
    const isAdmin = user?.id === 'cmjzbir7y0000eybbir608elt' || 
                   (user?.role && user.role.toLowerCase() === 'admin')
    
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { action, targetUserId, details } = await request.json()

    // Get IP address from headers
    const forwardedFor = request.headers.get('x-forwarded-for')
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : null

    const auditLog = await prisma.adminAuditLog.create({
      data: {
        adminId: user.id,
        action,
        targetUserId,
        details,
        ipAddress
      }
    })

    return NextResponse.json({ success: true, auditLog })
  } catch (error) {
    console.error('[API/admin/metrics] POST error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    )
  }
}
