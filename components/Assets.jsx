'use client'

import styles from './Assets.module.css'

export default function Assets() {
  const assets = [
    { name: 'Bitcoin', symbol: 'BTC', icon: '₿', amount: '6401,20', gradient: 'linear-gradient(135deg, #4488ff 0%, #9d4edd 100%)' },
    { name: 'Ethereum', symbol: 'ETH', icon: 'Ξ', amount: '3205,60', gradient: 'linear-gradient(135deg, #9d4edd 0%, #ff006e 100%)' },
  ]

  return (
    <div className={styles.assets}>
      <h3>Assets</h3>
      <div className={styles.cards}>
        {assets.map((asset, index) => (
          <div key={index} className={styles.card} style={{ background: asset.gradient }}>
            <div className={styles.cardPattern}></div>
            <div className={styles.cardContent}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIcon}>{asset.icon}</div>
                <div className={styles.cardLabel}>Crypto card</div>
              </div>
              <div className={styles.cardFooter}>
                <div className={styles.cardName}>{asset.name}</div>
                <div className={styles.cardAmount}>
                  {asset.amount}
                  <span className={styles.cardSymbol}>{asset.symbol}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

