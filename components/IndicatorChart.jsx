'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { createChart } from 'lightweight-charts'
import { INDICATOR_COLORS } from './IndicatorConfigPanel'
import styles from './IndicatorChart.module.css'

// Default chart options
const CHART_OPTIONS = {
  layout: {
    background: { type: 'solid', color: '#0a0a0a' },
    textColor: '#888',
  },
  grid: {
    vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
    horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
  },
  crosshair: {
    mode: 1,
    vertLine: { color: 'rgba(255, 255, 255, 0.3)', width: 1, style: 2 },
    horzLine: { color: 'rgba(255, 255, 255, 0.3)', width: 1, style: 2 },
  },
  timeScale: {
    borderColor: 'rgba(255, 255, 255, 0.1)',
    timeVisible: true,
    secondsVisible: false,
  },
  rightPriceScale: {
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
}

const OSCILLATOR_CHART_OPTIONS = {
  ...CHART_OPTIONS,
  height: 120,
  rightPriceScale: {
    ...CHART_OPTIONS.rightPriceScale,
    scaleMargins: { top: 0.1, bottom: 0.1 },
  },
}

const IndicatorChart = ({
  candles = [],
  indicators = [],
  indicatorData = {},
  loading = false,
  symbol = '',
  timeframe = '',
}) => {
  const mainChartRef = useRef(null)
  const mainContainerRef = useRef(null)
  const oscillatorChartsRef = useRef({})
  const oscillatorContainersRef = useRef({})
  const seriesRef = useRef({})
  const candleSeriesRef = useRef(null)
  
  // Get enabled overlay and oscillator indicators
  const overlayIndicators = indicators.filter(i => i.enabled && i.pane === 'overlay')
  const oscillatorIndicators = indicators.filter(i => i.enabled && i.pane === 'oscillator')
  
  // Initialize main chart
  useEffect(() => {
    if (!mainContainerRef.current) return
    
    // Create main chart
    const chart = createChart(mainContainerRef.current, {
      ...CHART_OPTIONS,
      width: mainContainerRef.current.clientWidth,
      height: 400,
    })
    
    mainChartRef.current = chart
    
    // Add candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    })
    candleSeriesRef.current = candleSeries
    
    // Handle resize
    const handleResize = () => {
      if (mainContainerRef.current && chart) {
        chart.applyOptions({ width: mainContainerRef.current.clientWidth })
      }
    }
    
    window.addEventListener('resize', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      mainChartRef.current = null
      candleSeriesRef.current = null
      seriesRef.current = {}
    }
  }, [])
  
  // Update candle data
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return
    
    const formattedCandles = candles.map(c => ({
      time: typeof c.time === 'number' ? c.time : new Date(c.time || c.date).getTime() / 1000,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })).filter(c => c.time && !isNaN(c.time))
    
    if (formattedCandles.length > 0) {
      candleSeriesRef.current.setData(formattedCandles)
      mainChartRef.current?.timeScale().fitContent()
    }
  }, [candles])
  
  // Manage overlay indicator series
  useEffect(() => {
    if (!mainChartRef.current) return
    
    const chart = mainChartRef.current
    const currentSeries = seriesRef.current
    
    // Get current overlay indicator IDs
    const overlayIds = overlayIndicators.map(i => i.id)
    
    // Remove series for indicators that are no longer enabled/present
    Object.keys(currentSeries).forEach(id => {
      const indicator = indicators.find(i => i.id === id)
      if (!indicator || !indicator.enabled || indicator.pane !== 'overlay') {
        if (currentSeries[id]) {
          try {
            chart.removeSeries(currentSeries[id])
          } catch (e) {
            // Series might already be removed
          }
          delete currentSeries[id]
        }
      }
    })
    
    // Add/update series for enabled overlay indicators
    overlayIndicators.forEach((indicator, index) => {
      const data = indicatorData[indicator.id]
      
      if (!currentSeries[indicator.id] && data) {
        // Create new line series for this indicator
        const color = INDICATOR_COLORS[index % INDICATOR_COLORS.length]
        const series = chart.addLineSeries({
          color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: `${indicator.type.toUpperCase()}(${indicator.params?.length || ''})`,
        })
        currentSeries[indicator.id] = series
      }
      
      // Update data if series exists
      if (currentSeries[indicator.id] && data) {
        const formattedData = data.map(d => ({
          time: typeof d.time === 'number' ? d.time : new Date(d.time).getTime() / 1000,
          value: d.value,
        })).filter(d => d.time && !isNaN(d.time) && d.value !== null && !isNaN(d.value))
        
        if (formattedData.length > 0) {
          currentSeries[indicator.id].setData(formattedData)
        }
      }
    })
    
    seriesRef.current = currentSeries
  }, [overlayIndicators, indicatorData, indicators])
  
  // Manage oscillator charts
  useEffect(() => {
    // Clean up oscillator charts that are no longer needed
    const currentOscillatorIds = oscillatorIndicators.map(i => i.id)
    
    Object.keys(oscillatorChartsRef.current).forEach(id => {
      if (!currentOscillatorIds.includes(id)) {
        try {
          oscillatorChartsRef.current[id]?.remove()
        } catch (e) {
          // Chart might already be removed
        }
        delete oscillatorChartsRef.current[id]
      }
    })
  }, [oscillatorIndicators])
  
  // Render oscillator sub-charts
  const renderOscillatorChart = useCallback((indicator, index) => {
    const data = indicatorData[indicator.id]
    const containerId = `oscillator-${indicator.id}`
    
    return (
      <div key={indicator.id} className={styles.oscillatorPane}>
        <div className={styles.oscillatorHeader}>
          <span className={styles.oscillatorColor} style={{ background: INDICATOR_COLORS[index % INDICATOR_COLORS.length] }}></span>
          <span className={styles.oscillatorName}>
            {indicator.type.toUpperCase()}({indicator.params?.length || ''})
          </span>
        </div>
        <div 
          className={styles.oscillatorChart}
          ref={(el) => {
            if (!el) return
            
            // Check if chart already exists
            if (oscillatorChartsRef.current[indicator.id]) {
              // Update data only
              const chart = oscillatorChartsRef.current[indicator.id]
              const series = chart.series?.[0]
              if (series && data) {
                const formattedData = data.map(d => ({
                  time: typeof d.time === 'number' ? d.time : new Date(d.time).getTime() / 1000,
                  value: d.value,
                })).filter(d => d.time && !isNaN(d.time) && d.value !== null && !isNaN(d.value))
                
                if (formattedData.length > 0) {
                  series.setData(formattedData)
                }
              }
              return
            }
            
            // Create new chart
            const chart = createChart(el, {
              ...OSCILLATOR_CHART_OPTIONS,
              width: el.clientWidth,
            })
            
            const color = INDICATOR_COLORS[index % INDICATOR_COLORS.length]
            const series = chart.addLineSeries({
              color,
              lineWidth: 1.5,
              priceLineVisible: false,
              lastValueVisible: true,
            })
            
            chart.series = [series]
            oscillatorChartsRef.current[indicator.id] = chart
            
            // Sync with main chart timescale
            if (mainChartRef.current) {
              mainChartRef.current.timeScale().subscribeVisibleLogicalRangeChange((range) => {
                if (range) {
                  chart.timeScale().setVisibleLogicalRange(range)
                }
              })
            }
            
            // Set data
            if (data) {
              const formattedData = data.map(d => ({
                time: typeof d.time === 'number' ? d.time : new Date(d.time).getTime() / 1000,
                value: d.value,
              })).filter(d => d.time && !isNaN(d.time) && d.value !== null && !isNaN(d.value))
              
              if (formattedData.length > 0) {
                series.setData(formattedData)
              }
            }
            
            // Handle resize
            const handleResize = () => {
              chart.applyOptions({ width: el.clientWidth })
            }
            window.addEventListener('resize', handleResize)
          }}
        />
      </div>
    )
  }, [indicatorData])
  
  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.symbolInfo}>
          <span className={styles.symbol}>{symbol}</span>
          <span className={styles.timeframe}>{timeframe}</span>
        </div>
        {loading && (
          <div className={styles.loadingIndicator}>
            <span className={`material-icons ${styles.spinning}`}>sync</span>
            Loading...
          </div>
        )}
      </div>
      
      {/* Main price chart */}
      <div className={styles.mainChart} ref={mainContainerRef}>
        {candles.length === 0 && !loading && (
          <div className={styles.noData}>
            <span className="material-icons">show_chart</span>
            <p>No chart data available</p>
          </div>
        )}
      </div>
      
      {/* Oscillator sub-charts */}
      {oscillatorIndicators.length > 0 && (
        <div className={styles.oscillatorContainer}>
          {oscillatorIndicators.map((indicator, index) => 
            renderOscillatorChart(indicator, index)
          )}
        </div>
      )}
      
      {/* Legend */}
      {indicators.filter(i => i.enabled).length > 0 && (
        <div className={styles.legend}>
          {indicators.filter(i => i.enabled).map((indicator, index) => (
            <span key={indicator.id} className={styles.legendItem}>
              <span 
                className={styles.legendDot} 
                style={{ background: INDICATOR_COLORS[index % INDICATOR_COLORS.length] }}
              ></span>
              {indicator.type.toUpperCase()}({indicator.params?.length || ''})
              <span className={styles.legendPane}>
                {indicator.pane === 'overlay' ? 'OVL' : 'OSC'}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default memo(IndicatorChart)
