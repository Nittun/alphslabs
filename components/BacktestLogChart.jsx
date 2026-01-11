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

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!priceData || priceData.length === 0) return { series: [], annotations: {} }

    // Price line series
    const priceSeries = priceData.map(d => ({
      x: new Date(d.Date).getTime(),
      y: parseFloat(d.Close || 0)
    }))

    // Prepare annotations for entry/exit points
    const annotations = {
      points: []
    }

    // Add entry/exit markers for closed trades
    if (trades && Array.isArray(trades)) {
      trades.forEach((trade, index) => {
        const entryDate = new Date(trade.Entry_Date).getTime()
        const exitDate = new Date(trade.Exit_Date).getTime()
        const isLong = trade.Position_Type === 'LONG'
        const isWin = trade.PnL >= 0

        // Entry point
        annotations.points.push({
          x: entryDate,
          y: parseFloat(trade.Entry_Price),
          marker: {
            size: 8,
            fillColor: isLong ? '#00ff88' : '#ff4444',
            strokeColor: '#fff',
            strokeWidth: 2,
            radius: 4
          },
          label: {
            text: `${isLong ? 'L' : 'S'} Entry`,
            style: {
              color: '#fff',
              fontSize: '10px',
              background: isLong ? '#00ff88' : '#ff4444',
              padding: {
                left: 5,
                right: 5,
                top: 2,
                bottom: 2
              }
            },
            offsetY: -10
          }
        })

        // Exit point
        annotations.points.push({
          x: exitDate,
          y: parseFloat(trade.Exit_Price),
          marker: {
            size: 8,
            fillColor: isWin ? '#00ff88' : '#ff4444',
            strokeColor: '#fff',
            strokeWidth: 2,
            radius: 4
          },
          label: {
            text: `${isWin ? 'WIN' : 'LOSS'}`,
            style: {
              color: '#fff',
              fontSize: '10px',
              background: isWin ? '#00ff88' : '#ff4444',
              padding: {
                left: 5,
                right: 5,
                top: 2,
                bottom: 2
              }
            },
            offsetY: -10
          }
        })
      })
    }

    // Add open position marker if exists
    if (openPosition) {
      const entryDate = new Date(openPosition.Entry_Date).getTime()
      const isLong = openPosition.Position_Type === 'LONG'

      annotations.points.push({
        x: entryDate,
        y: parseFloat(openPosition.Entry_Price),
        marker: {
          size: 10,
          fillColor: '#ffaa00',
          strokeColor: '#fff',
          strokeWidth: 2,
          radius: 5
        },
        label: {
          text: `${isLong ? 'L' : 'S'} HOLDING`,
          style: {
            color: '#fff',
            fontSize: '10px',
            background: '#ffaa00',
            padding: {
              left: 5,
              right: 5,
              top: 2,
              bottom: 2
            }
          },
          offsetY: -10
        }
      })

      // Add current price marker
      const currentDate = new Date().getTime()
      annotations.points.push({
        x: currentDate,
        y: parseFloat(openPosition.Current_Price || openPosition.Entry_Price),
        marker: {
          size: 8,
          fillColor: '#4488ff',
          strokeColor: '#fff',
          strokeWidth: 2,
          radius: 4
        },
        label: {
          text: 'Current',
          style: {
            color: '#fff',
            fontSize: '10px',
            background: '#4488ff',
            padding: {
              left: 5,
              right: 5,
              top: 2,
              bottom: 2
            }
          },
          offsetY: -10
        }
      })
    }

    return {
      series: [{
        name: 'Price',
        data: priceSeries
      }],
      annotations
    }
  }, [priceData, trades, openPosition])

  const chartOptions = {
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
    colors: ['#4488ff'],
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
    annotations: chartData.annotations.points.length > 0 ? chartData.annotations : {},
    legend: {
      show: true,
      position: 'top',
      horizontalAlign: 'right',
      labels: {
        colors: '#888'
      }
    }
  }

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
        {typeof window !== 'undefined' && chartData.series.length > 0 && (
          <Chart
            options={chartOptions}
            series={chartData.series}
            type="line"
            height={500}
          />
        )}
      </div>
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ background: '#00ff88' }}></span>
          <span>Long Entry / Win</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ background: '#ff4444' }}></span>
          <span>Short Entry / Loss</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ background: '#ffaa00' }}></span>
          <span>Holding Position</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendMarker} style={{ background: '#4488ff' }}></span>
          <span>Current Price</span>
        </div>
      </div>
    </div>
  )
}
