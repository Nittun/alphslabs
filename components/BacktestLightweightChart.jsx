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
  showSignals = false,
  height = 500,
  indicatorHeight = 180
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
  const indicator2MediumLineRef = useRef(null)
  const indicator2SlowLineRef = useRef(null)
  const indicator3FastLineRef = useRef(null)
  const indicator3MediumLineRef = useRef(null)
  const indicator3SlowLineRef = useRef(null)
  const indicatorSeriesRef = useRef(null)
  const indicator2SeriesRef = useRef(null)
  const indicator3SeriesRef = useRef(null)
  const rsiOverboughtRef = useRef(null)
  const rsiOversoldRef = useRef(null)
  const cciUpperRef = useRef(null)
  const cciLowerRef = useRef(null)
  const timeScaleSyncUnsubscribeRef = useRef(null)
  const syncTimeoutRef = useRef(null)
  const crosshairHandlerRef = useRef(null)
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

  // Store config/mode refs so chart subscriptions don't need to resubscribe
  const configRef = useRef(config)
  const modeRef = useRef(mode)
  const showEMALinesRef = useRef(false)
  const showIndicatorChartRef = useRef(false)
  const heightRef = useRef(typeof height === 'number' ? height : 500)
  const indicatorHeightRef = useRef(typeof indicatorHeight === 'number' ? indicatorHeight : 180)

  useEffect(() => { configRef.current = config }, [config])
  useEffect(() => { modeRef.current = mode }, [mode])
  
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

  // Keep derived flags in refs for subscriptions (no resubscribe needed)
  useEffect(() => { showEMALinesRef.current = showEMALines }, [showEMALines])
  useEffect(() => { showIndicatorChartRef.current = showIndicatorChart }, [showIndicatorChart])

  // Apply size changes imperatively (do not recreate chart)
  useEffect(() => {
    heightRef.current = typeof height === 'number' ? height : 500
    if (chartRef.current && chartContainerRef.current) {
      chartRef.current.applyOptions({
        width: chartContainerRef.current.clientWidth,
        height: heightRef.current,
      })
    }
  }, [height])

  useEffect(() => {
    indicatorHeightRef.current = typeof indicatorHeight === 'number' ? indicatorHeight : 180
    if (indicatorChartRef.current && indicatorChartContainerRef.current) {
      indicatorChartRef.current.applyOptions({
        width: Math.max(1, indicatorChartContainerRef.current.clientWidth),
        height: indicatorHeightRef.current,
      })
    }
  }, [indicatorHeight])

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
    
    const currentTrades = tradesRef.current
    const currentOpenPosition = openPositionRef.current
    const currentShowSignals = showSignalsRef.current
    const currentSignalMarkers = signalMarkersRef.current

    if (currentTrades && Array.isArray(currentTrades) && currentTrades.length > 0) {
      currentTrades.forEach((trade) => {
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
    if (currentOpenPosition && currentOpenPosition.Entry_Date) {
      const entryTime = toUnixSeconds(currentOpenPosition.Entry_Date)
      tradeDataMap.set(entryTime, {
        type: 'holding',
        position: currentOpenPosition,
        price: parseFloat(currentOpenPosition.Entry_Price || 0),
        time: entryTime
      })
    }

    tradeDataMapRef.current = tradeDataMap

    // Build markers only (no price lines)
    const markers = []
    
    if (currentTrades && Array.isArray(currentTrades) && currentTrades.length > 0) {
      currentTrades.forEach((trade) => {
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
    if (currentOpenPosition && currentOpenPosition.Entry_Date) {
      const entryTime = toUnixSeconds(currentOpenPosition.Entry_Date)
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
    if (currentShowSignals && currentSignalMarkers && currentSignalMarkers.length > 0) {
      currentSignalMarkers.forEach((signal) => {
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
      chartContainerRef.current._openPosition = currentOpenPosition
    }
  }, [toUnixSeconds])

  // Create main chart exactly once per mount (no deps) and update imperatively via other effects.
  useEffect(() => {
    if (!chartContainerRef.current) return
    if (!lightweightCharts) {
      setError('TradingView Lightweight Charts library not loaded. Please install: npm install lightweight-charts')
      return
    }

    const { createChart, ColorType, CrosshairMode } = lightweightCharts

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a1a' },
        textColor: '#888',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.1)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.1)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.1)' },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: heightRef.current,
    })
    chartRef.current = chart

    // Series are created once; visibility/data will be updated imperatively.
    candlestickSeriesRef.current = chart.addCandlestickSeries({
      upColor: '#00ff88',
      downColor: '#ff4444',
      borderVisible: false,
      wickUpColor: '#00ff88',
      wickDownColor: '#ff4444',
    })

    fastLineSeriesRef.current = chart.addLineSeries({ color: '#ff6b6b', lineWidth: 2, visible: false })
    mediumLineSeriesRef.current = chart.addLineSeries({ color: '#fbbf24', lineWidth: 2, visible: false })
    slowLineSeriesRef.current = chart.addLineSeries({ color: '#4ecdc4', lineWidth: 2, visible: false })

    indicator2FastLineRef.current = chart.addLineSeries({ color: '#fbbf24', lineWidth: 2, lineStyle: 2, visible: false })
    indicator2MediumLineRef.current = chart.addLineSeries({ color: '#f472b6', lineWidth: 2, lineStyle: 2, visible: false })
    indicator2SlowLineRef.current = chart.addLineSeries({ color: '#a78bfa', lineWidth: 2, lineStyle: 2, visible: false })

    indicator3FastLineRef.current = chart.addLineSeries({ color: '#10b981', lineWidth: 2, lineStyle: 3, visible: false })
    indicator3MediumLineRef.current = chart.addLineSeries({ color: '#84cc16', lineWidth: 2, lineStyle: 3, visible: false })
    indicator3SlowLineRef.current = chart.addLineSeries({ color: '#06b6d4', lineWidth: 2, lineStyle: 3, visible: false })

    // Tooltip element
    const tooltip = document.createElement('div')
    tooltip.className = styles.tooltip
    tooltip.style.display = 'none'
    chartContainerRef.current.appendChild(tooltip)
    tooltipRef.current = tooltip

    const handleCrosshairMove = (param) => {
      const container = chartContainerRef.current
      if (!container || !tooltipRef.current) return

      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > container.clientWidth ||
        param.point.y < 0 ||
        param.point.y > container.clientHeight
      ) {
        tooltipRef.current.style.display = 'none'
        return
      }

      const seriesData = param.seriesData
      const candle = seriesData?.get(candlestickSeriesRef.current)

      // Keep hovered candle available for manual right-click actions.
      if (modeRef.current === 'manual' && candle) {
        container._hoveredCandle = {
          time: param.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        }
      }

      const hoveredTime = param.time
      const priceDataMap = priceDataMapRef.current || {}
      const tradeDataMap = tradeDataMapRef.current

      // Fast path: exact match. Fallback: closest time (legacy behavior).
      let priceDataPoint = priceDataMap[String(hoveredTime)] || priceDataMap[hoveredTime] || null
      if (!priceDataPoint) {
        let minDiff = Infinity
        for (const timeKey in priceDataMap) {
          const t = parseFloat(timeKey)
          const diff = Math.abs(t - hoveredTime)
          if (diff < minDiff) {
            minDiff = diff
            priceDataPoint = priceDataMap[timeKey]
          }
        }
      }

      if (!priceDataPoint && !candle) {
        tooltipRef.current.style.display = 'none'
        return
      }

      const fastLineData = fastLineSeriesRef.current ? seriesData?.get(fastLineSeriesRef.current) : null
      const slowLineData = slowLineSeriesRef.current ? seriesData?.get(slowLineSeriesRef.current) : null

      let price, indicatorFast, indicatorSlow, date

      if (candle) {
        price = candle.close
        indicatorFast =
          fastLineData && fastLineData.value !== undefined
            ? fastLineData.value
            : priceDataPoint && priceDataPoint.Indicator_Fast !== null && priceDataPoint.Indicator_Fast !== undefined
              ? parseFloat(priceDataPoint.Indicator_Fast)
              : null
        indicatorSlow =
          slowLineData && slowLineData.value !== undefined
            ? slowLineData.value
            : priceDataPoint && priceDataPoint.Indicator_Slow !== null && priceDataPoint.Indicator_Slow !== undefined
              ? parseFloat(priceDataPoint.Indicator_Slow)
              : null
        date = priceDataPoint ? new Date(priceDataPoint.Date).toLocaleString() : new Date(hoveredTime * 1000).toLocaleString()
      } else if (priceDataPoint) {
        price = parseFloat(priceDataPoint.Close || 0)
        indicatorFast =
          priceDataPoint.Indicator_Fast !== null && priceDataPoint.Indicator_Fast !== undefined
            ? parseFloat(priceDataPoint.Indicator_Fast)
            : null
        indicatorSlow =
          priceDataPoint.Indicator_Slow !== null && priceDataPoint.Indicator_Slow !== undefined
            ? parseFloat(priceDataPoint.Indicator_Slow)
            : null
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
        if (diff < minTradeDiff && diff < 86400) {
          minTradeDiff = diff
          nearbyTradeData = tradeData
        }
      }

      const cfg = configRef.current
      const indicatorType = cfg?.indicator_type?.toUpperCase() === 'MA' ? 'MA' : 'EMA'

      let tooltipContent = `
        <div style="font-size: 12px; color: #aaa; margin-bottom: 4px;">Date: ${date}</div>
        <div style="font-size: 12px; color: #fff; margin-bottom: 4px;">Price: $${price.toFixed(2)}</div>
      `

      if (showEMALinesRef.current && indicatorFast !== null && indicatorFast !== undefined && !isNaN(indicatorFast)) {
        tooltipContent += `<div style="font-size: 12px; color: #ff6b6b; margin-bottom: 4px;">${indicatorType} Fast: $${indicatorFast.toFixed(2)}</div>`
      }

      if (showEMALinesRef.current && indicatorSlow !== null && indicatorSlow !== undefined && !isNaN(indicatorSlow)) {
        tooltipContent += `<div style="font-size: 12px; color: #4ecdc4; margin-bottom: 4px;">${indicatorType} Slow: $${indicatorSlow.toFixed(2)}</div>`
      }

      if (showIndicatorChartRef.current && priceDataPoint) {
        const indicatorValue =
          priceDataPoint.Indicator_Value !== null && priceDataPoint.Indicator_Value !== undefined
            ? parseFloat(priceDataPoint.Indicator_Value)
            : null
        if (indicatorValue !== null && !isNaN(indicatorValue)) {
          const indicatorTypeName = cfg?.indicator_type?.toUpperCase() || 'INDICATOR'
          tooltipContent += `<div style="font-size: 12px; color: #ffaa00; margin-bottom: 4px;">${indicatorTypeName}: ${indicatorValue.toFixed(2)}</div>`
        }
      }

      if (nearbyTradeData) {
        const tradeData = nearbyTradeData
        const data = tradeData.type === 'entry' || tradeData.type === 'holding' ? tradeData.trade || tradeData.position : tradeData.trade

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

      const rect = container.getBoundingClientRect()
      const x = param.point.x
      const y = param.point.y

      let left = x
      let top = y - 10
      if (x + 200 > rect.width) left = x - 200
      if (y < 150) top = y + 20

      tooltipRef.current.style.left = left + 'px'
      tooltipRef.current.style.top = top + 'px'
    }

    crosshairHandlerRef.current = handleCrosshairMove
    chart.subscribeCrosshairMove(handleCrosshairMove)

    const handleRightClick = (e) => {
      if (modeRef.current !== 'manual') return
      e.preventDefault()
      const hoveredCandle = chartContainerRef.current?._hoveredCandle
      if (!hoveredCandle) return

      const currentOnCandleClick = callbacksRef.current.onCandleClick
      const currentOnDeleteTrade = callbacksRef.current.onDeleteTrade

      if ((e.shiftKey || e.altKey) && currentOnDeleteTrade) {
        const hoveredTime = Math.floor(hoveredCandle.time)
        const currentTrades = tradesRef.current
        const currentOpenPosition = openPositionRef.current

        let foundTrade = null
        let foundPosition = null

        if (currentTrades && Array.isArray(currentTrades)) {
          for (const trade of currentTrades) {
            if (!trade || !trade.Entry_Date || !trade.Exit_Date) continue
            const entryTime = Math.floor(new Date(trade.Entry_Date).getTime() / 1000)
            const exitTime = Math.floor(new Date(trade.Exit_Date).getTime() / 1000)
            const diff = Math.min(Math.abs(hoveredTime - entryTime), Math.abs(hoveredTime - exitTime))
            if (diff < 86400) {
              foundTrade = trade
              break
            }
          }
        }

        if (currentOpenPosition && currentOpenPosition.Entry_Date) {
          const entryTime = Math.floor(new Date(currentOpenPosition.Entry_Date).getTime() / 1000)
          const diff = Math.abs(hoveredTime - entryTime)
          if (diff < 86400) {
            foundPosition = currentOpenPosition
          }
        }

        if (foundTrade || foundPosition) {
          const logData = foundTrade
            ? {
                positionType: foundTrade.Position_Type,
                entryDate: foundTrade.Entry_Date,
                exitDate: foundTrade.Exit_Date,
                isHolding: false,
              }
            : {
                positionType: foundPosition.Position_Type,
                entryDate: foundPosition.Entry_Date,
                isHolding: true,
              }
          currentOnDeleteTrade(logData)
        }

        return
      }

      if (currentOnCandleClick) {
        currentOnCandleClick(hoveredCandle)
      }
    }

    chartContainerRef.current.addEventListener('contextmenu', handleRightClick)
    chartContainerRef.current._rightClickHandler = handleRightClick

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: heightRef.current,
        })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (chartContainerRef.current && chartContainerRef.current._rightClickHandler) {
        chartContainerRef.current.removeEventListener('contextmenu', chartContainerRef.current._rightClickHandler)
        chartContainerRef.current._rightClickHandler = null
      }
      if (chartRef.current && crosshairHandlerRef.current) {
        try {
          chartRef.current.unsubscribeCrosshairMove(crosshairHandlerRef.current)
        } catch (e) {
          // Ignore
        }
      }
      if (chartContainerRef.current) {
        chartContainerRef.current._hoveredCandle = null
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
      indicator2MediumLineRef.current = null
      indicator2SlowLineRef.current = null
      indicator3FastLineRef.current = null
      indicator3MediumLineRef.current = null
      indicator3SlowLineRef.current = null
    }
  }, [])

  // Update main chart candle + line data imperatively when data/config changes.
  useEffect(() => {
    if (!candlestickSeriesRef.current) return

    // Store price data map for tooltip lookup
    const nextPriceDataMap = {}
    if (priceData && Array.isArray(priceData)) {
      priceData.forEach((d) => {
        const dateKey = new Date(d.Date).getTime() / 1000
        nextPriceDataMap[dateKey] = d
      })
    }
    priceDataMapRef.current = nextPriceDataMap

    const candleSeries = candlestickSeriesRef.current
    const candlestickData = (priceData || []).map((d) => ({
      time: new Date(d.Date).getTime() / 1000,
      open: parseFloat(d.Open || 0),
      high: parseFloat(d.High || 0),
      low: parseFloat(d.Low || 0),
      close: parseFloat(d.Close || 0),
    }))
    candleSeries.setData(candlestickData)

    const setLine = (seriesRef, data, options = {}) => {
      if (!seriesRef?.current) return
      const s = seriesRef.current
      if (!data || data.length === 0) {
        s.setData([])
        s.applyOptions({ visible: false, ...options })
        return
      }
      s.setData(data)
      s.applyOptions({ visible: true, ...options })
    }

    const cfg = config || {}

    // Primary EMA/MA/DEMA lines
    if (showEMALines) {
      const lineCount = cfg?.indicator_params?.lineCount || 2
      const indicatorLabel = cfg.indicator_type === 'ma' ? 'MA' : cfg.indicator_type === 'dema' ? 'DEMA' : 'EMA'
      const primaryParams =
        cfg?.indicator_params ||
        (cfg?.ema_fast !== undefined && cfg?.ema_slow !== undefined ? { fast: cfg.ema_fast, slow: cfg.ema_slow, lineCount: 2 } : {})
      const primaryIsSingleLength =
        primaryParams.length !== undefined &&
        primaryParams.fast === undefined &&
        primaryParams.slow === undefined &&
        primaryParams.medium === undefined

      const fastData = (priceData || [])
        .map((d) => ({
          time: new Date(d.Date).getTime() / 1000,
          value: d.Indicator_Fast !== null && d.Indicator_Fast !== undefined ? parseFloat(d.Indicator_Fast) : null,
        }))
        .filter((d) => d.value !== null)
      const mediumData = (priceData || [])
        .map((d) => ({
          time: new Date(d.Date).getTime() / 1000,
          value: d.Indicator_Medium !== null && d.Indicator_Medium !== undefined ? parseFloat(d.Indicator_Medium) : null,
        }))
        .filter((d) => d.value !== null)
      const slowData = (priceData || [])
        .map((d) => ({
          time: new Date(d.Date).getTime() / 1000,
          value: d.Indicator_Slow !== null && d.Indicator_Slow !== undefined ? parseFloat(d.Indicator_Slow) : null,
        }))
        .filter((d) => d.value !== null)

      setLine(fastLineSeriesRef, fastData, {
        title: primaryIsSingleLength ? `${indicatorLabel} (${primaryParams.length})` : `${indicatorLabel} Fast`,
      })

      if (lineCount >= 3) {
        setLine(mediumLineSeriesRef, mediumData, { title: `${indicatorLabel} Medium` })
      } else {
        setLine(mediumLineSeriesRef, [], { title: `${indicatorLabel} Medium` })
      }

      if (lineCount >= 2) {
        setLine(slowLineSeriesRef, slowData, { title: `${indicatorLabel} Slow` })
      } else {
        setLine(slowLineSeriesRef, [], { title: `${indicatorLabel} Slow` })
      }
    } else {
      setLine(fastLineSeriesRef, [])
      setLine(mediumLineSeriesRef, [])
      setLine(slowLineSeriesRef, [])
    }

    // Second indicator line series (EMA/MA/DEMA)
    if (indicator2Data?.length > 0 && cfg?.indicators?.length > 1) {
      const secondIndicator = cfg.indicators[1]
      const isLineIndicator = ['ema', 'ma', 'dema'].includes(secondIndicator.type.toLowerCase())
      if (isLineIndicator) {
        const secondName = getLineIndicatorName(secondIndicator.type)
        const secondParams = secondIndicator.params || {}
        const secondIsSingleLength =
          secondParams.length !== undefined &&
          secondParams.fast === undefined &&
          secondParams.slow === undefined &&
          secondParams.medium === undefined
        const lineCount = secondParams?.lineCount || 2

        const fast2Data = indicator2Data
          .map((d) => ({
            time: new Date(d.Date).getTime() / 1000,
            value: d.Indicator_Fast !== null && d.Indicator_Fast !== undefined ? parseFloat(d.Indicator_Fast) : null,
          }))
          .filter((d) => d.value !== null)
        const medium2Data = indicator2Data
          .map((d) => ({
            time: new Date(d.Date).getTime() / 1000,
            value: d.Indicator_Medium !== null && d.Indicator_Medium !== undefined ? parseFloat(d.Indicator_Medium) : null,
          }))
          .filter((d) => d.value !== null)
        const slow2Data = indicator2Data
          .map((d) => ({
            time: new Date(d.Date).getTime() / 1000,
            value: d.Indicator_Slow !== null && d.Indicator_Slow !== undefined ? parseFloat(d.Indicator_Slow) : null,
          }))
          .filter((d) => d.value !== null)

        setLine(indicator2FastLineRef, fast2Data, { title: secondIsSingleLength ? `${secondName} (${secondParams.length})` : `${secondName} Fast` })

        if (lineCount >= 3) setLine(indicator2MediumLineRef, medium2Data, { title: `${secondName} Medium` })
        else setLine(indicator2MediumLineRef, [], { title: `${secondName} Medium` })

        if (lineCount >= 2) setLine(indicator2SlowLineRef, slow2Data, { title: `${secondName} Slow` })
        else setLine(indicator2SlowLineRef, [], { title: `${secondName} Slow` })
      } else {
        setLine(indicator2FastLineRef, [])
        setLine(indicator2MediumLineRef, [])
        setLine(indicator2SlowLineRef, [])
      }
    } else {
      setLine(indicator2FastLineRef, [])
      setLine(indicator2MediumLineRef, [])
      setLine(indicator2SlowLineRef, [])
    }

    // Third indicator line series (EMA/MA/DEMA)
    if (indicator3Data?.length > 0 && cfg?.indicators?.length > 2) {
      const thirdIndicator = cfg.indicators[2]
      const isLineIndicator = ['ema', 'ma', 'dema'].includes(thirdIndicator.type.toLowerCase())
      if (isLineIndicator) {
        const thirdName = getLineIndicatorName(thirdIndicator.type)
        const thirdParams = thirdIndicator.params || {}
        const thirdIsSingleLength =
          thirdParams.length !== undefined &&
          thirdParams.fast === undefined &&
          thirdParams.slow === undefined &&
          thirdParams.medium === undefined
        const lineCount = thirdParams?.lineCount || 2

        const fast3Data = indicator3Data
          .map((d) => ({
            time: new Date(d.Date).getTime() / 1000,
            value: d.Indicator_Fast !== null && d.Indicator_Fast !== undefined ? parseFloat(d.Indicator_Fast) : null,
          }))
          .filter((d) => d.value !== null)
        const medium3Data = indicator3Data
          .map((d) => ({
            time: new Date(d.Date).getTime() / 1000,
            value: d.Indicator_Medium !== null && d.Indicator_Medium !== undefined ? parseFloat(d.Indicator_Medium) : null,
          }))
          .filter((d) => d.value !== null)
        const slow3Data = indicator3Data
          .map((d) => ({
            time: new Date(d.Date).getTime() / 1000,
            value: d.Indicator_Slow !== null && d.Indicator_Slow !== undefined ? parseFloat(d.Indicator_Slow) : null,
          }))
          .filter((d) => d.value !== null)

        setLine(indicator3FastLineRef, fast3Data, { title: thirdIsSingleLength ? `${thirdName} (${thirdParams.length})` : `${thirdName} Fast` })

        if (lineCount >= 3) setLine(indicator3MediumLineRef, medium3Data, { title: `${thirdName} Medium` })
        else setLine(indicator3MediumLineRef, [], { title: `${thirdName} Medium` })

        if (lineCount >= 2) setLine(indicator3SlowLineRef, slow3Data, { title: `${thirdName} Slow` })
        else setLine(indicator3SlowLineRef, [], { title: `${thirdName} Slow` })
      } else {
        setLine(indicator3FastLineRef, [])
        setLine(indicator3MediumLineRef, [])
        setLine(indicator3SlowLineRef, [])
      }
    } else {
      setLine(indicator3FastLineRef, [])
      setLine(indicator3MediumLineRef, [])
      setLine(indicator3SlowLineRef, [])
    }

    // Keep markers visible after candle updates
    updateMarkersAndPriceLines()
  }, [priceData, indicator2Data, indicator3Data, config, showEMALines, getLineIndicatorName, updateMarkersAndPriceLines])

  // Update markers when annotations (trades/open position/signals) change; never recreate chart.
  useEffect(() => {
    if (!candlestickSeriesRef.current) return
    updateMarkersAndPriceLines()
  }, [trades, openPosition, signalMarkers, showSignals, updateMarkersAndPriceLines])

  // Create indicator chart exactly once per mount; update data/visibility imperatively.
  useEffect(() => {
    if (!indicatorChartContainerRef.current) return
    if (!lightweightCharts) return

    const { createChart, ColorType, CrosshairMode } = lightweightCharts
    const indicatorChart = createChart(indicatorChartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a1a' },
        textColor: '#888',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.1)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.1)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.1)' },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      width: Math.max(1, indicatorChartContainerRef.current.clientWidth),
      height: indicatorHeightRef.current,
    })

    indicatorChartRef.current = indicatorChart

    indicatorSeriesRef.current = indicatorChart.addLineSeries({ color: '#2962FF', lineWidth: 2, visible: false })
    indicator2SeriesRef.current = indicatorChart.addLineSeries({ color: '#ff9800', lineWidth: 2, lineStyle: 2, visible: false })
    indicator3SeriesRef.current = indicatorChart.addLineSeries({ color: '#10b981', lineWidth: 2, lineStyle: 3, visible: false })

    rsiOverboughtRef.current = indicatorChart.addLineSeries({
      color: '#787B86',
      lineWidth: 1,
      lineStyle: 2,
      title: 'Overbought (70)',
      visible: false,
    })
    rsiOversoldRef.current = indicatorChart.addLineSeries({
      color: '#787B86',
      lineWidth: 1,
      lineStyle: 2,
      title: 'Oversold (30)',
      visible: false,
    })
    cciUpperRef.current = indicatorChart.addLineSeries({
      color: '#787B86',
      lineWidth: 1,
      lineStyle: 2,
      title: 'Upper (+100)',
      visible: false,
    })
    cciLowerRef.current = indicatorChart.addLineSeries({
      color: '#787B86',
      lineWidth: 1,
      lineStyle: 2,
      title: 'Lower (-100)',
      visible: false,
    })

    const trySetupTimeScaleSync = () => {
      if (timeScaleSyncUnsubscribeRef.current) return
      if (!chartRef.current || !indicatorChartRef.current) return
      try {
        const mainTimeScale = chartRef.current.timeScale()
        const indicatorTimeScale = indicatorChartRef.current.timeScale()
        const initialRange = mainTimeScale.getVisibleRange()
        if (initialRange) indicatorTimeScale.setVisibleRange(initialRange)

        const syncTimeScale = () => {
          try {
            const visibleRange = mainTimeScale.getVisibleRange()
            if (visibleRange) indicatorTimeScale.setVisibleRange(visibleRange)
          } catch (e) {
            // Ignore
          }
        }

        const unsubscribe = mainTimeScale.subscribeVisibleTimeRangeChange(syncTimeScale)
        timeScaleSyncUnsubscribeRef.current = unsubscribe
      } catch (e) {
        console.warn('Error setting up time scale sync:', e)
      }
    }

    // Retry sync a few times until main chart exists (both created once per mount).
    const syncInterval = setInterval(() => {
      trySetupTimeScaleSync()
      if (timeScaleSyncUnsubscribeRef.current) clearInterval(syncInterval)
    }, 150)

    const handleResize = () => {
      if (indicatorChartContainerRef.current && indicatorChartRef.current) {
        indicatorChartRef.current.applyOptions({
          width: Math.max(1, indicatorChartContainerRef.current.clientWidth),
          height: indicatorHeightRef.current,
        })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      clearInterval(syncInterval)
      window.removeEventListener('resize', handleResize)
      if (timeScaleSyncUnsubscribeRef.current) {
        try {
          timeScaleSyncUnsubscribeRef.current()
        } catch (e) {
          // Ignore
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
      rsiOverboughtRef.current = null
      rsiOversoldRef.current = null
      cciUpperRef.current = null
      cciLowerRef.current = null
    }
  }, [])

  // Update indicator chart data/visibility imperatively.
  useEffect(() => {
    if (!indicatorChartRef.current) return

    const setIndLine = (seriesRef, data, options = {}) => {
      if (!seriesRef?.current) return
      const s = seriesRef.current
      if (!data || data.length === 0) {
        s.setData([])
        s.applyOptions({ visible: false, ...options })
        return
      }
      s.setData(data)
      s.applyOptions({ visible: true, ...options })
    }

    if (!showIndicatorChart) {
      setIndLine(indicatorSeriesRef, [])
      setIndLine(indicator2SeriesRef, [])
      setIndLine(indicator3SeriesRef, [])
      setIndLine(rsiOverboughtRef, [])
      setIndLine(rsiOversoldRef, [])
      setIndLine(cciUpperRef, [])
      setIndLine(cciLowerRef, [])
      return
    }

    // Ensure sizing is correct after becoming visible
    requestAnimationFrame(() => {
      if (indicatorChartContainerRef.current && indicatorChartRef.current) {
        indicatorChartRef.current.applyOptions({
          width: Math.max(1, indicatorChartContainerRef.current.clientWidth),
          height: indicatorHeightRef.current,
        })
      }
      if (chartRef.current && indicatorChartRef.current) {
        const r = chartRef.current.timeScale().getVisibleRange()
        if (r) indicatorChartRef.current.timeScale().setVisibleRange(r)
      }
    })

    const cfg = config || {}
    const primaryType = cfg?.indicator_type?.toUpperCase() || 'RSI'

    const primaryData = (priceData || [])
      .map((d) => ({
        time: new Date(d.Date).getTime() / 1000,
        value: d.Indicator_Value !== null && d.Indicator_Value !== undefined ? parseFloat(d.Indicator_Value) : null,
      }))
      .filter((d) => d.value !== null)

    let primaryTitle = primaryType
    if (primaryType === 'RSI') primaryTitle = 'RSI'
    else if (primaryType === 'CCI') primaryTitle = 'CCI'
    else if (primaryType === 'ZSCORE') primaryTitle = 'Z-Score'
    else if (primaryType === 'ROLL_STD') primaryTitle = 'Roll Std'
    else if (primaryType === 'ROLL_PERCENTILE') primaryTitle = 'Roll Percentile'

    setIndLine(indicatorSeriesRef, primaryData, { title: primaryTitle })

    if (primaryType === 'RSI' && primaryData.length > 0) {
      setIndLine(rsiOverboughtRef, primaryData.map((d) => ({ time: d.time, value: 70 })))
      setIndLine(rsiOversoldRef, primaryData.map((d) => ({ time: d.time, value: 30 })))
    } else {
      setIndLine(rsiOverboughtRef, [])
      setIndLine(rsiOversoldRef, [])
    }

    if (primaryType === 'CCI' && primaryData.length > 0) {
      setIndLine(cciUpperRef, primaryData.map((d) => ({ time: d.time, value: 100 })))
      setIndLine(cciLowerRef, primaryData.map((d) => ({ time: d.time, value: -100 })))
    } else {
      setIndLine(cciUpperRef, [])
      setIndLine(cciLowerRef, [])
    }

    // Second indicator series (oscillators only)
    if (indicator2Data?.length > 0 && cfg?.indicators?.length > 1) {
      const secondIndicator = cfg.indicators[1]
      const secondType = secondIndicator.type.toUpperCase()
      if (['RSI', 'CCI', 'ZSCORE', 'ROLL_STD', 'ROLL_PERCENTILE'].includes(secondType)) {
        const data2 = indicator2Data
          .map((d) => ({
            time: new Date(d.Date).getTime() / 1000,
            value: d.Indicator_Value !== null && d.Indicator_Value !== undefined ? parseFloat(d.Indicator_Value) : null,
          }))
          .filter((d) => d.value !== null)
        let title2 = secondType
        if (secondType === 'ZSCORE') title2 = 'Z-Score'
        else if (secondType === 'ROLL_STD') title2 = 'Roll Std'
        else if (secondType === 'ROLL_PERCENTILE') title2 = 'Roll Percentile'
        setIndLine(indicator2SeriesRef, data2, { title: title2 + ' (2)' })
      } else {
        setIndLine(indicator2SeriesRef, [])
      }
    } else {
      setIndLine(indicator2SeriesRef, [])
    }

    // Third indicator series (oscillators only)
    if (indicator3Data?.length > 0 && cfg?.indicators?.length > 2) {
      const thirdIndicator = cfg.indicators[2]
      const thirdType = thirdIndicator.type.toUpperCase()
      if (['RSI', 'CCI', 'ZSCORE', 'ROLL_STD', 'ROLL_PERCENTILE'].includes(thirdType)) {
        const data3 = indicator3Data
          .map((d) => ({
            time: new Date(d.Date).getTime() / 1000,
            value: d.Indicator_Value !== null && d.Indicator_Value !== undefined ? parseFloat(d.Indicator_Value) : null,
          }))
          .filter((d) => d.value !== null)
        let title3 = thirdType
        if (thirdType === 'ZSCORE') title3 = 'Z-Score'
        else if (thirdType === 'ROLL_STD') title3 = 'Roll Std'
        else if (thirdType === 'ROLL_PERCENTILE') title3 = 'Roll Percentile'
        setIndLine(indicator3SeriesRef, data3, { title: title3 + ' (3)' })
      } else {
        setIndLine(indicator3SeriesRef, [])
      }
    } else {
      setIndLine(indicator3SeriesRef, [])
    }
  }, [priceData, indicator2Data, indicator3Data, showIndicatorChart, config])

  const isEmpty = !priceData || priceData.length === 0
  const showStatusOverlay = loading || !!error || isEmpty

  return (
    <div className={styles.container}>
      <div className={styles.chartShell}>
      <div
        ref={chartContainerRef}
        className={styles.chart}
        style={{ '--blw-chart-height': `${typeof height === 'number' ? height : 500}px` }}
      />
      {showStatusOverlay && (
        <div className={styles.statusOverlay}>
          {loading ? (
            <div className={styles.loading}>Loading chart data...</div>
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : (
            <div className={styles.emptyState}>
              <span className="material-icons">show_chart</span>
              <h3>No Chart Data Available</h3>
              <p>Run a backtest to view chart data and trade history.</p>
            </div>
          )}
        </div>
      )}
      </div>

      {!showStatusOverlay && (
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
      )}

      <div className={`${styles.indicatorChartWrapper} ${showIndicatorChart ? '' : styles.indicatorChartWrapperHidden}`}>
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
        <div
          ref={indicatorChartContainerRef}
          className={styles.indicatorChart}
          style={{ '--blw-indicator-height': `${typeof indicatorHeight === 'number' ? indicatorHeight : 180}px` }}
        />
      </div>
    </div>
  )
}
