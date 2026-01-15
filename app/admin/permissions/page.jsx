'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import Link from 'next/link'
import styles from '../page.module.css'

// Available pages in the application
const AVAILABLE_PAGES = [
  { id: 'backtest', name: 'Backtest', description: 'Trading strategy backtesting page' },
  { id: 'optimize', name: 'Algorithmic Optimization', description: 'Strategy optimization and parameter tuning' },
  { id: 'optimize-new', name: 'Strategy Builder', description: 'Notebook-style strategy builder with analysis components' },
  { id: 'strategy-maker', name: 'Indicator Sandbox', description: 'Visual drag-and-drop indicator testing environment' },
  { id: 'survey', name: 'Survey', description: 'Product survey and donation page' },
  { id: 'documents', name: 'Documents', description: 'Technical documentation and calculation reference' },
  { id: 'current-position', name: 'Current Position', description: 'Real-time position monitoring' },
  { id: 'profile', name: 'Profile', description: 'User profile and settings' },
  { id: 'connections', name: 'Connections', description: 'Database and API connections' },
  { id: 'settings', name: 'Settings', description: 'Application settings' },
  { id: 'help', name: 'Help', description: 'Help and documentation' },
  { id: 'admin', name: 'Admin Panel', description: 'Administration dashboard' },
]

const USER_TYPES = [
  { id: 'user', name: 'User', color: '#4488ff' },
  { id: 'moderator', name: 'Moderator', color: '#ffcc00' },
  { id: 'admin', name: 'Admin', color: '#9d4edd' },
]

