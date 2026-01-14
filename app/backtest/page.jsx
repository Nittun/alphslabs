'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Swal from 'sweetalert2'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import CryptoTicker from '@/components/CryptoTicker'
import BacktestLightweightChart from '@/components/BacktestLightweightChart'
import LogSection from '@/components/LogSection'
import BacktestConfig from '@/components/BacktestConfig'
import BacktestResults from '@/components/BacktestResults'
import EntryPositionModal from '@/components/EntryPositionModal'
import ExitPositionModal from '@/components/ExitPositionModal'
import IndicatorConfigPanel from '@/components/IndicatorConfigPanel'
import StrategySelectorSection from '@/components/StrategySelectorSection'
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
  // Unified indicator config for manual mode (same format as auto mode)
  const [manualIndicators, setManualIndicators] = useState([
    {
      id: 'manual_ema',
      type: 'ema',
      enabled: true,
      usage: 'display',
      pane: 'overlay',
      source: 'close',
      params: { fast: 12, slow: 26 }
    }
  ])
  const [manualStartDate, setManualStartDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() - 365)
    return date.toISOString().split('T')[0]
  })
  const [manualEndDate, setManualEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })
  const [savedStrategies, setSavedStrategies] = useState([])
  const [showSaveStrategyModal, setShowSaveStrategyModal] = useState(false)
  const [strategyName, setStrategyName] = useState('')
  const [editMode, setEditMode] = useState(false) // Toggle for candle clicking
  
  // Manual mode saved indicator state
  const [manualUseCustomConfig, setManualUseCustomConfig] = useState(true)
  const [manualSelectedStrategyId, setManualSelectedStrategyId] = useState(null)
  const [manualSavedStrategyIndicators, setManualSavedStrategyIndicators] = useState([])

  // Calculate manual performance metrics
  const manualPerformance = useMemo(() => {
    if (manualTrades.length === 0) return null
    
    const totalTrades = manualTrades.length
    const winningTradesList = manualTrades.filter(t => t.PnL > 0)
    const losingTradesList = manualTrades.filter(t => t.PnL < 0)
    const winningTrades = winningTradesList.length
    const losingTrades = losingTradesList.length
    const totalPnL = manualTrades.reduce((sum, t) => sum + (t.PnL || 0), 0)
    // PnL_Pct is already in percentage format (5.0 for 5%)
    const totalPnLPct = manualTrades.reduce((sum, t) => sum + (t.PnL_Pct || 0), 0)
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0
    const lossRate = totalTrades > 0 ? (losingTrades / totalTrades) * 100 : 0
    const avgWin = winningTrades > 0 ? winningTradesList.reduce((s, t) => s + t.PnL, 0) / winningTrades : 0
    const avgLoss = losingTrades > 0 ? Math.abs(losingTradesList.reduce((s, t) => s + t.PnL, 0) / losingTrades) : 0
    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0
    
    // Calculate EV (Expected Value per trade)
    const expectedValue = (winRate / 100 * avgWin) - (lossRate / 100 * avgLoss)
    
    // Calculate average holding time
    const totalHoldingMs = manualTrades.reduce((sum, t) => {
      if (t.Entry_Date && t.Exit_Date) {
        const entry = new Date(t.Entry_Date).getTime()
        const exit = new Date(t.Exit_Date).getTime()
        return sum + (exit - entry)
      }
      return sum
    }, 0)
    const avgHoldingDays = totalTrades > 0 ? (totalHoldingMs / totalTrades) / (1000 * 60 * 60 * 24) : 0
    
    // Calculate MAE and MFE from trade PnL percentages
    const pnlPercentages = manualTrades.map(t => t.PnL_Pct || 0)
    const mae = pnlPercentages.length > 0 ? Math.min(...pnlPercentages.filter(p => p < 0), 0) : 0
    const mfe = pnlPercentages.length > 0 ? Math.max(...pnlPercentages.filter(p => p > 0), 0) : 0
    
    // Calculate max drawdown
    let peak = 0
    let maxDrawdown = 0
    let cumPnL = 0
    manualTrades.forEach(t => {
      cumPnL += t.PnL || 0
      if (cumPnL > peak) peak = cumPnL
      const drawdown = peak - cumPnL
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    })
    const maxDrawdownPct = peak > 0 ? (maxDrawdown / peak) * 100 : 0

    return {
      Total_Trades: totalTrades,
      Winning_Trades: winningTrades,
      Losing_Trades: losingTrades,
      Total_Return: totalPnL,
      Total_Return_Pct: totalPnLPct,
      Win_Rate: winRate,
      Profit_Factor: profitFactor,
      Max_Drawdown_Pct: maxDrawdownPct,
      Avg_Win: avgWin,
      Avg_Loss: avgLoss,
      Expected_Value: expectedValue,
      Avg_Holding_Days: avgHoldingDays,
      MAE: mae,
      MFE: mfe
    }
  }, [manualTrades])

  // Helper to format date from Unix seconds or milliseconds
  const formatTradeDate = (dateValue) => {
    if (!dateValue) return 'N/A'
    // If it's a small number, it's Unix seconds - multiply by 1000
    const timestamp = typeof dateValue === 'number' && dateValue < 10000000000 
      ? dateValue * 1000 
      : dateValue
    return new Date(timestamp).toLocaleString()
  }

  // Check if stop loss or take profit is hit for a candle
  const checkStopLossTakeProfit = useCallback((position, candle) => {
    if (!position || !candle) return null
    
    const entryPrice = parseFloat(position.Entry_Price)
    const isLong = position.Position_Type === 'LONG'
    let exitReason = null
    let exitPrice = null
    
    // Check stop loss
    if (position.Stop_Loss) {
      const stopLoss = parseFloat(position.Stop_Loss)
      
      if (isLong) {
        // For LONG: exit if low touches or goes below stop loss
        if (candle.low <= stopLoss) {
          exitReason = 'Stop Loss'
          exitPrice = stopLoss // Use stop loss price
        }
      } else {
        // For SHORT: exit if high touches or goes above stop loss
        if (candle.high >= stopLoss) {
          exitReason = 'Stop Loss'
          exitPrice = stopLoss // Use stop loss price
        }
      }
    }
    
    // Check take profit (only if stop loss wasn't hit)
    if (!exitReason && position.Take_Profit) {
      const takeProfit = parseFloat(position.Take_Profit)
      
      if (isLong) {
        // For LONG: exit if high touches or goes above take profit
        if (candle.high >= takeProfit) {
          exitReason = 'Take Profit'
          exitPrice = takeProfit // Use take profit price
        }
      } else {
        // For SHORT: exit if low touches or goes below take profit
        if (candle.low <= takeProfit) {
          exitReason = 'Take Profit'
          exitPrice = takeProfit // Use take profit price
        }
      }
    }
    
    return exitReason ? { exitReason, exitPrice } : null
  }, [])

  // Auto-close position if stop loss or take profit is hit
  const handleAutoExit = useCallback((position, candle, exitReason, exitPrice) => {
    if (!position || !candle) return
    
    const entryPrice = parseFloat(position.Entry_Price)
    const isLong = position.Position_Type === 'LONG'
    const pnl = (exitPrice - entryPrice) * (isLong ? 1 : -1)
    const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100 * (isLong ? 1 : -1)
    
    // Calculate holding days
    const entryDate = new Date(position.Entry_Date)
    const exitTimestamp = candle.time < 10000000000 ? candle.time * 1000 : candle.time
    const exitDate = new Date(exitTimestamp)
    const holdingDays = Math.floor((exitDate - entryDate) / (1000 * 60 * 60 * 24))
    
    // Create closed trade
    const closedTrade = {
      Entry_Date: position.Entry_Date,
      Exit_Date: exitDate.toISOString(),
      Entry_Price: entryPrice,
      Exit_Price: exitPrice,
      Position_Type: position.Position_Type,
      PnL: pnl,
      PnL_Pct: pnlPct,
      Holding_Days: holdingDays,
      Stop_Loss: position.Stop_Loss || null,
      Take_Profit: position.Take_Profit || null,
      Exit_Reason: exitReason
    }
    
    // Add to trades and clear open position
    setManualTrades(prev => [...prev, closedTrade])
    setManualOpenPosition(null)
  }, [])

  // Delete a manual trade
  const handleDeleteManualTrade = useCallback((log) => {
    if (!log.positionType) return // Only delete trades, not manual logs
    
    // If it's an open position
    if (log.isHolding && log.entryDate) {
      setManualOpenPosition(null)
      return
    }
    
    // If it's a closed trade, find and remove it
    if (log.entryDate && log.exitDate) {
      setManualTrades(prev => prev.filter(trade => {
        // Match by entry and exit dates
        return !(trade.Entry_Date === log.entryDate && trade.Exit_Date === log.exitDate)
      }))
    }
  }, [])

  // Export manual trade logs as CSV
  const handleExportManualTrades = useCallback(() => {
    if (manualTrades.length === 0 && !manualOpenPosition) {
      alert('No trades to export')
      return
    }

    const headers = ['Trade #', 'Position Type', 'Entry Date', 'Exit Date', 'Entry Price', 'Exit Price', 'P&L ($)', 'P&L (%)', 'Holding Days', 'Stop Loss', 'Take Profit', 'Exit Reason']
    const rows = manualTrades.map((trade, i) => [
      i + 1,
      trade.Position_Type,
      formatTradeDate(trade.Entry_Date),
      formatTradeDate(trade.Exit_Date),
      trade.Entry_Price?.toFixed(2) || 'N/A',
      trade.Exit_Price?.toFixed(2) || 'N/A',
      trade.PnL?.toFixed(2) || 'N/A',
      (trade.PnL_Pct?.toFixed(2) || '0') + '%',
      trade.Holding_Days ?? 'N/A',
      trade.Stop_Loss ? trade.Stop_Loss.toFixed(2) : 'N/A',
      trade.Take_Profit ? trade.Take_Profit.toFixed(2) : 'N/A',
      trade.Exit_Reason || 'Manual'
    ])

    if (manualOpenPosition) {
      rows.push([
        'OPEN',
        manualOpenPosition.Position_Type,
        formatTradeDate(manualOpenPosition.Entry_Date),
        'Open',
        manualOpenPosition.Entry_Price?.toFixed(2) || 'N/A',
        manualOpenPosition.Current_Price?.toFixed(2) || 'N/A',
        manualOpenPosition.Unrealized_PnL?.toFixed(2) || 'N/A',
        (manualOpenPosition.Unrealized_PnL_Pct?.toFixed(2) || '0') + '%',
        manualOpenPosition.Holding_Days ?? 'N/A',
        manualOpenPosition.Stop_Loss ? manualOpenPosition.Stop_Loss.toFixed(2) : 'N/A',
        manualOpenPosition.Take_Profit ? manualOpenPosition.Take_Profit.toFixed(2) : 'N/A',
        'Open'
      ])
    }

    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `manual_trades_${selectedAsset.replace('/', '_')}_${new Date().toISOString().slice(0,10)}.csv`
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    // Safely remove the link
    if (link.parentNode) {
      link.parentNode.removeChild(link)
    }
  }, [manualTrades, manualOpenPosition, selectedAsset])

  // Save current strategy configuration
  const handleSaveStrategy = useCallback(async () => {
    if (!strategyName.trim()) {
      alert('Please enter a strategy name')
      return
    }

    try {
      const response = await fetch('/api/manual-strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: strategyName,
          asset: selectedAsset,
          timeframe: manualTimeframe,
          startDate: manualStartDate,
          endDate: manualEndDate,
          indicators: manualIndicators.filter(i => i.enabled).map(ind => ({
            type: ind.type,
            params: ind.params
          })),
          trades: manualTrades,
          performance: manualPerformance
        })
      })

      const data = await response.json()
      if (data.success) {
        setSavedStrategies(prev => [...prev, data.strategy])
        setShowSaveStrategyModal(false)
        setStrategyName('')
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Strategy saved!',
          showConfirmButton: false,
          timer: 1500,
          background: '#1a1a2e',
          color: '#fff'
        })
      } else {
        throw new Error(data.error || 'Failed to save strategy')
      }
    } catch (error) {
      console.error('Error saving strategy:', error)
      Swal.fire({
        icon: 'error',
        title: 'Failed to save',
        text: error.message || 'Could not save strategy to database',
        background: '#1a1a2e',
        color: '#fff',
        confirmButtonColor: '#ff4444'
      })
    }
  }, [strategyName, selectedAsset, manualTimeframe, manualStartDate, manualEndDate, manualIndicators, manualTrades, manualPerformance])

  // Load saved strategies from database
  useEffect(() => {
    const loadStrategies = async () => {
      try {
        const response = await fetch('/api/manual-strategies')
        const data = await response.json()
        if (data.success) {
          setSavedStrategies(data.strategies || [])
        }
      } catch (error) {
        console.error('Failed to load saved strategies:', error)
        // Fallback to localStorage for backward compatibility
        try {
          const saved = JSON.parse(localStorage.getItem('savedStrategies') || '[]')
          setSavedStrategies(saved)
        } catch (e) {
          console.warn('Failed to load from localStorage:', e)
        }
      }
    }
    loadStrategies()
  }, [])
  
  // Load user strategies for indicator selector (manual mode)
  const [manualSavedStrategies, setManualSavedStrategies] = useState([])
  const [manualStrategiesLoading, setManualStrategiesLoading] = useState(false)
  
  useEffect(() => {
    const loadUserStrategies = async () => {
      setManualStrategiesLoading(true)
      try {
        const response = await fetch('/api/user-strategies')
        const data = await response.json()
        if (data.success) {
          setManualSavedStrategies(data.strategies || [])
        }
      } catch (error) {
        console.warn('Failed to fetch saved strategies:', error)
      } finally {
        setManualStrategiesLoading(false)
      }
    }
    loadUserStrategies()
  }, [])
  
  // Handle saved strategy selection in manual mode (same logic as auto mode)
  const handleManualSelectStrategy = useCallback((strategyId) => {
    setManualSelectedStrategyId(strategyId)
    
    // When a saved strategy is selected, parse and apply its indicators
    if (strategyId) {
      const strategy = manualSavedStrategies.find(s => s.id === strategyId)
      if (strategy?.dsl?.indicators) {
        // Convert DSL indicators to unified indicator format
        const dslIndicators = strategy.dsl.indicators
        const indicatorEntries = Object.entries(dslIndicators)
        
        if (indicatorEntries.length > 0) {
          const newIndicators = indicatorEntries.map(([alias, config], index) => {
            const indicatorType = config.type?.toLowerCase() || 'ema'
            let params = {}
            
            // Map DSL config to unified params (same as BacktestConfig.jsx)
            if (['ema', 'ma', 'dema'].includes(indicatorType)) {
              params = {
                fast: config.length || config.fast || 12,
                slow: config.slowLength || config.slow || 26,
                medium: config.mediumLength || config.medium || 21,
                lineCount: config.lineCount || 2
              }
            } else if (['rsi', 'cci', 'zscore', 'roll_std', 'roll_median', 'roll_percentile'].includes(indicatorType)) {
              params = {
                length: config.length || 14,
                overbought: config.top || config.overbought || 70,
                oversold: config.bottom || config.oversold || 30
              }
            }
            
            return {
              id: `saved_${alias}_${index}`,
              type: indicatorType,
              enabled: true,
              usage: 'display', // For manual mode, all indicators are display-only
              pane: ['rsi', 'cci', 'zscore', 'roll_std', 'roll_percentile'].includes(indicatorType) ? 'oscillator' : 'overlay',
              source: config.source || 'close',
              params
            }
          })
          
          setManualSavedStrategyIndicators(newIndicators)
        } else {
          setManualSavedStrategyIndicators([])
        }
      } else {
        setManualSavedStrategyIndicators([])
      }
    } else {
      setManualSavedStrategyIndicators([])
    }
  }, [manualSavedStrategies])
  
  // Handle toggle between custom and saved indicator in manual mode (same logic as auto mode)
  const handleManualToggleStrategyMode = useCallback((useCustom) => {
    setManualUseCustomConfig(useCustom)
    if (useCustom) {
      setManualSelectedStrategyId(null)
    }
  }, [])
  
  // Active indicators for manual mode (custom or saved)
  const manualActiveIndicators = useMemo(() => {
    if (manualUseCustomConfig) {
      return manualIndicators
    } else {
      return manualSavedStrategyIndicators
    }
  }, [manualUseCustomConfig, manualIndicators, manualSavedStrategyIndicators])

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
            <div className={styles.modeSelectorButtons}>
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

            {/* Quick Guide for Auto Mode */}
            {mode === 'auto' && (
              <div className={styles.quickGuide}>
                <div className={styles.guideSteps}>
                  <span className={styles.guideStep}>
                    <span className={styles.stepNumber}>1</span>
                    Configure parameters
                  </span>
                  <span className={styles.guideDivider}>→</span>
                  <span className={styles.guideStep}>
                    <span className={styles.stepNumber}>2</span>
                    Run Backtest
                  </span>
                  <span className={styles.guideDivider}>→</span>
                  <span className={styles.guideStep}>
                    <span className={styles.stepNumber}>3</span>
                    Analyze results
                  </span>
                </div>
              </div>
            )}

            {/* Quick Guide for Manual Mode */}
            {mode === 'manual' && (
              <div className={styles.quickGuide}>
                <div className={styles.guideSteps}>
                  <span className={styles.guideStep}>
                    <span className={styles.stepNumber}>1</span>
                    Set up chart
                  </span>
                  <span className={styles.guideDivider}>→</span>
                  <span className={styles.guideStep}>
                    <span className={styles.stepNumber}>2</span>
                    Enable Edit Mode
                  </span>
                  <span className={styles.guideDivider}>→</span>
                  <span className={styles.guideStep}>
                    <span className={styles.stepNumber}>3</span>
                    Click chart to trade
                  </span>
                  <span className={styles.guideDivider}>→</span>
                  <span className={styles.guideStep}>
                    <span className={styles.stepNumber}>4</span>
                    Save strategy
                  </span>
                </div>
              </div>
            )}

            {/* Saved Strategies - Shown in Manual Mode */}
            {mode === 'manual' && (
              <div className={styles.savedStrategiesInline}>
                <button
                  className={`${styles.strategyChip} ${styles.newStrategyChip}`}
                  onClick={() => {
                    setManualTrades([])
                    setManualOpenPosition(null)
                    setStrategyName('')
                  }}
                >
                  <span className="material-icons">add</span>
                  New
                </button>
                {savedStrategies.map(strat => (
                  <button
                    key={strat.id}
                    className={styles.strategyChip}
                    onClick={() => {
                      setSelectedAsset(strat.asset)
                      setManualTimeframe(strat.timeframe)
                      setManualStartDate(strat.startDate)
                      setManualEndDate(strat.endDate)
                      // Convert saved indicators to unified format
                      const loadedIndicators = (strat.indicators || []).map((ind, idx) => ({
                        id: `loaded_${ind.type}_${idx}`,
                        type: ind.type,
                        enabled: true,
                        usage: 'display',
                        pane: ['rsi', 'cci', 'zscore', 'roll_std'].includes(ind.type) ? 'oscillator' : 'overlay',
                        source: 'close',
                        params: ind.params || {}
                      }))
                      setManualIndicators(loadedIndicators)
                      setManualTrades(strat.trades || [])
                      setManualOpenPosition(strat.openPosition || null)
                      setStrategyName(strat.name)
                    }}
                    title={`${strat.asset} • ${strat.timeframe} • ${strat.trades?.length || 0} trades`}
                  >
                    <span className="material-icons">bookmark</span>
                    {strat.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Manual Input Configuration - Full Width Row */}
          {mode === 'manual' && (
            <div className={styles.manualConfig}>
              <h3 className={styles.configTitle}>
                <span className="material-icons">tune</span>
                Graph Setting
              </h3>
              <div className={styles.configGrid}>
                <div className={styles.configRow}>
                  <label>Coin Pair</label>
                  <select
                    value={selectedAsset}
                    onChange={(e) => setSelectedAsset(e.target.value)}
                    className={styles.configInput}
                  >
                    <optgroup label="Cryptocurrencies">
                      <option value="BTC/USDT">BTC/USDT</option>
                      <option value="ETH/USDT">ETH/USDT</option>
                      <option value="BNB/USDT">BNB/USDT</option>
                      <option value="XRP/USDT">XRP/USDT</option>
                      <option value="SOL/USDT">SOL/USDT</option>
                      <option value="ADA/USDT">ADA/USDT</option>
                      <option value="DOGE/USDT">DOGE/USDT</option>
                      <option value="AVAX/USDT">AVAX/USDT</option>
                      <option value="DOT/USDT">DOT/USDT</option>
                      <option value="LINK/USDT">LINK/USDT</option>
                      <option value="MATIC/USDT">MATIC/USDT</option>
                      <option value="UNI/USDT">UNI/USDT</option>
                      <option value="ATOM/USDT">ATOM/USDT</option>
                      <option value="LTC/USDT">LTC/USDT</option>
                      <option value="TRX/USDT">TRX/USDT</option>
                    </optgroup>
                    <optgroup label="Market Index">
                      <option value="TOTAL/USDT">TOTAL (Crypto Market Cap)</option>
                    </optgroup>
                  </select>
                </div>

                <div className={styles.configRow}>
                  <label>Timeframe</label>
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
              {/* Strategy/Indicator Selection */}
              <div className={styles.manualIndicatorSection}>
                <StrategySelectorSection
                  useCustomConfig={manualUseCustomConfig}
                  onToggleMode={handleManualToggleStrategyMode}
                  savedStrategies={manualSavedStrategies}
                  selectedStrategyId={manualSelectedStrategyId}
                  onSelectStrategy={handleManualSelectStrategy}
                  loading={manualStrategiesLoading}
                  compact={true}
                />
                {manualUseCustomConfig ? (
                  <IndicatorConfigPanel
                    indicators={manualIndicators}
                    onChange={setManualIndicators}
                    title="Chart Indicators"
                    compact={true}
                    showUsage={false}
                    defaultUsage="display"
                  />
                ) : (
                  <div style={{
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '6px',
                    marginTop: '0.5rem'
                  }}>
                    {manualSavedStrategyIndicators.length > 0 ? (
                      <>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          fontSize: '0.75rem',
                          color: '#888',
                          marginBottom: '0.5rem'
                        }}>
                          <span className="material-icons" style={{ fontSize: '14px' }}>insights</span>
                          Active Indicators:
                        </div>
                        <div style={{
                          display: 'flex',
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: '0.4rem'
                        }}>
                          {manualSavedStrategyIndicators.map((ind, idx) => (
                            <span key={ind.id || idx} style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.25rem 0.5rem',
                              background: 'rgba(255, 255, 255, 0.08)',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: 500,
                              color: '#aaa'
                            }}>
                              {ind.type?.toUpperCase()} 
                              {ind.params?.fast && ind.params?.slow ? `(${ind.params.fast}/${ind.params.slow})` : 
                               ind.params?.length ? `(${ind.params.length})` : ''}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.75rem',
                        color: '#888'
                      }}>
                        <span className="material-icons" style={{ fontSize: '14px', color: '#ffc107' }}>info</span>
                        <span>Select a saved strategy above to use its indicator</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Auto Mode: Config Panel on top */}
          {mode === 'auto' && (
            <div className={styles.configSection}>
              <BacktestConfig onRunBacktest={handleRunBacktest} isLoading={isLoading} apiConnected={apiConnected} horizontal />
            </div>
          )}

          <div className={styles.mainContentGrid}>
            <div className={styles.leftSection}>
              <div className={styles.chartSection}>
                <div className={styles.chartHeader}>
                  <h2>Backtest Log</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ color: '#888', fontSize: '0.9rem' }}>
                      {selectedAsset} {mode === 'manual' ? `(${manualTimeframe})` : (currentConfig?.interval ? `(${currentConfig.interval})` : '')}
                    </span>
                    {mode === 'manual' && (
                      <button
                        onClick={() => setEditMode(!editMode)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.5rem 1rem',
                          background: editMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                          border: editMode ? '1px solid rgba(34, 197, 94, 0.5)' : '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '8px',
                          color: editMode ? '#22c55e' : '#888',
                          fontSize: '0.85rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <span className="material-icons" style={{ fontSize: '1.1rem' }}>
                          {editMode ? 'edit' : 'edit_off'}
                        </span>
                        {editMode ? 'Edit Mode ON' : 'Edit Log'}
                      </button>
                    )}
                  </div>
                </div>
              {(mode === 'auto' || mode === 'manual') && (
                <BacktestLightweightChart
                  trades={mode === 'manual' ? manualTrades : backtestTrades}
                  openPosition={mode === 'manual' ? manualOpenPosition : openPosition}
                  config={mode === 'manual' ? (() => {
                    // Build config from unified indicator format using active indicators
                    const enabledIndicators = manualActiveIndicators.filter(ind => ind.enabled)
                    
                    // Deduplicate indicators by type and params
                    const seen = new Map()
                    const dedupedIndicators = []
                    for (const ind of enabledIndicators) {
                      const paramsKey = JSON.stringify(ind.params || {})
                      const key = `${ind.type?.toLowerCase()}-${paramsKey}`
                      if (!seen.has(key)) {
                        seen.set(key, true)
                        dedupedIndicators.push(ind)
                      }
                    }
                    
                    const primaryIndicator = dedupedIndicators[0]
                    
                    return {
                      asset: selectedAsset,
                      interval: manualTimeframe,
                      start_date: manualStartDate,
                      end_date: manualEndDate,
                      // Primary indicator
                      indicator_type: primaryIndicator?.type || null,
                      indicator_params: primaryIndicator?.params || null,
                      // Multiple indicators array (deduplicated)
                      indicators: dedupedIndicators.map(ind => ({
                        type: ind.type,
                        params: ind.params
                      })),
                      // Flag to show chart without indicators
                      no_indicators: dedupedIndicators.length === 0
                    }
                  })() : (currentConfig || (backtestPerformance ? {
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
                  onCandleClick={mode === 'manual' && editMode ? (candle) => {
                    setSelectedCandle(candle)
                    
                    // Check if stop loss or take profit is hit
                    if (manualOpenPosition) {
                      // Get candle timestamp
                      const candleTimestamp = candle.time < 10000000000 ? candle.time * 1000 : candle.time
                      const candleDate = new Date(candleTimestamp)
                      const entryDate = new Date(manualOpenPosition.Entry_Date)
                      
                      // Check if exit date is before or same as entry date
                      if (candleDate <= entryDate) {
                        Swal.fire({
                          icon: 'warning',
                          title: 'Invalid Exit Date',
                          text: 'Exit date must be after the entry date. Please select a later candle.',
                          background: '#1a1a1a',
                          color: '#fff',
                          confirmButtonColor: '#4488ff'
                        })
                        setSelectedCandle(null)
                        return
                      }
                      
                      const autoExit = checkStopLossTakeProfit(manualOpenPosition, candle)
                      
                      if (autoExit) {
                        // Auto-close position
                        handleAutoExit(manualOpenPosition, candle, autoExit.exitReason, autoExit.exitPrice)
                        setSelectedCandle(null)
                        return
                      }
                      
                      // Otherwise show exit modal
                      setShowExitModal(true)
                    } else {
                      setShowEntryModal(true)
                    }
                  } : null}
                  onPositionClick={mode === 'manual' && editMode ? () => {
                    setShowExitModal(true)
                  } : null}
                  onDeleteTrade={mode === 'manual' ? handleDeleteManualTrade : null}
                />
              )}
              {mode === 'manual' && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#0f0f0f', borderRadius: '8px', fontSize: '0.85rem', color: '#888' }}>
                  {editMode ? (
                    <>
                      <span style={{ color: '#22c55e' }}>✓ Edit Mode Active:</span> Click on any candle to {manualOpenPosition ? 'exit the current position' : 'enter a new position'}.
                    </>
                  ) : (
                    <>
                      <strong>Tip:</strong> Click the <span style={{ color: '#888', fontWeight: 500 }}>"Edit Log"</span> button above to enable candle clicking for entering/exiting positions.
                      {manualIndicators.filter(i => i.enabled).length === 0 && <span style={{ color: '#666' }}> Add indicators above to see technical analysis overlays on the chart.</span>}
                    </>
                  )}
                </div>
              )}
              </div>
              <div className={styles.logSection}>
                <LogSection
                  backtestTrades={mode === 'manual' ? manualTrades : backtestTrades}
                  openPosition={mode === 'manual' ? manualOpenPosition : openPosition}
                  onExport={mode === 'manual' ? handleExportManualTrades : null}
                  onDeleteTrade={mode === 'manual' ? handleDeleteManualTrade : null}
                />
              </div>
              
              {/* Backtest Results - Under the chart for auto mode */}
              {mode === 'auto' && (
                <div className={styles.resultsSection}>
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
            {/* Manual Mode Results and Actions */}
            {mode === 'manual' && (
              <div className={styles.rightSection}>
                {/* Manual Results */}
                <div className={styles.manualResultsCard}>
                  <h3>
                    <span className="material-icons">analytics</span>
                    Performance Summary
                  </h3>
                  {manualPerformance ? (
                    <div className={styles.manualMetrics}>
                      {/* Key metrics row */}
                      <div className={styles.keyMetricsRow}>
                        <div className={styles.keyMetricBox}>
                          <span className={styles.keyMetricLabel}>Win Rate</span>
                          <span className={`${styles.keyMetricValue} ${manualPerformance.Win_Rate >= 50 ? styles.positive : styles.negative}`}>
                            {manualPerformance.Win_Rate.toFixed(1)}%
                          </span>
                        </div>
                        <div className={styles.keyMetricBox}>
                          <span className={styles.keyMetricLabel}>Total P&L</span>
                          <span className={`${styles.keyMetricValue} ${manualPerformance.Total_Return >= 0 ? styles.positive : styles.negative}`}>
                            ${manualPerformance.Total_Return >= 0 ? '+' : ''}{manualPerformance.Total_Return.toFixed(0)}
                          </span>
                        </div>
                        <div className={styles.keyMetricBox}>
                          <span className={styles.keyMetricLabel}>EV per Trade</span>
                          <span className={`${styles.keyMetricValue} ${manualPerformance.Expected_Value >= 0 ? styles.positive : styles.negative}`}>
                            ${manualPerformance.Expected_Value >= 0 ? '+' : ''}{manualPerformance.Expected_Value.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      
                      {/* Advanced metrics cards */}
                      <div className={styles.advancedMetricsRow}>
                        <div className={styles.advancedMetricCard}>
                          <span className="material-icons">trending_down</span>
                          <div>
                            <span className={styles.advLabel}>MAE</span>
                            <span className={`${styles.advValue} ${styles.negative}`}>
                              {manualPerformance.MAE.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                        <div className={styles.advancedMetricCard}>
                          <span className="material-icons">trending_up</span>
                          <div>
                            <span className={styles.advLabel}>MFE</span>
                            <span className={`${styles.advValue} ${styles.positive}`}>
                              +{manualPerformance.MFE.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                        <div className={styles.advancedMetricCard}>
                          <span className="material-icons">schedule</span>
                          <div>
                            <span className={styles.advLabel}>Avg Hold</span>
                            <span className={styles.advValue}>
                              {manualPerformance.Avg_Holding_Days < 1 
                                ? '< 1d' 
                                : `${manualPerformance.Avg_Holding_Days.toFixed(1)}d`}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Detailed metrics */}
                      <div className={styles.metricRow}>
                        <span>Total Trades</span>
                        <strong>{manualPerformance.Total_Trades}</strong>
                      </div>
                      <div className={styles.metricRow}>
                        <span>Won / Lost</span>
                        <strong>
                          <span className={styles.positive}>{manualPerformance.Winning_Trades}</span>
                          {' / '}
                          <span className={styles.negative}>{manualPerformance.Losing_Trades}</span>
                        </strong>
                      </div>
                      <div className={styles.metricRow}>
                        <span>Avg Win / Loss</span>
                        <strong>
                          <span className={styles.positive}>${manualPerformance.Avg_Win.toFixed(0)}</span>
                          {' / '}
                          <span className={styles.negative}>-${manualPerformance.Avg_Loss.toFixed(0)}</span>
                        </strong>
                      </div>
                      <div className={styles.metricRow}>
                        <span>Profit Factor</span>
                        <strong>{manualPerformance.Profit_Factor === Infinity ? '∞' : manualPerformance.Profit_Factor.toFixed(2)}</strong>
                      </div>
                      <div className={styles.metricRow}>
                        <span>Max Drawdown</span>
                        <strong className={styles.negative}>{manualPerformance.Max_Drawdown_Pct.toFixed(2)}%</strong>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.noResults}>
                      <span className="material-icons">pending_actions</span>
                      <p>No trades logged yet. Click on candles to enter positions.</p>
                    </div>
                  )}
                </div>

                {/* Open Position */}
                {manualOpenPosition && (
                  <div className={styles.openPositionCard}>
                    <h3>
                      <span className="material-icons">trending_up</span>
                      Open Position
                    </h3>
                    <div className={styles.openPositionDetails}>
                      <div className={`${styles.positionBadge} ${manualOpenPosition.Position_Type === 'LONG' ? styles.longBadge : styles.shortBadge}`}>
                        {manualOpenPosition.Position_Type}
                      </div>
                      <div className={styles.positionInfo}>
                        <span>Entry: ${manualOpenPosition.Entry_Price.toFixed(2)}</span>
                        {manualOpenPosition.Stop_Loss && (
                          <span className={styles.stopLossBadge}>
                            <span className="material-icons">arrow_downward</span>
                            SL: ${manualOpenPosition.Stop_Loss.toFixed(2)}
                          </span>
                        )}
                        {manualOpenPosition.Take_Profit && (
                          <span className={styles.takeProfitBadge}>
                            <span className="material-icons">arrow_upward</span>
                            TP: ${manualOpenPosition.Take_Profit.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {(manualOpenPosition.Stop_Loss || manualOpenPosition.Take_Profit) && (
                        <div className={styles.autoExitNote}>
                          <span className="material-icons">info</span>
                          Position will auto-close if stop loss or take profit is hit
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className={styles.manualActionsCard}>
                  <h3>
                    <span className="material-icons">build</span>
                    Actions
                  </h3>
                  <div className={styles.actionButtons}>
                    <button
                      className={styles.actionButton}
                      onClick={handleExportManualTrades}
                      disabled={manualTrades.length === 0 && !manualOpenPosition}
                    >
                      <span className="material-icons">download</span>
                      Export Trade Logs
                    </button>
                    <button
                      className={`${styles.actionButton} ${styles.primaryAction}`}
                      onClick={() => setShowSaveStrategyModal(true)}
                      disabled={manualIndicators.length === 0}
                    >
                      <span className="material-icons">save</span>
                      Save Strategy
                    </button>
                    <button
                      className={`${styles.actionButton} ${styles.dangerAction}`}
                      onClick={() => {
                        if (confirm('Are you sure you want to clear all trades?')) {
                          setManualTrades([])
                          setManualOpenPosition(null)
                        }
                      }}
                      disabled={manualTrades.length === 0 && !manualOpenPosition}
                    >
                      <span className="material-icons">delete_sweep</span>
                      Clear All Trades
                    </button>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Strategy Modal */}
      {showSaveStrategyModal && (
        <div className={styles.modalOverlay} onClick={() => setShowSaveStrategyModal(false)}>
          <div className={styles.saveStrategyModal} onClick={e => e.stopPropagation()}>
            <h3>Save Strategy</h3>
            <p>Save your current configuration and trades for future reference.</p>
            <input
              type="text"
              placeholder="Strategy name (e.g., 'BTC EMA Crossover')"
              value={strategyName}
              onChange={e => setStrategyName(e.target.value)}
              className={styles.strategyNameInput}
              autoFocus
            />
            <div className={styles.strategyPreview}>
              <div><strong>Asset:</strong> {selectedAsset}</div>
              <div><strong>Timeframe:</strong> {manualTimeframe}</div>
              <div><strong>Indicators:</strong> {manualIndicators.filter(i => i.enabled).map(i => i.type.toUpperCase()).join(', ') || 'None'}</div>
              <div><strong>Trades:</strong> {manualTrades.length}</div>
              {manualPerformance && (
                <div><strong>P&L:</strong> ${manualPerformance.Total_Return.toFixed(2)} ({manualPerformance.Total_Return_Pct.toFixed(2)}%)</div>
              )}
            </div>
            <div className={styles.modalActions}>
              <button onClick={() => setShowSaveStrategyModal(false)} className={styles.cancelBtn}>Cancel</button>
              <button onClick={handleSaveStrategy} className={styles.saveBtn}>Save Strategy</button>
            </div>
          </div>
        </div>
      )}

      {/* Entry Position Modal */}
      {showEntryModal && selectedCandle && (
        <EntryPositionModal
          candle={selectedCandle}
          onClose={() => {
            setShowEntryModal(false)
            setSelectedCandle(null)
          }}
          onConfirm={(entryData) => {
            // Create new position - convert Unix seconds to milliseconds for consistency
            const entryTimestamp = selectedCandle.time < 10000000000 
              ? selectedCandle.time * 1000 
              : selectedCandle.time
            const newPosition = {
              Entry_Date: new Date(entryTimestamp).toISOString(),
              Entry_Price: entryData.price,
              Position_Type: entryData.positionType,
              Stop_Loss: entryData.stopLoss || null,
              Take_Profit: entryData.takeProfit || null,
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
            // Store as percentage (5.0 for 5%) to match LogSection format
            const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100 * (isLong ? 1 : -1)
            
            // Calculate holding days
            const entryDate = new Date(manualOpenPosition.Entry_Date)
            // Convert Unix seconds to milliseconds if needed
            const exitTimestamp = selectedCandle.time < 10000000000 
              ? selectedCandle.time * 1000 
              : selectedCandle.time
            const exitDate = new Date(exitTimestamp)
            const holdingDays = Math.floor((exitDate - entryDate) / (1000 * 60 * 60 * 24))

            // Create closed trade with ISO date strings for consistency
            const closedTrade = {
              Entry_Date: manualOpenPosition.Entry_Date,
              Exit_Date: exitDate.toISOString(),
              Entry_Price: entryPrice,
              Exit_Price: exitPrice,
              Position_Type: manualOpenPosition.Position_Type,
              PnL: pnl,
              PnL_Pct: pnlPct,
              Holding_Days: holdingDays,
              Stop_Loss: manualOpenPosition.Stop_Loss || null,
              Take_Profit: manualOpenPosition.Take_Profit || null
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

