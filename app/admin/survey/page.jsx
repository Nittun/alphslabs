'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import Link from 'next/link'
import styles from '../page.module.css'

export default function AdminSurveyPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [responses, setResponses] = useState([])
  const [stats, setStats] = useState(null)

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
        const isAdmin =
          user.id === 'cmjzbir7y0000eybbir608elt' ||
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
        await loadSurvey()
      } catch (error) {
        console.error('Error checking admin status:', error)
        router.push('/backtest')
      }
    }

    checkAdmin()
  }, [session, status, router])

  const loadSurvey = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/survey?limit=200')
      const data = await response.json()
      if (data.success) {
        setResponses(data.responses || [])
        setStats(data.stats || null)
      } else {
        console.error('Failed to load survey:', data.error)
      }
    } catch (e) {
      console.error('Error loading survey:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const avgRow = useMemo(() => {
    if (!stats) return null
    const fmt = (v) => (typeof v === 'number' ? v.toFixed(2) : '-')
    return {
      overall: fmt(stats.overallAvg),
      useful: fmt(stats.usefulAvg),
      ui: fmt(stats.uiAvg),
      function: fmt(stats.functionAvg),
      features: fmt(stats.featuresAvg),
      performance: fmt(stats.performanceAvg),
      sample: stats.sampleSize ?? 0
    }
  }, [stats])

  if (status === 'loading' || !currentUserRole) {
    return (
      <div className={styles.dashboard}>
        <Sidebar onCollapseChange={setSidebarCollapsed} />
        <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
          <TopBar sidebarCollapsed={sidebarCollapsed} />
          <div className={styles.content}>
            <div className={styles.loading}>
              <span className="material-icons" style={{ fontSize: '3rem', animation: 'spin 1s linear infinite' }}>refresh</span>
              <p>Loading survey responses...</p>
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
          <div className={styles.headerSection}>
            <Link href="/admin" className={styles.backLink}>
              <span className="material-icons">arrow_back</span>
              Back to Admin
            </Link>
            <h1>
              <span className="material-icons" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}>assignment</span>
              Survey Responses
            </h1>
            <p className={styles.subtitle}>User ratings, comments, and pricing willingness</p>
          </div>

          <div className={styles.card} style={{ overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ color: '#aaa', fontSize: '0.9rem' }}>
                Total loaded: <strong style={{ color: '#fff' }}>{responses.length}</strong>
              </div>
              <button
                className={styles.refreshButton}
                onClick={loadSurvey}
                disabled={loading}
              >
                <span className="material-icons">refresh</span>
                Refresh
              </button>
            </div>

            {avgRow && (
              <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.18)' }}>
                <div style={{ color: '#fff', fontWeight: 700, marginBottom: '0.35rem' }}>Averages (sample: {avgRow.sample})</div>
                <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', color: '#bbb', fontSize: '0.85rem' }}>
                  <span><strong>Overall</strong>: {avgRow.overall}</span>
                  <span><strong>Useful</strong>: {avgRow.useful}</span>
                  <span><strong>UI</strong>: {avgRow.ui}</span>
                  <span><strong>Function</strong>: {avgRow.function}</span>
                  <span><strong>Features</strong>: {avgRow.features}</span>
                  <span><strong>Performance</strong>: {avgRow.performance}</span>
                </div>
              </div>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#aaa', fontSize: '0.8rem' }}>
                  <th style={{ padding: '0.6rem' }}>Created</th>
                  <th style={{ padding: '0.6rem' }}>User</th>
                  <th style={{ padding: '0.6rem' }}>Overall</th>
                  <th style={{ padding: '0.6rem' }}>Useful</th>
                  <th style={{ padding: '0.6rem' }}>UI</th>
                  <th style={{ padding: '0.6rem' }}>Function</th>
                  <th style={{ padding: '0.6rem' }}>Features</th>
                  <th style={{ padding: '0.6rem' }}>Perf</th>
                  <th style={{ padding: '0.6rem' }}>Pay/mo</th>
                  <th style={{ padding: '0.6rem' }}>Requested Features</th>
                </tr>
              </thead>
              <tbody>
                {responses.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '0.6rem', color: '#bbb', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                      {r.createdAt ? new Date(r.createdAt).toLocaleString() : '-'}
                    </td>
                    <td style={{ padding: '0.6rem', color: '#ddd', fontSize: '0.85rem' }}>
                      {r.userEmail || '-'}
                    </td>
                    <td style={{ padding: '0.6rem', color: '#fff', fontWeight: 700 }}>{r.overallRating}</td>
                    <td style={{ padding: '0.6rem', color: '#ddd' }}>{r.usefulRating}</td>
                    <td style={{ padding: '0.6rem', color: '#ddd' }}>{r.uiRating}</td>
                    <td style={{ padding: '0.6rem', color: '#ddd' }}>{r.functionRating}</td>
                    <td style={{ padding: '0.6rem', color: '#ddd' }}>{r.featuresRating}</td>
                    <td style={{ padding: '0.6rem', color: '#ddd' }}>{r.performanceRating}</td>
                    <td style={{ padding: '0.6rem', color: '#ddd', whiteSpace: 'nowrap' }}>
                      {typeof r.willingToPayAmount === 'number' ? `${r.willingToPayAmount} ${r.willingToPayCurrency || ''}` : '-'}
                    </td>
                    <td style={{ padding: '0.6rem', color: '#bbb', maxWidth: 420 }}>
                      <div style={{ overflowWrap: 'anywhere' }}>
                        {r.requestedFeatures || '-'}
                      </div>
                      {r.additionalComments && (
                        <div style={{ marginTop: '0.35rem', color: '#888' }}>
                          <strong>Notes:</strong> {r.additionalComments}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!responses.length && !loading && (
                  <tr>
                    <td colSpan={10} style={{ padding: '1rem', color: '#888' }}>
                      No survey responses yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

