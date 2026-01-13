'use client'

/**
 * MonteCarloChart Component
 * 
 * Visualizes Monte Carlo simulation results using TradingView Lightweight Charts.
 * Shows multiple equity paths with highlighted percentile lines.
 */

import { useEffect, useRef, useMemo, useState } from 'react'
import { createChart } from 'lightweight-charts'
import styles from './MonteCarloChart.module.css'

/**
 * Generate colors with varying opacity for equity paths
 */
function generatePathColor(index, total, baseColor = { r: 168, g: 85, b: 247 }) {
  const opacity = 0.1 + (index / total) * 0.2
  return `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${opacity})`
}

/**
 * MonteCarloChart Component
 * 
 * @param {Object} props
 * @param {Array} props.simulations - Array of simulation results
 * @param {Object} props.statistics - Percentile statistics
 * @param {number} props.initialCapital - Starting capital
 * @param {number} props.maxPathsToShow - Maximum paths to display (default 100)
 * @param {number} props.height - Chart height in pixels
 */
export default function MonteCarloChart({
  simulations = [],
  statistics = null,
  initialCapital = 10000,
  maxPathsToShow = 100,
  height = 400
}) {
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const tooltipRef = useRef(null)
  const [tooltipData, setTooltipData] = useState(null)
  const seriesMapRef = useRef(new Map()) // Map to store series -> simulation data
  
  // Select a subset of simulations to display
  const displaySimulations = useMemo(() => {
    if (!simulations || simulations.length === 0) return []
    
    // If fewer than max, show all
    if (simulations.length <= maxPathsToShow) {
      return simulations
    }
    
    // Otherwise, sample evenly across the distribution
    const step = Math.floor(simulations.length / maxPathsToShow)
    const selected = []
    for (let i = 0; i < simulations.length && selected.length < maxPathsToShow; i += step) {
      selected.push(simulations[i])
    }
    return selected
  }, [simulations, maxPathsToShow])
  
  // Find percentile simulations for highlighting
  const percentileSimulations = useMemo(() => {
    if (!simulations || simulations.length === 0 || !statistics) return {}
    
    // Sort by final equity to find percentile paths
    const sorted = [...simulations].sort((a, b) => a.finalEquity - b.finalEquity)
    
    const getAtPercentile = (percentile) => {
      const index = Math.floor((percentile / 100) * (sorted.length - 1))
      return sorted[index]
    }
    
    return {
      p5: getAtPercentile(5),
      p25: getAtPercentile(25),
      median: getAtPercentile(50),
      p75: getAtPercentile(75),
      p95: getAtPercentile(95)
    }
  }, [simulations, statistics])
  
  useEffect(() => {
    if (!chartContainerRef.current || displaySimulations.length === 0) return
    
    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#888',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: false,
        tickMarkFormatter: (time) => `Trade ${time}`,
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: 'rgba(255, 255, 255, 0.2)',
          labelBackgroundColor: '#1a1a1a',
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.2)',
          labelBackgroundColor: '#1a1a1a',
        },
      },
    })
    
    chartRef.current = chart
    
    // Add background paths (subset of simulations)
    const lineSeries = []
    
    // Add all display paths with low opacity
    displaySimulations.forEach((sim, idx) => {
      if (!sim.equity || sim.equity.length === 0) return
      
      // Skip if this is a percentile path (we'll add those separately)
      const isPercentilePath = 
        sim.index === percentileSimulations.p5?.index ||
        sim.index === percentileSimulations.p25?.index ||
        sim.index === percentileSimulations.median?.index ||
        sim.index === percentileSimulations.p75?.index ||
        sim.index === percentileSimulations.p95?.index
      
      if (isPercentilePath) return
      
      const series = chart.addLineSeries({
        color: generatePathColor(idx, displaySimulations.length),
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      
      const data = sim.equity.map((value, i) => ({
        time: i,
        value: value
      }))
      
      series.setData(data)
      lineSeries.push(series)
    })
    
    // Add percentile paths with distinct colors
    const addPercentilePath = (sim, color, lineWidth = 2, title = '') => {
      if (!sim || !sim.equity || sim.equity.length === 0) return null
      
      const series = chart.addLineSeries({
        color: color,
        lineWidth: lineWidth,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        title: title,
      })
      
      const data = sim.equity.map((value, i) => ({
        time: i,
        value: value
      }))
      
      series.setData(data)
      lineSeries.push(series)
      return series
    }
    
    // Add percentile lines in order (back to front)
    addPercentilePath(percentileSimulations.p5, '#ef4444', 2, '5th')  // Red - worst
    addPercentilePath(percentileSimulations.p25, '#f59e0b', 2, '25th')  // Orange
    addPercentilePath(percentileSimulations.p75, '#22c55e', 2, '75th')  // Green
    addPercentilePath(percentileSimulations.p95, '#10b981', 2, '95th')  // Bright green - best
    addPercentilePath(percentileSimulations.median, '#a855f7', 3, 'Median')  // Purple - median (on top)
    
    // Add initial capital line
    const baselineSeries = chart.addLineSeries({
      color: 'rgba(255, 255, 255, 0.3)',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      priceLineVisible: false,
      lastValueVisible: false,
    })
    
    const maxLength = Math.max(...displaySimulations.map(s => s.equity?.length || 0))
    const baselineData = Array.from({ length: maxLength }, (_, i) => ({
      time: i,
      value: initialCapital
    }))
    baselineSeries.setData(baselineData)
    
    // Fit content
    chart.timeScale().fitContent()
    
    // Subscribe to crosshair move for tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
        setTooltipData(null)
        return
      }
      
      const tradeIndex = param.time
      
      // Get values for percentile paths at this trade
      const getValueAtTrade = (sim) => {
        if (!sim || !sim.equity || tradeIndex >= sim.equity.length) return null
        return sim.equity[tradeIndex]
      }
      
      const p5Value = getValueAtTrade(percentileSimulations.p5)
      const p25Value = getValueAtTrade(percentileSimulations.p25)
      const medianValue = getValueAtTrade(percentileSimulations.median)
      const p75Value = getValueAtTrade(percentileSimulations.p75)
      const p95Value = getValueAtTrade(percentileSimulations.p95)
      
      // Calculate returns from initial capital
      const calcReturn = (value) => value ? ((value - initialCapital) / initialCapital * 100).toFixed(2) : null
      
      setTooltipData({
        tradeIndex: tradeIndex + 1,
        x: param.point.x,
        y: param.point.y,
        p5: p5Value ? { value: p5Value, return: calcReturn(p5Value) } : null,
        p25: p25Value ? { value: p25Value, return: calcReturn(p25Value) } : null,
        median: medianValue ? { value: medianValue, return: calcReturn(medianValue) } : null,
        p75: p75Value ? { value: p75Value, return: calcReturn(p75Value) } : null,
        p95: p95Value ? { value: p95Value, return: calcReturn(p95Value) } : null,
      })
    })
    
    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
    }
    
    window.addEventListener('resize', handleResize)
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      setTooltipData(null)
    }
  }, [displaySimulations, percentileSimulations, initialCapital, height])
  
  if (!simulations || simulations.length === 0) {
    return (
      <div className={styles.placeholder}>
        <span className="material-icons">show_chart</span>
        <p>No simulation data to display</p>
      </div>
    )
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h5>
          <span className="material-icons">ssid_chart</span>
          Equity Path Distribution
        </h5>
        <span className={styles.subtitle}>
          Showing {displaySimulations.length} of {simulations.length} paths
        </span>
      </div>
      
      <div className={styles.chartWrapper}>
        <div ref={chartContainerRef} className={styles.chart} />
        
        {/* Tooltip on hover */}
        {tooltipData && (
          <div 
            ref={tooltipRef}
            className={styles.tooltip}
            style={{
              left: Math.min(tooltipData.x + 15, chartContainerRef.current?.clientWidth - 220 || tooltipData.x),
              top: Math.max(tooltipData.y - 10, 0)
            }}
          >
            <div className={styles.tooltipHeader}>
              <span className="material-icons">timeline</span>
              Trade #{tooltipData.tradeIndex}
            </div>
            <div className={styles.tooltipContent}>
              {tooltipData.p95 && (
                <div className={styles.tooltipRow}>
                  <span className={styles.tooltipLabel} style={{ color: '#10b981' }}>95th Percentile:</span>
                  <span className={styles.tooltipValue}>
                    ${tooltipData.p95.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    <span className={tooltipData.p95.return >= 0 ? styles.positive : styles.negative}>
                      ({tooltipData.p95.return >= 0 ? '+' : ''}{tooltipData.p95.return}%)
                    </span>
                  </span>
                </div>
              )}
              {tooltipData.p75 && (
                <div className={styles.tooltipRow}>
                  <span className={styles.tooltipLabel} style={{ color: '#22c55e' }}>75th Percentile:</span>
                  <span className={styles.tooltipValue}>
                    ${tooltipData.p75.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    <span className={tooltipData.p75.return >= 0 ? styles.positive : styles.negative}>
                      ({tooltipData.p75.return >= 0 ? '+' : ''}{tooltipData.p75.return}%)
                    </span>
                  </span>
                </div>
              )}
              {tooltipData.median && (
                <div className={styles.tooltipRow}>
                  <span className={styles.tooltipLabel} style={{ color: '#a855f7' }}>Median:</span>
                  <span className={styles.tooltipValue}>
                    ${tooltipData.median.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    <span className={tooltipData.median.return >= 0 ? styles.positive : styles.negative}>
                      ({tooltipData.median.return >= 0 ? '+' : ''}{tooltipData.median.return}%)
                    </span>
                  </span>
                </div>
              )}
              {tooltipData.p25 && (
                <div className={styles.tooltipRow}>
                  <span className={styles.tooltipLabel} style={{ color: '#f59e0b' }}>25th Percentile:</span>
                  <span className={styles.tooltipValue}>
                    ${tooltipData.p25.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    <span className={tooltipData.p25.return >= 0 ? styles.positive : styles.negative}>
                      ({tooltipData.p25.return >= 0 ? '+' : ''}{tooltipData.p25.return}%)
                    </span>
                  </span>
                </div>
              )}
              {tooltipData.p5 && (
                <div className={styles.tooltipRow}>
                  <span className={styles.tooltipLabel} style={{ color: '#ef4444' }}>5th Percentile:</span>
                  <span className={styles.tooltipValue}>
                    ${tooltipData.p5.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    <span className={tooltipData.p5.return >= 0 ? styles.positive : styles.negative}>
                      ({tooltipData.p5.return >= 0 ? '+' : ''}{tooltipData.p5.return}%)
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={styles.legendColor} style={{ background: '#ef4444' }} />
          <span>5th Percentile (Worst)</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendColor} style={{ background: '#f59e0b' }} />
          <span>25th Percentile</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendColor} style={{ background: '#a855f7' }} />
          <span>Median (50th)</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendColor} style={{ background: '#22c55e' }} />
          <span>75th Percentile</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendColor} style={{ background: '#10b981' }} />
          <span>95th Percentile (Best)</span>
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendColor} style={{ background: 'rgba(255,255,255,0.3)', border: '1px dashed #666' }} />
          <span>Initial Capital</span>
        </div>
      </div>
    </div>
  )
}
