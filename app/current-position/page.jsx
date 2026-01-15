'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import PortfolioChart from '@/components/PortfolioChart'
import { useBacktestConfig } from '@/context/BacktestConfigContext'
import { useDatabase } from '@/hooks/useDatabase'
import { API_URL } from '@/lib/api'
import styles from './page.module.css'

export default function CurrentPositionPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const { config, isLoaded } = useBacktestConfig()
  const { getDefaultConfig } = useDatabase()
  
  const [selectedAsset, setSelectedAsset] = useState('BTC/USDT')
  const [selectedInterval, setSelectedInterval] = useState('4h')
  const [emaFast, setEmaFast] = useState(12)
  const [emaSlow, setEmaSlow] = useState(26)
  const [strategyMode, setStrategyMode] = useState('reversal')
  const [initialCapital, setInitialCapital] = useState(10000)
  const [enableShort, setEnableShort] = useState(true)
  const [marketAnalysis, setMarketAnalysis] = useState(null)
  const [currentPosition, setCurrentPosition] = useState(null)
  const [savedPerformance, setSavedPerformance] = useState(null)
  const [lastBacktestDate, setLastBacktestDate] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [apiConnected, setApiConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [defaultConfigLoaded, setDefaultConfigLoaded] = useState(false)
  const [configSource, setConfigSource] = useState(null) // 'default', 'session', or null
  const [realtimePrice, setRealtimePrice] = useState(null)
  const [priceLastUpdate, setPriceLastUpdate] = useState(null)
  const [isPriceLoading, setIsPriceLoading] = useState(false)
  
  // Load default config from database on mount (prioritized over session config)
  useEffect(() => {
    const loadDefaultConfig = async () => {
      if (!session?.user) return
      
      try {
        const result = await getDefaultConfig()
        if (result.success && result.defaultConfig) {
          const dbConfig = result.defaultConfig
          setSelectedAsset(dbConfig.asset || 'BTC/USDT')
          setSelectedInterval(dbConfig.interval || '4h')
          setEmaFast(dbConfig.emaFast || 12)
          setEmaSlow(dbConfig.emaSlow || 26)
          setStrategyMode(dbConfig.strategyMode || 'reversal')
          setInitialCapital(dbConfig.initialCapital || 10000)
          setEnableShort(dbConfig.enableShort !== false) // Default to true
          // Load saved position and performance from last backtest
          if (dbConfig.openPosition) {
            setCurrentPosition(dbConfig.openPosition)
          }
          if (dbConfig.performance) {
            setSavedPerformance(dbConfig.performance)
          }
          if (dbConfig.lastBacktestDate) {
            setLastBacktestDate(dbConfig.lastBacktestDate)
          }
          setDefaultConfigLoaded(true)
          setConfigSource('default')
          console.log('Using default config from database:', dbConfig)
        } else {
          // Fallback to session config if no default
          setDefaultConfigLoaded(true)
        }
      } catch (error) {
        console.error('Error loading default config:', error)
        setDefaultConfigLoaded(true)
      }
    }
    
    loadDefaultConfig()
  }, [session])
  
  // Load config from context only if no default config is set
  useEffect(() => {
    if (!defaultConfigLoaded) return
    if (configSource === 'default') return // Already using default config
    
    if (isLoaded && config) {
      setSelectedAsset(config.asset || 'BTC/USDT')
      setSelectedInterval(config.interval || '4h')
      setEmaFast(config.ema_fast || 12)
      setEmaSlow(config.ema_slow || 26)
      setStrategyMode(config.strategy_mode || 'reversal')
      setConfigSource('session')
    }
  }, [isLoaded, config, defaultConfigLoaded, configSource])

  // Check API connection on mount
  useEffect(() => {
    const checkApiConnection = async () => {
      try {
        const response = await fetch(`${API_URL}/api/health`)
        if (response.ok) {
          setApiConnected(true)
        } else {
          setApiConnected(false)
        }
      } catch (error) {
        setApiConnected(false)
      }
    }
    checkApiConnection()
    const interval = setInterval(checkApiConnection, 5000)
    return () => clearInterval(interval)
  }, [])

  // Fetch real-time price every 15 seconds
  useEffect(() => {
    if (!apiConnected || configSource !== 'default' || !currentPosition) return

    const fetchCurrentPrice = async () => {
      setIsPriceLoading(true)
      try {
        const response = await fetch(`${API_URL}/api/current-price?asset=${encodeURIComponent(selectedAsset)}`)
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.price) {
            setRealtimePrice(data.price)
            setPriceLastUpdate(new Date())
            // Update the current position with the new price
            setCurrentPosition(prev => ({
              ...prev,
              Current_Price: data.price
            }))
          }
        } else {
          // Silently fail - don't spam console with 404/500 errors
          console.debug('Current price endpoint not available:', response.status)
        }
      } catch (error) {
        // Silently fail - endpoint may not be available
        console.debug('Error fetching current price:', error.message)
      } finally {
        setIsPriceLoading(false)
      }
    }

    // Fetch immediately, then every 15 seconds
    fetchCurrentPrice()
    const intervalId = setInterval(fetchCurrentPrice, 15000)

    return () => clearInterval(intervalId)
  }, [apiConnected, configSource, selectedAsset, currentPosition?.Entry_Date])

  // Analyze market every minute - only when default config is set
  useEffect(() => {
    if (!apiConnected || configSource !== 'default') return

    const analyzeMarket = async () => {
      setIsLoading(true)
      try {
        const response = await fetch(`${API_URL}/api/analyze-current`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            asset: selectedAsset,
            interval: selectedInterval,
            days_back: 365,
            ema_fast: emaFast,
            ema_slow: emaSlow,
            strategy_mode: strategyMode,
          }),
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setMarketAnalysis(data)
            // Update current position with real-time data if available
            if (data.current_position) {
              setCurrentPosition(data.current_position)
            }
            setLastUpdate(new Date())
            console.log('Market analysis updated:', data)
          }
        }
      } catch (error) {
        console.error('Error analyzing market:', error)
      } finally {
        setIsLoading(false)
      }
    }

    // Analyze immediately, then every 60 seconds
    analyzeMarket()
    const intervalId = setInterval(analyzeMarket, 60000) // 60 seconds

    return () => clearInterval(intervalId)
  }, [apiConnected, configSource, selectedAsset, selectedInterval, emaFast, emaSlow, strategyMode])

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className={styles.dashboard}>
      <Sidebar onCollapseChange={setSidebarCollapsed} />
      <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <TopBar sidebarCollapsed={sidebarCollapsed} />
        <div className={styles.content}>
          <div className={styles.headerSection}>
            <h1>Current Position Dashboard</h1>
            {configSource === 'default' && (
              <div className={styles.controls}>
                <div className={`${styles.configBadge} ${styles.defaultBadge}`}>
                  <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>push_pin</span>
                  {selectedAsset} | {selectedInterval} | EMA({emaFast}/{emaSlow})
                  <span className={styles.defaultTag}>Default</span>
                </div>
                {priceLastUpdate && (
                  <span className={`${styles.priceUpdateBadge} ${isPriceLoading ? styles.loading : ''}`}>
                    <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px', animation: isPriceLoading ? 'spin 1s linear infinite' : 'none' }}>
                      {isPriceLoading ? 'sync' : 'trending_up'}
                    </span>
                    Live: ${realtimePrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className={styles.updateTime}>
                      {priceLastUpdate.toLocaleTimeString()}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Show empty state if no default config */}
          {configSource !== 'default' && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <span className="material-icons">settings_suggest</span>
              </div>
              <h2>No Default Strategy Set</h2>
              <p>To view your current holding position, you need to set a default strategy.</p>
              <div className={styles.emptySteps}>
                <div className={styles.step}>
                  <span className={styles.stepNumber}>1</span>
                  <span>Go to the <strong>Backtest</strong> page</span>
                </div>
                <div className={styles.step}>
                  <span className={styles.stepNumber}>2</span>
                  <span>Configure your trading strategy (asset, EMA, etc.)</span>
                </div>
                <div className={styles.step}>
                  <span className={styles.stepNumber}>3</span>
                  <span>Run a backtest to see performance</span>
                </div>
                <div className={styles.step}>
                  <span className={styles.stepNumber}>4</span>
                  <span>Click <strong>&quot;Use for Current Position&quot;</strong> button</span>
                </div>
              </div>
              <button className={styles.goToBacktestBtn} onClick={() => router.push('/backtest')}>
                <span className="material-icons">analytics</span>
                Go to Backtest
              </button>
            </div>
          )}

          {/* Show dashboard only when default is set */}
          {configSource === 'default' && (
            <>
              {/* Portfolio Chart Section */}
              <div className={styles.chartCard}>
                <PortfolioChart 
                  asset={selectedAsset}
                  initialCapital={initialCapital}
                />
              </div>

          <div className={styles.gridLayout}>
            {/* Strategy Configuration Card */}
            <div className={`${styles.card} ${styles.strategyCard}`}>
              <h2>
                <span className="material-icons">tune</span>
                Active Strategy
              </h2>
              <div className={styles.strategyDetails}>
                <div className={styles.strategyRow}>
                  <div className={styles.strategyItem}>
                    <span className={styles.strategyIcon}>
                      <span className="material-icons">currency_bitcoin</span>
                    </span>
                    <div className={styles.strategyInfo}>
                      <span className={styles.strategyLabel}>Asset</span>
                      <span className={styles.strategyValue}>{selectedAsset}</span>
                    </div>
                  </div>
                  <div className={styles.strategyItem}>
                    <span className={styles.strategyIcon}>
                      <span className="material-icons">schedule</span>
                    </span>
                    <div className={styles.strategyInfo}>
                      <span className={styles.strategyLabel}>Interval</span>
                      <span className={styles.strategyValue}>{selectedInterval}</span>
                    </div>
                  </div>
                </div>

                <div className={styles.strategyRow}>
                  <div className={styles.strategyItem}>
                    <span className={styles.strategyIcon}>
                      <span className="material-icons">show_chart</span>
                    </span>
                    <div className={styles.strategyInfo}>
                      <span className={styles.strategyLabel}>EMA Crossover</span>
                      <span className={styles.strategyValue}>{emaFast} / {emaSlow}</span>
                    </div>
                  </div>
                  <div className={styles.strategyItem}>
                    <span className={styles.strategyIcon}>
                      <span className="material-icons">psychology</span>
                    </span>
                    <div className={styles.strategyInfo}>
                      <span className={styles.strategyLabel}>Strategy Mode</span>
                      <span className={styles.strategyValue}>
                        {strategyMode === 'reversal' && 'Always-In Reversal'}
                        {strategyMode === 'wait_for_next' && 'Exit & Wait'}
                        {strategyMode === 'long_only' && 'Long Only'}
                        {strategyMode === 'short_only' && 'Short Only'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className={styles.strategyRow}>
                  <div className={styles.strategyItem}>
                    <span className={styles.strategyIcon}>
                      <span className="material-icons">account_balance</span>
                    </span>
                    <div className={styles.strategyInfo}>
                      <span className={styles.strategyLabel}>Initial Capital</span>
                      <span className={styles.strategyValue}>${initialCapital.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className={styles.strategyItem}>
                    <span className={styles.strategyIcon}>
                      <span className="material-icons">{enableShort ? 'swap_vert' : 'arrow_upward'}</span>
                    </span>
                    <div className={styles.strategyInfo}>
                      <span className={styles.strategyLabel}>Short Selling</span>
                      <span className={`${styles.strategyValue} ${enableShort ? styles.enabled : styles.disabled}`}>
                        {enableShort ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </div>

                {lastBacktestDate && (
                  <div className={styles.lastRunInfo}>
                    <span className="material-icons">update</span>
                    Last backtest: {new Date(lastBacktestDate).toLocaleString()}
                  </div>
                )}
              </div>
            </div>

            {/* Current Position Card */}
            <div className={`${styles.card} ${styles.positionCard}`}>
              <h2>
                <span className="material-icons">account_balance_wallet</span>
                Current Holding
              </h2>
              {currentPosition ? (
                <div className={styles.positionDetails}>
                  <div className={styles.positionHeader}>
                    <div className={`${styles.positionTypeBadge} ${styles[currentPosition.Position_Type?.toLowerCase()]}`}>
                      <span className="material-icons">
                        {currentPosition.Position_Type === 'Long' ? 'trending_up' : 'trending_down'}
                      </span>
                      {currentPosition.Position_Type}
                    </div>
                    {(() => {
                      const entryPrice = currentPosition.Entry_Price || 0
                      const currentPrice = currentPosition.Current_Price || 0
                      const priceDiff = currentPosition.Position_Type === 'Long' 
                        ? currentPrice - entryPrice 
                        : entryPrice - currentPrice
                      const pnlPct = entryPrice > 0 ? (priceDiff / entryPrice) * 100 : 0
                      const units = entryPrice > 0 ? initialCapital / entryPrice : 0
                      const pnlAmount = priceDiff * units
                      const isPositive = pnlPct >= 0
                      
                      return (
                        <div className={styles.pnlGroup}>
                          <div className={`${styles.pnlAmount} ${isPositive ? styles.positive : styles.negative}`}>
                            {isPositive ? '+' : ''}${pnlAmount.toFixed(2)}
                          </div>
                          <div className={`${styles.pnlPct} ${isPositive ? styles.positive : styles.negative}`}>
                            ({isPositive ? '+' : ''}{pnlPct.toFixed(2)}%)
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  <div className={styles.priceDisplay}>
                    <div className={styles.priceItem}>
                      <span className={styles.priceLabel}>Entry</span>
                      <span className={styles.priceValue}>${currentPosition.Entry_Price?.toFixed(2)}</span>
                    </div>
                    <div className={styles.priceArrow}>
                      <span className="material-icons">arrow_forward</span>
                    </div>
                    <div className={styles.priceItem}>
                      <span className={styles.priceLabel}>Current</span>
                      <span className={styles.priceValue}>${currentPosition.Current_Price?.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className={styles.positionMetrics}>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>Entry Date</span>
                      <span className={styles.metricValue}>
                        {currentPosition.Entry_Date ? new Date(currentPosition.Entry_Date).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>Holding Days</span>
                      <span className={styles.metricValue}>
                        {currentPosition.Entry_Date 
                          ? Math.floor((Date.now() - new Date(currentPosition.Entry_Date).getTime()) / (1000 * 60 * 60 * 24))
                          : 0}
                      </span>
                    </div>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>Stop Loss</span>
                      <span className={styles.metricValue} style={{ color: '#ff4444' }}>
                        ${currentPosition.Stop_Loss?.toFixed(2)}
                      </span>
                    </div>
                    <div className={styles.metricItem}>
                      <span className={styles.metricLabel}>Position Size</span>
                      <span className={styles.metricValue}>${initialCapital.toLocaleString()}</span>
                    </div>
                  </div>

                  {currentPosition.Should_Exit && (
                    <div className={styles.exitWarning}>
                      <span className="material-icons">warning</span>
                      Exit Signal: {currentPosition.Exit_Reason}
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.noPosition}>
                  <span className="material-icons">
                    {configSource === 'default' ? 'hourglass_empty' : 'settings_suggest'}
                  </span>
                  <p>{configSource === 'default' ? 'No open position' : 'No default strategy set'}</p>
                  <p className={styles.noPositionHint}>
                    {configSource === 'default' 
                      ? 'Your strategy currently has no open position. This means the last backtest either closed all positions or is waiting for an entry signal.'
                      : 'To view your current holding, go to Backtest page, run a backtest, and click "Use for Current Position" to set it as your default strategy.'}
                  </p>
                </div>
              )}
              
              {/* Last Backtest Info */}
              {lastBacktestDate && (
                <div className={styles.backtestInfo}>
                  <span className="material-icons">update</span>
                  Last backtest: {new Date(lastBacktestDate).toLocaleString()}
                </div>
              )}
            </div>

            {/* Performance Summary Card */}
            {savedPerformance && (
              <div className={`${styles.card} ${styles.performanceCard}`}>
                <h2>
                  <span className="material-icons">insights</span>
                  Strategy Performance
                </h2>
                <div className={styles.performanceGrid}>
                  <div className={styles.perfItem}>
                    <span className={styles.perfLabel}>Total Return</span>
                    <span className={`${styles.perfValue} ${savedPerformance.totalReturnPct >= 0 ? styles.positive : styles.negative}`}>
                      {savedPerformance.totalReturnPct >= 0 ? '+' : ''}{savedPerformance.totalReturnPct?.toFixed(2)}%
                    </span>
                  </div>
                  <div className={styles.perfItem}>
                    <span className={styles.perfLabel}>Win Rate</span>
                    <span className={styles.perfValue}>{savedPerformance.winRate?.toFixed(1)}%</span>
                  </div>
                  <div className={styles.perfItem}>
                    <span className={styles.perfLabel}>Total Trades</span>
                    <span className={styles.perfValue}>{savedPerformance.totalTrades || 0}</span>
                  </div>
                  <div className={styles.perfItem}>
                    <span className={styles.perfLabel}>P&L</span>
                    <span className={`${styles.perfValue} ${savedPerformance.totalReturn >= 0 ? styles.positive : styles.negative}`}>
                      ${savedPerformance.totalReturn?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Market Analysis Card */}
            <div className={styles.card}>
              <h2>Market Analysis</h2>
              {marketAnalysis ? (
                <div className={styles.analysisDetails}>
                  <div className={styles.analysisRow}>
                    <span className={styles.label}>Current Price:</span>
                    <span className={styles.value}>${marketAnalysis.current_price?.toFixed(2)}</span>
                  </div>
                  <div className={styles.analysisRow}>
                    <span className={styles.label}>RSI:</span>
                    <span className={styles.value}>{marketAnalysis.current_rsi?.toFixed(1)}</span>
                  </div>
                  <div className={styles.analysisRow}>
                    <span className={styles.label}>Support:</span>
                    <span className={styles.value}>${marketAnalysis.support?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className={styles.analysisRow}>
                    <span className={styles.label}>Resistance:</span>
                    <span className={styles.value}>${marketAnalysis.resistance?.toFixed(2) || 'N/A'}</span>
                  </div>
                  {(marketAnalysis.bullish_divergence || marketAnalysis.bearish_divergence) && (
                    <div className={styles.divergenceSignal}>
                      {marketAnalysis.bullish_divergence && (
                        <span className={styles.bullish}>🔼 Bullish Divergence</span>
                      )}
                      {marketAnalysis.bearish_divergence && (
                        <span className={styles.bearish}>🔽 Bearish Divergence</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.loading}>Loading analysis...</div>
              )}
            </div>

            {/* Next Position Prediction Card */}
            <div className={styles.card}>
              <h2>Next Position Prediction</h2>
              {marketAnalysis?.next_position ? (
                <div className={styles.predictionDetails}>
                  <div className={styles.predictionRow}>
                    <span className={styles.label}>Signal:</span>
                    <span className={`${styles.value} ${styles[marketAnalysis.next_position.toLowerCase()]}`}>
                      {marketAnalysis.next_position}
                    </span>
                  </div>
                  <div className={styles.predictionRow}>
                    <span className={styles.label}>Entry Signal:</span>
                    <span className={styles.value}>{marketAnalysis.entry_signal}</span>
                  </div>
                  <div className={styles.predictionRow}>
                    <span className={styles.label}>Target Price:</span>
                    <span className={styles.value}>${marketAnalysis.target_price?.toFixed(2)}</span>
                  </div>
                  <div className={styles.predictionRow}>
                    <span className={styles.label}>Stop Loss:</span>
                    <span className={styles.value}>${marketAnalysis.stop_loss?.toFixed(2)}</span>
                  </div>
                  <div className={styles.predictionRow}>
                    <span className={styles.label}>Confidence:</span>
                    <span className={styles.value}>{marketAnalysis.confidence?.toFixed(0)}%</span>
                  </div>
                  <div className={styles.profitPotential}>
                    Potential Profit: {marketAnalysis.next_position === 'Long' 
                      ? ((marketAnalysis.target_price - marketAnalysis.current_price) / marketAnalysis.current_price * 100).toFixed(2)
                      : ((marketAnalysis.current_price - marketAnalysis.target_price) / marketAnalysis.current_price * 100).toFixed(2)
                    }%
                  </div>
                </div>
              ) : (
                <div className={styles.noSignal}>No entry signal detected</div>
              )}
            </div>

          </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