export default function AdminPermissionsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingNudge, setSavingNudge] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState(null)
  
  // Permissions structure: { role: { pageId: true/false } }
  const [permissions, setPermissions] = useState({
    user: {},
    moderator: {},
    admin: {}
  })

  // Survey nudge settings (system-wide)
  const [surveyNudge, setSurveyNudge] = useState({
    enabled: true,
    message: 'After exploring the site please share your thought on the project',
    version: 1
  })

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
        await Promise.all([loadPermissions(), loadSurveyNudge()])
      } catch (error) {
        console.error('Error checking admin status:', error)
        router.push('/backtest')
      }
    }

    checkAdmin()
  }, [session, status, router])

  const loadPermissions = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/permissions')
      const data = await response.json()
      
      if (data.success && data.permissions) {
        setPermissions(data.permissions)
      } else {
        // Set defaults: admin has access to everything, users have access to basic pages
        setPermissions({
          user: {
            'backtest': true,
            'optimize': true,
            'optimize-new': true,
            'strategy-maker': true,
            'survey': true,
            'documents': true,
            'current-position': true,
            'profile': true,
            'connections': true,
            'settings': true,
            'help': true,
            'admin': false
          },
          moderator: {
            'backtest': true,
            'optimize': true,
            'optimize-new': true,
            'strategy-maker': true,
            'survey': true,
            'documents': true,
            'current-position': true,
            'profile': true,
            'connections': true,
            'settings': true,
            'help': true,
            'admin': false
          },
          admin: {
            'backtest': true,
            'optimize': true,
            'optimize-new': true,
            'strategy-maker': true,
            'survey': true,
            'documents': true,
            'current-position': true,
            'profile': true,
            'connections': true,
            'settings': true,
            'help': true,
            'admin': true
          }
        })
      }
    } catch (error) {
      console.error('Error loading permissions:', error)
      // Set defaults on error
      setPermissions({
        user: {
          'backtest': true,
          'optimize': true,
          'optimize-new': true,
          'strategy-maker': true,
          'survey': true,
          'documents': true,
          'current-position': true,
          'profile': true,
          'connections': true,
          'settings': true,
          'help': true,
          'admin': false
        },
        moderator: {
          'backtest': true,
          'optimize': true,
          'optimize-new': true,
          'strategy-maker': true,
          'survey': true,
          'documents': true,
          'current-position': true,
          'profile': true,
          'connections': true,
          'settings': true,
          'help': true,
          'admin': false
        },
        admin: {
          'backtest': true,
          'optimize': true,
          'optimize-new': true,
          'strategy-maker': true,
          'survey': true,
          'documents': true,
          'current-position': true,
          'profile': true,
          'connections': true,
          'settings': true,
          'help': true,
          'admin': true
        }
      })
    } finally {
      setLoading(false)
    }
  }

  const loadSurveyNudge = async () => {
    try {
      const response = await fetch('/api/admin/survey-nudge')
      const data = await response.json()
      if (data.success && data.surveyNudge) {
        setSurveyNudge(data.surveyNudge)
      }
    } catch (e) {
      // ignore
    }
  }

  const saveSurveyNudge = async ({ bumpVersion = false } = {}) => {
    try {
      setSavingNudge(true)
      const response = await fetch('/api/admin/survey-nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyNudge, bumpVersion })
      })
      const data = await response.json()
      if (data.success && data.surveyNudge) {
        setSurveyNudge(data.surveyNudge)
        Swal.fire({
          icon: 'success',
          title: bumpVersion ? 'Nudge Reset' : 'Nudge Saved',
          text: bumpVersion ? 'The nudge will show again for everyone (once).' : 'Survey nudge settings updated.',
          background: '#1a1a1a',
          color: '#fff',
          confirmButtonColor: '#00ff88',
          timer: 1600,
          timerProgressBar: true
        })
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: data.error || 'Failed to save nudge settings',
          background: '#1a1a1a',
          color: '#fff',
          confirmButtonColor: '#ff4444'
        })
      }
    } catch (e) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to save nudge settings',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#ff4444'
      })
    } finally {
      setSavingNudge(false)
    }
  }

  const handlePermissionToggle = (roleId, pageId) => {
    setPermissions(prev => ({
      ...prev,
      [roleId]: {
        ...prev[roleId],
        [pageId]: !prev[roleId][pageId]
      }
    }))
  }

  const handleSavePermissions = async () => {
    // Show confirmation dialog first
    const result = await Swal.fire({
      title: 'Confirm Save Permissions',
      html: 'Are you sure you want to save these permission changes?<br/><br/>This will immediately affect what pages users can access based on their role.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, save permissions',
      cancelButtonText: 'Cancel',
      background: '#1a1a1a',
      color: '#fff',
      confirmButtonColor: '#00ff88',
      cancelButtonColor: '#666'
    })

    if (!result.isConfirmed) {
      return
    }

    try {
      setSaving(true)
      const response = await fetch('/api/admin/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions })
      })

      const data = await response.json()

      if (data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Permissions Saved',
          text: 'Page permissions have been updated successfully',
          background: '#1a1a1a',
          color: '#fff',
          confirmButtonColor: '#00ff88',
          timer: 2000,
          timerProgressBar: true
        })
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: data.error || 'Failed to save permissions',
          background: '#1a1a1a',
          color: '#fff',
          confirmButtonColor: '#ff4444'
        })
      }
    } catch (error) {
      console.error('Error saving permissions:', error)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to save permissions',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#ff4444'
      })
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading' || loading || !currentUserRole) {
    return (
      <div className={styles.dashboard}>
        <Sidebar onCollapseChange={setSidebarCollapsed} />
        <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
          <TopBar sidebarCollapsed={sidebarCollapsed} />
          <div className={styles.content}>
            <div className={styles.loading}>
              <span className="material-icons" style={{ fontSize: '3rem', animation: 'spin 1s linear infinite' }}>refresh</span>
              <p>Loading permissions...</p>
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
          {/* Breadcrumb */}
          <div className={styles.breadcrumb}>
            <Link href="/admin" className={styles.breadcrumbLink}>
              Admin Panel
            </Link>
            <span className={styles.breadcrumbSeparator}>/</span>
            <span className={styles.breadcrumbCurrent}>Page Permissions</span>
          </div>

          <div className={styles.headerSection}>
            <div>
              <h1>
                <span className="material-icons" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}>lock</span>
                Page Permissions
              </h1>
              <p className={styles.subtitle}>Configure which pages each user role can access</p>
            </div>
          </div>
          <button 
              className={styles.saveButton}
              onClick={handleSavePermissions}
              disabled={saving}
            >
              <span className="material-icons">{saving ? 'hourglass_empty' : 'save'}</span>
              {saving ? 'Saving...' : 'Save Permissions'}
            </button>
          {/* Permissions Table */}
          <div className={styles.permissionsContainer}>
            <div className={styles.permissionsTableWrapper}>
              <table className={styles.permissionsTable}>
                <thead>
                  <tr>
                    <th className={styles.pageColumn}>Page</th>
                    {USER_TYPES.map(type => (
                      <th key={type.id} className={styles.roleColumn}>
                        <div className={styles.roleHeader}>
                          <span 
                            className={styles.roleBadge} 
                            style={{ 
                              backgroundColor: `${type.color}20`, 
                              borderColor: `${type.color}40`,
                              color: type.color
                            }}
                          >
                            {type.name}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AVAILABLE_PAGES.map(page => (
                    <tr key={page.id}>
                      <td className={styles.pageCell}>
                        <div className={styles.pageInfo}>
                          <div className={styles.pageName}>{page.name}</div>
                          <div className={styles.pageDescription}>{page.description}</div>
                        </div>
                      </td>
                      {USER_TYPES.map(type => (
                        <td key={type.id} className={styles.checkboxCell}>
                          <label className={styles.checkboxLabel}>
                            <input
                              type="checkbox"
                              checked={permissions[type.id]?.[page.id] || false}
                              onChange={() => handlePermissionToggle(type.id, page.id)}
                              className={styles.checkbox}
                              disabled={type.id === 'admin' && page.id === 'admin'} // Admin always has admin access
                            />
                            <span className={styles.checkmark}></span>
                          </label>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Save Button Section */}
          <div className={styles.saveSection}>
            <div className={styles.infoNote}>
              <span className="material-icons">info</span>
              <div>
                <strong>Note:</strong> Changes will take effect immediately. Users will see or lose access to pages based on their role and these permission settings.
              </div>
            </div>
 
          </div>

          {/* Survey Nudge Settings */}
          <div className={styles.permissionsContainer} style={{ marginTop: '1.25rem' }}>
            <div className={styles.permissionsHeader} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>
                  <span className="material-icons" style={{ verticalAlign: 'middle', marginRight: '0.5rem', color: '#ffaa00' }}>campaign</span>
                  Survey Nudge
                </h2>
                <p className={styles.subtitle} style={{ marginTop: '0.25rem' }}>
                  Control the one-time sidebar prompt for all users.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  className={styles.saveButton}
                  onClick={() => saveSurveyNudge({ bumpVersion: true })}
                  disabled={savingNudge}
                  style={{ background: 'rgba(255, 170, 0, 0.12)', border: '1px solid rgba(255, 170, 0, 0.35)', color: '#ffaa00' }}
                >
                  <span className="material-icons">{savingNudge ? 'hourglass_empty' : 'restart_alt'}</span>
                  {savingNudge ? 'Working...' : 'Show Again to Everyone'}
                </button>
                <button
                  className={styles.saveButton}
                  onClick={() => saveSurveyNudge({ bumpVersion: false })}
                  disabled={savingNudge}
                >
                  <span className="material-icons">{savingNudge ? 'hourglass_empty' : 'save'}</span>
                  {savingNudge ? 'Saving...' : 'Save Nudge'}
                </button>
              </div>
            </div>

            <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#ddd', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={!!surveyNudge.enabled}
                  onChange={(e) => setSurveyNudge((p) => ({ ...p, enabled: e.target.checked }))}
                />
                Enable nudge
                <span style={{ color: '#888', fontWeight: 500, fontSize: '0.85rem' }}>
                  (version: {surveyNudge.version})
                </span>
              </label>

              <div>
                <label style={{ display: 'block', color: '#ddd', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Nudge text
                </label>
                <textarea
                  value={surveyNudge.message || ''}
                  onChange={(e) => setSurveyNudge((p) => ({ ...p, message: e.target.value }))}
                  rows={3}
                  style={{
                    width: '100%',
                    resize: 'vertical',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(0,0,0,0.25)',
                    color: '#fff',
                    fontSize: '0.95rem',
                    lineHeight: 1.4
                  }}
                  maxLength={240}
                  placeholder="After exploring the site please share your thought on the project"
                />
                <div style={{ marginTop: '0.35rem', color: '#888', fontSize: '0.8rem' }}>
                  Tip: Saving changes bumps the version so everyone sees it once again.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

