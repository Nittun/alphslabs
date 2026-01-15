'use client'

import styles from './BetaBadge.module.css'

export default function BetaBadge({ className = '', text = 'BETA' }) {
  return (
    <span className={`${styles.badge} ${className}`.trim()}>
      {text}
    </span>
  )
}

