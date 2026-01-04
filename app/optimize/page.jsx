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
  
  // In-Sample results state
  const [isCalculatingInSample, setIsCalculatingInSample] = useState(false)
  const [inSampleResults, setInSampleResults] = useState(null)
  const [inSampleError, setInSampleError] = useState(null)
  const [inSampleSortConfig, setInSampleSortConfig] = useState({ key: 'sharpe_ratio', direction: 'desc' })
  
  // Out-of-Sample results state
  const [isCalculatingOutSample, setIsCalculatingOutSample] = useState(false)
  const [outSampleResult, setOutSampleResult] = useState(null)
  const [outSampleError, setOutSampleError] = useState(null)
  
  // Heatmap hover state
  const [heatmapHover, setHeatmapHover] = useState(null)

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
      const response = await fetch(`${API_URL}/api/optimize-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          interval,
          years: outSampleYears.sort((a, b) => a - b),
          ema_short: outSampleEmaShort,
          ema_long: outSampleEmaLong,
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

  // Sorting logic for tables
  const sortData = (data, sortConfig) => {
    if (!data || !Array.isArray(data)) return []
    return [...data].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? -1 : 1
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? 1 : -1
      }
      return 0
    })
  }

  const sortedInSampleResults = useMemo(() => {
    return sortData(inSampleResults?.results, inSampleSortConfig)
  }, [inSampleResults, inSampleSortConfig])

  const handleSort = (key) => {
    setInSampleSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }))
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

  // Build heatmap data structure with min/max for dynamic coloring
  const heatmapData = useMemo(() => {
    if (!inSampleResults?.results) return null
    
    const results = inSampleResults.results
    const sharpeValues = results.map(r => r.sharpe_ratio).filter(v => v !== null && v !== undefined)
    const minSharpe = Math.min(...sharpeValues)
    const maxSharpe = Math.max(...sharpeValues)
    const emaShortValues = [...new Set(results.map(r => r.ema_short))].sort((a, b) => a - b)
    const emaLongValues = [...new Set(results.map(r => r.ema_long))].sort((a, b) => a - b)
    
    // Create lookup map
    const lookup = {}
    results.forEach(r => {
      lookup[`${r.ema_short}-${r.ema_long}`] = r
    })
    
    return { emaShortValues, emaLongValues, lookup, minSharpe, maxSharpe }
  }, [inSampleResults])

  // Dynamic heatmap color based on actual data range
  const getHeatmapColor = (sharpe) => {
    if (sharpe === null || sharpe === undefined || !heatmapData) return 'rgba(30, 30, 30, 0.5)'
    
    const { minSharpe, maxSharpe } = heatmapData
    const range = maxSharpe - minSharpe
    
    // Normalize to 0-1 based on actual data range
    const normalized = range > 0 ? (sharpe - minSharpe) / range : 0.5
    
    // Create smooth gradient from red -> orange -> yellow -> lime -> green
    if (normalized < 0.2) {
      const t = normalized / 0.2
      return `rgba(255, ${Math.round(t * 100)}, ${Math.round(t * 50)}, 0.9)`
    } else if (normalized < 0.4) {
      const t = (normalized - 0.2) / 0.2
      return `rgba(255, ${Math.round(100 + t * 155)}, ${Math.round(50 * (1 - t))}, 0.9)`
    } else if (normalized < 0.6) {
      const t = (normalized - 0.4) / 0.2
      return `rgba(${Math.round(255 - t * 100)}, 255, 0, 0.9)`
    } else if (normalized < 0.8) {
      const t = (normalized - 0.6) / 0.2
      return `rgba(${Math.round(155 - t * 100)}, 255, ${Math.round(t * 80)}, 0.9)`
    } else {
      const t = (normalized - 0.8) / 0.2
      return `rgba(${Math.round(55 - t * 55)}, 255, ${Math.round(80 + t * 56)}, 0.95)`
    }
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

  const SortableHeader = ({ label, sortKey, sortConfig, onSort }) => {
    const isActive = sortConfig.key === sortKey
    return (
      <th onClick={() => onSort(sortKey)} className={styles.sortableHeader}>
        {label}
        <span className={`material-icons ${styles.sortIcon} ${isActive ? styles.active : ''}`}>
          {isActive ? (sortConfig.direction === 'desc' ? 'arrow_downward' : 'arrow_upward') : 'unfold_more'}
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
                        <h4>Sharpe Ratio Heatmap</h4>
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
                                    const sharpe = result?.sharpe_ratio
                                    const isValid = emaShort < emaLong && result
                                    
                                    return (
                                      <div
                                        key={`${emaShort}-${emaLong}`}
                                        className={`${styles.heatmapCell} ${isValid ? styles.valid : ''}`}
                                        style={{ backgroundColor: isValid ? getHeatmapColor(sharpe) : 'transparent' }}
                                        onMouseEnter={() => isValid && setHeatmapHover({ emaShort, emaLong, sharpe, ...result })}
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
                          
                          {/* Hover tooltip */}
                          {heatmapHover && (
                            <div className={styles.heatmapTooltip}>
                              <div className={styles.tooltipHeader}>EMA {heatmapHover.emaShort}/{heatmapHover.emaLong}</div>
                              <div className={styles.tooltipRow}>
                                <span>Sharpe Ratio:</span>
                                <span style={{ color: getSharpeColor(heatmapHover.sharpe) }}>
                                  {heatmapHover.sharpe?.toFixed(3)}
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
                              <div className={styles.tooltipHint}>Click to use in Out-of-Sample</div>
                            </div>
                          )}

                          {/* Color Legend */}
                          <div className={styles.heatmapLegend}>
                            <span className={styles.legendLabel}>Low</span>
                            <div className={styles.legendGradient}></div>
                            <span className={styles.legendLabel}>High</span>
                          </div>
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
                              <SortableHeader label="Short" sortKey="ema_short" sortConfig={inSampleSortConfig} onSort={handleSort} />
                              <SortableHeader label="Long" sortKey="ema_long" sortConfig={inSampleSortConfig} onSort={handleSort} />
                              <SortableHeader label="Sharpe" sortKey="sharpe_ratio" sortConfig={inSampleSortConfig} onSort={handleSort} />
                              <SortableHeader label="Return" sortKey="total_return" sortConfig={inSampleSortConfig} onSort={handleSort} />
                              <SortableHeader label="Max DD" sortKey="max_drawdown" sortConfig={inSampleSortConfig} onSort={handleSort} />
                              <SortableHeader label="Win %" sortKey="win_rate" sortConfig={inSampleSortConfig} onSort={handleSort} />
                              <SortableHeader label="Trades" sortKey="total_trades" sortConfig={inSampleSortConfig} onSort={handleSort} />
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

                {/* EMA Selection */}
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
                  </div>
                  <div className={styles.emaHint}>
                    <span className="material-icons">info</span>
                    Click a row in the In-Sample table or heatmap to auto-fill these values
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
                  <div className={styles.resultCard}>
                    <div className={styles.resultCardHeader}>
                      <span className="material-icons">analytics</span>
                      Validation Results
                    </div>
                    <div className={styles.resultCardBody}>
                      <div className={styles.mainMetric}>
                        <span className={styles.metricLabel}>Sharpe Ratio</span>
                        <span className={styles.metricValue} style={{ color: getSharpeColor(outSampleResult.sharpe_ratio) }}>
                          {outSampleResult.sharpe_ratio?.toFixed(3)}
                        </span>
                      </div>
                      <div className={styles.metricsGrid}>
                        <div className={styles.metricItem}>
                          <span className={styles.metricLabel}>Total Return</span>
                          <span className={`${styles.metricValue} ${outSampleResult.total_return >= 0 ? styles.positive : styles.negative}`}>
                            {(outSampleResult.total_return * 100).toFixed(2)}%
                          </span>
                        </div>
                        <div className={styles.metricItem}>
                          <span className={styles.metricLabel}>Max Drawdown</span>
                          <span className={`${styles.metricValue} ${styles.negative}`}>
                            {(outSampleResult.max_drawdown * 100).toFixed(2)}%
                          </span>
                        </div>
                        <div className={styles.metricItem}>
                          <span className={styles.metricLabel}>Win Rate</span>
                          <span className={styles.metricValue}>
                            {(outSampleResult.win_rate * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className={styles.metricItem}>
                          <span className={styles.metricLabel}>Trades</span>
                          <span className={styles.metricValue}>
                            {outSampleResult.total_trades}
                          </span>
                        </div>
                      </div>
                      <div className={styles.periodInfo}>
                        <span className="material-icons">date_range</span>
                        {outSampleResult.period}
                      </div>
                      <div className={styles.strategyInfo}>
                        <span className="material-icons">show_chart</span>
                        EMA {outSampleResult.ema_short}/{outSampleResult.ema_long} on {symbol} ({interval})
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
