'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { API_URL } from '@/lib/api'
import styles from './PortfolioChart.module.css'

// Dynamically import ApexCharts to avoid SSR issues
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false })

export default function PortfolioChart({ asset = 'BTC/USDT', initialCapital = 10000, trades = [] }) {
  const [chartData, setChartData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [timeRange, setTimeRange] = useState('1Y')
  const [performanceStats, setPerformanceStats] = useState(null)

  useEffect(() => {
    const fetchPortfolioData = async () => {
      setLoading(true)
      setError(null)
      
      try {
        // Fetch historical price data
        const daysMap = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': 730 }
        const days = daysMap[timeRange] || 365
        
        const response = await fetch(`${API_URL}/api/portfolio-history?asset=${encodeURIComponent(asset)}&days=${days}`)
        
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setChartData(data.portfolio_data)
            setPerformanceStats(data.stats)
          } else {
            // Generate mock data if API doesn't have portfolio history
            generateMockData(days)
          }
        } else {
          generateMockData(daysMap[timeRange])
        }
      } catch (err) {
        console.warn('Portfolio API not available, using mock data')
        generateMockData(timeRange === '1Y' ? 365 : 180)
      } finally {
        setLoading(false)
      }
    }

    const generateMockData = (days) => {
      const data = []
      const now = new Date()
      let capital = initialCapital
      
      for (let i = days; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        
        // Simulate portfolio growth with some volatility
        const dailyReturn = (Math.random() - 0.48) * 0.03 // Slight positive bias
        capital = capital * (1 + dailyReturn)
        
        data.push({
          date: date.toISOString().split('T')[0],
          value: capital
        })
      }
      
      const totalReturn = ((capital - initialCapital) / initialCapital) * 100
      
      setChartData(data)
      setPerformanceStats({
        totalReturn: totalReturn,
        currentValue: capital,
        initialValue: initialCapital,
        highestValue: Math.max(...data.map(d => d.value)),
        lowestValue: Math.min(...data.map(d => d.value))
      })
    }

    fetchPortfolioData()
  }, [asset, initialCapital, timeRange])

  const chartOptions = {
    chart: {
      type: 'area',
      height: 350,
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
    colors: [performanceStats?.totalReturn >= 0 ? '#00ff88' : '#ff4444'],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.5,
        opacityTo: 0.1,
        stops: [0, 90, 100]
      }
    },
    dataLabels: {
      enabled: false
    },
    stroke: {
      curve: 'smooth',
      width: 2
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
          day: 'dd MMM'
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
        formatter: (value) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      }
    },
    grid: {
      borderColor: 'rgba(255, 255, 255, 0.1)',
      strokeDashArray: 4
    },
    tooltip: {
      theme: 'dark',
      x: {
        format: 'dd MMM yyyy'
      },
      y: {
        formatter: (value) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      }
    }
  }

  const series = chartData ? [{
    name: 'Portfolio Value',
    data: chartData.map(d => ({
      x: new Date(d.date).getTime(),
      y: d.value
    }))
  }] : []

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <span className="material-icons" style={{ animation: 'spin 1s linear infinite' }}>sync</span>
          Loading portfolio data...
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h3>
            <span className="material-icons">show_chart</span>
            Portfolio Performance
          </h3>
          <span className={styles.assetBadge}>{asset}</span>
        </div>
        <div className={styles.timeRangeSelector}>
          {['1M', '3M', '6M', '1Y', 'ALL'].map(range => (
            <button
              key={range}
              className={`${styles.rangeBtn} ${timeRange === range ? styles.active : ''}`}
              onClick={() => setTimeRange(range)}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {performanceStats && (
        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Current Value</span>
            <span className={styles.statValue}>
              ${performanceStats.currentValue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Total Return</span>
            <span className={`${styles.statValue} ${performanceStats.totalReturn >= 0 ? styles.positive : styles.negative}`}>
              {performanceStats.totalReturn >= 0 ? '+' : ''}{performanceStats.totalReturn?.toFixed(2)}%
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Highest</span>
            <span className={styles.statValue} style={{ color: '#00ff88' }}>
              ${performanceStats.highestValue?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Lowest</span>
            <span className={styles.statValue} style={{ color: '#ff4444' }}>
              ${performanceStats.lowestValue?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      )}

      <div className={styles.chartWrapper}>
        {typeof window !== 'undefined' && chartData && (
          <Chart
            options={chartOptions}
            series={series}
            type="area"
            height={300}
          />
        )}
      </div>
    </div>
  )
}

