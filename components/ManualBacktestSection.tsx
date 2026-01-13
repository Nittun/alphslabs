'use client'

import React, { useEffect, useRef, useState, useCallback, memo } from 'react'
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  SeriesMarker,
  Time,
  CrosshairMode,
  IPriceLine,
} from 'lightweight-charts'
import styles from './ManualBacktestSection.module.css'

// ============================================
// TYPES & INTERFACES
// ============================================

export interface CandleData {
  time: Time
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface Position {
  id: string
  side: 'long' | 'short'
  entryPrice: number
  entryTime: Time
  exitPrice?: number
  exitTime?: Time
  stopLoss?: number
  takeProfit?: number
  pnl?: number
  pnlPercent?: number
  status: 'open' | 'closed'
}

export interface ManualBacktestSectionProps {
  // Data
  candles: CandleData[]
  latestCandle?: CandleData
  positions: Position[]
  
  // Status
  status?: 'live' | 'replay' | 'paused'
  currentTimeframe?: string
  availableTimeframes?: string[]
  
  // Callbacks
  onChartClick?: (price: number, time: Time) => void
  onLong?: () => void
  onShort?: () => void
  onClose?: () => void
  onUndo?: () => void
  onClear?: () => void
  onSelectPosition?: (positionId: string) => void
  onTimeframeChange?: (timeframe: string) => void
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const formatPnL = (pnl?: number, pnlPercent?: number): string => {
  if (pnl === undefined) return '—'
  const sign = pnl >= 0 ? '+' : ''
  const percentStr = pnlPercent !== undefined ? ` (${sign}${pnlPercent.toFixed(2)}%)` : ''
  return `${sign}${pnl.toFixed(2)}${percentStr}`
}

const getPnLClass = (pnl?: number): string => {
  if (pnl === undefined) return ''
  return pnl >= 0 ? styles.positive : styles.negative
}

// ============================================
// STATUS BADGE COMPONENT
// ============================================

const StatusBadge = memo(({ status }: { status: 'live' | 'replay' | 'paused' }) => {
  const statusConfig = {
    live: { label: 'Live', className: styles.statusLive },
    replay: { label: 'Replay', className: styles.statusReplay },
    paused: { label: 'Paused', className: styles.statusPaused },
  }
  
  const config = statusConfig[status]
  
  return (
    <span className={`${styles.statusBadge} ${config.className}`}>
      <span className={styles.statusDot}></span>
      {config.label}
    </span>
  )
})

StatusBadge.displayName = 'StatusBadge'

// ============================================
// POSITION ROW COMPONENT
// ============================================

const PositionRow = memo(({ 
  position, 
  onSelect,
  isSelected 
}: { 
  position: Position
  onSelect: (id: string) => void
  isSelected: boolean
}) => {
  return (
    <div 
      className={`${styles.positionRow} ${isSelected ? styles.selected : ''} ${position.status === 'open' ? styles.openPosition : ''}`}
      onClick={() => onSelect(position.id)}
    >
      <div className={styles.positionSide}>
        <span className={`${styles.sideTag} ${position.side === 'long' ? styles.longTag : styles.shortTag}`}>
          {position.side.toUpperCase()}
        </span>
      </div>
      <div className={styles.positionDetails}>
        <div className={styles.positionEntry}>
          Entry: {position.entryPrice.toFixed(2)}
        </div>
        {position.exitPrice && (
          <div className={styles.positionExit}>
            Exit: {position.exitPrice.toFixed(2)}
          </div>
        )}
      </div>
      <div className={`${styles.positionPnL} ${getPnLClass(position.pnl)}`}>
        {formatPnL(position.pnl, position.pnlPercent)}
      </div>
    </div>
  )
})

PositionRow.displayName = 'PositionRow'

// ============================================
// MAIN COMPONENT
// ============================================

function ManualBacktestSection({
  candles,
  latestCandle,
  positions,
  status = 'paused',
  currentTimeframe = '1H',
  availableTimeframes = ['1m', '5m', '15m', '1H', '4H', '1D'],
  onChartClick,
  onLong,
  onShort,
  onClose,
  onUndo,
  onClear,
  onSelectPosition,
  onTimeframeChange,
}: ManualBacktestSectionProps) {
  // Refs for chart instances (never recreated)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  
  // State
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [isPanelOpen, setIsPanelOpen] = useState(true)
  
  // Track previous candles for comparison
  const prevCandlesLengthRef = useRef(0)
  const prevSymbolTimeframeRef = useRef('')

  // ============================================
  // RESPONSIVE HANDLING
  // ============================================
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // ============================================
  // CHART INITIALIZATION (ONCE)
  // ============================================
  
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return

    // Create chart only once
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#0a0a0f' },
        textColor: '#888',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(255, 255, 255, 0.3)',
          labelBackgroundColor: '#1a1a2e',
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.3)',
          labelBackgroundColor: '#1a1a2e',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true },
    })

    // Create candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries

    // Subscribe to chart click
    chart.subscribeClick((param) => {
      if (param.time && param.point && onChartClick) {
        const price = candleSeries.coordinateToPrice(param.point.y)
        if (price !== null) {
          onChartClick(price, param.time)
        }
      }
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
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
        candleSeriesRef.current = null
      }
    }
  }, []) // Empty deps - initialize once

  // ============================================
  // DATA UPDATES (setData vs update)
  // ============================================
  
  useEffect(() => {
    if (!candleSeriesRef.current || !candles.length) return

    const symbolTimeframeKey = `${currentTimeframe}`
    
    // Full reload if timeframe changed or initial load
    if (prevSymbolTimeframeRef.current !== symbolTimeframeKey || prevCandlesLengthRef.current === 0) {
      candleSeriesRef.current.setData(candles as CandlestickData[])
      prevSymbolTimeframeRef.current = symbolTimeframeKey
      prevCandlesLengthRef.current = candles.length
      
      // Fit content after initial load
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent()
      }
    }
  }, [candles, currentTimeframe])

  // ============================================
  // REAL-TIME CANDLE UPDATE
  // ============================================
  
  useEffect(() => {
    if (!candleSeriesRef.current || !latestCandle) return
    candleSeriesRef.current.update(latestCandle as CandlestickData)
  }, [latestCandle])

  // ============================================
  // MARKERS FOR POSITIONS
  // ============================================
  
  useEffect(() => {
    if (!candleSeriesRef.current) return

    const markers: SeriesMarker<Time>[] = []

    positions.forEach((pos) => {
      // Entry marker
      markers.push({
        time: pos.entryTime,
        position: pos.side === 'long' ? 'belowBar' : 'aboveBar',
        color: pos.side === 'long' ? '#10b981' : '#ef4444',
        shape: pos.side === 'long' ? 'arrowUp' : 'arrowDown',
        text: `${pos.side.toUpperCase()} @ ${pos.entryPrice.toFixed(2)}`,
      })

      // Exit marker (if closed)
      if (pos.exitTime && pos.exitPrice) {
        markers.push({
          time: pos.exitTime,
          position: pos.side === 'long' ? 'aboveBar' : 'belowBar',
          color: '#f59e0b',
          shape: 'circle',
          text: `Exit @ ${pos.exitPrice.toFixed(2)}`,
        })
      }
    })

    // Sort markers by time
    markers.sort((a, b) => {
      const timeA = typeof a.time === 'number' ? a.time : new Date(a.time as string).getTime()
      const timeB = typeof b.time === 'number' ? b.time : new Date(b.time as string).getTime()
      return timeA - timeB
    })

    candleSeriesRef.current.setMarkers(markers)
  }, [positions])

  // ============================================
  // PRICE LINES FOR SL/TP
  // ============================================
  
  useEffect(() => {
    if (!candleSeriesRef.current) return

    // Remove existing price lines
    priceLinesRef.current.forEach((line) => {
      try {
        candleSeriesRef.current?.removePriceLine(line)
      } catch (e) {
        // Line might already be removed
      }
    })
    priceLinesRef.current = []

    // Add price lines for open positions
    positions.filter(p => p.status === 'open').forEach((pos) => {
      // Entry line
      const entryLine = candleSeriesRef.current!.createPriceLine({
        price: pos.entryPrice,
        color: pos.side === 'long' ? '#10b981' : '#ef4444',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'Entry',
      })
      priceLinesRef.current.push(entryLine)

      // Stop Loss line
      if (pos.stopLoss) {
        const slLine = candleSeriesRef.current!.createPriceLine({
          price: pos.stopLoss,
          color: '#ef4444',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'SL',
        })
        priceLinesRef.current.push(slLine)
      }

      // Take Profit line
      if (pos.takeProfit) {
        const tpLine = candleSeriesRef.current!.createPriceLine({
          price: pos.takeProfit,
          color: '#10b981',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'TP',
        })
        priceLinesRef.current.push(tpLine)
      }
    })
  }, [positions])

  // ============================================
  // HANDLERS
  // ============================================
  
  const handlePositionSelect = useCallback((id: string) => {
    setSelectedPositionId(id)
    onSelectPosition?.(id)
  }, [onSelectPosition])

  const handleTimeframeChange = useCallback((tf: string) => {
    onTimeframeChange?.(tf)
  }, [onTimeframeChange])

  // ============================================
  // RENDER
  // ============================================
  
  const openPositions = positions.filter(p => p.status === 'open')
  const closedPositions = positions.filter(p => p.status === 'closed')
  const hasOpenPosition = openPositions.length > 0

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.title}>
            <span className="material-icons">candlestick_chart</span>
            Manual Backtest
          </h2>
          <StatusBadge status={status} />
        </div>
        
        <div className={styles.headerRight}>
          {/* Timeframe Selector */}
          <div className={styles.timeframeSelector}>
            {availableTimeframes.map((tf) => (
              <button
                key={tf}
                className={`${styles.timeframeBtn} ${currentTimeframe === tf ? styles.active : ''}`}
                onClick={() => handleTimeframeChange(tf)}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={`${styles.mainContent} ${isMobile ? styles.mobile : ''}`}>
        {/* Chart Area */}
        <div className={styles.chartArea}>
          <div ref={chartContainerRef} className={styles.chartContainer} />
        </div>

        {/* Positions Panel */}
        <div className={`${styles.positionsPanel} ${isMobile ? styles.bottomPanel : ''} ${!isPanelOpen && isMobile ? styles.collapsed : ''}`}>
          {isMobile && (
            <button 
              className={styles.panelToggle}
              onClick={() => setIsPanelOpen(!isPanelOpen)}
            >
              <span className="material-icons">
                {isPanelOpen ? 'expand_more' : 'expand_less'}
              </span>
              Positions ({positions.length})
            </button>
          )}
          
          {(!isMobile || isPanelOpen) && (
            <div className={styles.positionsList}>
              {openPositions.length > 0 && (
                <div className={styles.positionsSection}>
                  <h4 className={styles.sectionTitle}>Open Positions</h4>
                  {openPositions.map((pos) => (
                    <PositionRow
                      key={pos.id}
                      position={pos}
                      onSelect={handlePositionSelect}
                      isSelected={selectedPositionId === pos.id}
                    />
                  ))}
                </div>
              )}
              
              {closedPositions.length > 0 && (
                <div className={styles.positionsSection}>
                  <h4 className={styles.sectionTitle}>Closed Trades</h4>
                  {closedPositions.slice(-10).reverse().map((pos) => (
                    <PositionRow
                      key={pos.id}
                      position={pos}
                      onSelect={handlePositionSelect}
                      isSelected={selectedPositionId === pos.id}
                    />
                  ))}
                </div>
              )}
              
              {positions.length === 0 && (
                <div className={styles.emptyState}>
                  <span className="material-icons">inbox</span>
                  <p>No positions yet</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action Bar */}
      <div className={styles.actionBar}>
        <div className={styles.actionGroup}>
          <button 
            className={`${styles.actionBtn} ${styles.longBtn}`}
            onClick={onLong}
            disabled={hasOpenPosition}
          >
            <span className="material-icons">trending_up</span>
            Long
          </button>
          <button 
            className={`${styles.actionBtn} ${styles.shortBtn}`}
            onClick={onShort}
            disabled={hasOpenPosition}
          >
            <span className="material-icons">trending_down</span>
            Short
          </button>
        </div>
        
        <div className={styles.actionGroup}>
          <button 
            className={`${styles.actionBtn} ${styles.closeBtn}`}
            onClick={onClose}
            disabled={!hasOpenPosition}
          >
            <span className="material-icons">close</span>
            Close Position
          </button>
        </div>
        
        <div className={styles.actionGroup}>
          <button 
            className={`${styles.actionBtn} ${styles.secondaryBtn}`}
            onClick={onUndo}
          >
            <span className="material-icons">undo</span>
            Undo
          </button>
          <button 
            className={`${styles.actionBtn} ${styles.secondaryBtn}`}
            onClick={onClear}
          >
            <span className="material-icons">delete_sweep</span>
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(ManualBacktestSection)
