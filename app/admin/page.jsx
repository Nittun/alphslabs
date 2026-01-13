'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Swal from 'sweetalert2'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import styles from './page.module.css'

export default function AdminDashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [metrics, setMetrics] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [feedbackCounts, setFeedbackCounts] = useState({ unread: 0, read: 0, replied: 0, archived: 0, total: 0 })

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      if (status === 'loading') return
      
      if (!session?.user) {
        router.push('/login')
        return
      }

      try {
        const userResponse = await fetch('/api/user')
        const userData = await userResponse.json()
        
        if (!userData.success || !userData.user) {
          router.push('/backtest')
          return
        }

        const user = userData.user
        const isAdmin = user.id === 'cmjzbir7y0000eybbir608elt' || 
                       (user.role && user.role.toLowerCase() === 'admin')
        
        if (!isAdmin) {
          Swal.fire({
            icon: 'error',
            title: 'Access Denied',
            text: 'You do not have permission to access this page.',
            background: '#1a1a1a',
            color: '#fff',
            confirmButtonColor: '#ff4444'
          })
          router.push('/backtest')
          return
        }

        setCurrentUserRole(user.role)
        await loadMetrics()
      } catch (error) {
        console.error('Error checking admin status:', error)
        router.push('/backtest')
      }
    }

    checkAdmin()
  }, [session, status, router])

  const loadMetrics = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/metrics')
      const data = await response.json()
      
      if (data.success) {
        setMetrics(data)
        setLastUpdated(new Date())
      }
    } catch (error) {
      console.error('Error loading metrics:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadFeedbackCounts = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/feedback')
      const data = await response.json()
      
      if (data.success) {
        setFeedbackCounts(data.counts || { unread: 0, read: 0, replied: 0, archived: 0, total: 0 })
      }
    } catch (error) {
      console.error('Error loading feedback counts:', error)
    }
  }, [])

  // Load feedback counts on mount
  useEffect(() => {
    if (currentUserRole) {
      loadFeedbackCounts()
    }
  }, [currentUserRole, loadFeedbackCounts])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh || !currentUserRole) return
    
    const interval = setInterval(() => {
      loadMetrics()
    }, 30000)

    return () => clearInterval(interval)
  }, [autoRefresh, currentUserRole, loadMetrics])

  const menuItems = [
    {
      id: 'users',
      icon: 'people',
      title: 'User Management',
      description: 'View and manage all users, assign roles',
      path: '/admin/users',
      color: '#4488ff'
    },
    {
      id: 'feedback',
      icon: 'feedback',
      title: 'User Feedback',
      description: 'Review messages, bug reports, and feature requests',
      path: '/admin/feedback',
      color: '#00ff88',
      badge: feedbackCounts.unread > 0 ? feedbackCounts.unread : null
    },
    {
      id: 'permissions',
      icon: 'lock',
      title: 'Page Permissions',
      description: 'Configure page access by role',
      path: '/admin/permissions',
      color: '#9d4edd'
    }
  ]

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num?.toString() || '0'
  }

  const formatMs = (ms) => {
    if (!ms) return '0ms'
    if (ms >= 60000) return (ms / 60000).toFixed(1) + 'm'
    if (ms >= 1000) return (ms / 1000).toFixed(1) + 's'
    return ms + 'ms'
  }

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return '#ff4444'
      case 'error': return '#ff6b6b'
      case 'warning': return '#ffcc00'
      default: return '#4488ff'
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#00ff88'
      case 'running': return '#4488ff'
      case 'queued': return '#ffcc00'
      case 'failed': return '#ff4444'
      default: return '#888'
    }
  }

  if (status === 'loading' || !currentUserRole) {
    return (
      <div className={styles.dashboard}>
        <Sidebar onCollapseChange={setSidebarCollapsed} />
        <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
          <TopBar sidebarCollapsed={sidebarCollapsed} />
          <div className={styles.content}>
            <div className={styles.loading}>
              <span className="material-icons" style={{ fontSize: '3rem', animation: 'spin 1s linear infinite' }}>refresh</span>
              <p>Loading admin panel...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.dashboard}>
      <Sidebar onCollapseChange={setSidebarCollapsed} />
      <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <TopBar sidebarCollapsed={sidebarCollapsed} />
        <div className={styles.content}>
          {/* Header */}
          <div className={styles.headerSection}>
            <div>
              <h1>
                <span className="material-icons" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}>admin_panel_settings</span>
                Admin Dashboard
              </h1>
              <p className={styles.subtitle}>
                Platform monitoring and management
                {lastUpdated && (
                  <span className={styles.lastUpdated}>
                    Last updated: {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>
            <div className={styles.headerActions}>
              <label className={styles.autoRefreshToggle}>
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                <span>Auto-refresh</span>
              </label>
              <button 
                className={styles.refreshButton} 
                onClick={loadMetrics}
                disabled={isLoading}
              >
                <span className={`material-icons ${isLoading ? styles.spinning : ''}`}>refresh</span>
                Refresh
              </button>
            </div>
          </div>

          {/* Quick Navigation */}
          <div className={styles.quickNav}>
            {menuItems.map(item => (
              <Link key={item.id} href={item.path} className={styles.quickNavCard}>
                <span className="material-icons" style={{ color: item.color }}>{item.icon}</span>
                <span>{item.title}</span>
                {item.badge && (
                  <span className={styles.menuBadge}>{item.badge}</span>
                )}
              </Link>
            ))}
          </div>

          {/* Alerts Section */}
          {metrics?.alerts?.length > 0 && (
            <div className={styles.alertsSection}>
              <h3><span className="material-icons">warning</span> Active Alerts</h3>
              <div className={styles.alertsList}>
                {metrics.alerts.map((alert, idx) => (
                  <div 
                    key={alert.id || idx} 
                    className={styles.alertItem}
                    style={{ borderLeftColor: getSeverityColor(alert.severity) }}
                  >
                    <span className="material-icons" style={{ color: getSeverityColor(alert.severity) }}>
                      {alert.severity === 'critical' ? 'error' : 'warning'}
                    </span>
                    <div className={styles.alertContent}>
                      <strong>{alert.type}</strong>
                      <p>{alert.message}</p>
                    </div>
                    <span className={styles.alertTime}>
                      {new Date(alert.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User Activity Section */}
          <div className={styles.section}>
            <h2><span className="material-icons">people</span> User Activity</h2>
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <div className={styles.metricIcon} style={{ background: 'rgba(68, 136, 255, 0.2)' }}>
                  <span className="material-icons" style={{ color: '#4488ff' }}>today</span>
                </div>
                <div className={styles.metricInfo}>
                  <div className={styles.metricValue}>{metrics?.userActivity?.dauToday || 0}</div>
                  <div className={styles.metricLabel}>DAU Today</div>
                  {metrics?.userActivity?.dauChange && (
                    <div className={`${styles.metricChange} ${parseFloat(metrics.userActivity.dauChange) >= 0 ? styles.positive : styles.negative}`}>
                      {parseFloat(metrics.userActivity.dauChange) >= 0 ? '↑' : '↓'} {Math.abs(metrics.userActivity.dauChange)}%
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricIcon} style={{ background: 'rgba(0, 255, 136, 0.2)' }}>
                  <span className="material-icons" style={{ color: '#00ff88' }}>trending_up</span>
                </div>
                <div className={styles.metricInfo}>
                  <div className={styles.metricValue}>{metrics?.userActivity?.activeBacktestUsers || 0}</div>
                  <div className={styles.metricLabel}>Active Backtest Users</div>
                  <div className={styles.metricSubtext}>Last 24h</div>
                </div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricIcon} style={{ background: 'rgba(157, 78, 221, 0.2)' }}>
                  <span className="material-icons" style={{ color: '#9d4edd' }}>group</span>
                </div>
                <div className={styles.metricInfo}>
                  <div className={styles.metricValue}>{formatNumber(metrics?.userActivity?.totalUsers)}</div>
                  <div className={styles.metricLabel}>Total Users</div>
                </div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricIcon} style={{ background: 'rgba(255, 204, 0, 0.2)' }}>
                  <span className="material-icons" style={{ color: '#ffcc00' }}>person_add</span>
                </div>
                <div className={styles.metricInfo}>
                  <div className={styles.metricValue}>{metrics?.userActivity?.newUsersToday || 0}</div>
                  <div className={styles.metricLabel}>New Users Today</div>
                </div>
              </div>
            </div>
          </div>

          {/* Job Queue Section */}
          <div className={styles.section}>
            <h2><span className="material-icons">queue</span> Job Queue</h2>
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <div className={styles.metricIcon} style={{ background: 'rgba(255, 204, 0, 0.2)' }}>
                  <span className="material-icons" style={{ color: '#ffcc00' }}>pending</span>
                </div>
                <div className={styles.metricInfo}>
                  <div className={styles.metricValue}>{metrics?.jobMetrics?.queued || 0}</div>
                  <div className={styles.metricLabel}>Queued</div>
                </div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricIcon} style={{ background: 'rgba(68, 136, 255, 0.2)' }}>
                  <span className="material-icons" style={{ color: '#4488ff' }}>sync</span>
                </div>
                <div className={styles.metricInfo}>
                  <div className={styles.metricValue}>{metrics?.jobMetrics?.running || 0}</div>
                  <div className={styles.metricLabel}>Running</div>
                </div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricIcon} style={{ background: 'rgba(0, 255, 136, 0.2)' }}>
                  <span className="material-icons" style={{ color: '#00ff88' }}>check_circle</span>
                </div>
                <div className={styles.metricInfo}>
                  <div className={styles.metricValue}>{metrics?.jobMetrics?.completed || 0}</div>
                  <div className={styles.metricLabel}>Completed (24h)</div>
                </div>
              </div>
              <div className={styles.metricCard}>
                <div className={styles.metricIcon} style={{ background: 'rgba(255, 68, 68, 0.2)' }}>
                  <span className="material-icons" style={{ color: '#ff4444' }}>error</span>
                </div>
                <div className={styles.metricInfo}>
                  <div className={styles.metricValue}>{metrics?.jobMetrics?.failed || 0}</div>
                  <div className={styles.metricLabel}>Failed (24h)</div>
                </div>
              </div>
            </div>

            {/* Job Performance */}
            <div className={styles.performanceGrid}>
              <div className={styles.performanceCard}>
                <span className="material-icons">speed</span>
                <div>
                  <div className={styles.perfValue}>{formatMs(metrics?.jobMetrics?.avgRuntimeMs)}</div>
                  <div className={styles.perfLabel}>Avg Runtime</div>
                </div>
              </div>
              <div className={styles.performanceCard}>
                <span className="material-icons">trending_up</span>
                <div>
                  <div className={styles.perfValue}>{formatMs(metrics?.jobMetrics?.p95RuntimeMs)}</div>
                  <div className={styles.perfLabel}>P95 Runtime</div>
                </div>
              </div>
              <div className={styles.performanceCard}>
                <span className="material-icons">schedule</span>
                <div>
                  <div className={styles.perfValue}>{formatMs(metrics?.jobMetrics?.avgWaitTimeMs)}</div>
                  <div className={styles.perfLabel}>Avg Wait Time</div>
                </div>
              </div>
            </div>
          </div>

          {/* Two Column Layout */}
          <div className={styles.twoColumn}>
            {/* Heavy Users */}
            <div className={styles.section}>
              <h2><span className="material-icons">local_fire_department</span> Heavy Users (Top 5)</h2>
              <div className={styles.listContainer}>
                {metrics?.heavyUsers?.length > 0 ? (
                  metrics.heavyUsers.map((user, idx) => (
                    <div key={user.id || idx} className={styles.listItem}>
                      <div className={styles.listRank}>{idx + 1}</div>
                      <div className={styles.listInfo}>
                        <div className={styles.listName}>{user.name || user.email || 'Unknown'}</div>
                        <div className={styles.listSub}>{user.email}</div>
                      </div>
                      <div className={styles.listValue}>
                        <span>{user.computeUnits || user._count?.backtestRuns || 0}</span>
                        <span className={styles.listUnit}>jobs</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyList}>No data available</div>
                )}
              </div>
            </div>

            {/* Rate Limiting */}
            <div className={styles.section}>
              <h2><span className="material-icons">security</span> Rate Limiting (7 days)</h2>
              <div className={styles.rateLimitGrid}>
                <div className={styles.rateLimitCard}>
                  <div className={styles.rateLimitValue}>{formatNumber(metrics?.rateLimiting?.totalHits)}</div>
                  <div className={styles.rateLimitLabel}>Total Hits</div>
                </div>
                <div className={styles.rateLimitCard} style={{ borderColor: '#ff4444' }}>
                  <div className={styles.rateLimitValue} style={{ color: '#ff4444' }}>
                    {formatNumber(metrics?.rateLimiting?.blockedRequests)}
                  </div>
                  <div className={styles.rateLimitLabel}>Blocked</div>
                </div>
                <div className={styles.rateLimitCard} style={{ borderColor: '#ff6b6b' }}>
                  <div className={styles.rateLimitValue} style={{ color: '#ff6b6b' }}>
                    {metrics?.rateLimiting?.abuseFlags || 0}
                  </div>
                  <div className={styles.rateLimitLabel}>Abuse Flags</div>
                </div>
              </div>
              {metrics?.rateLimiting?.topEndpoints?.length > 0 && (
                <div className={styles.topEndpoints}>
                  <h4>Top Rate-Limited Endpoints</h4>
                  {metrics.rateLimiting.topEndpoints.map((ep, idx) => (
                    <div key={idx} className={styles.endpointItem}>
                      <span className={styles.endpointName}>{ep.endpoint}</span>
                      <span className={styles.endpointCount}>{ep.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Feature Usage & Data Freshness */}
          <div className={styles.twoColumn}>
            {/* Feature Usage */}
            <div className={styles.section}>
              <h2><span className="material-icons">analytics</span> Feature Usage (Top 5)</h2>
              <div className={styles.listContainer}>
                {metrics?.featureUsage?.topFeatures?.length > 0 ? (
                  metrics.featureUsage.topFeatures.map((feature, idx) => (
                    <div key={idx} className={styles.featureItem}>
                      <div className={styles.featureName}>{feature.feature}</div>
                      <div className={styles.featureBar}>
                        <div 
                          className={styles.featureProgress}
                          style={{ 
                            width: `${(feature.count / (metrics.featureUsage.topFeatures[0]?.count || 1)) * 100}%` 
                          }}
                        />
                      </div>
                      <div className={styles.featureCount}>{formatNumber(feature.count)}</div>
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyList}>No feature usage data</div>
                )}
              </div>
            </div>

            {/* Data Freshness */}
            <div className={styles.section}>
              <h2><span className="material-icons">sync</span> Data Freshness</h2>
              <div className={styles.listContainer}>
                {metrics?.dataFreshness?.length > 0 ? (
                  metrics.dataFreshness.map((source, idx) => (
                    <div key={idx} className={styles.dataSourceItem}>
                      <span className={`material-icons ${styles.statusIcon}`} 
                        style={{ color: source.status === 'healthy' ? '#00ff88' : source.status === 'delayed' ? '#ffcc00' : '#ff4444' }}>
                        {source.status === 'healthy' ? 'check_circle' : source.status === 'delayed' ? 'schedule' : 'error'}
                      </span>
                      <div className={styles.dataSourceInfo}>
                        <div className={styles.dataSourceName}>{source.source}</div>
                        <div className={styles.dataSourceLag}>
                          {source.dataLagSeconds ? `${source.dataLagSeconds}s lag` : 'Unknown'}
                        </div>
                      </div>
                      <div className={styles.dataSourceStatus}>{source.status}</div>
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyList}>
                    <span className="material-icons">info</span>
                    No data sources configured
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Backtest Stats */}
          <div className={styles.section}>
            <h2><span className="material-icons">show_chart</span> Backtest Statistics (30 days)</h2>
            <div className={styles.backtestStatsGrid}>
              <div className={styles.backtestStatCard}>
                <div className={styles.backtestStatValue}>{formatNumber(metrics?.backtestStats?.total)}</div>
                <div className={styles.backtestStatLabel}>Total Backtests</div>
              </div>
              <div className={styles.backtestStatCard}>
                <div className={styles.backtestStatValue}>{metrics?.backtestStats?.avgPerUser || 0}</div>
                <div className={styles.backtestStatLabel}>Avg per User</div>
              </div>
            </div>
            <div className={styles.twoColumn} style={{ marginTop: '1rem' }}>
              <div className={styles.topList}>
                <h4>Top Assets</h4>
                {metrics?.backtestStats?.topAssets?.length > 0 ? (
                  metrics.backtestStats.topAssets.map((asset, idx) => (
                    <div key={idx} className={styles.topListItem}>
                      <span>{asset.asset}</span>
                      <span>{formatNumber(asset.count)}</span>
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyList}>No data</div>
                )}
              </div>
              <div className={styles.topList}>
                <h4>Top Intervals</h4>
                {metrics?.backtestStats?.topIntervals?.length > 0 ? (
                  metrics.backtestStats.topIntervals.map((interval, idx) => (
                    <div key={idx} className={styles.topListItem}>
                      <span>{interval.interval}</span>
                      <span>{formatNumber(interval.count)}</span>
                    </div>
                  ))
                ) : (
                  <div className={styles.emptyList}>No data</div>
                )}
              </div>
            </div>
          </div>

          {/* Admin Audit Log */}
          <div className={styles.section}>
            <h2><span className="material-icons">history</span> Admin Audit Log (Last 20)</h2>
            <div className={styles.auditLogContainer}>
              {metrics?.auditLog?.length > 0 ? (
                <table className={styles.auditTable}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.auditLog.map((log, idx) => (
                      <tr key={log.id || idx}>
                        <td>{new Date(log.createdAt).toLocaleString()}</td>
                        <td>
                          <span className={styles.actionBadge}>{log.action}</span>
                        </td>
                        <td>{log.targetUserId || '-'}</td>
                        <td className={styles.detailsCell}>
                          {typeof log.details === 'object' ? JSON.stringify(log.details) : log.details || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className={styles.emptyList}>
                  <span className="material-icons">history</span>
                  No audit log entries yet
                </div>
              )}
            </div>
          </div>

          {/* System Info */}
          <div className={styles.systemInfo}>
            <div className={styles.systemInfoItem}>
              <span className="material-icons">schedule</span>
              <span>Server Uptime: {metrics?.uptime ? Math.floor(metrics.uptime / 3600) + 'h ' + Math.floor((metrics.uptime % 3600) / 60) + 'm' : 'N/A'}</span>
            </div>
            <div className={styles.systemInfoItem}>
              <span className="material-icons">access_time</span>
              <span>Server Time: {metrics?.serverTime ? new Date(metrics.serverTime).toLocaleString() : 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
