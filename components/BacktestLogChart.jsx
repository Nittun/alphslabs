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
    if (!priceData || priceData.length === 0) return { series: [], annotations: { points: [] }, indicatorSeries: [] }

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

    // Add entry/exit markers for closed trades
    if (trades && Array.isArray(trades) && trades.length > 0) {
      trades.forEach((trade, index) => {
        if (!trade || !trade.Entry_Date || !trade.Exit_Date) return
        
        const entryDate = new Date(trade.Entry_Date).getTime()
        const exitDate = new Date(trade.Exit_Date).getTime()
        const isLong = (trade.Position_Type || '').toUpperCase() === 'LONG'
        const isWin = (trade.PnL || 0) >= 0
        const positionLabel = isLong ? 'L' : 'S'
        const exitLabel = isWin ? 'W' : 'L'

        // Entry point - shield-like design with label
        annotations.points.push({
          x: entryDate,
          y: parseFloat(trade.Entry_Price || 0),
          marker: {
            size: 0
          },
          label: {
            text: positionLabel,
            style: {
              background: isLong ? '#00ff88' : '#ff4444',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 'bold',
              padding: {
                left: 8,
                right: 8,
                top: 6,
                bottom: 6
              },
              borderRadius: '6px',
              border: '2px solid #fff'
            },
            offsetY: 0,
            offsetX: 0
          }
        })

        // Exit point - shield-like design with label
        annotations.points.push({
          x: exitDate,
          y: parseFloat(trade.Exit_Price || 0),
          marker: {
            size: 0
          },
          label: {
            text: exitLabel,
            style: {
              background: isWin ? '#00ff88' : '#ff4444',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 'bold',
              padding: {
                left: 8,
                right: 8,
                top: 6,
                bottom: 6
              },
              borderRadius: '6px',
              border: '2px solid #fff'
            },
            offsetY: 0,
            offsetX: 0
          }
        })
      })
    }

    // Add open position marker if exists
    if (openPosition && openPosition.Entry_Date) {
      const entryDate = new Date(openPosition.Entry_Date).getTime()
      const isLong = (openPosition.Position_Type || '').toUpperCase() === 'LONG'
      const positionLabel = isLong ? 'L' : 'S'

      annotations.points.push({
        x: entryDate,
        y: parseFloat(openPosition.Entry_Price || 0),
        marker: {
          size: 0
        },
        label: {
          text: positionLabel,
          style: {
            background: '#ffaa00',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 'bold',
            padding: {
              left: 8,
              right: 8,
              top: 6,
              bottom: 6
            },
            borderRadius: '6px',
            border: '2px solid #fff'
          },
          offsetY: 0,
          offsetX: 0
        }
      })
    }

    return {
      series,
      annotations,
      indicatorSeries
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
      x: {
        format: 'dd MMM yyyy HH:mm'
      },
      y: {
        formatter: (value) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`
      }
    },
    annotations: (chartData?.annotations?.points && chartData.annotations.points.length > 0) ? chartData.annotations : {},
    legend: {
      show: true,
      position: 'top',
      horizontalAlign: 'right',
      labels: {
        colors: '#888'
      }
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
        height: 250,
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
        show: true,
        position: 'top',
        horizontalAlign: 'right',
        labels: {
          colors: '#888'
        }
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
              height={250}
            />
          )}
        </div>
      )}

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ background: '#00ff88' }}></span>
          <span>Long / Win</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ background: '#ff4444' }}></span>
          <span>Short / Loss</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ background: '#ffaa00' }}></span>
          <span>Holding</span>
        </div>
      </div>
    </div>
  )
}
