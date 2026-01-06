'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import Link from 'next/link'
import styles from '../page.module.css'

export default function AdminUsersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState(null)
  const [updatingRoles, setUpdatingRoles] = useState({})
  const [pendingRoleChanges, setPendingRoleChanges] = useState({})
  const [searchQuery, setSearchQuery] = useState('')

  // Check if user is admin and load data
  useEffect(() => {
    const checkAdminAndLoad = async () => {
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

  const handleRoleSelectChange = (userId, currentRole, newRole) => {
    if (newRole === currentRole) {
      setPendingRoleChanges(prev => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
    } else {
      setPendingRoleChanges(prev => ({
        ...prev,
        [userId]: newRole
      }))
    }
  }

  const handleConfirmRoleChange = async (userId, newRole, userName) => {
    if (updatingRoles[userId]) return

    const result = await Swal.fire({
      title: 'Confirm Role Change',
      html: `Are you sure you want to change <strong>${userName}</strong>'s role to <strong>${newRole}</strong>?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, change it',
      cancelButtonText: 'Cancel',
      background: '#1a1a1a',
      color: '#fff',
      confirmButtonColor: '#00ff88',
      cancelButtonColor: '#666'
    })

    if (!result.isConfirmed) {
      setPendingRoleChanges(prev => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
      return
    }

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
        
        setPendingRoleChanges(prev => {
          const next = { ...prev }
          delete next[userId]
          return next
        })
        
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

  const filteredUsers = users.filter(user => {
    if (!searchQuery.trim()) return true
    
    const query = searchQuery.toLowerCase()
    const name = (user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User').toLowerCase()
    const email = (user.email || '').toLowerCase()
    const role = (user.role || 'user').toLowerCase()
    
    return name.includes(query) || email.includes(query) || role.includes(query)
  })

  if (status === 'loading' || loading || !currentUserRole) {
    return (
      <div className={styles.dashboard}>
        <Sidebar onCollapseChange={setSidebarCollapsed} />
        <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
          <TopBar sidebarCollapsed={sidebarCollapsed} />
          <div className={styles.content}>
            <div className={styles.loading}>
              <span className="material-icons" style={{ fontSize: '3rem', animation: 'spin 1s linear infinite' }}>refresh</span>
              <p>Loading users...</p>
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
            <span className={styles.breadcrumbCurrent}>Users</span>
          </div>

          <div className={styles.headerSection}>
            <div>
              <h1>
                <span className="material-icons" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}>people</span>
                User Management
              </h1>
              <p className={styles.subtitle}>View and manage all users</p>
            </div>
            <button className={styles.refreshButton} onClick={loadUsers}>
              <span className="material-icons">refresh</span>
              Refresh
            </button>
          </div>

          {/* Search Bar */}
          <div className={styles.searchSection}>
            <div className={styles.searchBox}>
              <span className="material-icons">search</span>
              <input
                type="text"
                placeholder="Search users by name, email, or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className={styles.clearSearchButton}
                  title="Clear search"
                >
                  <span className="material-icons">close</span>
                </button>
              )}
            </div>
            {searchQuery && (
              <div className={styles.searchResults}>
                Showing {filteredUsers.length} of {users.length} users
              </div>
            )}
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
              <span className="material-icons">security</span>
              <div className={styles.statInfo}>
                <div className={styles.statValue}>{users.filter(u => u.role === 'moderator').length}</div>
                <div className={styles.statLabel}>Moderators</div>
              </div>
            </div>
            <div className={styles.statCard}>
              <span className="material-icons">person</span>
              <div className={styles.statInfo}>
                <div className={styles.statValue}>{users.filter(u => u.role === 'user' || !u.role).length}</div>
                <div className={styles.statLabel}>Regular Users</div>
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
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="8" className={styles.emptyRow}>
                      <span className="material-icons">people_outline</span>
                      <p>{searchQuery ? 'No users match your search' : 'No users found'}</p>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(user => {
                    const currentRole = user.role || 'user'
                    const pendingRole = pendingRoleChanges[user.id]
                    const hasPendingChange = pendingRole && pendingRole !== currentRole
                    const displayRole = pendingRole || currentRole
                    const userName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown User'
                    
                    return (
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
                            <div className={styles.userName}>{userName}</div>
                            {user.id === 'cmjzbir7y0000eybbir608elt' && (
                              <span className={styles.primaryAdminBadge}>Primary Admin</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{user.email}</td>
                      <td>
                        <div className={styles.roleCell}>
                          <select
                            value={displayRole}
                            onChange={(e) => handleRoleSelectChange(user.id, currentRole, e.target.value)}
                            disabled={updatingRoles[user.id] || user.id === 'cmjzbir7y0000eybbir608elt'}
                            className={`${styles.roleSelect} ${
                              displayRole === 'admin' ? styles.adminRole : 
                              displayRole === 'moderator' ? styles.moderatorRole : 
                              styles.userRole
                            } ${hasPendingChange ? styles.pendingChange : ''}`}
                          >
                            <option value="user">User</option>
                            <option value="moderator">Moderator</option>
                            <option value="admin">Admin</option>
                          </select>
                          {hasPendingChange && (
                            <span className={styles.pendingIndicator} title="Role change pending">
                              *
                            </span>
                          )}
                        </div>
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
                          {hasPendingChange ? (
                            <div className={styles.actionButtons}>
                              <button
                                onClick={() => handleConfirmRoleChange(user.id, pendingRole, userName)}
                                disabled={updatingRoles[user.id]}
                                className={styles.saveButton}
                                title="Save role change"
                              >
                                <span className="material-icons">check</span>
                              </button>
                              <button
                                onClick={() => handleRoleSelectChange(user.id, currentRole, currentRole)}
                                disabled={updatingRoles[user.id]}
                                className={styles.cancelButton}
                                title="Cancel change"
                              >
                                <span className="material-icons">close</span>
                              </button>
                            </div>
                          ) : updatingRoles[user.id] ? (
                            <span className="material-icons" style={{ 
                              fontSize: '1rem', 
                              animation: 'spin 1s linear infinite',
                              color: '#4488ff'
                            }}>refresh</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

