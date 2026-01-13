'use client'

import { useState, useEffect } from 'react'
import styles from './EntryPositionModal.module.css'

export default function EntryPositionModal({ candle, onClose, onConfirm }) {
  const [positionType, setPositionType] = useState('LONG')
  const [priceType, setPriceType] = useState('close') // 'open', 'high', 'low', 'close'
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [entryPrice, setEntryPrice] = useState(0)

  useEffect(() => {
    // Set initial price based on selection
    const price = priceType === 'open' ? candle.open : 
                  priceType === 'high' ? candle.high :
                  priceType === 'low' ? candle.low :
                  candle.close
    setEntryPrice(price)
  }, [priceType, candle])

  const handleConfirm = () => {
    onConfirm({
      positionType,
      price: entryPrice,
      stopLoss: stopLoss ? parseFloat(stopLoss) : null,
      takeProfit: takeProfit ? parseFloat(takeProfit) : null
    })
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>Enter Position</h3>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label>Date & Time</label>
            <input
              type="text"
              value={candle.time ? new Date(candle.time * 1000).toLocaleString() : 'N/A'}
              readOnly
              className={styles.readOnlyInput}
            />
          </div>

          <div className={styles.formGroup}>
            <label>Position Type</label>
            <div className={styles.buttonGroup}>
              <button
                className={`${styles.positionButton} ${positionType === 'LONG' ? styles.active : ''}`}
                onClick={() => setPositionType('LONG')}
                data-position="LONG"
              >
                Long
              </button>
              <button
                className={`${styles.positionButton} ${positionType === 'SHORT' ? styles.active : ''}`}
                onClick={() => setPositionType('SHORT')}
                data-position="SHORT"
              >
                Short
              </button>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label>Entry Price</label>
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
              value={entryPrice}
              onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
              step="0.01"
              className={styles.input}
              placeholder="Or enter custom price"
            />
          </div>

          <div className={styles.formGroup}>
            <label>Stop Loss (Optional)</label>
            <input
              type="number"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              step="0.01"
              className={styles.input}
              placeholder="Enter stop loss price"
            />
          </div>

          <div className={styles.formGroup}>
            <label>Take Profit (Optional)</label>
            <input
              type="number"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              step="0.01"
              className={styles.input}
              placeholder="Enter take profit price"
            />
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.confirmButton} onClick={handleConfirm}>
            Confirm Entry
          </button>
        </div>
      </div>
    </div>
  )
}
