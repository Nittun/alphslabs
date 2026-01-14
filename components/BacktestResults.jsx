'use client'

import { useState } from 'react'
import { useDatabase } from '@/hooks/useDatabase'
import PortfolioPnLChart from './PortfolioPnLChart'
import styles from './BacktestResults.module.css'

const strategyModeLabels = {
  'reversal': 'A: Reversal',
  'wait_for_next': 'B: Wait',
  'long_only': 'C: Long Only',
  'short_only': 'D: Short Only',
}

const strategyModeDescriptions = {
  'reversal': 'Always in market, flip on signal',
  'wait_for_next': 'Exit and wait for next signal',
  'long_only': 'Long positions only',
  'short_only': 'Short positions only',
}

export default function BacktestResults({ performance, trades, interval, dataPoints, runDate, strategyMode, emaFast, emaSlow, currentConfig, openPosition }) {
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
      setDefaultMessage('✓ Set as default')
      setTimeout(() => setDefaultMessage(''), 3000)
    } else {
      setDefaultMessage('Failed')
    }
  }

  // Calculate additional metrics
  const totalReturn = performance?.Total_Return_Pct || 0
  const isPositive = totalReturn >= 0

  return (
    <div className={styles.results}>
      <h3>
        <span className="material-icons">analytics</span>
        Performance Summary
      </h3>
      
      {!performance ? (
        <div style={{ 
          padding: '2rem',
          textAlign: 'center',
          color: '#666',
          fontSize: '0.85rem'
        }}>
          <span className="material-icons" style={{ fontSize: '2.5rem', opacity: 0.3, marginBottom: '0.75rem', display: 'block' }}>
            query_stats
          </span>
          <p style={{ margin: 0 }}>Run a backtest to see results</p>
        </div>
      ) : (
        <>
          {/* Summary Bar */}
          <div className={styles.summaryBar}>
            <div className={styles.summaryItem}>
              <span>Interval:</span>
              <strong>{interval}</strong>
            </div>
            <div className={styles.summaryItem}>
              <span>Data:</span>
              <strong>{dataPoints || 'N/A'} bars</strong>
            </div>
            {emaFast && emaSlow && (
              <div className={`${styles.summaryItem} ${styles.highlight}`}>
                <span>Indicator:</span>
                <strong>EMA {emaFast}/{emaSlow}</strong>
              </div>
            )}
            {strategyMode && (
              <div className={`${styles.summaryItem} ${styles.strategy}`}>
                <span>Mode:</span>
                <strong title={strategyModeDescriptions[strategyMode]}>{strategyModeLabels[strategyMode]}</strong>
              </div>
            )}
          </div>

          {/* Key Metrics - Hero Display */}
          <div className={styles.keyMetrics}>
            <div className={`${styles.keyMetric} ${styles.primary}`}>
              <div className={styles.keyMetricLabel}>Total Return</div>
              <div className={`${styles.keyMetricValue} ${!isPositive ? styles.negative : ''}`}>
                {isPositive ? '+' : ''}{totalReturn.toFixed(2)}%
              </div>
            </div>
            <div className={styles.keyMetric}>
              <div className={styles.keyMetricLabel}>Win Rate</div>
              <div className={styles.keyMetricValue}>
                {(performance.Win_Rate || 0).toFixed(1)}%
              </div>
            </div>
            <div className={styles.keyMetric}>
              <div className={styles.keyMetricLabel}>Trades</div>
              <div className={styles.keyMetricValue}>
                {performance.Total_Trades || 0}
              </div>
            </div>
            <div className={styles.keyMetric}>
              <div className={styles.keyMetricLabel}>Final Capital</div>
              <div className={styles.keyMetricValue}>
                ${((performance.Final_Capital || 0) / 1000).toFixed(1)}k
              </div>
            </div>
          </div>

          {/* Secondary Metrics - Compact */}
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Initial</span>
              <span className={styles.metricValue}>
                ${((performance.Initial_Capital || 0) / 1000).toFixed(1)}k
              </span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Wins</span>
              <span className={`${styles.metricValue} ${styles.positive}`}>
                {performance.Winning_Trades || 0}
              </span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Losses</span>
              <span className={`${styles.metricValue} ${styles.negative}`}>
                {performance.Losing_Trades || 0}
              </span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>P/L Ratio</span>
              <span className={styles.metricValue}>
                {performance.Winning_Trades && performance.Losing_Trades 
                  ? (performance.Winning_Trades / performance.Losing_Trades).toFixed(2)
                  : 'N/A'}
              </span>
            </div>
          </div>
          
          {/* Portfolio P&L Chart */}
          {performance && (
            <PortfolioPnLChart
              trades={trades || []}
              initialCapital={performance.Initial_Capital}
              holdingPosition={openPosition}
            />
          )}

          {/* Set as Default Button */}
          {currentConfig && (
            <div className={styles.defaultSection}>
              <button 
                className={styles.defaultButton}
                onClick={handleSetAsDefault}
                disabled={isSettingDefault}
              >
                <span className="material-icons" style={{ fontSize: '1rem', marginRight: '0.4rem' }}>
                  {isSettingDefault ? 'hourglass_empty' : 'push_pin'}
                </span>
                {isSettingDefault ? 'Setting...' : 'Use for Current Position'}
              </button>
              {defaultMessage && (
                <span className={styles.defaultMessage} style={{ 
                  color: defaultMessage.includes('✓') ? '#00ff88' : '#ff4444' 
                }}>
                  {defaultMessage}
                </span>
              )}
              <p className={styles.defaultHint}>
                Apply these settings to Current Position page
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
