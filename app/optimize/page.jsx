'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { API_URL } from '@/lib/api'
import styles from './page.module.css'

export default function OptimizePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  
  // Generate available years (current year back to 10 years ago)
  const currentYear = new Date().getFullYear()
  const availableYears = Array.from({ length: 10 }, (_, i) => currentYear - i)
  
  // Configuration state
  const [symbol, setSymbol] = useState('BTC-USD')
  const [interval, setInterval] = useState('1d')
  const [inSampleYears, setInSampleYears] = useState([currentYear - 2, currentYear - 3])
  const [outSampleYears, setOutSampleYears] = useState([currentYear - 1, currentYear])
  const [maxEmaShort, setMaxEmaShort] = useState(20)
  const [maxEmaLong, setMaxEmaLong] = useState(50)
  
  // Out-of-Sample single EMA values (can be auto-filled from in-sample table)
  const [outSampleEmaShort, setOutSampleEmaShort] = useState(12)
  const [outSampleEmaLong, setOutSampleEmaLong] = useState(26)
  const [initialCapital, setInitialCapital] = useState(10000)
  
  // In-Sample results state
  const [isCalculatingInSample, setIsCalculatingInSample] = useState(false)
  const [inSampleResults, setInSampleResults] = useState(null)
  const [inSampleError, setInSampleError] = useState(null)
  // Multi-column sort: array of {key, direction} - empty initially (no auto-sort)
  const [inSampleSortConfig, setInSampleSortConfig] = useState([])
  
  // Heatmap metric selector
  const [heatmapMetric, setHeatmapMetric] = useState('sharpe_ratio')
  
  // Out-of-Sample results state
  const [isCalculatingOutSample, setIsCalculatingOutSample] = useState(false)
  const [outSampleResult, setOutSampleResult] = useState(null)
  const [outSampleError, setOutSampleError] = useState(null)
  
  // Heatmap hover state
  const [heatmapHover, setHeatmapHover] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  const symbols = [
    'BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD',
    'ADA-USD', 'DOGE-USD', 'AVAX-USD', 'DOT-USD', 'MATIC-USD'
  ]

  const intervals = [
    { value: '1h', label: '1 Hour' },
    { value: '4h', label: '4 Hours' },
    { value: '1d', label: '1 Day' },
    { value: '1wk', label: '1 Week' },
  ]

  const toggleInSampleYear = (year) => {
    if (inSampleYears.includes(year)) {
      setInSampleYears(inSampleYears.filter(y => y !== year))
    } else {
      setOutSampleYears(outSampleYears.filter(y => y !== year))
      setInSampleYears([...inSampleYears, year].sort((a, b) => a - b))
    }
  }

  const toggleOutSampleYear = (year) => {
    if (outSampleYears.includes(year)) {
      setOutSampleYears(outSampleYears.filter(y => y !== year))
    } else {
      setInSampleYears(inSampleYears.filter(y => y !== year))
      setOutSampleYears([...outSampleYears, year].sort((a, b) => a - b))
    }
  }

  const calculateInSample = async () => {
    if (inSampleYears.length === 0) {
      setInSampleError('Please select at least one year for In-Sample testing')
      return
    }

    setIsCalculatingInSample(true)
    setInSampleError(null)
    setInSampleResults(null)

    try {
      const response = await fetch(`${API_URL}/api/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          interval,
          years: inSampleYears.sort((a, b) => a - b),
          max_ema_short: maxEmaShort,
          max_ema_long: maxEmaLong,
          sample_type: 'in_sample',
          return_heatmap: true,
        }),
      })

      if (!response.ok) throw new Error('Failed to calculate optimization')
      const data = await response.json()
      setInSampleResults(data)
    } catch (err) {
      setInSampleError(err.message)
    } finally {
      setIsCalculatingInSample(false)
    }
  }

  const calculateOutSample = async () => {
    if (outSampleYears.length === 0) {
      setOutSampleError('Please select at least one year for Out-of-Sample testing')
      return
    }

    setIsCalculatingOutSample(true)
    setOutSampleError(null)
    setOutSampleResult(null)

    try {
      const response = await fetch(`${API_URL}/api/optimize-equity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          interval,
          in_sample_years: inSampleYears.sort((a, b) => a - b),
          out_sample_years: outSampleYears.sort((a, b) => a - b),
          ema_short: outSampleEmaShort,
          ema_long: outSampleEmaLong,
          initial_capital: initialCapital,
        }),
      })

      if (!response.ok) throw new Error('Failed to calculate')
      const data = await response.json()
      setOutSampleResult(data)
    } catch (err) {
      setOutSampleError(err.message)
    } finally {
      setIsCalculatingOutSample(false)
    }
  }

  // Multi-column sorting logic
  const sortDataMulti = (data, sortConfigs) => {
    if (!data || !Array.isArray(data)) return [...(data || [])]
    if (!sortConfigs || sortConfigs.length === 0) return [...data] // No sorting, return original order
    
    return [...data].sort((a, b) => {
      for (const config of sortConfigs) {
        const aVal = a[config.key]
        const bVal = b[config.key]
        if (aVal < bVal) return config.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return config.direction === 'asc' ? 1 : -1
      }
      return 0
    })
  }

  const sortedInSampleResults = useMemo(() => {
    return sortDataMulti(inSampleResults?.results, inSampleSortConfig)
  }, [inSampleResults, inSampleSortConfig])

  // Handle multi-column sort: click adds/toggles column, shift+click for secondary sort
  const handleSort = (key, event) => {
    const isShiftKey = event?.shiftKey
    
    setInSampleSortConfig(prev => {
      const existingIndex = prev.findIndex(s => s.key === key)
      
      if (existingIndex >= 0) {
        // Column already in sort - toggle direction or remove
        const existing = prev[existingIndex]
        if (existing.direction === 'desc') {
          // Toggle to asc
          const newConfig = [...prev]
          newConfig[existingIndex] = { key, direction: 'asc' }
          return newConfig
        } else {
          // Remove from sort
          return prev.filter((_, i) => i !== existingIndex)
        }
      } else {
        // Add new column to sort
        if (isShiftKey && prev.length > 0) {
          // Add as secondary sort
          return [...prev, { key, direction: 'desc' }]
        } else {
          // Replace with single column sort
          return [{ key, direction: 'desc' }]
        }
      }
    })
  }
  
  // Get sort info for a column
  const getSortInfo = (key) => {
    const index = inSampleSortConfig.findIndex(s => s.key === key)
    if (index < 0) return null
    return { ...inSampleSortConfig[index], priority: index + 1 }
  }

  // Auto-fill EMA values from in-sample table row click
  const handleRowClick = (row) => {
    setOutSampleEmaShort(row.ema_short)
    setOutSampleEmaLong(row.ema_long)
  }

  const getSharpeColor = (sharpe) => {
    if (sharpe >= 2) return '#00ff88'
    if (sharpe >= 1) return '#88ff00'
    if (sharpe >= 0.5) return '#ffcc00'
    if (sharpe >= 0) return '#ff8800'
    return '#ff4444'
  }

  // Heatmap metric options
  const heatmapMetricOptions = [
    { value: 'sharpe_ratio', label: 'Sharpe Ratio' },
    { value: 'total_return', label: 'Total Return' },
    { value: 'win_rate', label: 'Win Rate' },
  ]

  // Build heatmap data structure with min/max for dynamic coloring
  const heatmapData = useMemo(() => {
    if (!inSampleResults?.results) return null
    
    const results = inSampleResults.results
    const emaShortValues = [...new Set(results.map(r => r.ema_short))].sort((a, b) => a - b)
    const emaLongValues = [...new Set(results.map(r => r.ema_long))].sort((a, b) => a - b)
    
    // Create lookup map
    const lookup = {}
    results.forEach(r => {
      lookup[`${r.ema_short}-${r.ema_long}`] = r
    })
    
    // Calculate min/max for the selected metric
    const metricValues = results.map(r => r[heatmapMetric]).filter(v => v !== null && v !== undefined)
    const minValue = Math.min(...metricValues)
    const maxValue = Math.max(...metricValues)
    
    return { emaShortValues, emaLongValues, lookup, minValue, maxValue }
  }, [inSampleResults, heatmapMetric])

  // Dynamic heatmap color based on selected metric
  const getHeatmapColor = (value) => {
    if (value === null || value === undefined) return 'rgba(40, 40, 45, 0.6)'
    
    // Different coloring logic based on metric
    if (heatmapMetric === 'sharpe_ratio') {
      // Sharpe ratio: Red (<0) -> Yellow (0-1) -> Green (>1)
      if (value < 0) {
        const intensity = Math.min(1, Math.abs(value) / 2)
        const r = Math.round(255 - intensity * 55)
        const g = Math.round(120 - intensity * 80)
        const b = Math.round(120 - intensity * 80)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      } else if (value < 1) {
        const intensity = value
        const r = Math.round(255 - intensity * 25)
        const g = Math.round(180 + intensity * 55)
        const b = Math.round(80 + intensity * 40)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      } else {
        const intensity = Math.min(1, (value - 1) / 2)
        const r = Math.round(140 - intensity * 90)
        const g = Math.round(210 + intensity * 35)
        const b = Math.round(140 - intensity * 60)
        return `rgba(${r}, ${g}, ${b}, 0.9)`
      }
    } else if (heatmapMetric === 'total_return') {
      // Total return: Red (<0) -> Yellow (0) -> Green (>0)
      if (value < 0) {
        const intensity = Math.min(1, Math.abs(value) / 0.5) // -50% is max red
        const r = Math.round(255 - intensity * 55)
        const g = Math.round(120 - intensity * 80)
        const b = Math.round(120 - intensity * 80)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      } else {
        const intensity = Math.min(1, value / 1) // 100% is max green
        const r = Math.round(200 - intensity * 150)
        const g = Math.round(180 + intensity * 65)
        const b = Math.round(100 - intensity * 20)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      }
    } else if (heatmapMetric === 'win_rate') {
      // Win rate: Red (<0.4) -> Yellow (0.4-0.5) -> Green (>0.5)
      if (value < 0.4) {
        const intensity = (0.4 - value) / 0.4
        const r = Math.round(255 - intensity * 55)
        const g = Math.round(150 - intensity * 100)
        const b = Math.round(120 - intensity * 80)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      } else if (value < 0.5) {
        const intensity = (value - 0.4) / 0.1
        const r = Math.round(255 - intensity * 30)
        const g = Math.round(200 + intensity * 35)
        const b = Math.round(100 + intensity * 20)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      } else {
        const intensity = Math.min(1, (value - 0.5) / 0.3) // 80% is max green
        const r = Math.round(140 - intensity * 90)
        const g = Math.round(210 + intensity * 35)
        const b = Math.round(140 - intensity * 60)
        return `rgba(${r}, ${g}, ${b}, 0.9)`
      }
    }
    
    return 'rgba(100, 100, 100, 0.5)'
  }
  
  // Get display value for heatmap tooltip based on metric
  const getMetricDisplayValue = (result) => {
    if (!result) return 'N/A'
    const value = result[heatmapMetric]
    if (heatmapMetric === 'sharpe_ratio') return value?.toFixed(3)
    if (heatmapMetric === 'total_return') return `${(value * 100).toFixed(2)}%`
    if (heatmapMetric === 'win_rate') return `${(value * 100).toFixed(1)}%`
    return value?.toFixed(3)
  }

  // Export results to CSV
  const exportToCSV = () => {
    if (!inSampleResults?.results) return
    
    const headers = ['EMA_Short', 'EMA_Long', 'Sharpe_Ratio', 'Total_Return', 'Max_Drawdown', 'Win_Rate', 'Total_Trades']
    const rows = sortedInSampleResults.map(r => [
      r.ema_short,
      r.ema_long,
      r.sharpe_ratio.toFixed(4),
      (r.total_return * 100).toFixed(2) + '%',
      (r.max_drawdown * 100).toFixed(2) + '%',
      (r.win_rate * 100).toFixed(2) + '%',
      r.total_trades
    ])
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `optimization_${symbol}_${interval}_${inSampleYears.join('-')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const SortableHeader = ({ label, sortKey, onSort }) => {
    const sortInfo = getSortInfo(sortKey)
    const isActive = sortInfo !== null
    return (
      <th onClick={(e) => onSort(sortKey, e)} className={styles.sortableHeader} title="Click to sort, Shift+Click for multi-column sort">
        {label}
        {sortInfo && sortInfo.priority > 1 && (
          <span className={styles.sortPriority}>{sortInfo.priority}</span>
        )}
        <span className={`material-icons ${styles.sortIcon} ${isActive ? styles.active : ''}`}>
          {isActive ? (sortInfo.direction === 'desc' ? 'arrow_downward' : 'arrow_upward') : 'unfold_more'}
        </span>
      </th>
    )
  }

  if (status === 'loading') {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner}></div>
      </div>
    )
  }

  if (!session) return null

  return (
    <div className={styles.dashboard}>
      <Sidebar onCollapseChange={setSidebarCollapsed} />
      <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <TopBar sidebarCollapsed={sidebarCollapsed} />
        <div className={styles.content}>
          {/* Header */}
          <div className={styles.headerSection}>
            <h1>Strategy Optimizer</h1>
            <p className={styles.subtitle}>Find the optimal EMA parameters for your trading strategy</p>
          </div>

          {/* Global Configuration */}
          <div className={styles.configSection}>
            <div className={styles.configCard}>
              <h3>
                <span className="material-icons">tune</span>
                Global Parameters
              </h3>
              
              <div className={styles.configGrid}>
                <div className={styles.formGroup}>
                  <label>Trading Pair</label>
                  <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className={styles.select}>
                    {symbols.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Timeframe</label>
                  <select value={interval} onChange={(e) => setInterval(e.target.value)} className={styles.select}>
                    {intervals.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Max Short EMA</label>
                  <input type="number" value={maxEmaShort} onChange={(e) => setMaxEmaShort(Number(e.target.value))} min={5} max={50} className={styles.input} />
                </div>

                <div className={styles.formGroup}>
                  <label>Max Long EMA</label>
                  <input type="number" value={maxEmaLong} onChange={(e) => setMaxEmaLong(Number(e.target.value))} min={20} max={200} className={styles.input} />
                </div>
              </div>
            </div>
          </div>

          {/* In-Sample Section */}
          <div className={styles.sampleSection}>
            <div className={styles.sampleCard}>
              <div className={styles.sampleHeader}>
                <h3>
                  <span className="material-icons">science</span>
                  In-Sample Analysis (Training Data)
                </h3>
              </div>

              <div className={styles.sampleConfig}>
                {/* Year Selection */}
                <div className={styles.yearSelection}>
                  <label>Select Years:</label>
                  <div className={styles.yearChips}>
                    {availableYears.map(year => (
                      <button
                        key={year}
                        className={`${styles.yearChip} ${inSampleYears.includes(year) ? styles.selected : ''}`}
                        onClick={() => toggleInSampleYear(year)}
                      >
                        {year}
                      </button>
                    ))}
                  </div>
                  <div className={styles.selectedInfo}>
                    Selected: {inSampleYears.length > 0 ? inSampleYears.sort((a, b) => a - b).join(', ') : 'None'}
                  </div>
                </div>

                <button 
                  className={styles.calculateButton}
                  onClick={calculateInSample}
                  disabled={isCalculatingInSample || inSampleYears.length === 0}
                >
                  {isCalculatingInSample ? (
                    <><span className={`material-icons ${styles.spinning}`}>sync</span> Calculating...</>
                  ) : (
                    <><span className="material-icons">calculate</span> Calculate In-Sample</>
                  )}
                </button>
              </div>

              {inSampleError && (
                <div className={styles.errorMessage}>
                  <span className="material-icons">error</span>
                  {inSampleError}
                </div>
              )}

              {inSampleResults && (
                <div className={styles.resultsContainer}>
                  {/* Summary */}
                  <div className={styles.resultsSummary}>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Best EMA</span>
                      <span className={styles.summaryValue}>
                        {sortedInSampleResults[0]?.ema_short}/{sortedInSampleResults[0]?.ema_long}
                      </span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Best Sharpe</span>
                      <span className={styles.summaryValue} style={{ color: getSharpeColor(sortedInSampleResults[0]?.sharpe_ratio || 0) }}>
                        {sortedInSampleResults[0]?.sharpe_ratio?.toFixed(3)}
                      </span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Combinations</span>
                      <span className={styles.summaryValue}>{inSampleResults.combinations_tested}</span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Period</span>
                      <span className={styles.summaryValue}>{inSampleResults.period}</span>
                    </div>
                  </div>

                  {/* Heatmap and Table Grid */}
                  <div className={styles.resultsGrid}>
                    {/* Heatmap */}
                    {heatmapData && (
                      <div className={styles.heatmapSection}>
                        <div className={styles.heatmapHeader}>
                          <h4>Heatmap</h4>
                          <select 
                            value={heatmapMetric} 
                            onChange={(e) => setHeatmapMetric(e.target.value)}
                            className={styles.metricSelect}
                          >
                            {heatmapMetricOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className={styles.heatmapContainer}>
                          <div className={styles.heatmapYLabel}>Long EMA →</div>
                          <div className={styles.heatmapWrapper}>
                            <div className={styles.heatmapXLabels}>
                              <div className={styles.heatmapCorner}></div>
                              {heatmapData.emaShortValues.map(ema => (
                                <div key={ema} className={styles.heatmapXLabel}>{ema}</div>
                              ))}
                            </div>
                            <div className={styles.heatmapBody}>
                              {heatmapData.emaLongValues.map(emaLong => (
                                <div key={emaLong} className={styles.heatmapRow}>
                                  <div className={styles.heatmapYLabelCell}>{emaLong}</div>
                                  {heatmapData.emaShortValues.map(emaShort => {
                                    const result = heatmapData.lookup[`${emaShort}-${emaLong}`]
                                    const metricValue = result?.[heatmapMetric]
                                    const isValid = emaShort < emaLong && result
                                    
                                    return (
                                      <div
                                        key={`${emaShort}-${emaLong}`}
                                        className={`${styles.heatmapCell} ${isValid ? styles.valid : ''}`}
                                        style={{ backgroundColor: isValid ? getHeatmapColor(metricValue) : 'transparent' }}
                                        onMouseEnter={() => isValid && setHeatmapHover({ emaShort, emaLong, ...result })}
                                        onMouseMove={(e) => isValid && setMousePos({ x: e.clientX, y: e.clientY })}
                                        onMouseLeave={() => setHeatmapHover(null)}
                                        onClick={() => isValid && handleRowClick(result)}
                                      />
                                    )
                                  })}
                                </div>
                              ))}
                            </div>
                            <div className={styles.heatmapXAxisLabel}>Short EMA →</div>
                          </div>
                          
                          {/* Hover tooltip - follows mouse */}
                          {heatmapHover && (
                            <div 
                              className={styles.heatmapTooltip}
                              style={{ left: mousePos.x, top: mousePos.y }}
                            >
                              <div className={styles.tooltipHeader}>EMA {heatmapHover.emaShort}/{heatmapHover.emaLong}</div>
                              <div className={styles.tooltipRow}>
                                <span>Sharpe Ratio:</span>
                                <span style={{ color: getSharpeColor(heatmapHover.sharpe_ratio) }}>
                                  {heatmapHover.sharpe_ratio?.toFixed(3)}
                                </span>
                              </div>
                              <div className={styles.tooltipRow}>
                                <span>Return:</span>
                                <span className={heatmapHover.total_return >= 0 ? styles.positive : styles.negative}>
                                  {(heatmapHover.total_return * 100).toFixed(2)}%
                                </span>
                              </div>
                              <div className={styles.tooltipRow}>
                                <span>Max DD:</span>
                                <span className={styles.negative}>{(heatmapHover.max_drawdown * 100).toFixed(2)}%</span>
                              </div>
                              <div className={styles.tooltipRow}>
                                <span>Win Rate:</span>
                                <span>{(heatmapHover.win_rate * 100).toFixed(1)}%</span>
                              </div>
                              <div className={styles.tooltipHint}>Click to use in Out-of-Sample</div>
                            </div>
                          )}

                          {/* Color Legend */}
                          <div className={styles.heatmapLegend}>
                            <span className={styles.legendLabel}>
                              {heatmapMetric === 'sharpe_ratio' ? '<0' : 
                               heatmapMetric === 'total_return' ? '<0%' : '<40%'} (Red)
                            </span>
                            <div className={styles.legendGradient}></div>
                            <span className={styles.legendLabel}>
                              {heatmapMetric === 'sharpe_ratio' ? '>1' : 
                               heatmapMetric === 'total_return' ? '>100%' : '>50%'} (Green)
                            </span>
                          </div>
                          <div className={styles.legendCenter}>0-1 (Yellow)</div>
                        </div>
                      </div>
                    )}

                    {/* Results Table */}
                    <div className={styles.tableSection}>
                      <div className={styles.tableHeader}>
                        <h4>All Combinations <span className={styles.tableHint}>(Click row to use in Out-of-Sample)</span></h4>
                        <button className={styles.exportButton} onClick={exportToCSV}>
                          <span className="material-icons">download</span>
                          Export CSV
                        </button>
                      </div>
                      <div className={styles.tableContainer}>
                        <table className={styles.resultsTable}>
                          <thead>
                            <tr>
                              <SortableHeader label="Short" sortKey="ema_short" onSort={handleSort} />
                              <SortableHeader label="Long" sortKey="ema_long" onSort={handleSort} />
                              <SortableHeader label="Sharpe" sortKey="sharpe_ratio" onSort={handleSort} />
                              <SortableHeader label="Return" sortKey="total_return" onSort={handleSort} />
                              <SortableHeader label="Max DD" sortKey="max_drawdown" onSort={handleSort} />
                              <SortableHeader label="Win %" sortKey="win_rate" onSort={handleSort} />
                              <SortableHeader label="Trades" sortKey="total_trades" onSort={handleSort} />
                            </tr>
                          </thead>
                          <tbody>
                            {sortedInSampleResults.map((row, index) => (
                              <tr 
                                key={index} 
                                className={`${styles.clickableRow} ${row.ema_short === outSampleEmaShort && row.ema_long === outSampleEmaLong ? styles.selectedRow : ''}`}
                                onClick={() => handleRowClick(row)}
                              >
                                <td>{row.ema_short}</td>
                                <td>{row.ema_long}</td>
                                <td style={{ color: getSharpeColor(row.sharpe_ratio) }}>
                                  {row.sharpe_ratio.toFixed(3)}
                                </td>
                                <td className={row.total_return >= 0 ? styles.positive : styles.negative}>
                                  {(row.total_return * 100).toFixed(2)}%
                                </td>
                                <td className={styles.negative}>
                                  {(row.max_drawdown * 100).toFixed(2)}%
                                </td>
                                <td>{(row.win_rate * 100).toFixed(1)}%</td>
                                <td>{row.total_trades}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Out-of-Sample Section */}
          <div className={styles.sampleSection}>
            <div className={`${styles.sampleCard} ${styles.outSampleCard}`}>
              <div className={styles.sampleHeader}>
                <h3>
                  <span className="material-icons">verified</span>
                  Out-of-Sample Validation
                </h3>
              </div>

              <div className={styles.outSampleConfig}>
                {/* Year Selection */}
                <div className={styles.yearSelection}>
                  <label>Select Validation Years:</label>
                  <div className={styles.yearChips}>
                    {availableYears.map(year => (
                      <button
                        key={year}
                        className={`${styles.yearChip} ${styles.outSample} ${outSampleYears.includes(year) ? styles.selected : ''}`}
                        onClick={() => toggleOutSampleYear(year)}
                      >
                        {year}
                      </button>
                    ))}
                  </div>
                  <div className={styles.selectedInfo}>
                    Selected: {outSampleYears.length > 0 ? outSampleYears.sort((a, b) => a - b).join(', ') : 'None'}
                  </div>
                </div>

                {/* EMA and Capital Selection */}
                <div className={styles.emaSelection}>
                  <div className={styles.emaInputGroup}>
                    <div className={styles.formGroup}>
                      <label>Short EMA</label>
                      <input 
                        type="number" 
                        value={outSampleEmaShort} 
                        onChange={(e) => setOutSampleEmaShort(Number(e.target.value))} 
                        min={3} 
                        max={maxEmaShort} 
                        className={styles.input} 
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Long EMA</label>
                      <input 
                        type="number" 
                        value={outSampleEmaLong} 
                        onChange={(e) => setOutSampleEmaLong(Number(e.target.value))} 
                        min={10} 
                        max={maxEmaLong} 
                        className={styles.input} 
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Initial Capital ($)</label>
                      <input 
                        type="number" 
                        value={initialCapital} 
                        onChange={(e) => setInitialCapital(Number(e.target.value))} 
                        min={100} 
                        step={1000}
                        className={styles.input} 
                      />
                    </div>
                  </div>
                  <div className={styles.emaHint}>
                    <span className="material-icons">info</span>
                    Click a row in the In-Sample table or heatmap to auto-fill EMA values
                  </div>
                </div>

                <button 
                  className={`${styles.calculateButton} ${styles.outSampleButton}`}
                  onClick={calculateOutSample}
                  disabled={isCalculatingOutSample || outSampleYears.length === 0}
                >
                  {isCalculatingOutSample ? (
                    <><span className={`material-icons ${styles.spinning}`}>sync</span> Calculating...</>
                  ) : (
                    <><span className="material-icons">verified</span> Validate Strategy</>
                  )}
                </button>
              </div>

              {outSampleError && (
                <div className={styles.errorMessage}>
                  <span className="material-icons">error</span>
                  {outSampleError}
                </div>
              )}

              {outSampleResult && (
                <div className={styles.outSampleResults}>
                  {/* Metrics Cards */}
                  <div className={styles.metricsRow}>
                    {/* In-Sample Metrics */}
                    <div className={styles.resultCard}>
                      <div className={styles.resultCardHeader}>
                        <span className="material-icons">science</span>
                        In-Sample Results
                      </div>
                      <div className={styles.resultCardBody}>
                        <div className={styles.mainMetric}>
                          <span className={styles.metricLabel}>Sharpe Ratio</span>
                          <span className={styles.metricValue} style={{ color: getSharpeColor(outSampleResult.in_sample?.sharpe_ratio) }}>
                            {outSampleResult.in_sample?.sharpe_ratio?.toFixed(3) || 'N/A'}
                          </span>
                        </div>
                        <div className={styles.metricsGrid}>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Return</span>
                            <span className={`${styles.metricValue} ${(outSampleResult.in_sample?.total_return || 0) >= 0 ? styles.positive : styles.negative}`}>
                              {((outSampleResult.in_sample?.total_return || 0) * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Max DD</span>
                            <span className={`${styles.metricValue} ${styles.negative}`}>
                              {((outSampleResult.in_sample?.max_drawdown || 0) * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Win Rate</span>
                            <span className={styles.metricValue}>
                              {((outSampleResult.in_sample?.win_rate || 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Trades</span>
                            <span className={styles.metricValue}>
                              {outSampleResult.in_sample?.total_trades || 0}
                            </span>
                          </div>
                        </div>
                        <div className={styles.periodInfo}>
                          <span className="material-icons">date_range</span>
                          {outSampleResult.in_sample?.period || 'N/A'}
                        </div>
                      </div>
                    </div>

                    {/* Out-Sample Metrics */}
                    <div className={`${styles.resultCard} ${styles.outSampleResultCard}`}>
                      <div className={styles.resultCardHeader}>
                        <span className="material-icons">verified</span>
                        Out-of-Sample Results
                      </div>
                      <div className={styles.resultCardBody}>
                        <div className={styles.mainMetric}>
                          <span className={styles.metricLabel}>Sharpe Ratio</span>
                          <span className={styles.metricValue} style={{ color: getSharpeColor(outSampleResult.out_sample?.sharpe_ratio) }}>
                            {outSampleResult.out_sample?.sharpe_ratio?.toFixed(3) || 'N/A'}
                          </span>
                        </div>
                        <div className={styles.metricsGrid}>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Return</span>
                            <span className={`${styles.metricValue} ${(outSampleResult.out_sample?.total_return || 0) >= 0 ? styles.positive : styles.negative}`}>
                              {((outSampleResult.out_sample?.total_return || 0) * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Max DD</span>
                            <span className={`${styles.metricValue} ${styles.negative}`}>
                              {((outSampleResult.out_sample?.max_drawdown || 0) * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Win Rate</span>
                            <span className={styles.metricValue}>
                              {((outSampleResult.out_sample?.win_rate || 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Trades</span>
                            <span className={styles.metricValue}>
                              {outSampleResult.out_sample?.total_trades || 0}
                            </span>
                          </div>
                        </div>
                        <div className={styles.periodInfo}>
                          <span className="material-icons">date_range</span>
                          {outSampleResult.out_sample?.period || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Equity Curve Chart */}
                  {outSampleResult.equity_curve && outSampleResult.equity_curve.length > 0 && (
                    <div className={styles.equityCurveSection}>
                      <h4>
                        <span className="material-icons">show_chart</span>
                        Equity Curve - EMA {outSampleResult.ema_short}/{outSampleResult.ema_long}
                      </h4>
                      <div className={styles.equityCurveChart}>
                        <div className={styles.chartYAxis}>
                          <span>${Math.max(...outSampleResult.equity_curve.map(p => p.equity)).toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                          <span>${(initialCapital).toLocaleString()}</span>
                          <span>${Math.min(...outSampleResult.equity_curve.map(p => p.equity)).toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                        </div>
                        <div className={styles.chartArea}>
                          <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className={styles.equitySvg}>
                            {/* Render each segment with different colors */}
                            {outSampleResult.segments && outSampleResult.segments.map((segment, segIdx) => {
                              const minEquity = Math.min(...outSampleResult.equity_curve.map(p => p.equity))
                              const maxEquity = Math.max(...outSampleResult.equity_curve.map(p => p.equity))
                              const range = maxEquity - minEquity || 1
                              const totalPoints = outSampleResult.equity_curve.length
                              
                              // Build path for this segment
                              const pathData = []
                              for (let i = segment.start; i <= segment.end; i++) {
                                const point = outSampleResult.equity_curve[i]
                                const x = (i / (totalPoints - 1)) * 1000
                                const y = 300 - ((point.equity - minEquity) / range) * 280 - 10
                                pathData.push(i === segment.start ? `M ${x} ${y}` : `L ${x} ${y}`)
                              }
                              
                              const color = segment.type === 'in_sample' ? '#4488ff' : '#00ff88'
                              
                              return (
                                <path
                                  key={segIdx}
                                  d={pathData.join(' ')}
                                  fill="none"
                                  stroke={color}
                                  strokeWidth="2.5"
                                />
                              )
                            })}
                            
                            {/* Vertical divider lines between segments */}
                            {outSampleResult.segments && outSampleResult.segments.slice(0, -1).map((segment, idx) => {
                              const x = ((segment.end + 0.5) / (outSampleResult.equity_curve.length - 1)) * 1000
                              return (
                                <line 
                                  key={`divider-${idx}`}
                                  x1={x} 
                                  y1="0" 
                                  x2={x} 
                                  y2="300" 
                                  stroke="#666" 
                                  strokeWidth="1.5" 
                                  strokeDasharray="4,4"
                                />
                              )
                            })}
                          </svg>
                          <div className={styles.chartLabels}>
                            <span className={styles.inSampleLabel}>● In-Sample</span>
                            <span className={styles.outSampleLabel}>● Out-of-Sample</span>
                          </div>
                        </div>
                      </div>
                      <div className={styles.strategyInfo}>
                        <span className="material-icons">account_balance</span>
                        Initial: ${initialCapital.toLocaleString()} → Final: ${outSampleResult.equity_curve[outSampleResult.equity_curve.length - 1]?.equity.toLocaleString(undefined, {maximumFractionDigits: 0})}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
