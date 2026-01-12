'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import CryptoTicker from '@/components/CryptoTicker'
import BacktestLightweightChart from '@/components/BacktestLightweightChart'
import LogSection from '@/components/LogSection'
import BacktestConfig from '@/components/BacktestConfig'
import BacktestResults from '@/components/BacktestResults'
import EntryPositionModal from '@/components/EntryPositionModal'
import ExitPositionModal from '@/components/ExitPositionModal'
import { useDatabase } from '@/hooks/useDatabase'
import { API_URL } from '@/lib/api'
import styles from './page.module.css'

export default function BacktestPage() {
  const { data: session } = useSession()
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
  const [canAccessModeratorTools, setCanAccessModeratorTools] = useState(false)
  
  // Manual input mode state
  const [mode, setMode] = useState('auto') // 'auto' or 'manual'
  const [manualTrades, setManualTrades] = useState([])
  const [manualOpenPosition, setManualOpenPosition] = useState(null)
  const [selectedCandle, setSelectedCandle] = useState(null)
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [showExitModal, setShowExitModal] = useState(false)
  const [manualTimeframe, setManualTimeframe] = useState('1d')
  const [manualIndicators, setManualIndicators] = useState([]) // Array of up to 2 indicators
  // Indicator parameters for each selected indicator
  const [manualIndicatorParams, setManualIndicatorParams] = useState({
    ema: { fast: 12, slow: 26 },
    ma: { fast: 10, slow: 20 },
    rsi: { length: 14, top: 70, bottom: 30 },
    cci: { length: 20, top: 100, bottom: -100 },
    zscore: { length: 20, top: 2, bottom: -2 }
  })
  const [manualStartDate, setManualStartDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 365)
    return date.toISOString().split('T')[0]
  })
  const [manualEndDate, setManualEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })

  // Database hook for saving backtest runs
  const { saveBacktestRun, updateDefaultPosition } = useDatabase()

  // Check if user is admin or moderator
  useEffect(() => {
    const checkModeratorAccess = async () => {
      if (!session?.user) {
        setCanAccessModeratorTools(false)
        return
      }

      try {
        const response = await fetch('/api/user')
        const data = await response.json()
        if (data.success && data.user) {
          const user = data.user
          const userRole = user.role ? user.role.toLowerCase() : 'user'
          const isAdminUser = user.id === 'cmjzbir7y0000eybbir608elt' || userRole === 'admin'
          const isModerator = userRole === 'moderator'
          setCanAccessModeratorTools(isAdminUser || isModerator)
        } else {
          setCanAccessModeratorTools(false)
        }
      } catch (error) {
        console.error('Error checking moderator access:', error)
        setCanAccessModeratorTools(false)
      }
    }

    if (session !== undefined) {
      checkModeratorAccess()
    }
  }, [session])

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
            // Construct config from loaded data for chart display
            if (data.asset && data.interval) {
              setCurrentConfig({
                asset: data.asset,
                interval: data.interval,
                days_back: data.days_back || 365,
                start_date: data.start_date,
                end_date: data.end_date,
                strategy_mode: data.strategy_mode,
                ema_fast: data.ema_fast,
                ema_slow: data.ema_slow,
                indicator_type: data.indicator_type || 'ema',
                indicator_params: data.indicator_params || (data.ema_fast && data.ema_slow ? { fast: data.ema_fast, slow: data.ema_slow } : null)
              })
            }
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
      'TOTAL/USDT': 'CRYPTOCAP:TOTAL', // Total Crypto Market Cap
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

  // Download price and indicator data CSV for moderators and admins
  const handleDownloadPriceEMACSV = async () => {
    if (!currentConfig) {
      alert('No backtest configuration available. Please run a backtest first.')
      return
    }

    if (!apiConnected) {
      alert('API server is not connected. Please check the connection.')
      return
    }

    try {
      setIsLoading(true)
      
      const requestBody = {
        asset: currentConfig.asset || selectedAsset,
        interval: currentConfig.interval,
        indicator_type: currentConfig.indicator_type || 'ema',
        indicator_params: currentConfig.indicator_params
      }

      // Legacy support: if indicator_params not available, use ema_fast/ema_slow
      if (!requestBody.indicator_params && requestBody.indicator_type === 'ema' && emaFast && emaSlow) {
        requestBody.indicator_params = { fast: emaFast, slow: emaSlow }
        requestBody.ema_fast = emaFast
        requestBody.ema_slow = emaSlow
      }

      // Add date range if available, otherwise use days_back
      if (currentConfig.start_date && currentConfig.end_date) {
        requestBody.start_date = currentConfig.start_date
        requestBody.end_date = currentConfig.end_date
      } else if (currentConfig.days_back) {
        requestBody.days_back = currentConfig.days_back
      } else {
        // Default to 365 days if nothing is specified
        requestBody.days_back = 365
      }

      console.log('Fetching price/indicator data:', `${API_URL}/api/price-ema-data`, requestBody)
      
      // Fetch price and indicator data from API
      const response = await fetch(`${API_URL}/api/price-ema-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      })

      console.log('Price/indicator API response status:', response.status)

      if (!response.ok) {
        let errorText = 'Unknown error'
        try {
          errorText = await response.text()
        } catch (e) {
          console.error('Failed to read error response:', e)
        }
        throw new Error(`API returned ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      console.log('Price/indicator API response data:', data)

      if (!data.success) {
        throw new Error(data.error || 'API request failed')
      }

      if (!data.data || data.data.length === 0) {
        throw new Error('No chart data available for the selected configuration')
      }

      const indicatorValues = data.indicator_values || {}
      const indicatorType = indicatorValues.type || data.indicator_type?.toUpperCase() || 'EMA'

      // Build CSV headers based on indicator type
      let headers = ['Date', 'Open', 'Close', 'High', 'Low']
      
      if (indicatorType === 'EMA' || indicatorType === 'MA') {
        headers.push(`${indicatorType} Fast (${indicatorValues.fast || data.ema_fast || 'N/A'})`)
        headers.push(`${indicatorType} Slow (${indicatorValues.slow || data.ema_slow || 'N/A'})`)
      } else {
        // RSI, CCI, Z-Score
        headers.push(`${indicatorType} (${indicatorValues.length || 'N/A'})`)
        headers.push(`${indicatorType} Top Threshold (${indicatorValues.top || 'N/A'})`)
        headers.push(`${indicatorType} Bottom Threshold (${indicatorValues.bottom || 'N/A'})`)
      }
      
      headers.push('Volume')

      // Convert data to CSV rows
      const csvRows = data.data.map(row => {
        const rowData = [
          row.Date || 'N/A',
          (row.Open || 0).toFixed(8),
          (row.Close || 0).toFixed(8),
          (row.High || 0).toFixed(8),
          (row.Low || 0).toFixed(8)
        ]
        
        if (indicatorType === 'EMA' || indicatorType === 'MA') {
          rowData.push(
            row.Indicator_Fast !== null && row.Indicator_Fast !== undefined ? row.Indicator_Fast.toFixed(8) : 'N/A',
            row.Indicator_Slow !== null && row.Indicator_Slow !== undefined ? row.Indicator_Slow.toFixed(8) : 'N/A'
          )
        } else {
          rowData.push(
            row.Indicator_Value !== null && row.Indicator_Value !== undefined ? row.Indicator_Value.toFixed(8) : 'N/A',
            indicatorValues.top || 'N/A',
            indicatorValues.bottom || 'N/A'
          )
        }
        
        rowData.push((row.Volume || 0).toFixed(2))
        return rowData
      })

      // Combine headers and rows
      const csvContent = [
        headers.join(','),
        ...csvRows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n')

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      const assetSlug = (currentConfig.asset || selectedAsset).replace('/', '_')
      const indicatorSlug = indicatorType.toLowerCase().replace('-', '_')
      link.setAttribute('download', `price_${indicatorSlug}_${assetSlug}_${timestamp}.csv`)
      
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      // Safely remove the link
      if (link.parentNode) {
        link.parentNode.removeChild(link)
      }
    } catch (error) {
      console.error('Error downloading price/indicator CSV:', error)
      const errorMessage = error.message || 'Unknown error'
      alert(`Error downloading CSV: ${errorMessage}\n\nMake sure:\n1. Python API server is running\n2. Check browser console for details`)
    } finally {
      setIsLoading(false)
    }
  }

  // Download CSV function for moderators and admins
  const handleDownloadTradeLogsCSV = () => {
    if (!backtestTrades || backtestTrades.length === 0) {
      alert('No trade data available to download')
      return
    }

    // Determine indicator type and label
    const indicatorType = currentConfig?.indicator_type || 'ema'
    const indicatorLabel = indicatorType.toUpperCase()
    const isCrossover = ['ema', 'ma'].includes(indicatorType)

    // CSV headers - dynamic based on indicator type
    const headers = [
      'Trade #',
      'Position Type',
      'Entry Date',
      'Exit Date',
      'Entry Price',
      'Exit Price'
    ]

    // Add indicator-specific headers
    if (isCrossover) {
      headers.push(`${indicatorLabel} Fast Period`, `${indicatorLabel} Slow Period`)
      headers.push(`Entry ${indicatorLabel} Fast`, `Entry ${indicatorLabel} Slow`)
      headers.push(`Exit ${indicatorLabel} Fast`, `Exit ${indicatorLabel} Slow`)
    } else {
      headers.push(`${indicatorLabel} Period`, `${indicatorLabel} Top`, `${indicatorLabel} Bottom`)
      headers.push(`Entry ${indicatorLabel} Value`, `Exit ${indicatorLabel} Value`)
    }

    headers.push('PnL', 'PnL %', 'Holding Days', 'Entry Reason', 'Exit Reason', 'Stop Loss', 'Stop Loss Hit')

    // Convert trades to CSV rows
    const csvRows = backtestTrades.map((trade, index) => {
      const row = [
        index + 1,
        trade.Position_Type || 'N/A',
        trade.Entry_Date || 'N/A',
        trade.Exit_Date || 'N/A',
        (trade.Entry_Price || 0).toFixed(8),
        (trade.Exit_Price || 0).toFixed(8)
      ]

      if (isCrossover) {
        row.push(
          trade.EMA_Fast_Period || trade.Indicator_Fast_Period || 'N/A',
          trade.EMA_Slow_Period || trade.Indicator_Slow_Period || 'N/A',
          (trade.Entry_EMA_Fast || trade.Entry_Indicator_Fast || 0).toFixed(8),
          (trade.Entry_EMA_Slow || trade.Entry_Indicator_Slow || 0).toFixed(8),
          (trade.Exit_EMA_Fast || trade.Exit_Indicator_Fast || 0).toFixed(8),
          (trade.Exit_EMA_Slow || trade.Exit_Indicator_Slow || 0).toFixed(8)
        )
      } else {
        row.push(
          trade.Indicator_Period || currentConfig?.indicator_params?.length || 'N/A',
          trade.Indicator_Top || currentConfig?.indicator_params?.top || 'N/A',
          trade.Indicator_Bottom || currentConfig?.indicator_params?.bottom || 'N/A',
          (trade.Entry_Indicator_Value || 0).toFixed(8),
          (trade.Exit_Indicator_Value || 0).toFixed(8)
        )
      }

      row.push(
        (trade.PnL || 0).toFixed(2),
        ((trade.PnL_Pct || 0) * 100).toFixed(2) + '%',
        trade.Holding_Days || 0,
        trade.Entry_Reason || 'N/A',
        trade.Exit_Reason || 'N/A',
        (trade.Stop_Loss || 0).toFixed(8),
        trade.Stop_Loss_Hit ? 'Yes' : 'No'
      )

      return row
    })

    // Add open position if exists
    if (openPosition) {
      const openRow = [
        'OPEN',
        openPosition.Position_Type || 'N/A',
        openPosition.Entry_Date || 'N/A',
        'N/A',
        (openPosition.Entry_Price || 0).toFixed(8),
        (openPosition.Current_Price || 0).toFixed(8)
      ]

      if (isCrossover) {
        openRow.push(
          openPosition.EMA_Fast_Period || openPosition.Indicator_Fast_Period || emaFast || currentConfig?.indicator_params?.fast || 'N/A',
          openPosition.EMA_Slow_Period || openPosition.Indicator_Slow_Period || emaSlow || currentConfig?.indicator_params?.slow || 'N/A',
          (openPosition.Entry_EMA_Fast || openPosition.Entry_Indicator_Fast || 0).toFixed(8),
          (openPosition.Entry_EMA_Slow || openPosition.Entry_Indicator_Slow || 0).toFixed(8),
          (openPosition.Current_EMA_Fast || openPosition.Current_Indicator_Fast || openPosition.Entry_EMA_Fast || openPosition.Entry_Indicator_Fast || 0).toFixed(8),
          (openPosition.Current_EMA_Slow || openPosition.Current_Indicator_Slow || openPosition.Entry_EMA_Slow || openPosition.Entry_Indicator_Slow || 0).toFixed(8)
        )
      } else {
        openRow.push(
          openPosition.Indicator_Period || currentConfig?.indicator_params?.length || 'N/A',
          openPosition.Indicator_Top || currentConfig?.indicator_params?.top || 'N/A',
          openPosition.Indicator_Bottom || currentConfig?.indicator_params?.bottom || 'N/A',
          (openPosition.Entry_Indicator_Value || 0).toFixed(8),
          (openPosition.Current_Indicator_Value || openPosition.Entry_Indicator_Value || 0).toFixed(8)
        )
      }

      openRow.push(
        ((openPosition.Current_Price - openPosition.Entry_Price) * (openPosition.Position_Type === 'LONG' ? 1 : -1)).toFixed(2),
        ((openPosition.PnL_Pct || 0) * 100).toFixed(2) + '%',
        openPosition.Holding_Days || 0,
        openPosition.Entry_Reason || 'N/A',
        'OPEN POSITION',
        (openPosition.Stop_Loss || 0).toFixed(8),
        'No'
      )

      csvRows.push(openRow)
    }

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...csvRows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const assetSlug = selectedAsset.replace('/', '_')
    const indicatorSlug = indicatorType.toLowerCase().replace('-', '_')
    link.setAttribute('download', `trade_logs_${indicatorSlug}_${assetSlug}_${timestamp}.csv`)
    
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    // Safely remove the link
    if (link.parentNode) {
      link.parentNode.removeChild(link)
    }
  }

  return (
    <div className={styles.dashboard}>
      <Sidebar onCollapseChange={setSidebarCollapsed} />
      <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
            <TopBar sidebarCollapsed={sidebarCollapsed} />
            <CryptoTicker onSelectAsset={setSelectedAsset} />
        <div className={styles.content}>
          {/* Mode Selector */}
          <div className={styles.modeSelector}>
            <button
              className={`${styles.modeButton} ${mode === 'auto' ? styles.active : ''}`}
              onClick={() => setMode('auto')}
            >
              Auto
            </button>
            <button
              className={`${styles.modeButton} ${mode === 'manual' ? styles.active : ''}`}
              onClick={() => setMode('manual')}
            >
              Manual
            </button>
          </div>

          {/* Manual Input Configuration - Full Width Row */}
          {mode === 'manual' && (
            <div className={styles.manualConfig}>
              <h3>
                <span className="material-icons">tune</span>
                Manual Input Configuration
              </h3>
              <div className={styles.configGrid}>
                <div className={styles.configRow}>
                  <label>
                    <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>schedule</span>
                    Timeframe
                  </label>
                  <select
                    value={manualTimeframe}
                    onChange={(e) => setManualTimeframe(e.target.value)}
                    className={styles.configInput}
                  >
                    <option value="1h">1 Hour</option>
                    <option value="2h">2 Hours</option>
                    <option value="4h">4 Hours</option>
                    <option value="1d">1 Day</option>
                    <option value="1W">1 Week</option>
                    <option value="1M">1 Month</option>
                  </select>
                </div>
                <div className={styles.configRow}>
                  <label>
                    <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>show_chart</span>
                    Indicators (max 2)
                  </label>
                  <div className={styles.indicatorButtons}>
                    {['ema', 'ma', 'rsi', 'cci', 'zscore'].map((indicator) => {
                      const isSelected = manualIndicators.includes(indicator)
                      const canSelect = manualIndicators.length < 2 || isSelected
                      return (
                        <button
                          key={indicator}
                          type="button"
                          className={`${styles.indicatorButton} ${isSelected ? styles.indicatorButtonActive : ''} ${!canSelect ? styles.indicatorButtonDisabled : ''}`}
                          onClick={() => {
                            if (!canSelect) return
                            if (isSelected) {
                              setManualIndicators(manualIndicators.filter(i => i !== indicator))
                            } else {
                              setManualIndicators([...manualIndicators, indicator])
                            }
                          }}
                          disabled={!canSelect}
                        >
                          {indicator.toUpperCase()}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {/* Indicator Parameters */}
                {manualIndicators.map((indicator) => (
                  <div key={indicator} className={styles.indicatorParams}>
                    <label className={styles.indicatorParamLabel}>{indicator.toUpperCase()} Parameters</label>
                    <div className={styles.indicatorParamInputs}>
                      {['ema', 'ma'].includes(indicator) ? (
                        <>
                          <div className={styles.paramField}>
                            <span>Fast</span>
                            <input
                              type="number"
                              value={manualIndicatorParams[indicator].fast}
                              onChange={(e) => setManualIndicatorParams({
                                ...manualIndicatorParams,
                                [indicator]: { ...manualIndicatorParams[indicator], fast: parseInt(e.target.value) || 1 }
                              })}
                              className={styles.paramInput}
                              min={1}
                              max={100}
                            />
                          </div>
                          <div className={styles.paramField}>
                            <span>Slow</span>
                            <input
                              type="number"
                              value={manualIndicatorParams[indicator].slow}
                              onChange={(e) => setManualIndicatorParams({
                                ...manualIndicatorParams,
                                [indicator]: { ...manualIndicatorParams[indicator], slow: parseInt(e.target.value) || 1 }
                              })}
                              className={styles.paramInput}
                              min={1}
                              max={200}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={styles.paramField}>
                            <span>Length</span>
                            <input
                              type="number"
                              value={manualIndicatorParams[indicator].length}
                              onChange={(e) => setManualIndicatorParams({
                                ...manualIndicatorParams,
                                [indicator]: { ...manualIndicatorParams[indicator], length: parseInt(e.target.value) || 1 }
                              })}
                              className={styles.paramInput}
                              min={1}
                              max={100}
                            />
                          </div>
                          <div className={styles.paramField}>
                            <span>Top</span>
                            <input
                              type="number"
                              value={manualIndicatorParams[indicator].top}
                              onChange={(e) => setManualIndicatorParams({
                                ...manualIndicatorParams,
                                [indicator]: { ...manualIndicatorParams[indicator], top: parseFloat(e.target.value) || 0 }
                              })}
                              className={styles.paramInput}
                            />
                          </div>
                          <div className={styles.paramField}>
                            <span>Bottom</span>
                            <input
                              type="number"
                              value={manualIndicatorParams[indicator].bottom}
                              onChange={(e) => setManualIndicatorParams({
                                ...manualIndicatorParams,
                                [indicator]: { ...manualIndicatorParams[indicator], bottom: parseFloat(e.target.value) || 0 }
                              })}
                              className={styles.paramInput}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <div className={styles.configRow}>
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={manualStartDate}
                    onChange={(e) => setManualStartDate(e.target.value)}
                    className={styles.configInput}
                    max={manualEndDate}
                  />
                </div>
                <div className={styles.configRow}>
                  <label>End Date</label>
                  <input
                    type="date"
                    value={manualEndDate}
                    onChange={(e) => setManualEndDate(e.target.value)}
                    className={styles.configInput}
                    min={manualStartDate}
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
            </div>
          )}

          <div className={`${styles.mainContentGrid} ${mode === 'auto' ? styles.hasRightSection : ''}`}>
            <div className={styles.leftSection}>
              <div className={styles.chartSection}>
                <div className={styles.chartHeader}>
                  <h2>Backtest Log</h2>
                  <span style={{ color: '#888', fontSize: '0.9rem' }}>
                    {selectedAsset} {mode === 'manual' ? `(${manualTimeframe})` : (currentConfig?.interval ? `(${currentConfig.interval})` : '')}
                  </span>
                </div>
              {mode === 'manual' && manualIndicators.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
                  Please select at least one indicator above to load the chart.
                </div>
              )}
              {(mode === 'auto' || (mode === 'manual' && manualIndicators.length > 0)) && (
                <BacktestLightweightChart
                  trades={mode === 'manual' ? manualTrades : backtestTrades}
                  openPosition={mode === 'manual' ? manualOpenPosition : openPosition}
                  config={mode === 'manual' ? {
                    asset: selectedAsset,
                    interval: manualTimeframe,
                    start_date: manualStartDate,
                    end_date: manualEndDate,
                    // Primary indicator (for backward compatibility)
                    indicator_type: manualIndicators[0] || 'ema',
                    indicator_params: manualIndicators.length > 0 ? manualIndicatorParams[manualIndicators[0]] : {},
                    // Multiple indicators array for manual mode
                    indicators: manualIndicators.map(ind => ({
                      type: ind,
                      params: manualIndicatorParams[ind]
                    }))
                  } : (currentConfig || (backtestPerformance ? {
                    asset: selectedAsset,
                    interval: backtestPerformance.interval || '1d',
                    days_back: 365,
                    strategy_mode: strategyMode,
                    ema_fast: emaFast,
                    ema_slow: emaSlow,
                    indicator_type: 'ema'
                  } : null))}
                  asset={selectedAsset}
                  mode={mode}
                  onCandleClick={mode === 'manual' ? (candle) => {
                    setSelectedCandle(candle)
                    if (manualOpenPosition) {
                      setShowExitModal(true)
                    } else {
                      setShowEntryModal(true)
                    }
                  } : null}
                  onPositionClick={mode === 'manual' ? () => {
                    setShowExitModal(true)
                  } : null}
                />
              )}
              {mode === 'manual' && manualIndicators.length > 0 && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#0f0f0f', borderRadius: '8px', fontSize: '0.85rem', color: '#888' }}>
                  <strong>Tip:</strong> Click on any candle to {manualOpenPosition ? 'exit the current position' : 'enter a new position'}. Hold Shift and click near the open position marker to exit quickly.
                </div>
              )}
              </div>
              <div className={styles.logSection}>
                <LogSection
                  backtestTrades={mode === 'manual' ? manualTrades : backtestTrades}
                  openPosition={mode === 'manual' ? manualOpenPosition : openPosition}
                />
              </div>
            </div>
            {mode === 'auto' && (
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
                openPosition={openPosition}
              />
              {/* Moderators Tools CSV Export Section */}
              {canAccessModeratorTools && (backtestTrades && backtestTrades.length > 0 || openPosition) && (
                <div className={styles.adminSection}>
                  <div className={styles.adminSectionHeader}>
                    <span className="material-icons" style={{ color: '#ffcc00' }}>security</span>
                    <h3>Moderators Tools</h3>
                    <span className={styles.adminBadge}>Moderators & Admins</span>
                  </div>
                  <div className={styles.adminSectionContent}>
                    <p className={styles.adminDescription}>
                      Download detailed trade log data including entry/exit prices and EMA values used for each trade.
                    </p>
                    <button
                      className={styles.downloadButton}
                      onClick={handleDownloadTradeLogsCSV}
                      disabled={(!backtestTrades || backtestTrades.length === 0) && !openPosition}
                    >
                      <span className="material-icons">download</span>
                      Download Trade Logs CSV
                    </button>
                    <button
                      className={styles.downloadButton}
                      onClick={handleDownloadPriceEMACSV}
                      disabled={!currentConfig || isLoading}
                    >
                      <span className="material-icons">table_chart</span>
                      {isLoading ? 'Loading...' : `Download Price & ${currentConfig?.indicator_type?.toUpperCase() || 'Indicator'} Data CSV`}
                    </button>
                    <div className={styles.downloadInfo}>
                      <span className="material-icons">info</span>
                      <span>CSV includes: Trade details, Entry/Exit prices, Indicator values, P&L, and more | Price & Indicator CSV: Daily OHLC prices with calculated indicator values</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Entry Position Modal */}
      {showEntryModal && selectedCandle && (
        <EntryPositionModal
          candle={selectedCandle}
          onClose={() => {
            setShowEntryModal(false)
            setSelectedCandle(null)
          }}
          onConfirm={(entryData) => {
            // Create new position
            const newPosition = {
              Entry_Date: selectedCandle.time,
              Entry_Price: entryData.price,
              Position_Type: entryData.positionType,
              Stop_Loss: entryData.stopLoss || null,
              Current_Price: entryData.price,
              PnL: 0,
              PnL_Pct: 0,
              Holding_Days: 0
            }
            setManualOpenPosition(newPosition)
            setShowEntryModal(false)
            setSelectedCandle(null)
            // User will click another candle to exit the position
          }}
          />
        )}

      {/* Exit Position Modal */}
      {showExitModal && manualOpenPosition && selectedCandle && (
        <ExitPositionModal
          position={manualOpenPosition}
          candle={selectedCandle}
          onClose={() => {
            setShowExitModal(false)
            setSelectedCandle(null)
          }}
          onConfirm={(exitData) => {
            // Calculate P&L
            const entryPrice = parseFloat(manualOpenPosition.Entry_Price)
            const exitPrice = exitData.price
            const isLong = manualOpenPosition.Position_Type === 'LONG'
            const pnl = (exitPrice - entryPrice) * (isLong ? 1 : -1)
            const pnlPct = ((exitPrice - entryPrice) / entryPrice) * (isLong ? 1 : -1)
            
            // Calculate holding days
            const entryDate = new Date(manualOpenPosition.Entry_Date)
            const exitDate = new Date(selectedCandle.time * 1000) // Convert Unix seconds to milliseconds
            const holdingDays = Math.floor((exitDate - entryDate) / (1000 * 60 * 60 * 24))

            // Create closed trade
            const closedTrade = {
              Entry_Date: manualOpenPosition.Entry_Date,
              Exit_Date: selectedCandle.time,
              Entry_Price: entryPrice,
              Exit_Price: exitPrice,
              Position_Type: manualOpenPosition.Position_Type,
              PnL: pnl,
              PnL_Pct: pnlPct,
              Holding_Days: holdingDays,
              Stop_Loss: manualOpenPosition.Stop_Loss || null
            }

            // Add to trades and clear open position
            setManualTrades([...manualTrades, closedTrade])
            setManualOpenPosition(null)
            setShowExitModal(false)
            setSelectedCandle(null)
          }}
          />
        )}
    </div>
  )
}

