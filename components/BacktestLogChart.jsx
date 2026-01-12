'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { API_URL } from '@/lib/api'
import styles from './BacktestLogChart.module.css'

// Dynamically import ApexCharts to avoid SSR issues
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false })

export default function BacktestLogChart({ 
  trades = [], 
  openPosition = null,
  config = null,
  asset = 'BTC/USDT'
}) {
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
      // Default to 365 days if nothing specified
      endDate = new Date()
      startDate = new Date()
      startDate.setDate(startDate.getDate() - 365)
    }

    return { startDate, endDate }
  }, [config])

  // Fetch price data for the backtest timeframe
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
        
        // Add indicator_params if available
        if (config.indicator_params) {
          requestBody.indicator_params = config.indicator_params
        }

        // Add date range
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

  // Check if indicator chart should be shown
  const showIndicatorChart = useMemo(() => {
    if (!config) return false
    const indicatorType = config.indicator_type || 'ema'
    return ['rsi', 'cci', 'zscore'].includes(indicatorType.toLowerCase())
  }, [config])

  // Check if EMA/MA lines should be shown
  const showEMALines = useMemo(() => {
    if (!config) return false
    const indicatorType = config.indicator_type || 'ema'
    return ['ema', 'ma'].includes(indicatorType.toLowerCase())
  }, [config])

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!priceData || priceData.length === 0) return { series: [], annotations: { points: [] }, indicatorSeries: [], tradeDataMap: new Map() }

    // Price line series
    const priceSeries = priceData.map(d => ({
      x: new Date(d.Date).getTime(),
      y: parseFloat(d.Close || 0)
    }))

    // EMA/MA Fast and Slow series
    const emaFastSeries = showEMALines ? priceData.map(d => ({
      x: new Date(d.Date).getTime(),
      y: d.Indicator_Fast !== null && d.Indicator_Fast !== undefined ? parseFloat(d.Indicator_Fast) : null
    })).filter(d => d.y !== null) : []
    
    const emaSlowSeries = showEMALines ? priceData.map(d => ({
      x: new Date(d.Date).getTime(),
      y: d.Indicator_Slow !== null && d.Indicator_Slow !== undefined ? parseFloat(d.Indicator_Slow) : null
    })).filter(d => d.y !== null) : []

    // Indicator series for RSI/CCI/Z-score
    const indicatorSeries = showIndicatorChart ? priceData.map(d => ({
      x: new Date(d.Date).getTime(),
      y: d.Indicator_Value !== null && d.Indicator_Value !== undefined ? parseFloat(d.Indicator_Value) : null
    })).filter(d => d.y !== null) : []

    // Build series array
    const series = [{
      name: 'Price',
      data: priceSeries
    }]

    // Add EMA/MA lines if applicable
    if (showEMALines && emaFastSeries.length > 0) {
      series.push({
        name: config?.indicator_type?.toUpperCase() === 'MA' ? 'MA Fast' : 'EMA Fast',
        data: emaFastSeries
      })
    }
    
    if (showEMALines && emaSlowSeries.length > 0) {
      series.push({
        name: config?.indicator_type?.toUpperCase() === 'MA' ? 'MA Slow' : 'EMA Slow',
        data: emaSlowSeries
      })
    }

    // Prepare annotations for entry/exit points
    const annotations = {
      points: []
    }
    
    // Store trade data for tooltips
    const tradeDataMap = new Map()

    // Add entry/exit markers for closed trades
    if (trades && Array.isArray(trades) && trades.length > 0) {
      trades.forEach((trade, index) => {
        if (!trade || !trade.Entry_Date || !trade.Exit_Date) return
        
        const entryDate = new Date(trade.Entry_Date).getTime()
        const exitDate = new Date(trade.Exit_Date).getTime()
        const entryPrice = parseFloat(trade.Entry_Price || 0)
        const exitPrice = parseFloat(trade.Exit_Price || 0)
        const isLong = (trade.Position_Type || '').toUpperCase() === 'LONG'
        const isWin = (trade.PnL || 0) >= 0

        // Entry point - minimal marker
        const entryKey = `${entryDate}-${entryPrice}`
        const entryTradeData = {
          type: 'entry',
          trade,
          isLong,
          price: entryPrice,
          date: entryDate
        }
        tradeDataMap.set(entryKey, entryTradeData)
        
        annotations.points.push({
          x: entryDate,
          y: entryPrice,
          marker: {
            size: 5,
            fillColor: isLong ? '#10b981' : '#ef4444',
            strokeColor: isLong ? '#10b981' : '#ef4444',
            strokeWidth: 1.5,
            shape: 'circle'
          },
          customData: entryTradeData
        })

        // Exit point - minimal marker
        const exitKey = `${exitDate}-${exitPrice}`
        const exitTradeData = {
          type: 'exit',
          trade,
          isWin,
          price: exitPrice,
          date: exitDate
        }
        tradeDataMap.set(exitKey, exitTradeData)
        
        annotations.points.push({
          x: exitDate,
          y: exitPrice,
          marker: {
            size: 5,
            fillColor: isWin ? '#10b981' : '#ef4444',
            strokeColor: isWin ? '#10b981' : '#ef4444',
            strokeWidth: 1.5,
            shape: 'circle'
          },
          customData: exitTradeData
        })
      })
    }

    // Add open position marker if exists
    if (openPosition && openPosition.Entry_Date) {
      const entryDate = new Date(openPosition.Entry_Date).getTime()
      const entryPrice = parseFloat(openPosition.Entry_Price || 0)
      const holdingKey = `${entryDate}-${entryPrice}`
      const holdingTradeData = {
        type: 'holding',
        position: openPosition,
        price: entryPrice,
        date: entryDate
      }
      
      tradeDataMap.set(holdingKey, holdingTradeData)
      
      annotations.points.push({
        x: entryDate,
        y: entryPrice,
        marker: {
          size: 5,
          fillColor: '#f59e0b',
          strokeColor: '#f59e0b',
          strokeWidth: 1.5,
          shape: 'circle'
        },
        customData: holdingTradeData
      })
    }

    return {
      series,
      annotations,
      indicatorSeries,
      tradeDataMap
    }
  }, [priceData, trades, openPosition, showIndicatorChart, showEMALines, config])

  const chartOptions = useMemo(() => ({
    chart: {
      type: 'line',
      height: 500,
      background: 'transparent',
      toolbar: {
        show: true,
        tools: {
          download: true,
          selection: true,
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true
        }
      },
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 800
      }
    },
    colors: showEMALines 
      ? ['#4488ff', '#ff6b6b', '#4ecdc4']  // Price, Fast EMA/MA, Slow EMA/MA
      : ['#4488ff'],
    stroke: {
      curve: 'smooth',
      width: 2
    },
    dataLabels: {
      enabled: false
    },
    markers: {
      size: 0,
      hover: {
        size: 6
      }
    },
    xaxis: {
      type: 'datetime',
      labels: {
        style: {
          colors: '#888'
        },
        datetimeFormatter: {
          year: 'yyyy',
          month: "MMM 'yy",
          day: 'dd MMM',
          hour: 'HH:mm'
        }
      },
      axisBorder: {
        show: false
      },
      axisTicks: {
        show: false
      }
    },
    yaxis: {
      labels: {
        style: {
          colors: '#888'
        },
        formatter: (value) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`
      }
    },
    grid: {
      borderColor: 'rgba(255, 255, 255, 0.1)',
      strokeDashArray: 4
    },
    tooltip: {
      theme: 'dark',
      custom: function({ series, seriesIndex, dataPointIndex, w }) {
        // Check if hovering near an annotation point
        const annotations = w.config.annotations?.points || []
        if (annotations.length > 0) {
          const hoveredX = w.globals.categoryLabels[dataPointIndex] ? new Date(w.globals.categoryLabels[dataPointIndex]).getTime() : null
          const hoveredY = series[seriesIndex]?.[dataPointIndex]
          
          if (hoveredX !== null && hoveredY !== null && hoveredY !== undefined) {
            // Find the closest annotation point (within threshold)
            const xRange = w.globals.xAxisScale.max - w.globals.xAxisScale.min
            const yRange = w.globals.yAxisScale.max - w.globals.yAxisScale.min
            const thresholdX = xRange * 0.03 // 3% of x range
            const thresholdY = yRange * 0.03 // 3% of y range
            
            for (const annotation of annotations) {
              if (annotation.customData) {
                const distanceX = Math.abs(annotation.x - hoveredX)
                const distanceY = Math.abs(annotation.y - hoveredY)
                
                if (distanceX < thresholdX && distanceY < thresholdY) {
                  const tradeData = annotation.customData
                  if (tradeData) {
                    const data = tradeData.type === 'entry' || tradeData.type === 'holding' 
                      ? tradeData.trade || tradeData.position
                      : tradeData.trade
                    
                    if (data) {
                      const isLong = tradeData.isLong !== undefined ? tradeData.isLong : (data.Position_Type || '').toUpperCase() === 'LONG'
                      const positionType = isLong ? 'LONG' : 'SHORT'
                      const pnl = data.PnL || (tradeData.position?.Unrealized_PnL || 0)
                      const pnlPct = data.PnL_Pct || (tradeData.position?.Unrealized_PnL_Pct || 0)
                      const price = tradeData.price
                      const date = new Date(tradeData.date).toLocaleString()
                      
                      let tooltipContent = `
                        <div style="padding: 10px; background: #1a1a1a; border-radius: 6px; min-width: 200px;">
                          <div style="font-weight: bold; margin-bottom: 6px; font-size: 14px;">${positionType} ${tradeData.type.toUpperCase()}</div>
                          <div style="font-size: 12px; color: #aaa; margin-bottom: 4px;">Date: ${date}</div>
                          <div style="font-size: 12px; color: #aaa; margin-bottom: 4px;">Price: $${price.toFixed(2)}</div>
                      `
                      
                      if (tradeData.type === 'exit') {
                        tooltipContent += `
                          <div style="font-size: 12px; color: ${pnl >= 0 ? '#10b981' : '#ef4444'}; font-weight: bold; margin-top: 4px;">
                            P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${(pnlPct * 100).toFixed(2)}%)
                          </div>
                        `
                      } else if (tradeData.type === 'holding') {
                        tooltipContent += `
                          <div style="font-size: 12px; color: ${pnl >= 0 ? '#10b981' : '#ef4444'}; font-weight: bold; margin-top: 4px;">
                            Unrealized P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${(pnlPct * 100).toFixed(2)}%)
                          </div>
                        `
                      }
                      
                      tooltipContent += `</div>`
                      return tooltipContent
                    }
                  }
                }
              }
            }
          }
        }
        
        // Default tooltip for regular data points
        const value = series[seriesIndex][dataPointIndex]
        const date = w.globals.categoryLabels[dataPointIndex] ? new Date(w.globals.categoryLabels[dataPointIndex]).toLocaleString() : ''
        return `
          <div style="padding: 8px; background: #1a1a1a; border-radius: 4px;">
            <div style="font-weight: bold; margin-bottom: 4px;">${w.globals.seriesNames[seriesIndex]}</div>
            <div style="font-size: 12px; color: #aaa;">Date: ${date}</div>
            <div style="font-size: 12px; color: #aaa;">Value: $${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}</div>
          </div>
        `
      },
      x: {
        format: 'dd MMM yyyy HH:mm'
      },
      y: {
        formatter: (value) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`
      }
    },
    annotations: (chartData?.annotations?.points && chartData.annotations.points.length > 0) ? chartData.annotations : {},
    legend: {
      show: false
    }
  }), [chartData, showEMALines])

  // Indicator chart options for RSI/CCI
  const indicatorChartOptions = useMemo(() => {
    if (!showIndicatorChart || !config) return null

    const indicatorType = (config.indicator_type || 'rsi').toUpperCase()
    const indicatorParams = config.indicator_params || {}
    const top = indicatorParams.top || (indicatorType === 'RSI' ? 70 : 100)
    const bottom = indicatorParams.bottom || (indicatorType === 'RSI' ? 30 : -100)

    return {
      chart: {
        type: 'line',
        height: 180,
        background: 'transparent',
        toolbar: {
          show: false
        },
        animations: {
          enabled: true,
          easing: 'easeinout',
          speed: 800
        }
      },
      colors: ['#ffaa00'],
      stroke: {
        curve: 'smooth',
        width: 2
      },
      dataLabels: {
        enabled: false
      },
      markers: {
        size: 0,
        hover: {
          size: 4
        }
      },
      xaxis: {
        type: 'datetime',
        labels: {
          style: {
            colors: '#888'
          },
          datetimeFormatter: {
            year: 'yyyy',
            month: "MMM 'yy",
            day: 'dd MMM',
            hour: 'HH:mm'
          }
        },
        axisBorder: {
          show: false
        },
        axisTicks: {
          show: false
        }
      },
      yaxis: {
        labels: {
          style: {
            colors: '#888'
          },
          formatter: (value) => value.toFixed(2)
        },
        min: indicatorType === 'RSI' ? 0 : bottom - 50,
        max: indicatorType === 'RSI' ? 100 : top + 50
      },
      grid: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        strokeDashArray: 4
      },
      tooltip: {
        theme: 'dark',
        x: {
          format: 'dd MMM yyyy HH:mm'
        },
        y: {
          formatter: (value) => value.toFixed(2)
        }
      },
      annotations: {
        yaxis: [
          {
            y: top,
            borderColor: '#ff4444',
            borderWidth: 2,
            borderDashArray: 5,
            label: {
              text: `Overbought (${top})`,
              style: {
                color: '#fff',
                background: '#ff4444',
                fontSize: '10px',
                padding: {
                  left: 5,
                  right: 5,
                  top: 2,
                  bottom: 2
                }
              },
              offsetY: -5
            }
          },
          {
            y: bottom,
            borderColor: '#00ff88',
            borderWidth: 2,
            borderDashArray: 5,
            label: {
              text: `Oversold (${bottom})`,
              style: {
                color: '#fff',
                background: '#00ff88',
                fontSize: '10px',
                padding: {
                  left: 5,
                  right: 5,
                  top: 2,
                  bottom: 2
                }
              },
              offsetY: 5
            }
          }
        ]
      },
      legend: {
        show: false
      }
    }
  }, [showIndicatorChart, config])

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <span className="material-icons" style={{ animation: 'spin 1s linear infinite' }}>sync</span>
          Loading backtest chart data...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <span className="material-icons">error_outline</span>
          {error}
        </div>
      </div>
    )
  }

  if (!priceData || priceData.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <span className="material-icons">show_chart</span>
          No price data available. Run a backtest to see the chart.
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.chartWrapper}>
        {typeof window !== 'undefined' && chartData && chartData.series && chartData.series.length > 0 && (
          <Chart
            options={chartOptions}
            series={chartData.series}
            type="line"
            height={500}
          />
        )}
      </div>
      
      {/* Indicator chart for RSI/CCI */}
      {showIndicatorChart && indicatorChartOptions && chartData.indicatorSeries && chartData.indicatorSeries.length > 0 && (
        <div className={styles.indicatorChartWrapper}>
          <div className={styles.indicatorChartTitle}>
            {(config?.indicator_type || 'rsi').toUpperCase()} Indicator
          </div>
          {typeof window !== 'undefined' && (
            <Chart
              options={indicatorChartOptions}
              series={[{
                name: (config?.indicator_type || 'rsi').toUpperCase(),
                data: chartData.indicatorSeries
              }]}
              type="line"
              height={180}
            />
          )}
        </div>
      )}

      <div className={styles.legend}>
        {/* Position meanings */}
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ background: '#10b981' }}></span>
          <span>Long / Win</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ background: '#ef4444' }}></span>
          <span>Short / Loss</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ background: '#f59e0b' }}></span>
          <span>Holding</span>
        </div>
        {/* Indicator meanings */}
        {showEMALines && (
          <>
            <div className={styles.legendItem}>
              <span className={styles.legendMarker} style={{ background: '#4488ff' }}></span>
              <span>Price</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendMarker} style={{ background: '#ff6b6b' }}></span>
              <span>{config?.indicator_type?.toUpperCase() === 'MA' ? 'MA Fast' : 'EMA Fast'}</span>
            </div>
            <div className={styles.legendItem}>
              <span className={styles.legendMarker} style={{ background: '#4ecdc4' }}></span>
              <span>{config?.indicator_type?.toUpperCase() === 'MA' ? 'MA Slow' : 'EMA Slow'}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
