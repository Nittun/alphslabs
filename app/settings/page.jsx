'use client'

import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import styles from './page.module.css'

export default function SettingsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className={styles.dashboard}>
      <Sidebar onCollapseChange={setSidebarCollapsed} />
      <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <TopBar sidebarCollapsed={sidebarCollapsed} />
        <div className={styles.content}>
          <div className={styles.maintenanceContainer}>
            <div className={styles.maintenanceIcon}>
              <span className="material-icons">build</span>
            </div>
            <h1 className={styles.maintenanceTitle}>Under Maintenance</h1>
            <p className={styles.maintenanceText}>
              The Settings page is currently under development.
            </p>
            <p className={styles.maintenanceSubtext}>
              Soon you'll be able to customize your preferences, manage your account, and configure notifications here.
            </p>
            <div className={styles.featurePreview}>
              <div className={styles.featureItem}>
                <span className="material-icons">person</span>
                <span>Profile</span>
              </div>
              <div className={styles.featureItem}>
                <span className="material-icons">palette</span>
                <span>Appearance</span>
              </div>
              <div className={styles.featureItem}>
                <span className="material-icons">security</span>
                <span>Security</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

