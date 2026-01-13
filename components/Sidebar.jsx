'use client'

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import styles from './Sidebar.module.css'

// Menu items defined outside component to prevent recreation
const MENU_ITEMS = [
  { id: 'backtest', icon: 'analytics', label: 'Backtest', path: '/backtest' },
  { id: 'optimize', icon: 'auto_graph', label: 'Algorithmic Optimization', path: '/optimize' },
  { id: 'optimize-new', icon: 'science', label: 'Strategy Builder', path: '/optimize-new' },
  { id: 'current-position', icon: 'trending_up', label: 'Current Position', path: '/current-position' },
  { id: 'profile', icon: 'account_circle', label: 'Profile', path: '/profile' },
  { id: 'connections', icon: 'link', label: 'Connections', path: '/connections' },
  { id: 'settings', icon: 'settings', label: 'Settings', path: '/settings' },
  { id: 'help', icon: 'help_outline', label: 'Help', path: '/help' },
]

function Sidebar({ onCollapseChange }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session } = useSession()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  
  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileOpen(false)
  }, [pathname])

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      if (!session?.user) {
        setIsAdmin(false)
        return
      }

      try {
        const response = await fetch('/api/user')
        const data = await response.json()
        if (data.success && data.user) {
          const user = data.user
          // Check if user is admin by ID or role
          // Handle case where role might be null/undefined (if migration not run yet)
          const isAdminUser = user.id === 'cmjzbir7y0000eybbir608elt' || 
                             (user.role && user.role.toLowerCase() === 'admin')
          setIsAdmin(isAdminUser)
          
          // Debug log
          console.log('Admin check:', { 
            userId: user.id, 
            userRole: user.role, 
            isAdmin: isAdminUser,
            matchesId: user.id === 'cmjzbir7y0000eybbir608elt'
          })
        } else {
          setIsAdmin(false)
        }
      } catch (error) {
        console.error('Error checking admin status:', error)
        setIsAdmin(false)
      }
    }

    // Only check if session is loaded
    if (session !== undefined) {
      checkAdmin()
    }
  }, [session])
  
  // Determine active item based on current path (memoized)
  const activeItem = useMemo(() => {
    if (pathname?.includes('/backtest')) return 'backtest'
    if (pathname?.includes('/optimize-new')) return 'optimize-new'
    if (pathname?.includes('/optimize')) return 'optimize'
    if (pathname?.includes('/current-position')) return 'current-position'
    if (pathname?.includes('/admin')) return 'admin'
    if (pathname?.includes('/profile')) return 'profile'
    if (pathname?.includes('/connections')) return 'connections'
    if (pathname?.includes('/settings')) return 'settings'
    if (pathname?.includes('/help')) return 'help'
    return 'backtest' // default
  }, [pathname])

  // Filter menu items based on admin status
  const menuItems = useMemo(() => {
    const items = [...MENU_ITEMS]
    if (isAdmin) {
      // Insert admin item before profile
      const profileIndex = items.findIndex(item => item.id === 'profile')
      items.splice(profileIndex, 0, {
        id: 'admin',
        icon: 'admin_panel_settings',
        label: 'Admin',
        path: '/admin'
      })
    }
    return items
  }, [isAdmin])

  const handleToggle = useCallback(() => {
    setIsCollapsed(prev => {
      const newState = !prev
      if (onCollapseChange) {
        onCollapseChange(newState)
      }
      return newState
    })
  }, [onCollapseChange])

  const handleNavClick = useCallback((path) => {
    if (path && path !== '#') {
      router.push(path)
      setIsMobileOpen(false)
    }
  }, [router])

  return (
    <>
      {/* Mobile menu button */}
      <button 
        className={styles.mobileMenuButton}
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        aria-label="Toggle menu"
      >
        <span className="material-icons">{isMobileOpen ? 'close' : 'menu'}</span>
      </button>

      {/* Mobile overlay */}
      <div 
        className={`${styles.mobileOverlay} ${isMobileOpen ? styles.visible : ''}`}
        onClick={() => setIsMobileOpen(false)}
      />

      <div className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''} ${isMobileOpen ? styles.mobileOpen : ''}`}>
        <div className={styles.logo}>
          <div className={styles.logoContainer}>
            <img 
              src="/logo.png" 
              alt="Alphalabs" 
              className={styles.logoImage}
            />
            {(!isCollapsed || isMobile) && (
              <span className={styles.logoText}>Alphalabs</span>
            )}
          </div>
          <button 
            className={styles.toggleButton}
            onClick={handleToggle}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="material-icons">{isCollapsed ? 'chevron_right' : 'chevron_left'}</span>
          </button>
        </div>
        <nav className={styles.nav}>
          {menuItems.map((item) => (
            <div
              key={item.id}
              className={`${styles.navItem} ${activeItem === item.id ? styles.active : ''} ${item.id === 'admin' ? styles.adminItem : ''}`}
              onClick={() => handleNavClick(item.path)}
              title={isCollapsed && !isMobile ? item.label : ''}
            >
              <span className={`material-icons ${styles.icon}`}>{item.icon}</span>
              {(!isCollapsed || isMobile) && <span className={styles.label}>{item.label}</span>}
            </div>
          ))}
        </nav>
        {session?.user && (!isCollapsed || isMobile) && (
          <div className={styles.userSection} onClick={() => handleNavClick('/profile')} style={{ cursor: 'pointer' }}>
            <div className={styles.userInfo}>
              <div className={styles.userAvatar}>
                {session.user.image ? (
                  <img src={session.user.image} alt={session.user.name || 'User'} />
                ) : (
                  <span>{session.user.name?.charAt(0) || 'U'}</span>
                )}
              </div>
              <div className={styles.userDetails}>
                <div className={styles.userName}>{session.user.name || 'User'}</div>
                <div className={styles.userEmail}>{session.user.email}</div>
              </div>
              <span className="material-icons" style={{ marginLeft: 'auto', fontSize: '1rem', color: '#666' }}>chevron_right</span>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default memo(Sidebar)
