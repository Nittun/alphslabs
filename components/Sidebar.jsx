'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import styles from './Sidebar.module.css'

export default function Sidebar({ onCollapseChange }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session } = useSession()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  
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
  
  // Determine active item based on current path
  const getActiveItem = () => {
    if (pathname?.includes('/backtest')) return 'backtest'
    if (pathname?.includes('/optimize')) return 'optimize'
    if (pathname?.includes('/current-position')) return 'current-position'
    if (pathname?.includes('/profile')) return 'profile'
    if (pathname?.includes('/connections')) return 'connections'
    if (pathname?.includes('/settings')) return 'settings'
    if (pathname?.includes('/help')) return 'help'
    return 'backtest' // default
  }
  
  const activeItem = getActiveItem()

  const handleToggle = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    if (onCollapseChange) {
      onCollapseChange(newState)
    }
  }

  const handleNavClick = (path) => {
    if (path && path !== '#') {
      router.push(path)
      if (isMobile) {
        setIsMobileOpen(false)
      }
    }
  }

  const menuItems = [
    { id: 'backtest', icon: 'analytics', label: 'Backtest', path: '/backtest' },
    { id: 'optimize', icon: 'auto_graph', label: 'Optimize', path: '/optimize' },
    { id: 'current-position', icon: 'trending_up', label: 'Current Position', path: '/current-position' },
    { id: 'profile', icon: 'account_circle', label: 'Profile', path: '/profile' },
    { id: 'connections', icon: 'link', label: 'Connections', path: '/connections' },
    { id: 'settings', icon: 'settings', label: 'Settings', path: '/settings' },
    { id: 'help', icon: 'help_outline', label: 'Help', path: '/help' },
  ]

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
          {(!isCollapsed || isMobile) && <h2>Alphalabs</h2>}
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
              className={`${styles.navItem} ${activeItem === item.id ? styles.active : ''}`}
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

