'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
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
  asset = 'BTC/USDT'
}) {
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const indicatorChartContainerRef = useRef(null)
  const indicatorChartRef = useRef(null)
  const tooltipRef = useRef(null)
  const candlestickSeriesRef = useRef(null)
  const fastLineSeriesRef = useRef(null)
  const slowLineSeriesRef = useRef(null)
  const indicatorSeriesRef = useRef(null)
  const [priceData, setPriceData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Store trade data and price data maps for tooltip lookups
  const tradeDataMapRef = useRef(new Map())
  const priceDataMapRef = useRef({})

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

  // Fetch price data
  useEffect(() => {
    if (!config || !dateRange) {
      setLoading(false)
      return
    }

    const fetchPriceData = async () => {
      setLoading(true)
      setError(null)

      try {
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
      } catch (err) {
        console.warn('Error fetching price data:', err)
        setError('Failed to load price data')
      } finally {
        setLoading(false)
      }
    }

    fetchPriceData()
  }, [config, dateRange, asset])

  // Check if EMA/MA lines should be shown
  const showEMALines = useMemo(() => {
    if (!config) return false
    const indicatorType = config.indicator_type || 'ema'
    return ['ema', 'ma'].includes(indicatorType.toLowerCase())
  }, [config])

  // Check if indicator chart should be shown (RSI, CCI, Z-score)
  const showIndicatorChart = useMemo(() => {
    if (!config) return false
    const indicatorType = config.indicator_type || 'ema'
    return ['rsi', 'cci', 'zscore'].includes(indicatorType.toLowerCase())
  }, [config])

  // Initialize chart
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

    // Build trade data map for tooltip lookups
    const tradeDataMap = new Map()
    const priceDataMap = {}
    
    // Store price data map
    priceData.forEach(d => {
      const dateKey = new Date(d.Date).getTime() / 1000
      priceDataMap[dateKey] = d
    })
    priceDataMapRef.current = priceDataMap

    // Store trade data
    if (trades && Array.isArray(trades) && trades.length > 0) {
      trades.forEach((trade) => {
        if (!trade || !trade.Entry_Date || !trade.Exit_Date) return
        
        const entryTime = new Date(trade.Entry_Date).getTime() / 1000
        const exitTime = new Date(trade.Exit_Date).getTime() / 1000
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
      const entryTime = new Date(openPosition.Entry_Date).getTime() / 1000
      tradeDataMap.set(entryTime, {
        type: 'holding',
        position: openPosition,
        price: parseFloat(openPosition.Entry_Price || 0),
        time: entryTime
      })
    }

    tradeDataMapRef.current = tradeDataMap

    // Prepare candlestick data
    const candlestickData = priceData.map(d => ({
      time: new Date(d.Date).getTime() / 1000, // Lightweight Charts uses Unix timestamp in seconds
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

    // Add EMA/MA lines if needed
    if (showEMALines) {
      const fastData = priceData
        .map(d => ({
          time: new Date(d.Date).getTime() / 1000,
          value: d.Indicator_Fast !== null && d.Indicator_Fast !== undefined ? parseFloat(d.Indicator_Fast) : null,
        }))
        .filter(d => d.value !== null)

      const slowData = priceData
        .map(d => ({
          time: new Date(d.Date).getTime() / 1000,
          value: d.Indicator_Slow !== null && d.Indicator_Slow !== undefined ? parseFloat(d.Indicator_Slow) : null,
        }))
        .filter(d => d.value !== null)

      if (fastData.length > 0) {
        const fastLine = chart.addLineSeries({
          color: '#ff6b6b',
          lineWidth: 2,
          title: config.indicator_type === 'ma' ? 'MA Fast' : 'EMA Fast',
        })
        fastLine.setData(fastData)
        fastLineSeriesRef.current = fastLine
      }

      if (slowData.length > 0) {
        const slowLine = chart.addLineSeries({
          color: '#4ecdc4',
          lineWidth: 2,
          title: config.indicator_type === 'ma' ? 'MA Slow' : 'EMA Slow',
        })
        slowLine.setData(slowData)
        slowLineSeriesRef.current = slowLine
      }
    }

    // Add markers for trade entries/exits
    const markers = []
    
    if (trades && Array.isArray(trades) && trades.length > 0) {
      trades.forEach((trade) => {
        if (!trade || !trade.Entry_Date || !trade.Exit_Date) return
        
        const entryTime = new Date(trade.Entry_Date).getTime() / 1000
        const exitTime = new Date(trade.Exit_Date).getTime() / 1000
        const isLong = (trade.Position_Type || '').toUpperCase() === 'LONG'
        const isWin = (trade.PnL || 0) >= 0

        // Entry marker
        markers.push({
          time: entryTime,
          position: 'belowBar',
          color: isLong ? '#10b981' : '#ef4444',
          shape: 'circle',
          size: 1,
          text: isLong ? 'LONG' : 'SHORT',
        })

        // Exit marker
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
      const entryTime = new Date(openPosition.Entry_Date).getTime() / 1000
      markers.push({
        time: entryTime,
        position: 'belowBar',
        color: '#f59e0b',
        shape: 'circle',
        size: 1,
        text: 'OPEN',
      })
    }

    if (markers.length > 0) {
      candlestickSeries.setMarkers(markers)
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

    return () => {
      window.removeEventListener('resize', handleResize)
      if (tooltipRef.current && tooltipRef.current.parentNode) {
        tooltipRef.current.parentNode.removeChild(tooltipRef.current)
      }
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
      candlestickSeriesRef.current = null
      fastLineSeriesRef.current = null
      slowLineSeriesRef.current = null
    }
  }, [priceData, trades, openPosition, showEMALines, config])

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
      height: 300, // Shorter height for indicator chart
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
      let indicatorColor = '#ffaa00'
      let indicatorTitle = indicatorType

      // Set color and title based on indicator type
      if (indicatorType === 'RSI') {
        indicatorColor = '#ffaa00'
        indicatorTitle = 'RSI'
      } else if (indicatorType === 'CCI') {
        indicatorColor = '#ffaa00'
        indicatorTitle = 'CCI'
      } else if (indicatorType === 'ZSCORE') {
        indicatorColor = '#ffaa00'
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
          color: '#ef4444',
          lineWidth: 1,
          lineStyle: 2, // Dashed
          title: 'Overbought (70)',
        })
        overboughtLine.setData(indicatorData.map(d => ({ time: d.time, value: 70 })))

        const oversoldLine = indicatorChart.addLineSeries({
          color: '#10b981',
          lineWidth: 1,
          lineStyle: 2, // Dashed
          title: 'Oversold (30)',
        })
        oversoldLine.setData(indicatorData.map(d => ({ time: d.time, value: 30 })))
      }

      // Add threshold lines for CCI (+100, -100)
      if (indicatorType === 'CCI') {
        const upperLine = indicatorChart.addLineSeries({
          color: '#ef4444',
          lineWidth: 1,
          lineStyle: 2, // Dashed
          title: 'Upper (+100)',
        })
        upperLine.setData(indicatorData.map(d => ({ time: d.time, value: 100 })))

        const lowerLine = indicatorChart.addLineSeries({
          color: '#10b981',
          lineWidth: 1,
          lineStyle: 2, // Dashed
          title: 'Lower (-100)',
        })
        lowerLine.setData(indicatorData.map(d => ({ time: d.time, value: -100 })))
      }
    }

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
      window.removeEventListener('resize', handleResize)
      if (indicatorChartRef.current) {
        indicatorChartRef.current.remove()
        indicatorChartRef.current = null
      }
      indicatorSeriesRef.current = null
    }
  }, [priceData, showIndicatorChart, config])

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
        <div className={styles.error}>No data available</div>
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
        {showEMALines && (
          <>
            <div className={styles.legendItem}>
              <span className={styles.legendMarker} style={{ backgroundColor: '#ff6b6b' }}></span>
              <span>{config?.indicator_type === 'ma' ? 'MA Fast' : 'EMA Fast'}</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendMarker} style={{ backgroundColor: '#4ecdc4' }}></span>
              <span>{config?.indicator_type === 'ma' ? 'MA Slow' : 'EMA Slow'}</span>
            </div>
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
      </div>
      {showIndicatorChart && (
        <div className={styles.indicatorChartWrapper}>
          <div className={styles.indicatorChartTitle}>
            {config?.indicator_type?.toUpperCase() || 'Indicator'} Chart
          </div>
          <div ref={indicatorChartContainerRef} className={styles.indicatorChart} />
        </div>
      )}
    </div>
  )
}
