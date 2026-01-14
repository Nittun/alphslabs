'use client'

import { useMemo, useState, useRef, useEffect } from 'react'
import styles from './PortfolioPnLChart.module.css'

export default function PortfolioPnLChart({ trades = [], initialCapital = 10000 }) {
  const containerRef = useRef(null)
  const [dimensions, setDimensions] = useState({ width: 400, height: 180 })
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // Responsive sizing
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width } = containerRef.current.getBoundingClientRect()
        setDimensions({ width: Math.max(300, width), height: 180 })
      }
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  const chartData = useMemo(() => {
    if (!trades || trades.length === 0) {
      return { points: [], maxValue: initialCapital, minValue: initialCapital, dates: [] }
    }

    const sortedTrades = [...trades].sort((a, b) => {
      return new Date(a.Exit_Date) - new Date(b.Exit_Date)
    })

    let cumulativeCapital = initialCapital
    const points = []
    const dates = []

    if (sortedTrades.length > 0) {
      const firstEntryDate = new Date(sortedTrades[0].Entry_Date)
      points.push({ date: firstEntryDate, value: initialCapital, tradeNum: 0 })
      dates.push(firstEntryDate)
    }

    sortedTrades.forEach((trade, index) => {
      cumulativeCapital += trade.PnL || 0
      const exitDate = new Date(trade.Exit_Date)
      points.push({ 
        date: exitDate, 
        value: cumulativeCapital, 
        tradeNum: index + 1,
        pnl: trade.PnL,
        asset: trade.Asset || trade.Symbol
      })
      dates.push(exitDate)
    })

    const values = points.map(p => p.value)
    const maxValue = Math.max(...values, initialCapital)
    const minValue = Math.min(...values, initialCapital)
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
      <div className={styles.chartContainer} ref={containerRef}>
        <div className={styles.emptyState}>
          <span className="material-icons">show_chart</span>
          <p>No trade data</p>
        </div>
      </div>
    )
  }

  const { points, maxValue, minValue } = chartData
  const { width, height } = dimensions
  const padding = { top: 15, right: 15, bottom: 25, left: 50 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const valueRange = maxValue - minValue || 1

  const svgPoints = points.map((point, index) => {
    const x = padding.left + (index / (points.length - 1 || 1)) * chartWidth
    const y = padding.top + chartHeight - ((point.value - minValue) / valueRange) * chartHeight
    return { ...point, x, y }
  })

  const pathData = svgPoints.map((point, index) => {
    return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  }).join(' ')

  const areaPath = svgPoints.length > 0
    ? `${pathData} L ${svgPoints[svgPoints.length - 1].x} ${padding.top + chartHeight} L ${svgPoints[0].x} ${padding.top + chartHeight} Z`
    : ''

  const formatValue = (value) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
    return `$${value.toFixed(0)}`
  }

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const finalValue = points.length > 0 ? points[points.length - 1].value : initialCapital
  const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100
  const isPositive = totalReturn >= 0

  // Y-axis labels (3 steps)
  const yAxisLabels = [0, 1, 2].map(i => {
    const value = minValue + (valueRange * i / 2)
    const y = padding.top + chartHeight - (i / 2) * chartHeight
    return { value, y }
  })

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setMousePos({ x, y })

    // Find closest point
    let closest = null
    let minDist = Infinity
    svgPoints.forEach((point, index) => {
      const dist = Math.abs(point.x - x)
      if (dist < minDist && dist < 30) {
        minDist = dist
        closest = { ...point, index }
      }
    })
    setHoveredPoint(closest)
  }

  return (
    <div className={styles.chartContainer} ref={containerRef}>
      <div className={styles.chartHeader}>
        <span className={styles.chartLabel}>Equity Curve</span>
        <span className={`${styles.returnBadge} ${isPositive ? styles.positive : styles.negative}`}>
          {isPositive ? '+' : ''}{totalReturn.toFixed(1)}%
        </span>
      </div>
      <div className={styles.chartWrapper}>
        <svg 
          width="100%" 
          height={height} 
          viewBox={`0 0 ${width} ${height}`}
          className={styles.chart}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredPoint(null)}
        >
          <defs>
            <linearGradient id="positiveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#00ff88" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#00ff88" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="negativeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ff4444" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#ff4444" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {yAxisLabels.map((label, index) => (
            <line
              key={`grid-${index}`}
              x1={padding.left}
              y1={label.y}
              x2={width - padding.right}
              y2={label.y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          ))}

          {/* Initial capital line */}
          <line
            x1={padding.left}
            y1={padding.top + chartHeight - ((initialCapital - minValue) / valueRange) * chartHeight}
            x2={width - padding.right}
            y2={padding.top + chartHeight - ((initialCapital - minValue) / valueRange) * chartHeight}
            stroke="#666"
            strokeWidth="1"
            strokeDasharray="3,3"
            opacity="0.4"
          />

          {/* Area fill */}
          {areaPath && (
            <path
              d={areaPath}
              fill={isPositive ? 'url(#positiveGradient)' : 'url(#negativeGradient)'}
            />
          )}

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

          {/* Data points - small, only show hovered */}
          {svgPoints.map((point, index) => (
            <circle
              key={`point-${index}`}
              cx={point.x}
              cy={point.y}
              r={hoveredPoint?.index === index ? 5 : 2}
              fill={isPositive ? '#00ff88' : '#ff4444'}
              stroke={hoveredPoint?.index === index ? '#fff' : 'none'}
              strokeWidth="2"
              style={{ transition: 'r 0.1s ease' }}
            />
          ))}

          {/* Y-axis labels */}
          {yAxisLabels.map((label, index) => (
            <text
              key={`y-label-${index}`}
              x={padding.left - 5}
              y={label.y + 3}
              textAnchor="end"
              fill="#666"
              fontSize="9"
              fontFamily="system-ui"
            >
              {formatValue(label.value)}
            </text>
          ))}

          {/* X-axis labels */}
          {points.length > 1 && (
            <>
              <text x={padding.left} y={height - 5} textAnchor="start" fill="#666" fontSize="9" fontFamily="system-ui">
                {formatDate(points[0].date)}
              </text>
              <text x={width - padding.right} y={height - 5} textAnchor="end" fill="#666" fontSize="9" fontFamily="system-ui">
                {formatDate(points[points.length - 1].date)}
              </text>
            </>
          )}

          {/* Hover crosshair */}
          {hoveredPoint && (
            <>
              <line
                x1={hoveredPoint.x}
                y1={padding.top}
                x2={hoveredPoint.x}
                y2={padding.top + chartHeight}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
              <line
                x1={padding.left}
                y1={hoveredPoint.y}
                x2={width - padding.right}
                y2={hoveredPoint.y}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
            </>
          )}
        </svg>

        {/* Tooltip */}
        {hoveredPoint && (
          <div 
            className={styles.tooltip}
            style={{
              left: Math.min(hoveredPoint.x, width - 120),
              top: Math.max(hoveredPoint.y - 70, 5)
            }}
          >
            <div className={styles.tooltipDate}>{formatDate(hoveredPoint.date)}</div>
            <div className={styles.tooltipValue}>
              <span>Value:</span>
              <strong style={{ color: hoveredPoint.value >= initialCapital ? '#00ff88' : '#ff4444' }}>
                {formatValue(hoveredPoint.value)}
              </strong>
            </div>
            {hoveredPoint.tradeNum > 0 && (
              <>
                <div className={styles.tooltipRow}>
                  <span>Trade #{hoveredPoint.tradeNum}</span>
                </div>
                {hoveredPoint.pnl !== undefined && (
                  <div className={styles.tooltipRow}>
                    <span>P&L:</span>
                    <strong style={{ color: hoveredPoint.pnl >= 0 ? '#00ff88' : '#ff4444' }}>
                      {hoveredPoint.pnl >= 0 ? '+' : ''}{formatValue(hoveredPoint.pnl)}
                    </strong>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
