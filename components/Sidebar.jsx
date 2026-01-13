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
  const [userRole, setUserRole] = useState('user')
  const [pagePermissions, setPagePermissions] = useState(null)
  
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

  // Check user role and fetch permissions
  useEffect(() => {
    const checkUserAndPermissions = async () => {
      if (!session?.user) {
        setIsAdmin(false)
        setUserRole('user')
        setPagePermissions(null)
        return
      }

      try {
        // Get user info
        const userResponse = await fetch('/api/user')
        const userData = await userResponse.json()
        
        if (userData.success && userData.user) {
          const user = userData.user
          const role = (user.role || 'user').toLowerCase()
          setUserRole(role)
          
          // Check if user is admin by ID or role
          const isAdminUser = user.id === 'cmjzbir7y0000eybbir608elt' || role === 'admin'
          setIsAdmin(isAdminUser)
        } else {
          setIsAdmin(false)
          setUserRole('user')
        }

        // Fetch page permissions
        const permResponse = await fetch('/api/user/permissions')
        const permData = await permResponse.json()
        
        if (permData.success && permData.permissions) {
          setPagePermissions(permData.permissions)
        }
      } catch (error) {
        console.error('Error checking user/permissions:', error)
        setIsAdmin(false)
        setUserRole('user')
        setPagePermissions(null)
      }
    }

    if (session !== undefined) {
      checkUserAndPermissions()
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

  // Filter menu items based on admin status and page permissions
  const menuItems = useMemo(() => {
    let items = [...MENU_ITEMS]
    
    // Add admin item if user is admin
    if (isAdmin) {
      const profileIndex = items.findIndex(item => item.id === 'profile')
      items.splice(profileIndex, 0, {
        id: 'admin',
        icon: 'admin_panel_settings',
        label: 'Admin',
        path: '/admin'
      })
    }
    
    // Filter items based on page permissions
    if (pagePermissions) {
      items = items.filter(item => {
        // Always show admin panel to admins
        if (item.id === 'admin' && isAdmin) return true
        
        // Check if this page is allowed for the user's role
        const hasPermission = pagePermissions[item.id]
        return hasPermission !== false // Show if true or undefined (backwards compatibility)
      })
    }
    
    return items
  }, [isAdmin, pagePermissions])

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
