'use client'

import { useState, useMemo } from 'react'
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

  // Calculate advanced metrics from trades
  const advancedMetrics = useMemo(() => {
    if (!trades || trades.length === 0) {
      return {
        winRate: 0,
        totalPnL: 0,
        expectedValue: 0,
        avgWin: 0,
        avgLoss: 0,
        avgHoldingTime: 0,
        profitFactor: 0,
        mae: null, // Maximum Adverse Excursion - needs backend support
        mfe: null, // Maximum Favorable Excursion - needs backend support
      }
    }

    const winningTrades = trades.filter(t => t.PnL > 0)
    const losingTrades = trades.filter(t => t.PnL < 0)
    const totalTrades = trades.length

    // Win rate
    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0
    const lossRate = totalTrades > 0 ? (losingTrades.length / totalTrades) * 100 : 0

    // Total P&L
    const totalPnL = trades.reduce((sum, t) => sum + (t.PnL || 0), 0)

    // Average win and average loss
    const avgWin = winningTrades.length > 0 
      ? winningTrades.reduce((sum, t) => sum + t.PnL, 0) / winningTrades.length 
      : 0
    const avgLoss = losingTrades.length > 0 
      ? losingTrades.reduce((sum, t) => sum + Math.abs(t.PnL), 0) / losingTrades.length 
      : 0

    // Expected Value (EV) = (win rate * avg win) - (loss rate * avg loss)
    // Normalized to per-trade expectancy
    const expectedValue = (winRate / 100 * avgWin) - (lossRate / 100 * avgLoss)

    // Average holding time (in days)
    const totalHoldingDays = trades.reduce((sum, t) => sum + (t.Holding_Days || 0), 0)
    const avgHoldingTime = totalTrades > 0 ? totalHoldingDays / totalTrades : 0

    // Profit Factor = Gross Profits / Gross Losses
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.PnL, 0)
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.PnL, 0))
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0

    // MAE/MFE - Calculate from PnL percentage extremes
    // MAE = Maximum drawdown during trades (worst unrealized loss)
    // MFE = Maximum runup during trades (best unrealized gain)
    // Since we don't have intrabar data, we approximate from PnL_Pct
    const pnlPercentages = trades.map(t => t.PnL_Pct || 0)
    const mae = pnlPercentages.length > 0 ? Math.min(...pnlPercentages.filter(p => p < 0), 0) : 0
    const mfe = pnlPercentages.length > 0 ? Math.max(...pnlPercentages.filter(p => p > 0), 0) : 0

    return {
      winRate,
      totalPnL,
      expectedValue,
      avgWin,
      avgLoss,
      avgHoldingTime,
      profitFactor,
      mae,
      mfe,
    }
  }, [trades])

  // Calculate additional metrics
  const totalReturn = performance?.Total_Return_Pct || 0
  const isPositive = totalReturn >= 0

  // Format time display
  const formatHoldingTime = (days) => {
    if (days < 1) return '< 1 day'
    if (days < 7) return `${days.toFixed(1)} days`
    if (days < 30) return `${(days / 7).toFixed(1)} weeks`
    return `${(days / 30).toFixed(1)} months`
  }

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
                {advancedMetrics.winRate.toFixed(1)}%
              </div>
            </div>
            <div className={styles.keyMetric}>
              <div className={styles.keyMetricLabel}>Total P&L</div>
              <div className={`${styles.keyMetricValue} ${advancedMetrics.totalPnL < 0 ? styles.negative : ''}`}>
                ${advancedMetrics.totalPnL >= 0 ? '+' : ''}{advancedMetrics.totalPnL.toFixed(0)}
              </div>
            </div>
            <div className={styles.keyMetric}>
              <div className={styles.keyMetricLabel}>Trades</div>
              <div className={styles.keyMetricValue}>
                {performance.Total_Trades || 0}
              </div>
            </div>
          </div>

          {/* Advanced Metrics - 2 Column Grid */}
          <div className={styles.advancedMetrics}>
            <div className={styles.metricCard}>
              <div className={styles.metricCardHeader}>
                <span className="material-icons">casino</span>
                Expected Value (EV)
              </div>
              <div className={`${styles.metricCardValue} ${advancedMetrics.expectedValue < 0 ? styles.negative : styles.positive}`}>
                ${advancedMetrics.expectedValue >= 0 ? '+' : ''}{advancedMetrics.expectedValue.toFixed(2)}
              </div>
              <div className={styles.metricCardSubtext}>
                Per trade expectancy
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricCardHeader}>
                <span className="material-icons">schedule</span>
                Avg Holding Time
              </div>
              <div className={styles.metricCardValue}>
                {formatHoldingTime(advancedMetrics.avgHoldingTime)}
              </div>
              <div className={styles.metricCardSubtext}>
                {advancedMetrics.avgHoldingTime.toFixed(1)} days average
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricCardHeader}>
                <span className="material-icons">trending_down</span>
                MAE (Max Adverse)
              </div>
              <div className={`${styles.metricCardValue} ${styles.negative}`}>
                {advancedMetrics.mae !== null ? `${advancedMetrics.mae.toFixed(2)}%` : 'N/A'}
              </div>
              <div className={styles.metricCardSubtext}>
                Worst trade drawdown
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricCardHeader}>
                <span className="material-icons">trending_up</span>
                MFE (Max Favorable)
              </div>
              <div className={`${styles.metricCardValue} ${styles.positive}`}>
                {advancedMetrics.mfe !== null ? `+${advancedMetrics.mfe.toFixed(2)}%` : 'N/A'}
              </div>
              <div className={styles.metricCardSubtext}>
                Best trade runup
              </div>
            </div>
          </div>

          {/* Detailed Breakdown */}
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Initial</span>
              <span className={styles.metricValue}>
                ${((performance.Initial_Capital || 0) / 1000).toFixed(1)}k
              </span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Final</span>
              <span className={styles.metricValue}>
                ${((performance.Final_Capital || 0) / 1000).toFixed(1)}k
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
              <span className={styles.metricLabel}>Avg Win</span>
              <span className={`${styles.metricValue} ${styles.positive}`}>
                ${advancedMetrics.avgWin.toFixed(0)}
              </span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Avg Loss</span>
              <span className={`${styles.metricValue} ${styles.negative}`}>
                -${advancedMetrics.avgLoss.toFixed(0)}
              </span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Profit Factor</span>
              <span className={styles.metricValue}>
                {advancedMetrics.profitFactor === Infinity ? '∞' : advancedMetrics.profitFactor.toFixed(2)}
              </span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Max DD</span>
              <span className={`${styles.metricValue} ${styles.negative}`}>
                {(performance.Max_Drawdown_Pct || 0).toFixed(1)}%
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
