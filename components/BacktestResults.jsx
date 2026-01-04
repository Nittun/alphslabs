'use client'

import { useState } from 'react'
import { useDatabase } from '@/hooks/useDatabase'
import styles from './BacktestResults.module.css'

const strategyModeLabels = {
  'reversal': 'Reversal (Always in market)',
  'wait_for_next': 'Wait for Next (Flat periods)',
  'long_only': 'Long Only',
  'short_only': 'Short Only',
}

export default function BacktestResults({ performance, trades, interval, dataPoints, runDate, strategyMode, emaFast, emaSlow, currentConfig }) {
  const { setDefaultConfig } = useDatabase()
  const [isSettingDefault, setIsSettingDefault] = useState(false)
  const [defaultMessage, setDefaultMessage] = useState('')

  const handleSetAsDefault = async () => {
    if (!currentConfig) return
    
    setIsSettingDefault(true)
    setDefaultMessage('')
    
    const result = await setDefaultConfig({
      asset: currentConfig.asset,
      interval: currentConfig.interval,
      daysBack: currentConfig.days_back,
      initialCapital: currentConfig.initial_capital,
      enableShort: currentConfig.enable_short,
      strategyMode: currentConfig.strategy_mode,
      emaFast: currentConfig.ema_fast,
      emaSlow: currentConfig.ema_slow
    })
    
    setIsSettingDefault(false)
    
    if (result.success) {
      setDefaultMessage('✓ Set as default for Current Position')
      setTimeout(() => setDefaultMessage(''), 3000)
    } else {
      setDefaultMessage('Failed to set as default')
    }
  }
  return (
    <div className={styles.results}>
      <h3>Backtest Results</h3>
      {!performance ? (
        <div style={{ 
          padding: '2rem',
          textAlign: 'center',
          color: '#888',
          fontSize: '0.9rem'
        }}>
          <p>No backtest results yet.</p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            Run a backtest to see performance metrics here.
          </p>
        </div>
      ) : (
        <>
          {interval && (
            <div style={{ 
              color: '#888', 
              fontSize: '0.85rem', 
              marginBottom: '1rem',
              padding: '0.5rem',
              background: '#0f0f0f',
              borderRadius: '6px'
            }}>
              <div>Interval: {interval} | Data Points: {dataPoints || 'N/A'}</div>
              {emaFast && emaSlow && (
                <div style={{ marginTop: '0.25rem', color: '#00ff88' }}>
                  EMA Crossover: {emaFast}/{emaSlow}
                </div>
              )}
              {strategyMode && (
                <div style={{ marginTop: '0.25rem', color: '#4488ff' }}>
                  Strategy: {strategyModeLabels[strategyMode] || strategyMode}
                </div>
              )}
              {runDate && (
                <div style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.8rem' }}>
                  Last Run: {new Date(runDate).toLocaleString()}
                </div>
              )}
            </div>
          )}
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Initial Capital</div>
              <div className={styles.metricValue}>
                ${(performance.Initial_Capital || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Final Capital</div>
              <div className={styles.metricValue}>
                ${(performance.Final_Capital || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Total Return</div>
              <div className={`${styles.metricValue} ${(performance.Total_Return_Pct || 0) >= 0 ? styles.positive : styles.negative}`}>
                {(performance.Total_Return_Pct || 0) >= 0 ? '+' : ''}
                {(performance.Total_Return_Pct || 0).toFixed(2)}%
              </div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Total Trades</div>
              <div className={styles.metricValue}>{performance.Total_Trades || 0}</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Winning Trades</div>
              <div className={styles.metricValue}>{performance.Winning_Trades || 0}</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Losing Trades</div>
              <div className={styles.metricValue}>{performance.Losing_Trades || 0}</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricLabel}>Win Rate</div>
              <div className={styles.metricValue}>
                {(performance.Win_Rate || 0).toFixed(1)}%
              </div>
            </div>
          </div>
          
          {/* Set as Default Button */}
          {currentConfig && (
            <div className={styles.defaultSection}>
              <button 
                className={styles.defaultButton}
                onClick={handleSetAsDefault}
                disabled={isSettingDefault}
              >
                <span className="material-icons" style={{ fontSize: '1rem', marginRight: '0.5rem' }}>
                  {isSettingDefault ? 'hourglass_empty' : 'push_pin'}
                </span>
                {isSettingDefault ? 'Setting...' : 'Use for Current Position'}
              </button>
              {defaultMessage && (
                <div className={styles.defaultMessage} style={{ 
                  color: defaultMessage.includes('✓') ? '#00ff88' : '#ff4444' 
                }}>
                  {defaultMessage}
                </div>
              )}
              <p className={styles.defaultHint}>
                This will use these settings on the Current Position page
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

