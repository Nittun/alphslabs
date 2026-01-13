'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import Link from 'next/link'
import styles from '../page.module.css'

export default function AdminFeedbackPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [feedback, setFeedback] = useState([])
  const [feedbackCounts, setFeedbackCounts] = useState({ unread: 0, read: 0, replied: 0, archived: 0, total: 0 })
  const [feedbackFilter, setFeedbackFilter] = useState('all')
  const [selectedFeedback, setSelectedFeedback] = useState(null)
  const [loading, setLoading] = useState(true)

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
        await loadFeedback()
      } catch (error) {
        console.error('Error checking admin status:', error)
        router.push('/backtest')
      }
    }

    checkAdmin()
  }, [session, status, router])

  const loadFeedback = useCallback(async (statusFilter = null) => {
    try {
      setLoading(true)
      const url = statusFilter ? `/api/admin/feedback?status=${statusFilter}` : '/api/admin/feedback'
      const response = await fetch(url)
      const data = await response.json()
      
      if (data.success) {
        setFeedback(data.feedback || [])
        setFeedbackCounts(data.counts || { unread: 0, read: 0, replied: 0, archived: 0, total: 0 })
      } else {
        console.error('Failed to load feedback:', data.error)
      }
    } catch (error) {
      console.error('Error loading feedback:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentUserRole) {
      loadFeedback(feedbackFilter === 'all' ? null : feedbackFilter)
    }
  }, [feedbackFilter, currentUserRole, loadFeedback])

  const updateFeedbackStatus = async (id, newStatus) => {
    try {
      const response = await fetch('/api/admin/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus })
      })
      const data = await response.json()
      if (data.success) {
        await loadFeedback(feedbackFilter === 'all' ? null : feedbackFilter)
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: `Marked as ${newStatus}`,
          showConfirmButton: false,
          timer: 1500,
          background: '#1a1a2e',
          color: '#fff'
        })
      }
    } catch (error) {
      console.error('Error updating feedback:', error)
    }
  }

  const deleteFeedback = async (id) => {
    const result = await Swal.fire({
      title: 'Delete Feedback?',
      text: 'This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff4444',
      cancelButtonColor: '#666',
      confirmButtonText: 'Delete',
      background: '#1a1a2e',
      color: '#fff'
    })

    if (result.isConfirmed) {
      try {
        const response = await fetch(`/api/admin/feedback?id=${id}`, { method: 'DELETE' })
        const data = await response.json()
        if (data.success) {
          await loadFeedback(feedbackFilter === 'all' ? null : feedbackFilter)
          setSelectedFeedback(null)
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'Feedback deleted',
            showConfirmButton: false,
            timer: 1500,
            background: '#1a1a2e',
            color: '#fff'
          })
        }
      } catch (error) {
        console.error('Error deleting feedback:', error)
      }
    }
  }

  const getSubjectColor = (subject) => {
    switch (subject) {
      case 'bug': return '#ff4444'
      case 'feature': return '#00ff88'
      case 'feedback': return '#9d4edd'
      case 'other': return '#ffaa00'
      default: return '#4488ff'
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
              <p>Loading feedback...</p>
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
            <Link href="/admin" className={styles.backLink}>
              <span className="material-icons">arrow_back</span>
              Back to Admin
            </Link>
            <h1>
              <span className="material-icons" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}>feedback</span>
              User Feedback
              {feedbackCounts.unread > 0 && (
                <span className={styles.feedbackBadge}>{feedbackCounts.unread} unread</span>
              )}
            </h1>
            <p className={styles.subtitle}>
              Review and manage user feedback, bug reports, and feature requests
            </p>
          </div>

          {/* Stats Cards */}
          <div className={styles.statsGrid} style={{ marginBottom: '1.5rem' }}>
            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(68, 136, 255, 0.15)' }}>
                <span className="material-icons" style={{ color: '#4488ff' }}>mail</span>
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{feedbackCounts.total}</span>
                <span className={styles.statLabel}>Total</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(255, 68, 68, 0.15)' }}>
                <span className="material-icons" style={{ color: '#ff4444' }}>mark_email_unread</span>
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{feedbackCounts.unread}</span>
                <span className={styles.statLabel}>Unread</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(0, 255, 136, 0.15)' }}>
                <span className="material-icons" style={{ color: '#00ff88' }}>reply</span>
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{feedbackCounts.replied}</span>
                <span className={styles.statLabel}>Replied</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(255, 170, 0, 0.15)' }}>
                <span className="material-icons" style={{ color: '#ffaa00' }}>archive</span>
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{feedbackCounts.archived}</span>
                <span className={styles.statLabel}>Archived</span>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className={styles.feedbackHeader}>
            <div className={styles.feedbackFilters}>
              {['all', 'unread', 'read', 'replied', 'archived'].map(filterStatus => (
                <button
                  key={filterStatus}
                  className={`${styles.feedbackFilterBtn} ${feedbackFilter === filterStatus ? styles.active : ''}`}
                  onClick={() => setFeedbackFilter(filterStatus)}
                >
                  {filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}
                  {filterStatus !== 'all' && feedbackCounts[filterStatus] > 0 && (
                    <span className={styles.filterCount}>{feedbackCounts[filterStatus]}</span>
                  )}
                </button>
              ))}
            </div>
            <button 
              className={styles.refreshButton}
              onClick={() => loadFeedback(feedbackFilter === 'all' ? null : feedbackFilter)}
            >
              <span className="material-icons">refresh</span>
              Refresh
            </button>
          </div>

          {/* Feedback Container */}
          <div className={styles.feedbackContainer}>
            {/* Feedback List */}
            <div className={styles.feedbackList}>
              {loading ? (
                <div className={styles.emptyFeedback}>
                  <span className="material-icons" style={{ animation: 'spin 1s linear infinite' }}>refresh</span>
                  <p>Loading...</p>
                </div>
              ) : feedback.length > 0 ? (
                feedback.map(fb => (
                  <div
                    key={fb.id}
                    className={`${styles.feedbackItem} ${selectedFeedback?.id === fb.id ? styles.selected : ''} ${fb.status === 'unread' ? styles.unread : ''}`}
                    onClick={() => {
                      setSelectedFeedback(fb)
                      if (fb.status === 'unread') {
                        updateFeedbackStatus(fb.id, 'read')
                      }
                    }}
                  >
                    <div className={styles.feedbackItemHeader}>
                      <span className={styles.feedbackName}>{fb.name}</span>
                      <span 
                        className={styles.feedbackSubject}
                        style={{ 
                          background: `${getSubjectColor(fb.subject)}20`,
                          color: getSubjectColor(fb.subject)
                        }}
                      >
                        {fb.subject}
                      </span>
                    </div>
                    <div className={styles.feedbackEmail}>{fb.email}</div>
                    <div className={styles.feedbackPreview}>
                      {fb.message.length > 100 ? fb.message.substring(0, 100) + '...' : fb.message}
                    </div>
                    <div className={styles.feedbackDate}>
                      {new Date(fb.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.emptyFeedback}>
                  <span className="material-icons">inbox</span>
                  <p>No {feedbackFilter !== 'all' ? feedbackFilter : ''} feedback</p>
                </div>
              )}
            </div>

            {/* Feedback Detail */}
            {selectedFeedback ? (
              <div className={styles.feedbackDetail}>
                <div className={styles.feedbackDetailHeader}>
                  <div>
                    <h3>{selectedFeedback.name}</h3>
                    <a href={`mailto:${selectedFeedback.email}`} className={styles.feedbackDetailEmail}>
                      {selectedFeedback.email}
                    </a>
                  </div>
                  <button className={styles.closeDetailBtn} onClick={() => setSelectedFeedback(null)}>
                    <span className="material-icons">close</span>
                  </button>
                </div>
                
                <div className={styles.feedbackMeta}>
                  <span 
                    className={styles.feedbackSubjectBadge}
                    style={{ 
                      background: `${getSubjectColor(selectedFeedback.subject)}20`,
                      color: getSubjectColor(selectedFeedback.subject)
                    }}
                  >
                    {selectedFeedback.subject}
                  </span>
                  <span className={`${styles.statusBadge} ${styles[selectedFeedback.status]}`}>
                    {selectedFeedback.status}
                  </span>
                  <span className={styles.feedbackTime}>
                    {new Date(selectedFeedback.createdAt).toLocaleString()}
                  </span>
                </div>
                
                <div className={styles.feedbackMessage}>
                  {selectedFeedback.message}
                </div>
                
                <div className={styles.feedbackActions}>
                  <a
                    href={`mailto:${selectedFeedback.email}?subject=Re: ${selectedFeedback.subject} - Alphalabs Support`}
                    className={`${styles.feedbackActionBtn} ${styles.reply}`}
                  >
                    <span className="material-icons">email</span>
                    Reply via Email
                  </a>
                  <button
                    className={`${styles.feedbackActionBtn} ${styles.markRead}`}
                    onClick={() => updateFeedbackStatus(selectedFeedback.id, 'replied')}
                  >
                    <span className="material-icons">check</span>
                    Mark Replied
                  </button>
                  <button
                    className={`${styles.feedbackActionBtn} ${styles.archive}`}
                    onClick={() => updateFeedbackStatus(selectedFeedback.id, 'archived')}
                  >
                    <span className="material-icons">archive</span>
                    Archive
                  </button>
                  <button
                    className={`${styles.feedbackActionBtn} ${styles.delete}`}
                    onClick={() => deleteFeedback(selectedFeedback.id)}
                  >
                    <span className="material-icons">delete</span>
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.feedbackDetailEmpty}>
                <span className="material-icons">touch_app</span>
                <p>Select a feedback item to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
