'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { API_URL } from '@/lib/api'
import styles from './BacktestLightweightChart.module.css'

// Dynamically import lightweight-charts to avoid SSR issues
let lightweightCharts = null
if (typeof window !== 'undefined') {
  try {
    lightweightCharts = require('lightweight-charts')
  } catch (e) {
    console.warn('lightweight-charts not installed. Please run: npm install lightweight-charts')
  }
}

export default function BacktestLightweightChart({ 
  trades = [], 
  openPosition = null,
  config = null,
  asset = 'BTC/USDT',
  mode = 'auto',
  onCandleClick = null,
  onPositionClick = null,
  onDeleteTrade = null,
  signalMarkers = [], // Array of { time: Date/timestamp, type: 'entry_signal'|'exit_signal' }
  showSignals = false
}) {
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const indicatorChartContainerRef = useRef(null)
  const indicatorChartRef = useRef(null)
  const tooltipRef = useRef(null)
  const candlestickSeriesRef = useRef(null)
  const fastLineSeriesRef = useRef(null)
  const mediumLineSeriesRef = useRef(null)
  const slowLineSeriesRef = useRef(null)
  const indicator2FastLineRef = useRef(null)
  const indicator2SlowLineRef = useRef(null)
  const indicator3FastLineRef = useRef(null)
  const indicator3SlowLineRef = useRef(null)
  const indicatorSeriesRef = useRef(null)
  const indicator2SeriesRef = useRef(null)
  const indicator3SeriesRef = useRef(null)
  const timeScaleSyncUnsubscribeRef = useRef(null)
  const syncTimeoutRef = useRef(null)
  const [priceData, setPriceData] = useState([])
  const [indicator2Data, setIndicator2Data] = useState([])
  const [indicator3Data, setIndicator3Data] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const getLineIndicatorName = useCallback((type) => {
    const t = (type || '').toLowerCase()
    if (t === 'ma') return 'MA'
    if (t === 'dema') return 'DEMA'
    return 'EMA'
  }, [])

  const buildLineLegendItems = useCallback((type, params, colors) => {
    if (!type || !params) return []
    const name = getLineIndicatorName(type)

    // Support both schemas:
    // - crossover: { fast, slow, medium?, lineCount }
    // - single-line: { length }
    const hasCrossover = params.fast !== undefined || params.slow !== undefined || params.medium !== undefined
    const hasSingleLength = params.length !== undefined && !hasCrossover

    if (hasSingleLength) {
      return [{
        color: colors.fast,
        text: `${name} (${params.length})`,
      }]
    }

    const lineCount = params.lineCount || 2
    const items = []

    if (params.fast !== undefined && params.fast !== null) {
      items.push({ color: colors.fast, text: `${name} Fast (${params.fast})` })
    }

    if (lineCount >= 3 && params.medium !== undefined && params.medium !== null) {
      items.push({ color: colors.medium, text: `${name} Medium (${params.medium})` })
    }

    if (lineCount >= 2 && params.slow !== undefined && params.slow !== null) {
      items.push({ color: colors.slow, text: `${name} Slow (${params.slow})` })
    }

    return items
  }, [getLineIndicatorName])
  
  // Store trade data and price data maps for tooltip lookups
  const tradeDataMapRef = useRef(new Map())
  const priceDataMapRef = useRef({})
  
  // Store callbacks ref to avoid stale closures
  const callbacksRef = useRef({ onCandleClick, onPositionClick, onDeleteTrade })
  useEffect(() => {
    callbacksRef.current = { onCandleClick, onPositionClick, onDeleteTrade }
  }, [onCandleClick, onPositionClick, onDeleteTrade])
  
  // Store trades and openPosition refs to avoid stale closures in chart initialization
  const tradesRef = useRef(trades)
  const openPositionRef = useRef(openPosition)
  const signalMarkersRef = useRef(signalMarkers)
  const showSignalsRef = useRef(showSignals)
  useEffect(() => {
    tradesRef.current = trades
    openPositionRef.current = openPosition
    signalMarkersRef.current = signalMarkers
    showSignalsRef.current = showSignals
  }, [trades, openPosition, signalMarkers, showSignals])

  // Calculate date range from config
  const dateRange = useMemo(() => {
    if (!config) return null

    let startDate, endDate

    if (config.start_date && config.end_date) {
      startDate = new Date(config.start_date)
      endDate = new Date(config.end_date)
    } else if (config.days_back) {
      endDate = new Date()
      startDate = new Date()
      startDate.setDate(startDate.getDate() - config.days_back)
    } else {
      endDate = new Date()
      startDate = new Date()
      startDate.setDate(startDate.getDate() - 365)
    }

    return { startDate, endDate }
  }, [config])

  // Fetch price data for primary indicator
  useEffect(() => {
    if (!config || !dateRange) {
      setLoading(false)
      return
    }

    const fetchPriceData = async () => {
      setLoading(true)
      setError(null)
      setIndicator2Data([])
      setIndicator3Data([])

      try {
        // Fetch primary indicator data
        const requestBody = {
          asset: config.asset || asset,
          interval: config.interval,
          indicator_type: config.indicator_type || 'ema',
        }
        
        if (config.indicator_params) {
          requestBody.indicator_params = config.indicator_params
        }

        if (config.start_date && config.end_date) {
          requestBody.start_date = config.start_date
          requestBody.end_date = config.end_date
        } else if (config.days_back) {
          requestBody.days_back = config.days_back
        } else {
          requestBody.days_back = 365
        }

        const response = await fetch(`${API_URL}/api/price-ema-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data && data.data.length > 0) {
            setPriceData(data.data)
          } else {
            setError('No price data available')
          }
        } else {
          setError('Failed to fetch price data')
        }

        // Fetch second indicator data if present
        if (config?.indicators && config.indicators.length > 1) {
          const secondIndicator = config.indicators[1]
          const requestBody2 = {
            asset: config.asset || asset,
            interval: config.interval,
            indicator_type: secondIndicator.type,
            indicator_params: secondIndicator.params,
          }

          if (config.start_date && config.end_date) {
            requestBody2.start_date = config.start_date
            requestBody2.end_date = config.end_date
          } else if (config.days_back) {
            requestBody2.days_back = config.days_back
          } else {
            requestBody2.days_back = 365
          }

          const response2 = await fetch(`${API_URL}/api/price-ema-data`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody2)
          })

          if (response2.ok) {
            const data2 = await response2.json()
            if (data2.success && data2.data && data2.data.length > 0) {
              setIndicator2Data(data2.data)
            }
          }
        }

        // Fetch third indicator data if present
        if (config?.indicators && config.indicators.length > 2) {
          const thirdIndicator = config.indicators[2]
          const requestBody3 = {
            asset: config.asset || asset,
            interval: config.interval,
            indicator_type: thirdIndicator.type,
            indicator_params: thirdIndicator.params,
          }

          if (config.start_date && config.end_date) {
            requestBody3.start_date = config.start_date
            requestBody3.end_date = config.end_date
          } else if (config.days_back) {
            requestBody3.days_back = config.days_back
          } else {
            requestBody3.days_back = 365
          }

          const response3 = await fetch(`${API_URL}/api/price-ema-data`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody3)
          })

          if (response3.ok) {
            const data3 = await response3.json()
            if (data3.success && data3.data && data3.data.length > 0) {
              setIndicator3Data(data3.data)
            }
          }
        }
      } catch (err) {
        console.warn('Error fetching price data:', err)
        setError('Failed to load price data')
      } finally {
        setLoading(false)
      }
    }

    fetchPriceData()
  }, [config, dateRange, asset])

  // Check if EMA/MA/DEMA lines should be shown
  const showEMALines = useMemo(() => {
    if (!config) return false
    if (config.no_indicators) return false
    const indicatorType = config.indicator_type || 'ema'
    return ['ema', 'ma', 'dema'].includes(indicatorType?.toLowerCase())
  }, [config])
  
  // Get number of EMA/MA lines to show (1, 2, or 3)
  const emaLineCount = useMemo(() => {
    if (!config || !config.indicator_params) return 2
    return config.indicator_params.lineCount || 2
  }, [config])

  // Check if indicator chart should be shown (RSI, CCI, Z-score)
  const showIndicatorChart = useMemo(() => {
    if (!config) return false
    if (config.no_indicators) return false
    const indicatorType = config.indicator_type || 'ema'
    // Check primary indicator
    const oscillatorIndicators = ['rsi', 'cci', 'zscore', 'roll_std', 'roll_percentile']
    if (indicatorType && oscillatorIndicators.includes(indicatorType.toLowerCase())) return true
    // Check second indicator (manual mode only)
    if (config?.indicators && config.indicators.length > 1) {
      const secondType = config.indicators[1].type.toLowerCase()
      if (oscillatorIndicators.includes(secondType)) return true
    }
    // Check third indicator (manual mode only)
    if (config?.indicators && config.indicators.length > 2) {
      const thirdType = config.indicators[2].type.toLowerCase()
      if (oscillatorIndicators.includes(thirdType)) return true
    }
    return false
  }, [config])

  // Check which indicators need the indicator chart
  const indicatorChartIndicators = useMemo(() => {
    if (!config) return []
    const result = []
    const oscillatorIndicators = ['rsi', 'cci', 'zscore', 'roll_std', 'roll_percentile']
    const indicatorType = config.indicator_type || 'ema'
    if (oscillatorIndicators.includes(indicatorType.toLowerCase())) {
      result.push({ type: indicatorType, data: priceData, params: config?.indicator_params, isPrimary: true })
    }
    if (config?.indicators && config.indicators.length > 1) {
      const secondIndicator = config.indicators[1]
      if (oscillatorIndicators.includes(secondIndicator.type.toLowerCase())) {
        result.push({ type: secondIndicator.type, data: indicator2Data, params: secondIndicator.params, isPrimary: false })
      }
    }
    if (config?.indicators && config.indicators.length > 2) {
      const thirdIndicator = config.indicators[2]
      if (oscillatorIndicators.includes(thirdIndicator.type.toLowerCase())) {
        result.push({ type: thirdIndicator.type, data: indicator3Data, params: thirdIndicator.params, isPrimary: false })
      }
    }
    return result
  }, [config, priceData, indicator2Data, indicator3Data])

  // Helper to convert Entry_Date/Exit_Date to Unix seconds
  const toUnixSeconds = useCallback((dateValue) => {
    if (typeof dateValue === 'number') {
      return dateValue > 10000000000 ? Math.floor(dateValue / 1000) : dateValue
    }
    return Math.floor(new Date(dateValue).getTime() / 1000)
  }, [])

  // Function to update markers without recreating the chart (no price lines to reduce flickering)
  const updateMarkersAndPriceLines = useCallback(() => {
    if (!candlestickSeriesRef.current) return

    // Update trade data map for tooltip lookups
    const tradeDataMap = new Map()
    
    if (trades && Array.isArray(trades) && trades.length > 0) {
      trades.forEach((trade) => {
        if (!trade || !trade.Entry_Date || !trade.Exit_Date) return
        
        const entryTime = toUnixSeconds(trade.Entry_Date)
        const exitTime = toUnixSeconds(trade.Exit_Date)
        const isLong = (trade.Position_Type || '').toUpperCase() === 'LONG'
        const isWin = (trade.PnL || 0) >= 0

        tradeDataMap.set(entryTime, {
          type: 'entry',
          trade,
          isLong,
          price: parseFloat(trade.Entry_Price || 0),
          time: entryTime
        })

        tradeDataMap.set(exitTime, {
          type: 'exit',
          trade,
          isWin,
          price: parseFloat(trade.Exit_Price || 0),
          time: exitTime
        })
      })
    }

    // Store open position data
    if (openPosition && openPosition.Entry_Date) {
      const entryTime = toUnixSeconds(openPosition.Entry_Date)
      tradeDataMap.set(entryTime, {
        type: 'holding',
        position: openPosition,
        price: parseFloat(openPosition.Entry_Price || 0),
        time: entryTime
      })
    }

    tradeDataMapRef.current = tradeDataMap

    // Build markers only (no price lines)
    const markers = []
    
    if (trades && Array.isArray(trades) && trades.length > 0) {
      trades.forEach((trade) => {
        if (!trade || !trade.Entry_Date || !trade.Exit_Date) return
        
        const entryTime = toUnixSeconds(trade.Entry_Date)
        const exitTime = toUnixSeconds(trade.Exit_Date)
        const isLong = (trade.Position_Type || '').toUpperCase() === 'LONG'
        const isWin = (trade.PnL || 0) >= 0

        markers.push({
          time: entryTime,
          position: 'belowBar',
          color: isLong ? '#10b981' : '#ef4444',
          shape: 'circle',
          size: 1,
          text: isLong ? 'LONG' : 'SHORT',
        })

        markers.push({
          time: exitTime,
          position: 'aboveBar',
          color: isWin ? '#10b981' : '#ef4444',
          shape: 'circle',
          size: 1,
          text: isWin ? 'WIN' : 'LOSS',
        })
      })
    }

    // Add open position marker
    if (openPosition && openPosition.Entry_Date) {
      const entryTime = toUnixSeconds(openPosition.Entry_Date)
      markers.push({
        time: entryTime,
        position: 'belowBar',
        color: '#f59e0b',
        shape: 'circle',
        size: 1,
        text: 'OPEN',
      })
    }

    // Add signal markers if showSignals is enabled
    if (showSignals && signalMarkers && signalMarkers.length > 0) {
      signalMarkers.forEach((signal) => {
        const signalTime = toUnixSeconds(signal.time)
        const isEntrySignal = signal.type === 'entry_signal'
        
        markers.push({
          time: signalTime,
          position: isEntrySignal ? 'belowBar' : 'aboveBar',
          color: '#fbbf24', // Yellow/amber for signals
          shape: 'arrowUp',
          size: 0.5,
          text: isEntrySignal ? '▲ SIGNAL' : '▼ SIGNAL',
        })
      })
    }

    // Set markers on candlestick series
    if (candlestickSeriesRef.current) {
      // Sort markers by time (required by lightweight-charts)
      markers.sort((a, b) => a.time - b.time)
      candlestickSeriesRef.current.setMarkers(markers)
    }

    // Update open position info for click detection
    if (chartContainerRef.current) {
      chartContainerRef.current._openPosition = openPosition
    }
  }, [trades, openPosition, toUnixSeconds])

  // Initialize chart (only when priceData or config changes, NOT trades/openPosition)
  useEffect(() => {
    if (!chartContainerRef.current || !priceData || priceData.length === 0) return
    if (!lightweightCharts) {
      setError('TradingView Lightweight Charts library not loaded. Please install: npm install lightweight-charts')
      return
    }

    const { createChart, ColorType, CrosshairMode } = lightweightCharts

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a1a' },
        textColor: '#888',
      },
      grid: {
        vertLines: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        horzLines: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 500,
    })

    chartRef.current = chart

    // Create tooltip element
    const tooltip = document.createElement('div')
    tooltip.className = styles.tooltip
    tooltip.style.display = 'none'
    chartContainerRef.current.appendChild(tooltip)
    tooltipRef.current = tooltip

    // Store price data map
    const priceDataMap = {}
    priceData.forEach(d => {
      const dateKey = new Date(d.Date).getTime() / 1000
      priceDataMap[dateKey] = d
    })
    priceDataMapRef.current = priceDataMap

    // Prepare candlestick data
    const candlestickData = priceData.map(d => ({
      time: new Date(d.Date).getTime() / 1000,
      open: parseFloat(d.Open || 0),
      high: parseFloat(d.High || 0),
      low: parseFloat(d.Low || 0),
      close: parseFloat(d.Close || 0),
    }))

    // Add candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#00ff88',
      downColor: '#ff4444',
      borderVisible: false,
      wickUpColor: '#00ff88',
      wickDownColor: '#ff4444',
    })
    candlestickSeries.setData(candlestickData)
    candlestickSeriesRef.current = candlestickSeries

    // Add click handler for manual mode - use callbacks ref for fresh reference
    if (mode === 'manual') {
      chart.subscribeCrosshairMove((param) => {
        if (param.time && param.point) {
          const hoveredCandle = candlestickData.find(c => c.time === param.time)
          if (hoveredCandle) {
            chartContainerRef.current._hoveredCandle = {
              time: param.time,
              open: hoveredCandle.open,
              high: hoveredCandle.high,
              low: hoveredCandle.low,
              close: hoveredCandle.close
            }
          }
        }
      })

      const handleChartClick = (e) => {
        const hoveredCandle = chartContainerRef.current._hoveredCandle
        const currentOnCandleClick = callbacksRef.current.onCandleClick

        if (hoveredCandle && currentOnCandleClick) {
          currentOnCandleClick(hoveredCandle)
        }
      }

      chartContainerRef.current.addEventListener('click', handleChartClick)
      chartContainerRef.current._clickHandler = handleChartClick

      // Add right-click handler for deleting trades (manual mode only)
      if (callbacksRef.current.onDeleteTrade) {
        const handleRightClick = (e) => {
          e.preventDefault()
          const hoveredCandle = chartContainerRef.current._hoveredCandle
          if (!hoveredCandle) return

          const hoveredTime = Math.floor(hoveredCandle.time)
          const currentTrades = tradesRef.current
          const currentOpenPosition = openPositionRef.current

          // Check if we're near a trade marker
          let foundTrade = null
          let foundPosition = null

          // Check trades
          if (currentTrades && Array.isArray(currentTrades)) {
            for (const trade of currentTrades) {
              if (!trade || !trade.Entry_Date || !trade.Exit_Date) continue
              const entryTime = Math.floor(new Date(trade.Entry_Date).getTime() / 1000)
              const exitTime = Math.floor(new Date(trade.Exit_Date).getTime() / 1000)
              const diff = Math.min(Math.abs(hoveredTime - entryTime), Math.abs(hoveredTime - exitTime))
              if (diff < 86400) { // Within 1 day
                foundTrade = trade
                break
              }
            }
          }

          // Check open position
          if (currentOpenPosition && currentOpenPosition.Entry_Date) {
            const entryTime = Math.floor(new Date(currentOpenPosition.Entry_Date).getTime() / 1000)
            const diff = Math.abs(hoveredTime - entryTime)
            if (diff < 86400) {
              foundPosition = currentOpenPosition
            }
          }

          if (foundTrade || foundPosition) {
            const currentOnDeleteTrade = callbacksRef.current.onDeleteTrade
            if (currentOnDeleteTrade) {
              // Create a log-like object for the delete handler
              const logData = foundTrade ? {
                positionType: foundTrade.Position_Type,
                entryDate: foundTrade.Entry_Date,
                exitDate: foundTrade.Exit_Date,
                isHolding: false
              } : {
                positionType: foundPosition.Position_Type,
                entryDate: foundPosition.Entry_Date,
                isHolding: true
              }
              currentOnDeleteTrade(logData)
            }
          }
        }

        chartContainerRef.current.addEventListener('contextmenu', handleRightClick)
        chartContainerRef.current._rightClickHandler = handleRightClick
      }
    }

    // Add EMA/MA lines if needed
    if (showEMALines) {
      const lineCount = config?.indicator_params?.lineCount || 2
      
      // Always show fast line if we're showing EMA/MA
      const fastData = priceData
        .map(d => ({
          time: new Date(d.Date).getTime() / 1000,
          value: d.Indicator_Fast !== null && d.Indicator_Fast !== undefined ? parseFloat(d.Indicator_Fast) : null,
        }))
        .filter(d => d.value !== null)

      // Get indicator label (EMA, MA, or DEMA)
      const indicatorLabel = config.indicator_type === 'ma' ? 'MA' : 
                             config.indicator_type === 'dema' ? 'DEMA' : 'EMA'
      const primaryParams = config?.indicator_params || (
        config?.ema_fast !== undefined && config?.ema_slow !== undefined
          ? { fast: config.ema_fast, slow: config.ema_slow, lineCount: 2 }
          : {}
      )
      const primaryIsSingleLength = primaryParams.length !== undefined &&
        primaryParams.fast === undefined &&
        primaryParams.slow === undefined &&
        primaryParams.medium === undefined
      
      if (fastData.length > 0) {
        const fastLine = chart.addLineSeries({
          color: '#ff6b6b',
          lineWidth: 2,
          title: primaryIsSingleLength ? `${indicatorLabel} (${primaryParams.length})` : `${indicatorLabel} Fast`,
        })
        fastLine.setData(fastData)
        fastLineSeriesRef.current = fastLine
      }

      // Show medium line when lineCount >= 3
      if (lineCount >= 3) {
        const mediumData = priceData
          .map(d => ({
            time: new Date(d.Date).getTime() / 1000,
            value: d.Indicator_Medium !== null && d.Indicator_Medium !== undefined ? parseFloat(d.Indicator_Medium) : null,
          }))
          .filter(d => d.value !== null)

        if (mediumData.length > 0) {
          const mediumLine = chart.addLineSeries({
            color: '#fbbf24', // Yellow/amber for medium
            lineWidth: 2,
            title: `${indicatorLabel} Medium`,
          })
          mediumLine.setData(mediumData)
          mediumLineSeriesRef.current = mediumLine
        }
      }

      // Show slow line when lineCount >= 2
      if (lineCount >= 2) {
        const slowData = priceData
          .map(d => ({
            time: new Date(d.Date).getTime() / 1000,
            value: d.Indicator_Slow !== null && d.Indicator_Slow !== undefined ? parseFloat(d.Indicator_Slow) : null,
          }))
          .filter(d => d.value !== null)

        if (slowData.length > 0) {
          const slowLine = chart.addLineSeries({
            color: '#4ecdc4',
            lineWidth: 2,
            title: `${indicatorLabel} Slow`,
          })
          slowLine.setData(slowData)
          slowLineSeriesRef.current = slowLine
        }
      }
    }

    // Add second indicator lines (EMA/MA/DEMA) if present
    if (indicator2Data.length > 0 && config?.indicators && config.indicators.length > 1) {
      const secondIndicator = config.indicators[1]
      const isLineIndicator = ['ema', 'ma', 'dema'].includes(secondIndicator.type.toLowerCase())
      const indicator2LineCount = secondIndicator.params?.lineCount || 2
      
      if (isLineIndicator) {
        const secondName = getLineIndicatorName(secondIndicator.type)
        const secondParams = secondIndicator.params || {}
        const secondIsSingleLength = secondParams.length !== undefined &&
          secondParams.fast === undefined &&
          secondParams.slow === undefined &&
          secondParams.medium === undefined

        const fast2Data = indicator2Data
          .map(d => ({
            time: new Date(d.Date).getTime() / 1000,
            value: d.Indicator_Fast !== null && d.Indicator_Fast !== undefined ? parseFloat(d.Indicator_Fast) : null,
          }))
          .filter(d => d.value !== null)

        if (fast2Data.length > 0) {
          const fast2Line = chart.addLineSeries({
            color: '#fbbf24',
            lineWidth: 2,
            title: secondIsSingleLength ? `${secondName} (${secondParams.length})` : `${secondName} Fast`,
            lineStyle: 2,
          })
          fast2Line.setData(fast2Data)
          indicator2FastLineRef.current = fast2Line
        }

        // Second indicator slow line
        if (indicator2LineCount >= 2) {
          const slow2Data = indicator2Data
            .map(d => ({
              time: new Date(d.Date).getTime() / 1000,
              value: d.Indicator_Slow !== null && d.Indicator_Slow !== undefined ? parseFloat(d.Indicator_Slow) : null,
            }))
            .filter(d => d.value !== null)

          if (slow2Data.length > 0) {
            const slow2Line = chart.addLineSeries({
              color: '#a78bfa',
              lineWidth: 2,
              title: `${secondName} Slow`,
              lineStyle: 2,
            })
            slow2Line.setData(slow2Data)
            indicator2SlowLineRef.current = slow2Line
          }
        }

        // Second indicator medium line (if 3 lines)
        if (indicator2LineCount >= 3) {
          const medium2Data = indicator2Data
            .map(d => ({
              time: new Date(d.Date).getTime() / 1000,
              value: d.Indicator_Medium !== null && d.Indicator_Medium !== undefined ? parseFloat(d.Indicator_Medium) : null,
            }))
            .filter(d => d.value !== null)

          if (medium2Data.length > 0) {
            const medium2Line = chart.addLineSeries({
              color: '#f472b6',
              lineWidth: 2,
              title: `${secondName} Medium`,
              lineStyle: 2,
            })
            medium2Line.setData(medium2Data)
            // Store reference if needed
          }
        }
      }
    }

    // Add third indicator lines (EMA/MA/DEMA) if present
    if (indicator3Data.length > 0 && config?.indicators && config.indicators.length > 2) {
      const thirdIndicator = config.indicators[2]
      const isLineIndicator = ['ema', 'ma', 'dema'].includes(thirdIndicator.type.toLowerCase())
      const indicator3LineCount = thirdIndicator.params?.lineCount || 2
      
      if (isLineIndicator) {
        const thirdName = getLineIndicatorName(thirdIndicator.type)
        const thirdParams = thirdIndicator.params || {}
        const thirdIsSingleLength = thirdParams.length !== undefined &&
          thirdParams.fast === undefined &&
          thirdParams.slow === undefined &&
          thirdParams.medium === undefined

        const fast3Data = indicator3Data
          .map(d => ({
            time: new Date(d.Date).getTime() / 1000,
            value: d.Indicator_Fast !== null && d.Indicator_Fast !== undefined ? parseFloat(d.Indicator_Fast) : null,
          }))
          .filter(d => d.value !== null)

        if (fast3Data.length > 0) {
          const fast3Line = chart.addLineSeries({
            color: '#10b981',
            lineWidth: 2,
            title: thirdIsSingleLength ? `${thirdName} (${thirdParams.length})` : `${thirdName} Fast`,
            lineStyle: 3,
          })
          fast3Line.setData(fast3Data)
          indicator3FastLineRef.current = fast3Line
        }

        // Third indicator slow line
        if (indicator3LineCount >= 2) {
          const slow3Data = indicator3Data
            .map(d => ({
              time: new Date(d.Date).getTime() / 1000,
              value: d.Indicator_Slow !== null && d.Indicator_Slow !== undefined ? parseFloat(d.Indicator_Slow) : null,
            }))
            .filter(d => d.value !== null)

          if (slow3Data.length > 0) {
            const slow3Line = chart.addLineSeries({
              color: '#06b6d4',
              lineWidth: 2,
              title: `${thirdName} Slow`,
              lineStyle: 3,
            })
            slow3Line.setData(slow3Data)
            indicator3SlowLineRef.current = slow3Line
          }
        }

        // Third indicator medium line (if 3 lines)
        if (indicator3LineCount >= 3) {
          const medium3Data = indicator3Data
            .map(d => ({
              time: new Date(d.Date).getTime() / 1000,
              value: d.Indicator_Medium !== null && d.Indicator_Medium !== undefined ? parseFloat(d.Indicator_Medium) : null,
            }))
            .filter(d => d.value !== null)

          if (medium3Data.length > 0) {
            const medium3Line = chart.addLineSeries({
              color: '#84cc16',
              lineWidth: 2,
              title: `${thirdName} Medium`,
              lineStyle: 3,
            })
            medium3Line.setData(medium3Data)
          }
        }
      }
    }

    // Subscribe to crosshair movements for custom tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!tooltipRef.current) return

      if (param.point === undefined || !param.time || param.point.x < 0 || param.point.x > chartContainerRef.current.clientWidth ||
          param.point.y < 0 || param.point.y > chartContainerRef.current.clientHeight) {
        tooltipRef.current.style.display = 'none'
        return
      }

      const hoveredTime = param.time
      const priceDataMap = priceDataMapRef.current
      const tradeDataMap = tradeDataMapRef.current

      // Get series data from crosshair param
      const seriesData = param.seriesData
      const candlestickData = seriesData?.get(candlestickSeriesRef.current)
      const fastLineData = fastLineSeriesRef.current ? seriesData?.get(fastLineSeriesRef.current) : null
      const slowLineData = slowLineSeriesRef.current ? seriesData?.get(slowLineSeriesRef.current) : null
      
      // Find closest price data point
      let priceDataPoint = null
      let closestTime = null
      let minDiff = Infinity

      for (const timeKey in priceDataMap) {
        const time = parseFloat(timeKey)
        const diff = Math.abs(time - hoveredTime)
        if (diff < minDiff) {
          minDiff = diff
          closestTime = time
          priceDataPoint = priceDataMap[timeKey]
        }
      }

      // Only show tooltip if we have data
      if (!priceDataPoint && !candlestickData) {
        tooltipRef.current.style.display = 'none'
        return
      }

      // Use candlestick data if available, otherwise use priceDataPoint
      let price, indicatorFast, indicatorSlow, date
      
      if (candlestickData) {
        price = candlestickData.close
        // Get indicator values from line series or priceDataPoint
        if (fastLineData && fastLineData.value !== undefined) {
          indicatorFast = fastLineData.value
        } else if (priceDataPoint && priceDataPoint.Indicator_Fast !== null && priceDataPoint.Indicator_Fast !== undefined) {
          indicatorFast = parseFloat(priceDataPoint.Indicator_Fast)
        } else {
          indicatorFast = null
        }
        
        if (slowLineData && slowLineData.value !== undefined) {
          indicatorSlow = slowLineData.value
        } else if (priceDataPoint && priceDataPoint.Indicator_Slow !== null && priceDataPoint.Indicator_Slow !== undefined) {
          indicatorSlow = parseFloat(priceDataPoint.Indicator_Slow)
        } else {
          indicatorSlow = null
        }
        
        // Get date from priceDataPoint or use timestamp
        if (priceDataPoint) {
          date = new Date(priceDataPoint.Date).toLocaleString()
        } else {
          date = new Date(hoveredTime * 1000).toLocaleString()
        }
      } else if (priceDataPoint) {
        price = parseFloat(priceDataPoint.Close || 0)
        indicatorFast = priceDataPoint.Indicator_Fast !== null && priceDataPoint.Indicator_Fast !== undefined 
          ? parseFloat(priceDataPoint.Indicator_Fast) : null
        indicatorSlow = priceDataPoint.Indicator_Slow !== null && priceDataPoint.Indicator_Slow !== undefined 
          ? parseFloat(priceDataPoint.Indicator_Slow) : null
        date = new Date(priceDataPoint.Date).toLocaleString()
      } else {
        tooltipRef.current.style.display = 'none'
        return
      }

      // Check if hovering near a trade marker (within 1 day)
      let nearbyTradeData = null
      let minTradeDiff = Infinity

      for (const [tradeTime, tradeData] of tradeDataMap.entries()) {
        const diff = Math.abs(tradeTime - hoveredTime)
        if (diff < minTradeDiff && diff < 86400) { // Within 1 day
          minTradeDiff = diff
          nearbyTradeData = tradeData
        }
      }

      const indicatorType = config?.indicator_type?.toUpperCase() === 'MA' ? 'MA' : 'EMA'

      let tooltipContent = `
        <div style="font-size: 12px; color: #aaa; margin-bottom: 4px;">Date: ${date}</div>
        <div style="font-size: 12px; color: #fff; margin-bottom: 4px;">Price: $${price.toFixed(2)}</div>
      `

      // Show indicator values if available
      if (showEMALines && indicatorFast !== null && indicatorFast !== undefined && !isNaN(indicatorFast)) {
        tooltipContent += `<div style="font-size: 12px; color: #ff6b6b; margin-bottom: 4px;">${indicatorType} Fast: $${indicatorFast.toFixed(2)}</div>`
      }

      if (showEMALines && indicatorSlow !== null && indicatorSlow !== undefined && !isNaN(indicatorSlow)) {
        tooltipContent += `<div style="font-size: 12px; color: #4ecdc4; margin-bottom: 4px;">${indicatorType} Slow: $${indicatorSlow.toFixed(2)}</div>`
      }

      // Show indicator value for RSI, CCI, Z-score
      if (showIndicatorChart && priceDataPoint) {
        const indicatorValue = priceDataPoint.Indicator_Value !== null && priceDataPoint.Indicator_Value !== undefined 
          ? parseFloat(priceDataPoint.Indicator_Value) : null
        if (indicatorValue !== null && !isNaN(indicatorValue)) {
          const indicatorTypeName = config?.indicator_type?.toUpperCase() || 'INDICATOR'
          tooltipContent += `<div style="font-size: 12px; color: #ffaa00; margin-bottom: 4px;">${indicatorTypeName}: ${indicatorValue.toFixed(2)}</div>`
        }
      }

      // Add position details if near a trade marker
      if (nearbyTradeData) {
        const tradeData = nearbyTradeData
        const data = tradeData.type === 'entry' || tradeData.type === 'holding' 
          ? tradeData.trade || tradeData.position
          : tradeData.trade

        if (data) {
          const isLong = tradeData.isLong !== undefined ? tradeData.isLong : (data.Position_Type || '').toUpperCase() === 'LONG'
          const positionType = isLong ? 'LONG' : 'SHORT'
          const entryPrice = parseFloat(data.Entry_Price || 0)
          const stopLoss = data.Stop_Loss ? parseFloat(data.Stop_Loss) : null

          tooltipContent += `
            <div style="border-top: 1px solid rgba(255,255,255,0.1); margin-top: 8px; padding-top: 8px;">
              <div style="font-weight: bold; margin-bottom: 6px; font-size: 13px; color: ${isLong ? '#10b981' : '#ef4444'};">${positionType} ${tradeData.type.toUpperCase()}</div>
              <div style="font-size: 12px; color: #aaa; margin-bottom: 4px;">Entry Price: $${entryPrice.toFixed(2)}</div>
          `

          if (stopLoss !== null && stopLoss !== undefined) {
            tooltipContent += `<div style="font-size: 12px; color: #aaa; margin-bottom: 4px;">Stop Loss: $${stopLoss.toFixed(2)}</div>`
          }

          if (tradeData.type === 'exit') {
            const pnl = data.PnL || 0
            const pnlPct = data.PnL_Pct || 0
            tooltipContent += `
              <div style="font-size: 12px; color: ${pnl >= 0 ? '#10b981' : '#ef4444'}; font-weight: bold; margin-top: 4px;">
                P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${(pnlPct * 100).toFixed(2)}%)
              </div>
            `
          } else if (tradeData.type === 'holding') {
            const pnl = data.Unrealized_PnL || 0
            const pnlPct = data.Unrealized_PnL_Pct || 0
            tooltipContent += `
              <div style="font-size: 12px; color: ${pnl >= 0 ? '#10b981' : '#ef4444'}; font-weight: bold; margin-top: 4px;">
                Unrealized P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${(pnlPct * 100).toFixed(2)}%)
              </div>
            `
          }

          tooltipContent += `</div>`
        }
      }

      tooltipRef.current.innerHTML = tooltipContent
      tooltipRef.current.style.display = 'block'
      
      // Position tooltip relative to chart container
      const rect = chartContainerRef.current.getBoundingClientRect()
      const x = param.point.x
      const y = param.point.y
      
      // Adjust position to keep tooltip within bounds
      let left = x
      let top = y - 10 // Offset above cursor
      
      // If tooltip would go off right edge, align to left of cursor
      if (x + 200 > rect.width) {
        left = x - 200
      }
      
      // If tooltip would go off top, show below cursor
      if (y < 150) {
        top = y + 20
      }
      
      tooltipRef.current.style.left = left + 'px'
      tooltipRef.current.style.top = top + 'px'
    })

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        })
      }
    }

    window.addEventListener('resize', handleResize)

    // Set initial markers after chart is created (no price lines to reduce flickering)
    // Use setTimeout to ensure the chart is fully initialized
    const initMarkersTimeout = setTimeout(() => {
      if (candlestickSeriesRef.current) {
        // Get current values from refs
        const currentTrades = tradesRef.current
        const currentOpenPosition = openPositionRef.current
        
        // Build initial markers (no price lines)
        const markers = []
        
        // Helper to convert dates to Unix seconds
        const toUnixSecs = (dateValue) => {
          if (typeof dateValue === 'number') {
            return dateValue > 10000000000 ? Math.floor(dateValue / 1000) : dateValue
          }
          return Math.floor(new Date(dateValue).getTime() / 1000)
        }
        
        // Add trade markers
        if (currentTrades && Array.isArray(currentTrades) && currentTrades.length > 0) {
          currentTrades.forEach((trade) => {
            if (!trade || !trade.Entry_Date || !trade.Exit_Date) return
            
            const entryTime = toUnixSecs(trade.Entry_Date)
            const exitTime = toUnixSecs(trade.Exit_Date)
            const isLong = (trade.Position_Type || '').toUpperCase() === 'LONG'
            const isWin = (trade.PnL || 0) >= 0

            markers.push({
              time: entryTime,
              position: 'belowBar',
              color: isLong ? '#10b981' : '#ef4444',
              shape: 'circle',
              size: 1,
              text: isLong ? 'LONG' : 'SHORT',
            })

            markers.push({
              time: exitTime,
              position: 'aboveBar',
              color: isWin ? '#10b981' : '#ef4444',
              shape: 'circle',
              size: 1,
              text: isWin ? 'WIN' : 'LOSS',
            })
          })
        }

        // Add open position marker
        if (currentOpenPosition && currentOpenPosition.Entry_Date) {
          const entryTime = toUnixSecs(currentOpenPosition.Entry_Date)
          markers.push({
            time: entryTime,
            position: 'belowBar',
            color: '#f59e0b',
            shape: 'circle',
            size: 1,
            text: 'OPEN',
          })
        }

        // Add signal markers if showSignals is enabled
        const currentSignalMarkers = signalMarkersRef.current
        const currentShowSignals = showSignalsRef.current
        if (currentShowSignals && currentSignalMarkers && currentSignalMarkers.length > 0) {
          currentSignalMarkers.forEach((signal) => {
            const signalTime = toUnixSecs(signal.time)
            const isEntrySignal = signal.type === 'entry_signal'
            
            markers.push({
              time: signalTime,
              position: isEntrySignal ? 'belowBar' : 'aboveBar',
              color: '#fbbf24', // Yellow/amber for signals
              shape: 'arrowUp',
              size: 0.5,
              text: isEntrySignal ? '▲ SIGNAL' : '▼ SIGNAL',
            })
          })
        }

        // Set markers (sorted by time)
        if (markers.length > 0) {
          markers.sort((a, b) => a.time - b.time)
          candlestickSeriesRef.current.setMarkers(markers)
        }
      }
    }, 50)

    return () => {
      clearTimeout(initMarkersTimeout)
      window.removeEventListener('resize', handleResize)
      // Remove click handler if exists
      if (chartContainerRef.current && chartContainerRef.current._clickHandler) {
        chartContainerRef.current.removeEventListener('click', chartContainerRef.current._clickHandler)
        chartContainerRef.current._clickHandler = null
        chartContainerRef.current._hoveredCandle = null
      }
      // Remove right-click handler if exists
      if (chartContainerRef.current && chartContainerRef.current._rightClickHandler) {
        chartContainerRef.current.removeEventListener('contextmenu', chartContainerRef.current._rightClickHandler)
        chartContainerRef.current._rightClickHandler = null
      }
      if (tooltipRef.current && tooltipRef.current.parentNode) {
        tooltipRef.current.parentNode.removeChild(tooltipRef.current)
      }
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
      candlestickSeriesRef.current = null
      fastLineSeriesRef.current = null
      mediumLineSeriesRef.current = null
      slowLineSeriesRef.current = null
      indicator2FastLineRef.current = null
      indicator2SlowLineRef.current = null
      indicator3FastLineRef.current = null
      indicator3SlowLineRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceData, indicator2Data, indicator3Data, showEMALines, showIndicatorChart, config, mode])

  // Update markers and price lines when trades or openPosition changes (without recreating chart)
  useEffect(() => {
    // Only update if chart is already initialized and we have price data
    if (candlestickSeriesRef.current && priceData && priceData.length > 0) {
      // Small delay to ensure chart is ready
      const timeout = setTimeout(() => {
        updateMarkersAndPriceLines()
      }, 10)
      return () => clearTimeout(timeout)
    }
  }, [trades, openPosition, updateMarkersAndPriceLines, priceData])

  // Initialize indicator chart (for RSI, CCI, Z-score)
  useEffect(() => {
    if (!showIndicatorChart || !indicatorChartContainerRef.current || !priceData || priceData.length === 0) {
      if (indicatorChartRef.current) {
        indicatorChartRef.current.remove()
        indicatorChartRef.current = null
      }
      return
    }

    if (!lightweightCharts) {
      return
    }

    const { createChart, ColorType, CrosshairMode } = lightweightCharts

    // Clean up existing chart
    if (indicatorChartRef.current) {
      indicatorChartRef.current.remove()
      indicatorChartRef.current = null
    }

    // Create indicator chart
    const indicatorChart = createChart(indicatorChartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a1a' },
        textColor: '#888',
      },
      grid: {
        vertLines: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        horzLines: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      width: indicatorChartContainerRef.current.clientWidth,
      height: 180, // Reduced height (40% less than 300px)
    })

    indicatorChartRef.current = indicatorChart

    // Prepare indicator data
    const indicatorData = priceData
      .map(d => ({
        time: new Date(d.Date).getTime() / 1000,
        value: d.Indicator_Value !== null && d.Indicator_Value !== undefined ? parseFloat(d.Indicator_Value) : null,
      }))
      .filter(d => d.value !== null)

    if (indicatorData.length > 0) {
      const indicatorType = config?.indicator_type?.toUpperCase() || 'RSI'
      const indicatorColor = '#2962FF' // Blue color
      let indicatorTitle = indicatorType

      // Set title based on indicator type
      if (indicatorType === 'RSI') {
        indicatorTitle = 'RSI'
      } else if (indicatorType === 'CCI') {
        indicatorTitle = 'CCI'
      } else if (indicatorType === 'ZSCORE') {
        indicatorTitle = 'Z-Score'
      }

      const indicatorSeries = indicatorChart.addLineSeries({
        color: indicatorColor,
        lineWidth: 2,
        title: indicatorTitle,
      })
      indicatorSeries.setData(indicatorData)
      indicatorSeriesRef.current = indicatorSeries

      // Add threshold lines for RSI (30, 70)
      if (indicatorType === 'RSI') {
        const overboughtLine = indicatorChart.addLineSeries({
          color: '#787B86',
          lineWidth: 1,
          lineStyle: 2, // Dashed
          title: 'Overbought (70)',
        })
        overboughtLine.setData(indicatorData.map(d => ({ time: d.time, value: 70 })))

        const oversoldLine = indicatorChart.addLineSeries({
          color: '#787B86',
          lineWidth: 1,
          lineStyle: 2, // Dashed
          title: 'Oversold (30)',
        })
        oversoldLine.setData(indicatorData.map(d => ({ time: d.time, value: 30 })))
      }

      // Add threshold lines for CCI (+100, -100)
      if (indicatorType === 'CCI') {
        const upperLine = indicatorChart.addLineSeries({
          color: '#787B86',
          lineWidth: 1,
          lineStyle: 2, // Dashed
          title: 'Upper (+100)',
        })
        upperLine.setData(indicatorData.map(d => ({ time: d.time, value: 100 })))

        const lowerLine = indicatorChart.addLineSeries({
          color: '#787B86',
          lineWidth: 1,
          lineStyle: 2, // Dashed
          title: 'Lower (-100)',
        })
        lowerLine.setData(indicatorData.map(d => ({ time: d.time, value: -100 })))
      }
    }

    // Add second indicator if it's RSI/CCI/Z-score
    if (indicator2Data.length > 0 && config?.indicators && config.indicators.length > 1) {
      const secondIndicator = config.indicators[1]
      const secondType = secondIndicator.type.toUpperCase()
      
      if (['RSI', 'CCI', 'ZSCORE', 'ROLL_STD', 'ROLL_PERCENTILE'].includes(secondType)) {
        const indicator2DataPoints = indicator2Data
          .map(d => ({
            time: new Date(d.Date).getTime() / 1000,
            value: d.Indicator_Value !== null && d.Indicator_Value !== undefined ? parseFloat(d.Indicator_Value) : null,
          }))
          .filter(d => d.value !== null)

        if (indicator2DataPoints.length > 0) {
          const indicator2Color = '#ff9800' // Orange for second indicator
          let indicator2Title = secondType
          if (secondType === 'ZSCORE') indicator2Title = 'Z-Score'

          const indicator2Series = indicatorChart.addLineSeries({
            color: indicator2Color,
            lineWidth: 2,
            lineStyle: 2, // Dashed to differentiate
            title: indicator2Title + ' (2)',
          })
          indicator2Series.setData(indicator2DataPoints)
          indicator2SeriesRef.current = indicator2Series
        }
      }
    }

    // Add third indicator if it's RSI/CCI/Z-score
    if (indicator3Data.length > 0 && config?.indicators && config.indicators.length > 2) {
      const thirdIndicator = config.indicators[2]
      const thirdType = thirdIndicator.type.toUpperCase()
      
      if (['RSI', 'CCI', 'ZSCORE', 'ROLL_STD', 'ROLL_PERCENTILE'].includes(thirdType)) {
        const indicator3DataPoints = indicator3Data
          .map(d => ({
            time: new Date(d.Date).getTime() / 1000,
            value: d.Indicator_Value !== null && d.Indicator_Value !== undefined ? parseFloat(d.Indicator_Value) : null,
          }))
          .filter(d => d.value !== null)

        if (indicator3DataPoints.length > 0) {
          const indicator3Color = '#10b981' // Green for third indicator
          let indicator3Title = thirdType
          if (thirdType === 'ZSCORE') indicator3Title = 'Z-Score'

          const indicator3Series = indicatorChart.addLineSeries({
            color: indicator3Color,
            lineWidth: 2,
            lineStyle: 3, // Dotted to differentiate
            title: indicator3Title + ' (3)',
          })
          indicator3Series.setData(indicator3DataPoints)
          indicator3SeriesRef.current = indicator3Series
        }
      }
    }

    // Link time scales between main chart and indicator chart
    // Use setTimeout to ensure main chart is fully initialized
    const setupTimeScaleSync = () => {
      if (chartRef.current && indicatorChartRef.current) {
        try {
          const mainTimeScale = chartRef.current.timeScale()
          const indicatorTimeScale = indicatorChartRef.current.timeScale()

          // Sync initial visible range
          const initialRange = mainTimeScale.getVisibleRange()
          if (initialRange) {
            indicatorTimeScale.setVisibleRange(initialRange)
          }

          // Subscribe to time scale changes on main chart and sync to indicator chart
          const syncTimeScale = () => {
            if (chartRef.current && indicatorChartRef.current) {
              try {
                const visibleRange = mainTimeScale.getVisibleRange()
                if (visibleRange) {
                  indicatorTimeScale.setVisibleRange(visibleRange)
                }
              } catch (e) {
                // Ignore errors during sync
              }
            }
          }

          // Subscribe to visible time range changes (handles scrolling/panning/zooming)
          const unsubscribe = mainTimeScale.subscribeVisibleTimeRangeChange(syncTimeScale)
          timeScaleSyncUnsubscribeRef.current = unsubscribe
        } catch (e) {
          console.warn('Error setting up time scale sync:', e)
        }
      }
    }

    // Setup sync after a short delay to ensure both charts are ready
    syncTimeoutRef.current = setTimeout(setupTimeScaleSync, 100)

    // Handle resize
    const handleResize = () => {
      if (indicatorChartContainerRef.current && indicatorChartRef.current) {
        indicatorChartRef.current.applyOptions({
          width: indicatorChartContainerRef.current.clientWidth,
        })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
        syncTimeoutRef.current = null
      }
      window.removeEventListener('resize', handleResize)
      if (timeScaleSyncUnsubscribeRef.current) {
        try {
          timeScaleSyncUnsubscribeRef.current()
        } catch (e) {
          // Ignore unsubscribe errors
        }
        timeScaleSyncUnsubscribeRef.current = null
      }
      if (indicatorChartRef.current) {
        indicatorChartRef.current.remove()
        indicatorChartRef.current = null
      }
      indicatorSeriesRef.current = null
      indicator2SeriesRef.current = null
      indicator3SeriesRef.current = null
    }
  }, [priceData, indicator2Data, indicator3Data, showIndicatorChart, config])

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading chart data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
      </div>
    )
  }

  if (!priceData || priceData.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <span className="material-icons">show_chart</span>
          <h3>No Chart Data Available</h3>
          <p>Run a backtest to view chart data and trade history.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div ref={chartContainerRef} className={styles.chart} />
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ backgroundColor: '#00ff88' }}></span>
          <span>Price (Candlestick)</span>
        </div>
        {showEMALines && buildLineLegendItems(
          config?.indicator_type,
          config?.indicator_params || (
            config?.ema_fast !== undefined && config?.ema_slow !== undefined
              ? { fast: config.ema_fast, slow: config.ema_slow, lineCount: 2 }
              : null
          ),
          { fast: '#ff6b6b', medium: '#fbbf24', slow: '#4ecdc4' }
        ).map((item) => (
          <div key={`primary-${item.text}`} className={styles.legendItem}>
            <span className={styles.legendMarker} style={{ backgroundColor: item.color }}></span>
            <span>{item.text}</span>
          </div>
        ))}
        {/* Second indicator legend for EMA/MA/DEMA */}
        {indicator2Data.length > 0 && config?.indicators?.length > 1 && ['ema', 'ma', 'dema'].includes(config.indicators[1].type.toLowerCase()) && (
          <>
            {buildLineLegendItems(
              config.indicators[1].type,
              config.indicators[1].params,
              { fast: '#fbbf24', medium: '#f472b6', slow: '#a78bfa' }
            ).map((item) => (
              <div key={`second-${item.text}`} className={styles.legendItem}>
                <span className={styles.legendMarker} style={{ backgroundColor: item.color }}></span>
                <span>{item.text}</span>
              </div>
            ))}
          </>
        )}
        {/* Third indicator legend for EMA/MA/DEMA */}
        {indicator3Data.length > 0 && config?.indicators?.length > 2 && ['ema', 'ma', 'dema'].includes(config.indicators[2].type.toLowerCase()) && (
          <>
            {buildLineLegendItems(
              config.indicators[2].type,
              config.indicators[2].params,
              { fast: '#10b981', medium: '#84cc16', slow: '#06b6d4' }
            ).map((item) => (
              <div key={`third-${item.text}`} className={styles.legendItem}>
                <span className={styles.legendMarker} style={{ backgroundColor: item.color }}></span>
                <span>{item.text}</span>
              </div>
            ))}
          </>
        )}
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ backgroundColor: '#10b981' }}></span>
          <span>Long Entry / Win</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ backgroundColor: '#ef4444' }}></span>
          <span>Short Entry / Loss</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ backgroundColor: '#f59e0b' }}></span>
          <span>Open Position</span>
        </div>
        {showSignals && (
          <div className={styles.legendItem}>
            <span className={styles.legendMarker} style={{ backgroundColor: '#fbbf24' }}></span>
            <span>Signal</span>
          </div>
        )}
      </div>
      {showIndicatorChart && (
        <div className={styles.indicatorChartWrapper}>
          <div className={styles.indicatorChartTitle}>
            {indicatorChartIndicators.map((ind, i) => (
              <span key={ind.type}>
                {i > 0 && ' / '}
                {ind.type.toUpperCase() === 'ZSCORE' ? 'Z-Score' : ind.type.toUpperCase()}
                {ind.params?.length && ` (${ind.params.length})`}
              </span>
            ))}
            {indicatorChartIndicators.length === 0 && (config?.indicator_type?.toUpperCase() || 'Indicator')}
            {' '}Chart
          </div>
          <div ref={indicatorChartContainerRef} className={styles.indicatorChart} />
        </div>
      )}
    </div>
  )
}
