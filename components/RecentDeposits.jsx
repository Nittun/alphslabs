'use client'

import styles from './RecentDeposits.module.css'

export default function RecentDeposits() {
  const deposits = [
    { coin: 'Bitcoin', icon: '₿', action: 'Buy', amount: '+ $244.00', time: 'Today 13:15 PM' },
    { coin: 'Ethereum', icon: 'Ξ', action: 'Received', amount: '+0,4213 ETH', time: 'Today 11:18 PM' },
    { coin: 'Polygon', icon: '⬟', action: 'Buy', amount: '+ $1,245', time: 'Yesterday' },
    { coin: 'XRP Ledger', icon: '✕', action: 'Received', amount: '+0,5686 XRP', time: 'Yesterday' },
    { coin: 'Solana', icon: '◎', action: 'Received', amount: '+ $244.00', time: 'Yesterday' },
  ]

  return (
    <div className={styles.recentDeposits}>
      <div className={styles.header}>
        <h3>Recent deposits</h3>
        <span className={styles.menu}>⋯</span>
      </div>
      <div className={styles.list}>
        {deposits.map((deposit, index) => (
          <div key={index} className={styles.depositItem}>
            <div className={styles.coinInfo}>
              <div className={styles.coinIcon}>{deposit.icon}</div>
              <div className={styles.coinDetails}>
                <div className={styles.coinName}>{deposit.coin}</div>
                <div className={styles.action}>{deposit.action}</div>
              </div>
            </div>
            <div className={styles.amountInfo}>
              <div className={styles.amount}>{deposit.amount}</div>
              <div className={styles.time}>{deposit.time}</div>
            </div>
          </div>
        ))}
      </div>
      <div className={styles.showMore}>Show more</div>
    </div>
  )
}

