'use client'

import { useState, useEffect } from 'react'
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
        await loadStats()
      } catch (error) {
        console.error('Error checking admin status:', error)
        router.push('/backtest')
      }
    }

    checkAdmin()
  }, [session, status, router])

  const loadStats = async () => {
    try {
      const response = await fetch('/api/admin/users')
      const data = await response.json()
      
      if (data.success && data.users) {
        const users = data.users
        setStats({
          totalUsers: users.length,
          admins: users.filter(u => u.role === 'admin').length,
          moderators: users.filter(u => u.role === 'moderator').length,
          regularUsers: users.filter(u => u.role === 'user' || !u.role).length,
          totalBacktests: users.reduce((sum, u) => sum + (u._count?.backtestRuns || 0), 0)
        })
      }
    } catch (error) {
      console.error('Error loading stats:', error)
    }
  }

  const menuItems = [
    {
      id: 'users',
      icon: 'people',
      title: 'User Management',
      description: 'View and manage all users, assign roles, and track user activity',
      path: '/admin/users',
      color: '#4488ff'
    },
    {
      id: 'permissions',
      icon: 'lock',
      title: 'Page Permissions',
      description: 'Configure which pages each user role can access',
      path: '/admin/permissions',
      color: '#9d4edd'
    }
  ]

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
          <div className={styles.headerSection}>
            <div>
              <h1>
                <span className="material-icons" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }}>admin_panel_settings</span>
                Admin Dashboard
              </h1>
              <p className={styles.subtitle}>Manage your platform settings and users</p>
            </div>
          </div>

          {/* Quick Stats */}
          {stats && (
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <span className="material-icons">people</span>
                <div className={styles.statInfo}>
                  <div className={styles.statValue}>{stats.totalUsers}</div>
                  <div className={styles.statLabel}>Total Users</div>
                </div>
              </div>
              <div className={styles.statCard}>
                <span className="material-icons">admin_panel_settings</span>
                <div className={styles.statInfo}>
                  <div className={styles.statValue}>{stats.admins}</div>
                  <div className={styles.statLabel}>Admins</div>
                </div>
              </div>
              <div className={styles.statCard}>
                <span className="material-icons">security</span>
                <div className={styles.statInfo}>
                  <div className={styles.statValue}>{stats.moderators}</div>
                  <div className={styles.statLabel}>Moderators</div>
                </div>
              </div>
              <div className={styles.statCard}>
                <span className="material-icons">trending_up</span>
                <div className={styles.statInfo}>
                  <div className={styles.statValue}>{stats.totalBacktests}</div>
                  <div className={styles.statLabel}>Total Backtests</div>
                </div>
              </div>
            </div>
          )}

          {/* Admin Menu */}
          <div className={styles.menuGrid}>
            {menuItems.map(item => (
              <Link key={item.id} href={item.path} className={styles.menuCard}>
                <div className={styles.menuCardIcon} style={{ backgroundColor: `${item.color}20`, borderColor: `${item.color}40` }}>
                  <span className="material-icons" style={{ color: item.color }}>{item.icon}</span>
                </div>
                <div className={styles.menuCardContent}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
                <div className={styles.menuCardArrow}>
                  <span className="material-icons">arrow_forward</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
