'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import styles from './page.module.css'

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [updatingRoles, setUpdatingRoles] = useState({})

  // Check if user is admin and load data
  useEffect(() => {
    const checkAdminAndLoad = async () => {
      if (status === 'loading') return
      
      if (!session?.user) {
        router.push('/login')
        return
      }

      try {
        // First check if current user is admin
        const userResponse = await fetch('/api/user')
        const userData = await userResponse.json()
        
        if (!userData.success || !userData.user) {
          router.push('/backtest')
          return
        }

        const user = userData.user
        // Handle case where role might be null/undefined (if migration not run yet)
        const isAdmin = user.id === 'cmjzbir7y0000eybbir608elt' || 
                       (user.role && user.role.toLowerCase() === 'admin')
        
        console.log('Admin page check:', { 
          userId: user.id, 
          userRole: user.role, 
          isAdmin: isAdmin,
          matchesId: user.id === 'cmjzbir7y0000eybbir608elt'
        })
        
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
        await loadUsers()
      } catch (error) {
        console.error('Error checking admin status:', error)
        router.push('/backtest')
      }
    }

    checkAdminAndLoad()
  }, [session, status, router])

  const loadUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/users')
      const data = await response.json()
      
      if (data.success) {
        setUsers(data.users || [])
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: data.error || 'Failed to load users',
          background: '#1a1a1a',
          color: '#fff',
          confirmButtonColor: '#ff4444'
        })
      }
    } catch (error) {
      console.error('Error loading users:', error)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to load users',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#ff4444'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userId, newRole) => {
    if (updatingRoles[userId]) return

    setUpdatingRoles(prev => ({ ...prev, [userId]: true }))

    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole })
      })

      const data = await response.json()

      if (data.success) {
        setUsers(prevUsers =>
          prevUsers.map(user =>
            user.id === userId ? { ...user, role: newRole } : user
          )
        )
        
        Swal.fire({
          icon: 'success',
          title: 'Role Updated',
          text: `User role has been updated to ${newRole}`,
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
          text: data.error || 'Failed to update user role',
          background: '#1a1a1a',
          color: '#fff',
          confirmButtonColor: '#ff4444'
        })
      }
    } catch (error) {
      console.error('Error updating role:', error)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to update user role',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#ff4444'
      })
    } finally {
      setUpdatingRoles(prev => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDateShort = (dateStr) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
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
          <div className={styles.headerSection}>
            <div>
              <h1>
                <span className="material-icons" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}>admin_panel_settings</span>
                Admin Panel
              </h1>
              <p className={styles.subtitle}>Manage users and their roles</p>
            </div>
            <button className={styles.refreshButton} onClick={loadUsers}>
              <span className="material-icons">refresh</span>
              Refresh
            </button>
          </div>

          {/* Stats */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className="material-icons">people</span>
              <div className={styles.statInfo}>
                <div className={styles.statValue}>{users.length}</div>
                <div className={styles.statLabel}>Total Users</div>
              </div>
            </div>
            <div className={styles.statCard}>
              <span className="material-icons">admin_panel_settings</span>
              <div className={styles.statInfo}>
                <div className={styles.statValue}>{users.filter(u => u.role === 'admin').length}</div>
                <div className={styles.statLabel}>Admins</div>
              </div>
            </div>
            <div className={styles.statCard}>
              <span className="material-icons">person</span>
              <div className={styles.statInfo}>
                <div className={styles.statValue}>{users.filter(u => u.role === 'user').length}</div>
                <div className={styles.statLabel}>Regular Users</div>
              </div>
            </div>
            <div className={styles.statCard}>
              <span className="material-icons">trending_up</span>
              <div className={styles.statInfo}>
                <div className={styles.statValue}>
                  {users.reduce((sum, u) => sum + (u._count?.backtestRuns || 0), 0)}
                </div>
                <div className={styles.statLabel}>Total Backtests</div>
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Last Login</th>
                  <th>Backtests</th>
                  <th>Configs</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan="8" className={styles.emptyRow}>
                      <span className="material-icons">people_outline</span>
                      <p>No users found</p>
                    </td>
                  </tr>
                ) : (
                  users.map(user => (
                    <tr key={user.id}>
                      <td>
                        <div className={styles.userCell}>
                          {user.image ? (
                            <img src={user.image} alt={user.name || 'User'} className={styles.avatar} />
                          ) : (
                            <div className={styles.avatarPlaceholder}>
                              {user.name?.charAt(0) || user.email?.charAt(0) || 'U'}
                            </div>
                          )}
                          <div className={styles.userInfo}>
                            <div className={styles.userName}>
                              {user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User'}
                            </div>
                            {user.id === 'cmjzbir7y0000eybbir608elt' && (
                              <span className={styles.primaryAdminBadge}>Primary Admin</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{user.email}</td>
                      <td>
                        <select
                          value={user.role || 'user'}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          disabled={updatingRoles[user.id] || user.id === 'cmjzbir7y0000eybbir608elt'}
                          className={`${styles.roleSelect} ${user.role === 'admin' ? styles.adminRole : styles.userRole}`}
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td>{formatDateShort(user.createdAt)}</td>
                      <td>
                        <div>
                          <div>{formatDate(user.lastLogin)}</div>
                          {user.lastLoginIp && (
                            <div className={styles.ipAddress}>{user.lastLoginIp}</div>
                          )}
                        </div>
                      </td>
                      <td>{user._count?.backtestRuns || 0}</td>
                      <td>{user._count?.backtestConfigs || 0}</td>
                      <td>
                        <div className={styles.actions}>
                          {updatingRoles[user.id] && (
                            <span className="material-icons" style={{ 
                              fontSize: '1rem', 
                              animation: 'spin 1s linear infinite',
                              color: '#4488ff'
                            }}>refresh</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

