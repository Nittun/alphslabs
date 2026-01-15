'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import styles from './EntryPositionModal.module.css'

export default function ExitPositionModal({ position, candle, onClose, onConfirm }) {
  const [priceType, setPriceType] = useState('close') // 'open', 'high', 'low', 'close'
  const [exitPrice, setExitPrice] = useState(0)
  const [dateWarning, setDateWarning] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    // Set initial price based on selection
    const price = priceType === 'open' ? candle.open : 
                  priceType === 'high' ? candle.high :
                  priceType === 'low' ? candle.low :
                  candle.close
    setExitPrice(price)
    
    // Check if exit date is same as entry date
    if (position.Entry_Date && candle.time) {
      const entryDate = new Date(position.Entry_Date)
      const exitTimestamp = candle.time < 10000000000 ? candle.time * 1000 : candle.time
      const exitDate = new Date(exitTimestamp)
      
      // Compare dates (ignore time)
      const entryDateOnly = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate())
      const exitDateOnly = new Date(exitDate.getFullYear(), exitDate.getMonth(), exitDate.getDate())
      
      if (entryDateOnly.getTime() === exitDateOnly.getTime()) {
        setDateWarning('Warning: You are exiting on the same day as entry. This may not be realistic for your strategy.')
      } else {
        setDateWarning('')
      }
    }
  }, [priceType, candle, position.Entry_Date])

  const entryPrice = parseFloat(position.Entry_Price)
  const isLong = position.Position_Type === 'LONG'
  const pnl = (exitPrice - entryPrice) * (isLong ? 1 : -1)
  const pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * (isLong ? 1 : -1) * 100 : 0

  const handleConfirm = () => {
    onConfirm({
      price: exitPrice
    })
  }

  if (!mounted) return null

  const portalTarget = document.fullscreenElement || document.body

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>Exit Position</h3>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label>Entry Information</label>
            <div className={styles.infoRow}>
              <span>Type: <strong>{position.Position_Type}</strong></span>
              <span>Entry Price: <strong>${entryPrice.toFixed(2)}</strong></span>
              <span>Entry Date: <strong>{new Date(position.Entry_Date).toLocaleString()}</strong></span>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Exit Date & Time</label>
            <input
              type="text"
              value={candle.time ? new Date(candle.time * 1000).toLocaleString() : 'N/A'}
              readOnly
              className={styles.readOnlyInput}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Exit Price</label>
            <select
              value={priceType}
              onChange={(e) => setPriceType(e.target.value)}
              className={styles.select}
            >
              <option value="open">Open: ${candle.open?.toFixed(2)}</option>
              <option value="high">High: ${candle.high?.toFixed(2)}</option>
              <option value="low">Low: ${candle.low?.toFixed(2)}</option>
              <option value="close">Close: ${candle.close?.toFixed(2)}</option>
            </select>
            <input
              type="number"
              value={exitPrice}
              onChange={(e) => setExitPrice(parseFloat(e.target.value) || 0)}
              step="0.01"
              className={styles.input}
              placeholder="Or enter custom price"
            />
          </div>

          {position.Stop_Loss && (
            <div className={styles.formGroup}>
              <label>Stop Loss</label>
              <input
                type="text"
                value={`$${position.Stop_Loss.toFixed(2)}`}
                readOnly
                className={styles.readOnlyInput}
              />
            </div>
          )}

          {position.Take_Profit && (
            <div className={styles.formGroup}>
              <label>Take Profit</label>
              <input
                type="text"
                value={`$${position.Take_Profit.toFixed(2)}`}
                readOnly
                className={styles.readOnlyInput}
              />
            </div>
          )}

          {dateWarning && (
            <div className={styles.warningMessage}>
              <span className="material-icons">warning</span>
              {dateWarning}
            </div>
          )}

          <div className={styles.formGroup}>
            <label>Projected P&L</label>
            <div className={styles.pnlDisplay}>
              <span className={pnl >= 0 ? styles.profit : styles.loss}>
                ${pnl.toFixed(2)} ({pnlPct.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.confirmButton} onClick={handleConfirm}>
            Confirm Exit
          </button>
        </div>
      </div>
    </div>
  , portalTarget)
}
