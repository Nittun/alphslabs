'use client'

import { useMemo } from 'react'
import styles from './PortfolioPnLChart.module.css'

export default function PortfolioPnLChart({ trades = [], initialCapital = 10000 }) {
  const chartData = useMemo(() => {
    if (!trades || trades.length === 0) {
      return { points: [], maxValue: initialCapital, minValue: initialCapital, dates: [] }
    }

    // Sort trades by exit date
    const sortedTrades = [...trades].sort((a, b) => {
      return new Date(a.Exit_Date) - new Date(b.Exit_Date)
    })

    // Calculate cumulative P&L
    let cumulativeCapital = initialCapital
    const points = []
    const dates = []

    // Add starting point
    if (sortedTrades.length > 0) {
      const firstEntryDate = new Date(sortedTrades[0].Entry_Date)
      points.push({ date: firstEntryDate, value: initialCapital })
      dates.push(firstEntryDate)
    }

    // Process each trade
    sortedTrades.forEach((trade) => {
      cumulativeCapital += trade.PnL || 0
      const exitDate = new Date(trade.Exit_Date)
      points.push({ date: exitDate, value: cumulativeCapital })
      dates.push(exitDate)
    })

    // Calculate min/max for scaling
    const values = points.map(p => p.value)
    const maxValue = Math.max(...values, initialCapital)
    const minValue = Math.min(...values, initialCapital)
    
    // Add some padding
    const range = maxValue - minValue
    const padding = range * 0.1

    return {
      points,
      maxValue: maxValue + padding,
      minValue: Math.max(0, minValue - padding),
      dates
    }
  }, [trades, initialCapital])

  if (!trades || trades.length === 0) {
    return (
      <div className={styles.chartContainer}>
        <h3 className={styles.chartTitle}>Portfolio P&L Chart</h3>
        <div className={styles.emptyState}>
          <p>No trades available</p>
          <p className={styles.emptySubtext}>Run a backtest to see portfolio performance</p>
        </div>
      </div>
    )
  }

  const { points, maxValue, minValue, dates } = chartData
  const width = 600
  const height = 300
  const padding = { top: 20, right: 40, bottom: 40, left: 60 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  // Calculate scales
  const valueRange = maxValue - minValue
  const dateRange = dates.length > 1 
    ? dates[dates.length - 1].getTime() - dates[0].getTime()
    : 1

  // Convert points to SVG coordinates
  const svgPoints = points.map((point, index) => {
    const x = padding.left + (index / (points.length - 1 || 1)) * chartWidth
    const y = padding.top + chartHeight - ((point.value - minValue) / valueRange) * chartHeight
    return { x, y, value: point.value, date: point.date }
  })

  // Create path for the line
  const pathData = svgPoints.map((point, index) => {
    return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  }).join(' ')

  // Create area path (for fill)
  const areaPath = svgPoints.length > 0
    ? `${pathData} L ${svgPoints[svgPoints.length - 1].x} ${padding.top + chartHeight} L ${svgPoints[0].x} ${padding.top + chartHeight} Z`
    : ''

  // Format value for display
  const formatValue = (value) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`
    return `$${value.toFixed(2)}`
  }

  // Format date for display
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Generate Y-axis labels
  const yAxisSteps = 5
  const yAxisLabels = []
  for (let i = 0; i <= yAxisSteps; i++) {
    const value = minValue + (valueRange * i / yAxisSteps)
    const y = padding.top + chartHeight - (i / yAxisSteps) * chartHeight
    yAxisLabels.push({ value, y })
  }

  // Generate X-axis labels (show first, middle, last)
  const xAxisLabels = []
  if (points.length > 0) {
    xAxisLabels.push({ date: points[0].date, x: padding.left })
    if (points.length > 1) {
      const midIndex = Math.floor(points.length / 2)
      xAxisLabels.push({ date: points[midIndex].date, x: padding.left + chartWidth / 2 })
      xAxisLabels.push({ date: points[points.length - 1].date, x: padding.left + chartWidth })
    }
  }

  const finalValue = points.length > 0 ? points[points.length - 1].value : initialCapital
  const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100
  const isPositive = totalReturn >= 0

  return (
    <div className={styles.chartContainer}>
      <div className={styles.chartHeader}>
        <h3 className={styles.chartTitle}>Portfolio P&L Chart</h3>
        <div className={styles.summary}>
          <span className={styles.summaryLabel}>Final Value:</span>
          <span className={`${styles.summaryValue} ${isPositive ? styles.positive : styles.negative}`}>
            {formatValue(finalValue)} ({totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%)
          </span>
        </div>
      </div>
      <div className={styles.chartWrapper}>
        <svg width={width} height={height} className={styles.chart}>
          {/* Grid lines */}
          {yAxisLabels.map((label, index) => (
            <line
              key={`grid-${index}`}
              x1={padding.left}
              y1={label.y}
              x2={padding.left + chartWidth}
              y2={label.y}
              stroke="#2a2a2a"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
          ))}

          {/* Initial capital line */}
          <line
            x1={padding.left}
            y1={padding.top + chartHeight - ((initialCapital - minValue) / valueRange) * chartHeight}
            x2={padding.left + chartWidth}
            y2={padding.top + chartHeight - ((initialCapital - minValue) / valueRange) * chartHeight}
            stroke="#666"
            strokeWidth="1"
            strokeDasharray="4,4"
            opacity="0.5"
          />

          {/* Area fill */}
          {areaPath && (
            <path
              d={areaPath}
              fill={isPositive ? 'url(#positiveGradient)' : 'url(#negativeGradient)'}
              opacity="0.3"
            />
          )}

          {/* Gradients */}
          <defs>
            <linearGradient id="positiveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#00ff88" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#00ff88" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="negativeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ff4444" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#ff4444" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Line */}
          {pathData && (
            <path
              d={pathData}
              fill="none"
              stroke={isPositive ? '#00ff88' : '#ff4444'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data points */}
          {svgPoints.map((point, index) => (
            <circle
              key={`point-${index}`}
              cx={point.x}
              cy={point.y}
              r="3"
              fill={isPositive ? '#00ff88' : '#ff4444'}
              stroke="#fff"
              strokeWidth="1"
            />
          ))}

          {/* Y-axis labels */}
          {yAxisLabels.map((label, index) => (
            <text
              key={`y-label-${index}`}
              x={padding.left - 10}
              y={label.y + 4}
              textAnchor="end"
              fill="#888"
              fontSize="10"
            >
              {formatValue(label.value)}
            </text>
          ))}

          {/* X-axis labels */}
          {xAxisLabels.map((label, index) => (
            <text
              key={`x-label-${index}`}
              x={label.x}
              y={height - padding.bottom + 20}
              textAnchor={index === 0 ? 'start' : index === xAxisLabels.length - 1 ? 'end' : 'middle'}
              fill="#888"
              fontSize="10"
            >
              {formatDate(label.date)}
            </text>
          ))}

          {/* Axis lines */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + chartHeight}
            stroke="#444"
            strokeWidth="1"
          />
          <line
            x1={padding.left}
            y1={padding.top + chartHeight}
            x2={padding.left + chartWidth}
            y2={padding.top + chartHeight}
            stroke="#444"
            strokeWidth="1"
          />
        </svg>
      </div>
    </div>
  )
}

