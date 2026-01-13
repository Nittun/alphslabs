'use client'

/**
 * MonteCarloChart Component
 * 
 * Visualizes Monte Carlo simulation results using TradingView Lightweight Charts.
 * Shows multiple equity paths with highlighted percentile lines.
 */

import { useEffect, useRef, useMemo } from 'react'
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
