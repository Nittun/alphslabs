'use client'

import { useState } from 'react'
import styles from './BalanceSection.module.css'

export default function BalanceSection() {
  const [activeTab, setActiveTab] = useState('Portfolio')

  const tabs = ['Portfolio', 'Funding', 'Assets', 'P2P']

  return (
    <div className={styles.balanceSection}>
      <div className={styles.balanceInfo}>
        <div className={styles.label}>Total Balance</div>
        <div className={styles.btcAmount}>
          <span className={styles.amount}>0.97689522</span>
          <span className={styles.currency}>BTC</span>
        </div>
        <div className={styles.usdAmount}>$40,098.36</div>
      </div>
      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.active : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  )
}

