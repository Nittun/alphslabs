'use client'

import { useState, useEffect } from 'react'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import CryptoTicker from '@/components/CryptoTicker'
import TradingViewChart from '@/components/TradingViewChart'
import LogSection from '@/components/LogSection'
import BacktestConfig from '@/components/BacktestConfig'
import BacktestResults from '@/components/BacktestResults'
import PortfolioPnLChart from '@/components/PortfolioPnLChart'
import { useDatabase } from '@/hooks/useDatabase'
import { API_URL } from '@/lib/api'
import styles from './page.module.css'

export default function BacktestPage() {
  const [selectedAsset, setSelectedAsset] = useState('BTC/USDT')
  const [selectedInterval, setSelectedInterval] = useState('D')
  const [backtestTrades, setBacktestTrades] = useState([])
  const [backtestPerformance, setBacktestPerformance] = useState(null)
  const [openPosition, setOpenPosition] = useState(null)
  const [positionId, setPositionId] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [apiConnected, setApiConnected] = useState(false)
  const [latestBacktestDate, setLatestBacktestDate] = useState(null)
  const [strategyMode, setStrategyMode] = useState(null)
  const [emaFast, setEmaFast] = useState(null)
  const [emaSlow, setEmaSlow] = useState(null)
  const [currentConfig, setCurrentConfig] = useState(null)

  // Database hook for saving backtest runs
  const { saveBacktestRun, updateDefaultPosition } = useDatabase()

  // Check API connection on mount
  useEffect(() => {
    const checkApiConnection = async () => {
      try {
        const response = await fetch(`${API_URL}/api/health`)
        if (response.ok) {
          setApiConnected(true)
          console.log('API server is connected')
        } else {
          setApiConnected(false)
          console.warn('API server returned error:', response.status)
        }
      } catch (error) {
        setApiConnected(false)
        console.warn('API server not reachable:', error.message)
      }
    }
    checkApiConnection()
    // Check every 5 seconds
    const interval = setInterval(checkApiConnection, 5000)
    return () => clearInterval(interval)
  }, [])

  // Load latest backtest on mount
  useEffect(() => {
    if (!apiConnected) return

    const loadLatestBacktest = async () => {
      try {
        const response = await fetch(`${API_URL}/api/latest-backtest`)
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setBacktestTrades(data.trades || [])
            setOpenPosition(data.open_position || null)
            setPositionId(data.position_id || null)
            setBacktestPerformance({
              ...data.performance,
              interval: data.interval,
              data_points: data.data_points
            })
            setSelectedAsset(data.asset || 'BTC/USDT')
            if (data.interval) {
              setSelectedInterval(getTradingViewInterval(data.interval))
            }
            setLatestBacktestDate(data.run_date)
            setStrategyMode(data.strategy_mode || null)
            setEmaFast(data.ema_fast || null)
            setEmaSlow(data.ema_slow || null)
            console.log('Loaded latest backtest from:', data.run_date, 'strategy:', data.strategy_mode, 'EMA:', data.ema_fast, '/', data.ema_slow)
          }
        }
      } catch (error) {
        console.warn('No latest backtest available:', error.message)
      }
    }

    loadLatestBacktest()
  }, [apiConnected])

  // Poll for position updates every minute if there's an open position
  useEffect(() => {
    if (!positionId || !apiConnected) return

    const updatePosition = async () => {
      try {
        const response = await fetch(`${API_URL}/api/position/${positionId}`)
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.position) {
            // Check if position was closed (Status is not HOLDING or missing)
            if (data.position.Status !== 'HOLDING' || !data.position.Status) {
              // Position was closed, remove it
              setOpenPosition(null)
              setPositionId(null)
              console.log('Position was closed')
            } else {
              setOpenPosition(data.position)
              console.log('Position updated:', {
                price: data.position.Current_Price,
                pnl: data.position.PnL_Pct,
                shouldExit: data.position.Should_Exit,
                lastUpdate: data.position.Last_Update || data.position.last_update
              })
              
              // If position should be closed, show notification
              if (data.position.Should_Exit) {
                console.warn('Position should be closed:', data.position.Exit_Reason)
                // Optionally show browser notification
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification('Position Exit Signal', {
                    body: `Position should be closed: ${data.position.Exit_Reason}`,
                    icon: '/favicon.ico'
                  })
                }
              }
            }
          }
        } else if (response.status === 404) {
          // Position not found (was closed)
          setOpenPosition(null)
          setPositionId(null)
          console.log('Position no longer exists (was closed)')
        }
      } catch (error) {
        console.warn('Error updating position:', error.message)
      }
    }

    // Update immediately, then every 60 seconds
    updatePosition()
    const interval = setInterval(updatePosition, 60000) // 60 seconds

    return () => clearInterval(interval)
  }, [positionId, apiConnected])

  const getTradingViewSymbol = (asset) => {
    // Crypto pairs - use BINANCE exchange
    const cryptoMap = {
      'BTC/USDT': 'BINANCE:BTCUSDT',
      'ETH/USDT': 'BINANCE:ETHUSDT',
      'BNB/USDT': 'BINANCE:BNBUSDT',
      'XRP/USDT': 'BINANCE:XRPUSDT',
      'SOL/USDT': 'BINANCE:SOLUSDT',
      'ADA/USDT': 'BINANCE:ADAUSDT',
      'DOGE/USDT': 'BINANCE:DOGEUSDT',
      'AVAX/USDT': 'BINANCE:AVAXUSDT',
      'DOT/USDT': 'BINANCE:DOTUSDT',
      'LINK/USDT': 'BINANCE:LINKUSDT',
      'MATIC/USDT': 'BINANCE:MATICUSDT',
      'UNI/USDT': 'BINANCE:UNIUSDT',
      'ATOM/USDT': 'BINANCE:ATOMUSDT',
      'LTC/USDT': 'BINANCE:LTCUSDT',
      'TRX/USDT': 'BINANCE:TRXUSDT',
    }
    
    // Stocks - use NASDAQ exchange
    const stockMap = {
      'NVDA': 'NASDAQ:NVDA',
      'AAPL': 'NASDAQ:AAPL',
      'MSFT': 'NASDAQ:MSFT',
      'GOOGL': 'NASDAQ:GOOGL',
      'AMZN': 'NASDAQ:AMZN',
      'TSLA': 'NASDAQ:TSLA',
      'META': 'NASDAQ:META',
      'AMD': 'NASDAQ:AMD',
      'INTC': 'NASDAQ:INTC',
      'NFLX': 'NASDAQ:NFLX',
      'SPY': 'AMEX:SPY',
      'QQQ': 'NASDAQ:QQQ',
    }
    
    if (cryptoMap[asset]) return cryptoMap[asset]
    if (stockMap[asset]) return stockMap[asset]
    
    // Fallback: try to construct symbol
    if (asset.includes('/USDT')) {
      return `BINANCE:${asset.replace('/USDT', 'USDT')}`
    }
    
    // Default to NASDAQ for unknown stocks
    return `NASDAQ:${asset}`
  }

  const getTradingViewInterval = (interval) => {
    const map = {
      '1h': '60',
      '2h': '120',
      '4h': '240',
      '1d': 'D',
      '1W': 'W',
      '1M': 'M',
    }
    return map[interval] || 'D'
  }

  const handleRunBacktest = async (config) => {
    setIsLoading(true)
    setBacktestTrades([])
    setBacktestPerformance(null)
    setOpenPosition(null)
    setPositionId(null)

    try {
      console.log(`Sending backtest request to ${API_URL}/api/backtest`, config)

      const response = await fetch(`${API_URL}/api/backtest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      })

      console.log('Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error:', errorText)
        throw new Error(`API returned ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      console.log('Backtest response:', data)

      if (data.success) {
        setBacktestTrades(data.trades)
        setOpenPosition(data.open_position || null)
        setPositionId(data.position_id || null)
        // Include interval and data points in performance for display
        setBacktestPerformance({
          ...data.performance,
          interval: data.interval,
          data_points: data.data_points
        })
        setSelectedAsset(config.asset)
        setSelectedInterval(getTradingViewInterval(config.interval))
        setLatestBacktestDate(data.run_date)
        setStrategyMode(data.strategy_mode || config.strategy_mode)
        setEmaFast(data.ema_fast || config.ema_fast)
        setEmaSlow(data.ema_slow || config.ema_slow)
        // Store the current config for "Set as Default" feature
        setCurrentConfig(config)
        console.log(`Backtest completed (${data.strategy_mode}) EMA(${data.ema_fast}/${data.ema_slow}) for interval ${config.interval}: ${data.performance.Total_Return_Pct.toFixed(2)}% return, ${data.trades?.length || 0} trades`)
        if (data.open_position) {
          console.log('Open position detected:', data.open_position)
          console.log('Position ID for updates:', data.position_id)
        }

        // Save backtest run to database (non-blocking)
        saveBacktestRun({
          asset: config.asset,
          interval: config.interval,
          daysBack: config.days_back,
          initialCapital: config.initial_capital,
          enableShort: config.enable_short,
          strategyMode: config.strategy_mode,
          emaFast: config.ema_fast,
          emaSlow: config.ema_slow,
          totalReturn: data.performance.Total_Return,
          totalReturnPct: data.performance.Total_Return_Pct,
          winRate: data.performance.Win_Rate,
          totalTrades: data.performance.Total_Trades,
          winningTrades: data.performance.Winning_Trades,
          losingTrades: data.performance.Losing_Trades,
          maxDrawdown: data.performance.Max_Drawdown_Pct,
          sharpeRatio: data.performance.Sharpe_Ratio,
          tradeLogs: data.trades
        }).then(result => {
          if (result.success) {
            console.log('Backtest run saved to database')
          }
        }).catch(err => {
          console.warn('Failed to save backtest run to database:', err)
        })

        // Also update the default config with open position (if user has a default set)
        updateDefaultPosition({
          openPosition: data.open_position || null,
          performance: {
            totalReturn: data.performance.Total_Return,
            totalReturnPct: data.performance.Total_Return_Pct,
            winRate: data.performance.Win_Rate,
            totalTrades: data.performance.Total_Trades
          },
          lastBacktestDate: data.run_date
        }).then(result => {
          if (result.success) {
            console.log('Default config updated with open position')
          }
        }).catch(err => {
          // Ignore - user might not have a default config set
        })
      } else {
        console.error('Backtest failed:', data.error)
        alert('Backtest failed: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error running backtest:', error)
      const errorMessage = error.message || 'Unknown error'
      alert(`Error running backtest: ${errorMessage}\n\nMake sure:\n1. Python API server is running on port 5001\n2. Check browser console for details`)
    } finally {
      setIsLoading(false)
    }
  }

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className={styles.dashboard}>
      <Sidebar onCollapseChange={setSidebarCollapsed} />
      <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
            <TopBar sidebarCollapsed={sidebarCollapsed} />
            <CryptoTicker onSelectAsset={setSelectedAsset} />
        <div className={styles.content}>
          <div className={styles.leftSection}>
            <div className={styles.chartSection}>
              <div className={styles.chartHeader}>
                <h2>Trading Chart</h2>
                <span style={{ color: '#888', fontSize: '0.9rem' }}>{selectedAsset}</span>
              </div>
              <TradingViewChart
                key={`${selectedAsset}-${selectedInterval}`}
                symbol={getTradingViewSymbol(selectedAsset)}
                interval={selectedInterval}
                theme="dark"
                indicators={['RSI', 'MACD', 'MA']}
              />
            </div>
            <div className={styles.logSection}>
              <LogSection
                backtestTrades={backtestTrades}
                openPosition={openPosition}
              />
            </div>
          </div>
          <div className={styles.rightSection}>
            <BacktestConfig onRunBacktest={handleRunBacktest} isLoading={isLoading} apiConnected={apiConnected} />
            <BacktestResults
              performance={backtestPerformance}
              trades={backtestTrades}
              interval={backtestPerformance?.interval}
              dataPoints={backtestPerformance?.data_points}
              runDate={latestBacktestDate}
              strategyMode={strategyMode}
              emaFast={emaFast}
              emaSlow={emaSlow}
              currentConfig={currentConfig}
            />
            {backtestPerformance && (
              <PortfolioPnLChart
                trades={backtestTrades}
                initialCapital={backtestPerformance.Initial_Capital}
                holdingPosition={openPosition}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

