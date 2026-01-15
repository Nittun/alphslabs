'use client'

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import styles from './Sidebar.module.css'
import BetaBadge from './BetaBadge'

// Menu items defined outside component to prevent recreation
const MENU_ITEMS = [
  { id: 'backtest', icon: 'analytics', label: 'Price Action Backtest', path: '/backtest' },
  { id: 'optimize', icon: 'auto_graph', label: 'Algorithmic Optimization', path: '/optimize' },
  { id: 'optimize-new', icon: 'science', label: 'Strategy Builder', path: '/optimize-new' },
  { id: 'strategy-maker', icon: 'build', label: 'Indicator Sandbox', path: '/strategy-maker' },
  { id: 'survey', icon: 'assignment', label: 'Survey', path: '/survey' },
  { id: 'documents', icon: 'menu_book', label: 'Documents', path: '/documents' },
  { id: 'current-position', icon: 'trending_up', label: 'Current Position', path: '/current-position' },
  { id: 'profile', icon: 'account_circle', label: 'Profile', path: '/profile' },
  { id: 'connections', icon: 'link', label: 'Connections', path: '/connections' },
  { id: 'settings', icon: 'settings', label: 'Settings', path: '/settings' },
  { id: 'help', icon: 'help_outline', label: 'Help', path: '/help' },
]

// Storage key for caching permissions
const PERMISSIONS_CACHE_KEY = 'alphalabs_page_permissions'

function Sidebar({ onCollapseChange }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session, status: sessionStatus } = useSession()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)
  const [showSurveyNudge, setShowSurveyNudge] = useState(false)
  const [surveyNudgeText, setSurveyNudgeText] = useState('After exploring the site please share your thought on the project')
  const [surveyNudgeVersion, setSurveyNudgeVersion] = useState(1)
  const [surveyNudgeEnabled, setSurveyNudgeEnabled] = useState(true)
  const [pagePermissions, setPagePermissions] = useState(() => {
    // Try to load cached permissions on initial render
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem(PERMISSIONS_CACHE_KEY)
        if (cached) {
          const parsed = JSON.parse(cached)
          return parsed.permissions || null
        }
      } catch (e) {}
    }
    return null
  })
  
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

  const checkUserAndPermissions = useCallback(async () => {
    if (sessionStatus === 'loading') return
    
    if (!session?.user) {
      setIsAdmin(false)
      setPagePermissions(null)
      setPermissionsLoaded(true)
      // Clear cache on logout
      try { sessionStorage.removeItem(PERMISSIONS_CACHE_KEY) } catch (e) {}
      return
    }

    try {
      // Fetch permissions (this also returns isAdmin)
      const permResponse = await fetch('/api/user/permissions')
      const permData = await permResponse.json()
      
      if (permData.success) {
        setPagePermissions(permData.permissions || null)
        setIsAdmin(permData.isAdmin || false)

        // Survey nudge settings (server-controlled)
        if (permData.surveyNudge) {
          setSurveyNudgeEnabled(permData.surveyNudge.enabled !== false)
          setSurveyNudgeText(permData.surveyNudge.message || 'After exploring the site please share your thought on the project')
          setSurveyNudgeVersion(Number(permData.surveyNudge.version) || 1)
        }
        
        // Cache permissions in sessionStorage
        try {
          sessionStorage.setItem(PERMISSIONS_CACHE_KEY, JSON.stringify({
            permissions: permData.permissions,
            isAdmin: permData.isAdmin,
            timestamp: Date.now()
          }))
        } catch (e) {}
      }
    } catch (error) {
      console.error('Error fetching permissions:', error)
      // On error, try to use cached data
      try {
        const cached = sessionStorage.getItem(PERMISSIONS_CACHE_KEY)
        if (cached) {
          const parsed = JSON.parse(cached)
          setPagePermissions(parsed.permissions || null)
          setIsAdmin(parsed.isAdmin || false)
        }
      } catch (e) {}
    } finally {
      setPermissionsLoaded(true)
    }
  }, [session, sessionStatus])

  // Check user role and fetch permissions
  useEffect(() => {
    checkUserAndPermissions()
  }, [checkUserAndPermissions])

  // Refresh nudge settings when admin updates them
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleRefresh = () => checkUserAndPermissions()
    window.addEventListener('surveyNudgeUpdated', handleRefresh)
    return () => window.removeEventListener('surveyNudgeUpdated', handleRefresh)
  }, [checkUserAndPermissions])

  // Decide whether to show the nudge (once per version)
  useEffect(() => {
    if (!permissionsLoaded) return
    if (!surveyNudgeEnabled) return
    if (!pagePermissions?.survey) return
    if (pathname?.includes('/survey')) return
    if (typeof window === 'undefined') return

    try {
      const key = 'alphalabs_survey_nudge_last_seen_version'
      const lastSeen = Number(localStorage.getItem(key) || '0')
      if (lastSeen >= surveyNudgeVersion) return

      localStorage.setItem(key, String(surveyNudgeVersion))
      setShowSurveyNudge(true)
      const t = setTimeout(() => setShowSurveyNudge(false), 14000)
      return () => clearTimeout(t)
    } catch (e) {
      // ignore
    }
  }, [permissionsLoaded, surveyNudgeEnabled, surveyNudgeVersion, pagePermissions, pathname])
  
  // Determine active item based on current path (memoized)
  const activeItem = useMemo(() => {
    if (pathname?.includes('/backtest')) return 'backtest'
    if (pathname?.includes('/optimize-new')) return 'optimize-new'
    if (pathname?.includes('/strategy-maker')) return 'strategy-maker'
    if (pathname?.includes('/optimize')) return 'optimize'
    if (pathname?.includes('/documents')) return 'documents'
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
    // Don't show any items until permissions are loaded
    if (!permissionsLoaded) return []
    
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
  }, [isAdmin, pagePermissions, permissionsLoaded])
  
  // Show loading state
  const isLoading = sessionStatus === 'loading' || (session && !permissionsLoaded)

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
          {isLoading ? (
            // Skeleton loaders while permissions are loading
            <>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className={`${styles.navItem} ${styles.skeleton}`}>
                  <div className={styles.skeletonIcon}></div>
                  {(!isCollapsed || isMobile) && <div className={styles.skeletonLabel}></div>}
                </div>
              ))}
            </>
          ) : (
            menuItems.map((item) => (
              <div
                key={item.id}
                className={`${styles.navItem} ${activeItem === item.id ? styles.active : ''} ${item.id === 'admin' ? styles.adminItem : ''} ${showSurveyNudge && item.id === 'survey' ? styles.surveyNudgeItem : ''}`}
                onClick={() => {
                  if (item.id === 'survey') setShowSurveyNudge(false)
                  handleNavClick(item.path)
                }}
                title={isCollapsed && !isMobile ? item.label : ''}
              >
                <span className={`material-icons ${styles.icon}`}>{item.icon}</span>
                {showSurveyNudge && item.id === 'survey' && (
                  <span className={styles.surveyDot} aria-hidden="true" />
                )}
                {(!isCollapsed || isMobile) && (
                  <span className={styles.label}>
                    {item.label}
                    {item.id === 'strategy-maker' && (
                      <span className={styles.betaInline}>
                        <BetaBadge />
                      </span>
                    )}
                  </span>
                )}
                {showSurveyNudge && item.id === 'survey' && (!isCollapsed || isMobile) && (
                  <div className={styles.surveyNudgeBubble} role="note">
                    {surveyNudgeText}
                    <div className={styles.surveyNudgeArrow} />
                  </div>
                )}
              </div>
            ))
          )}
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
