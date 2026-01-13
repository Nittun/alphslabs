'use client'

import { useState, useRef, useEffect, memo, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Swal from 'sweetalert2'
import { useBacktestConfig } from '@/context/BacktestConfigContext'
import styles from './TopBar.module.css'

function TopBar({ sidebarCollapsed = false }) {
  const { data: session } = useSession()
  const { resetConfig } = useBacktestConfig()
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const menuRef = useRef(null)

  // Detect scroll to collapse top bar
  useEffect(() => {
    const handleScroll = () => {
      // Check if any scrollable content area is scrolled
      const scrollY = window.scrollY || document.documentElement.scrollTop
      setIsScrolled(scrollY > 50)
    }

    // Also listen to scroll events on the main content area
    const contentArea = document.querySelector('[class*="content"]')
    
    window.addEventListener('scroll', handleScroll, { passive: true })
    if (contentArea) {
      contentArea.addEventListener('scroll', (e) => {
        setIsScrolled(e.target.scrollTop > 50)
      }, { passive: true })
    }

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowProfileMenu(false)
      }
    }

    if (showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showProfileMenu])

  const handleLogout = async () => {
    setShowProfileMenu(false)
    
    const result = await Swal.fire({
      title: 'Log Out',
      text: 'Are you sure you want to log out?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#ff4444',
      cancelButtonColor: '#444',
      confirmButtonText: 'Yes, log out',
      cancelButtonText: 'Cancel',
      background: '#1a1a2e',
      color: '#fff',
      customClass: {
        popup: 'swal-dark-popup',
        title: 'swal-dark-title',
        confirmButton: 'swal-confirm-btn',
        cancelButton: 'swal-cancel-btn'
      }
    })
    
    if (result.isConfirmed) {
      // Clear user-specific session config before logging out
      resetConfig()
      await signOut({ callbackUrl: '/login' })
    }
  }

  const userName = session?.user?.name || 'User'
  const userEmail = session?.user?.email || ''
  const userImage = session?.user?.image

  return (
    <div className={`${styles.topBar} ${sidebarCollapsed ? styles.sidebarCollapsed : ''} ${isScrolled ? styles.scrolled : ''}`}>
      <div className={styles.greeting}>
        <h3>{isScrolled ? 'Alphalabs' : 'Hi '}{isScrolled ? '' : userName.split(' ')[0]}{isScrolled ? '' : '!'}</h3>
      </div>
      <div className={styles.rightSection}>
        <div 
          className={styles.profile} 
          onClick={() => setShowProfileMenu(!showProfileMenu)}
          ref={menuRef}
        >
          <div className={styles.avatar}>
            {userImage ? (
              <img src={userImage} alt={userName} />
            ) : (
              <span>{userName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <span className={`material-icons ${styles.dropdown}`}>expand_more</span>
          
          {showProfileMenu && (
            <div className={styles.profileMenu}>
              <div className={styles.profileHeader}>
                <div className={styles.profileAvatar}>
                  {userImage ? (
                    <img src={userImage} alt={userName} />
                  ) : (
                    <span>{userName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className={styles.profileInfo}>
                  <div className={styles.profileName}>{userName}</div>
                  <div className={styles.profileEmail}>{userEmail}</div>
                </div>
              </div>
              <div className={styles.profileMenuDivider}></div>
              <div className={styles.profileMenuItems}>
                <div className={styles.profileMenuItem}>
                  <span className={`material-icons ${styles.menuIcon}`}>person</span>
                  <span>View Profile</span>
                </div>
                <div className={styles.profileMenuItem}>
                  <span className={`material-icons ${styles.menuIcon}`}>settings</span>
                  <span>Settings</span>
                </div>
                <div className={styles.profileMenuDivider}></div>
                <div 
                  className={`${styles.profileMenuItem} ${styles.logoutItem}`}
                  onClick={handleLogout}
                >
                  <span className={`material-icons ${styles.menuIcon}`}>logout</span>
                  <span>Log Out</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(TopBar)
