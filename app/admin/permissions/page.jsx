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
  const [currentUserRole, setCurrentUserRole] = useState(null)
  
  // Permissions structure: { role: { pageId: true/false } }
  const [permissions, setPermissions] = useState({
    user: {},
    moderator: {},
    admin: {}
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
        await loadPermissions()
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
        </div>
      </div>
    </div>
  )
}

