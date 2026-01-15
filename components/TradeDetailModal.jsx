'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './TradeDetailModal.module.css'

export default function TradeDetailModal({ trade, isOpen, onClose }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!mounted || !isOpen || !trade) return null

  const portalTarget = document.fullscreenElement || document.body

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Trade Details</h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.detailRow}>
            <span className={styles.label}>Position Type:</span>
            <span className={`${styles.value} ${styles[trade.type === 'success' ? 'win' : 'loss']}`}>
              {trade.positionType || 'N/A'}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.label}>Status:</span>
            <span className={`${styles.value} ${trade.status === 'HOLDING' ? styles.holding : (trade.type === 'success' ? styles.win : styles.loss)}`}>
              {trade.status === 'HOLDING' ? 'HOLDING' : (trade.type === 'success' ? 'WIN' : 'LOSS')}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.label}>Entry Date:</span>
            <span className={styles.value}>{trade.entryDate || trade.timestamp}</span>
          </div>
          {trade.status !== 'HOLDING' && (
            <div className={styles.detailRow}>
              <span className={styles.label}>Exit Date:</span>
              <span className={styles.value}>{trade.exitDate || 'N/A'}</span>
            </div>
          )}
          <div className={styles.detailRow}>
            <span className={styles.label}>Entry Price:</span>
            <span className={styles.value}>${trade.entryPrice?.toFixed(2) || 'N/A'}</span>
          </div>
          {trade.status === 'HOLDING' ? (
            <div className={styles.detailRow}>
              <span className={styles.label}>Current Price:</span>
              <span className={styles.value}>${trade.currentPrice?.toFixed(2) || 'N/A'}</span>
            </div>
          ) : (
            <div className={styles.detailRow}>
              <span className={styles.label}>Exit Price:</span>
              <span className={styles.value}>${trade.exitPrice?.toFixed(2) || 'N/A'}</span>
            </div>
          )}
          <div className={styles.detailRow}>
            <span className={styles.label}>Stop Loss:</span>
            <span className={`${styles.value} ${trade.stopLossHit ? styles.loss : ''}`}>
              ${trade.stopLoss?.toFixed(2) || 'N/A'} {trade.stopLossHit && <><span className="material-icons" style={{ fontSize: '12px', verticalAlign: 'middle', marginLeft: '4px' }}>bolt</span> Hit</>}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.label}>{trade.status === 'HOLDING' ? 'Unrealized P&L:' : 'P&L:'}</span>
            <span className={`${styles.value} ${styles[trade.type === 'success' ? 'win' : 'loss']}`}>
              {trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct?.toFixed(2) || '0.00'}%
              {trade.status === 'HOLDING' && <span style={{ fontSize: '0.85rem', color: '#888', marginLeft: '0.5rem' }}>(unrealized)</span>}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.label}>{trade.status === 'HOLDING' ? 'Unrealized P&L Amount:' : 'P&L Amount:'}</span>
            <span className={`${styles.value} ${styles[trade.type === 'success' ? 'win' : 'loss']}`}>
              ${trade.pnlAmount?.toFixed(2) || '0.00'}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.label}>Timeframe:</span>
            <span className={styles.value}>{trade.interval || 'N/A'}</span>
          </div>
          {(trade.emaFastPeriod || trade.emaSlowPeriod) && (
            <div className={styles.detailRow}>
              <span className={styles.label}>EMA Settings:</span>
              <span className={styles.value} style={{ color: '#00ff88' }}>
                EMA{trade.emaFastPeriod || '?'} / EMA{trade.emaSlowPeriod || '?'}
              </span>
            </div>
          )}
          {(trade.entryEmaFast || trade.entryEmaSlow) && (
            <div className={styles.detailRow}>
              <span className={styles.label}>Entry EMA:</span>
              <span className={styles.value}>
                EMA{trade.emaFastPeriod || 'Fast'}: ${trade.entryEmaFast?.toFixed(2) || 'N/A'} | EMA{trade.emaSlowPeriod || 'Slow'}: ${trade.entryEmaSlow?.toFixed(2) || 'N/A'}
              </span>
            </div>
          )}
          {(trade.exitEmaFast || trade.exitEmaSlow) && (
            <div className={styles.detailRow}>
              <span className={styles.label}>Exit EMA:</span>
              <span className={styles.value}>
                EMA{trade.emaFastPeriod || 'Fast'}: ${trade.exitEmaFast?.toFixed(2) || 'N/A'} | EMA{trade.emaSlowPeriod || 'Slow'}: ${trade.exitEmaSlow?.toFixed(2) || 'N/A'}
              </span>
            </div>
          )}
          <div className={styles.detailRow}>
            <span className={styles.label}>Holding Days:</span>
            <span className={styles.value}>{trade.holdingDays || 'N/A'}</span>
          </div>
          {trade.entryReason && (
            <div className={styles.detailRow}>
              <span className={styles.label}>Entry Reason:</span>
              <span className={styles.value} style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{trade.entryReason}</span>
            </div>
          )}
          {trade.status !== 'HOLDING' && trade.exitReason && (
            <div className={styles.detailRow}>
              <span className={styles.label}>Exit Reason:</span>
              <span className={styles.value} style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{trade.exitReason}</span>
            </div>
          )}
          <div className={styles.detailRow}>
            <span className={styles.label}>Full Message:</span>
            <span className={styles.value}>{trade.message}</span>
          </div>
        </div>
      </div>
    </div>,
    portalTarget
  )
}

