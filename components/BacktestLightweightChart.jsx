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
  const [priceData, setPriceData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
      }

      if (slowData.length > 0) {
        const slowLine = chart.addLineSeries({
          color: '#4ecdc4',
          lineWidth: 2,
          title: config.indicator_type === 'ma' ? 'MA Slow' : 'EMA Slow',
        })
        slowLine.setData(slowData)
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
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [priceData, trades, openPosition, showEMALines, config])

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
    </div>
  )
}
