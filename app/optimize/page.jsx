'use client'

import { useState, useEffect } from 'react'
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
  
  // Results state
  const [isCalculating, setIsCalculating] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(0)

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
      // Remove from out-sample if it's there
      setOutSampleYears(outSampleYears.filter(y => y !== year))
      setInSampleYears([...inSampleYears, year].sort((a, b) => a - b))
    }
  }

  const toggleOutSampleYear = (year) => {
    if (outSampleYears.includes(year)) {
      setOutSampleYears(outSampleYears.filter(y => y !== year))
    } else {
      // Remove from in-sample if it's there
      setInSampleYears(inSampleYears.filter(y => y !== year))
      setOutSampleYears([...outSampleYears, year].sort((a, b) => a - b))
    }
  }

  const calculateOptimization = async () => {
    if (inSampleYears.length === 0) {
      setError('Please select at least one year for In-Sample testing')
      return
    }
    if (outSampleYears.length === 0) {
      setError('Please select at least one year for Out-of-Sample testing')
      return
    }

    setIsCalculating(true)
    setError(null)
    setResults(null)
    setProgress(0)

    try {
      const response = await fetch(`${API_URL}/api/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol,
          interval,
          in_sample_years: inSampleYears.sort((a, b) => a - b),
          out_sample_years: outSampleYears.sort((a, b) => a - b),
          max_ema_short: maxEmaShort,
          max_ema_long: maxEmaLong,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to calculate optimization')
      }

      const data = await response.json()
      setResults(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsCalculating(false)
      setProgress(100)
    }
  }

  const getBestResult = (data, type) => {
    if (!data || !data[type] || data[type].length === 0) return null
    return data[type].reduce((best, current) => 
      current.sharpe_ratio > best.sharpe_ratio ? current : best
    , data[type][0])
  }

  const getSharpeColor = (sharpe) => {
    if (sharpe >= 2) return '#00ff88'
    if (sharpe >= 1) return '#88ff00'
    if (sharpe >= 0.5) return '#ffcc00'
    if (sharpe >= 0) return '#ff8800'
    return '#ff4444'
  }

  if (status === 'loading') {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner}></div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <div className={styles.dashboard}>
      <Sidebar onCollapseChange={setSidebarCollapsed} />
      <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <TopBar sidebarCollapsed={sidebarCollapsed} />
        <div className={styles.content}>
          {/* Header */}
          <div className={styles.headerSection}>
            <div>
              <h1>Strategy Optimizer</h1>
              <p className={styles.subtitle}>Find the optimal EMA parameters for your trading strategy</p>
            </div>
          </div>

          {/* Configuration */}
          <div className={styles.configSection}>
            <div className={styles.configCard}>
              <h3>
                <span className="material-icons">tune</span>
                Optimization Parameters
              </h3>
              
              <div className={styles.configGrid}>
                <div className={styles.formGroup}>
                  <label>Trading Pair</label>
                  <select 
                    value={symbol} 
                    onChange={(e) => setSymbol(e.target.value)}
                    className={styles.select}
                  >
                    {symbols.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Timeframe</label>
                  <select 
                    value={interval} 
                    onChange={(e) => setInterval(e.target.value)}
                    className={styles.select}
                  >
                    {intervals.map(i => (
                      <option key={i.value} value={i.value}>{i.label}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Max Short EMA</label>
                  <input 
                    type="number" 
                    value={maxEmaShort}
                    onChange={(e) => setMaxEmaShort(Number(e.target.value))}
                    min={5}
                    max={50}
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Max Long EMA</label>
                  <input 
                    type="number" 
                    value={maxEmaLong}
                    onChange={(e) => setMaxEmaLong(Number(e.target.value))}
                    min={20}
                    max={200}
                    className={styles.input}
                  />
                </div>
              </div>

              {/* Year Selection */}
              <div className={styles.yearSelectionSection}>
                <div className={styles.yearSelectionHeader}>
                  <h4>
                    <span className="material-icons">calendar_month</span>
                    Select Years for Testing
                  </h4>
                  <p className={styles.yearHint}>
                    Click to assign each year to In-Sample (training) or Out-of-Sample (validation)
                  </p>
                </div>

                <div className={styles.yearGrid}>
                  {availableYears.map(year => {
                    const isInSample = inSampleYears.includes(year)
                    const isOutSample = outSampleYears.includes(year)
                    return (
                      <div key={year} className={styles.yearItem}>
                        <span className={styles.yearLabel}>{year}</span>
                        <div className={styles.yearButtons}>
                          <button
                            className={`${styles.yearButton} ${styles.inSampleButton} ${isInSample ? styles.active : ''}`}
                            onClick={() => toggleInSampleYear(year)}
                            title="In-Sample (Training)"
                          >
                            <span className="material-icons">science</span>
                            IS
                          </button>
                          <button
                            className={`${styles.yearButton} ${styles.outSampleButton} ${isOutSample ? styles.active : ''}`}
                            onClick={() => toggleOutSampleYear(year)}
                            title="Out-of-Sample (Validation)"
                          >
                            <span className="material-icons">verified</span>
                            OS
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className={styles.selectedSummary}>
                  <div className={styles.selectedGroup}>
                    <span className={styles.selectedLabel}>
                      <span className="material-icons">science</span>
                      In-Sample:
                    </span>
                    <span className={styles.selectedYears}>
                      {inSampleYears.length > 0 
                        ? inSampleYears.sort((a, b) => a - b).join(', ')
                        : 'None selected'}
                    </span>
                  </div>
                  <div className={styles.selectedGroup}>
                    <span className={styles.selectedLabel}>
                      <span className="material-icons">verified</span>
                      Out-of-Sample:
                    </span>
                    <span className={styles.selectedYears}>
                      {outSampleYears.length > 0 
                        ? outSampleYears.sort((a, b) => a - b).join(', ')
                        : 'None selected'}
                    </span>
                  </div>
                </div>
              </div>

              <button 
                className={styles.calculateButton}
                onClick={calculateOptimization}
                disabled={isCalculating || inSampleYears.length === 0 || outSampleYears.length === 0}
              >
                {isCalculating ? (
                  <>
                    <span className={`material-icons ${styles.spinning}`}>sync</span>
                    Calculating...
                  </>
                ) : (
                  <>
                    <span className="material-icons">calculate</span>
                    Run Optimization
                  </>
                )}
              </button>

              {isCalculating && (
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${progress}%` }}></div>
                </div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className={styles.errorMessage}>
              <span className="material-icons">error</span>
              {error}
            </div>
          )}

          {/* Results */}
          {results && (
            <div className={styles.resultsSection}>
              {/* Best Results Summary */}
              <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryHeader}>
                    <span className="material-icons">star</span>
                    Best In-Sample
                  </div>
                  {getBestResult(results, 'in_sample') && (
                    <div className={styles.summaryContent}>
                      <div className={styles.summaryValue}>
                        EMA {getBestResult(results, 'in_sample').ema_short}/{getBestResult(results, 'in_sample').ema_long}
                      </div>
                      <div className={styles.summaryMetric}>
                        Sharpe: <span style={{ color: getSharpeColor(getBestResult(results, 'in_sample').sharpe_ratio) }}>
                          {getBestResult(results, 'in_sample').sharpe_ratio.toFixed(3)}
                        </span>
                      </div>
                      <div className={styles.summaryMetric}>
                        Return: <span className={getBestResult(results, 'in_sample').total_return >= 0 ? styles.positive : styles.negative}>
                          {(getBestResult(results, 'in_sample').total_return * 100).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.summaryCard}>
                  <div className={styles.summaryHeader}>
                    <span className="material-icons">verified</span>
                    Best Out-of-Sample
                  </div>
                  {getBestResult(results, 'out_sample') && (
                    <div className={styles.summaryContent}>
                      <div className={styles.summaryValue}>
                        EMA {getBestResult(results, 'out_sample').ema_short}/{getBestResult(results, 'out_sample').ema_long}
                      </div>
                      <div className={styles.summaryMetric}>
                        Sharpe: <span style={{ color: getSharpeColor(getBestResult(results, 'out_sample').sharpe_ratio) }}>
                          {getBestResult(results, 'out_sample').sharpe_ratio.toFixed(3)}
                        </span>
                      </div>
                      <div className={styles.summaryMetric}>
                        Return: <span className={getBestResult(results, 'out_sample').total_return >= 0 ? styles.positive : styles.negative}>
                          {(getBestResult(results, 'out_sample').total_return * 100).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.summaryCard}>
                  <div className={styles.summaryHeader}>
                    <span className="material-icons">info</span>
                    Test Info
                  </div>
                  <div className={styles.summaryContent}>
                    <div className={styles.summaryMetric}>
                      Combinations Tested: <span>{results.combinations_tested}</span>
                    </div>
                    <div className={styles.summaryMetric}>
                      In-Sample: <span>{results.in_sample_period}</span>
                    </div>
                    <div className={styles.summaryMetric}>
                      Out-Sample: <span>{results.out_sample_period}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Results Tables */}
              <div className={styles.tablesGrid}>
                {/* In-Sample Results */}
                <div className={styles.tableCard}>
                  <h3>
                    <span className="material-icons">science</span>
                    In-Sample Results (Training Data)
                  </h3>
                  <div className={styles.tableContainer}>
                    <table className={styles.resultsTable}>
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>EMA Short</th>
                          <th>EMA Long</th>
                          <th>Sharpe Ratio</th>
                          <th>Total Return</th>
                          <th>Max Drawdown</th>
                          <th>Win Rate</th>
                          <th>Trades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.in_sample?.slice(0, 20).map((row, index) => (
                          <tr key={index} className={index === 0 ? styles.bestRow : ''}>
                            <td>{index + 1}</td>
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

                {/* Out-of-Sample Results */}
                <div className={styles.tableCard}>
                  <h3>
                    <span className="material-icons">verified</span>
                    Out-of-Sample Results (Validation Data)
                  </h3>
                  <div className={styles.tableContainer}>
                    <table className={styles.resultsTable}>
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>EMA Short</th>
                          <th>EMA Long</th>
                          <th>Sharpe Ratio</th>
                          <th>Total Return</th>
                          <th>Max Drawdown</th>
                          <th>Win Rate</th>
                          <th>Trades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.out_sample?.slice(0, 20).map((row, index) => (
                          <tr key={index} className={index === 0 ? styles.bestRow : ''}>
                            <td>{index + 1}</td>
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

              {/* Heatmap Visualization */}
              {results.heatmap && (
                <div className={styles.heatmapSection}>
                  <div className={styles.heatmapCard}>
                    <h3>
                      <span className="material-icons">grid_on</span>
                      Sharpe Ratio Heatmap (In-Sample)
                    </h3>
                    <div className={styles.heatmapContainer}>
                      <div className={styles.heatmapLabels}>
                        <span className={styles.yLabel}>EMA Long ↓</span>
                        <span className={styles.xLabel}>EMA Short →</span>
                      </div>
                      <div className={styles.heatmap}>
                        {results.heatmap.map((row, i) => (
                          <div key={i} className={styles.heatmapRow}>
                            {row.map((cell, j) => (
                              <div 
                                key={j} 
                                className={styles.heatmapCell}
                                style={{ 
                                  backgroundColor: cell !== null 
                                    ? `rgba(68, 136, 255, ${Math.min(Math.max(cell / 3, 0), 1)})`
                                    : '#1a1a1a'
                                }}
                                title={cell !== null ? `Sharpe: ${cell.toFixed(3)}` : 'N/A'}
                              >
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className={styles.heatmapLegend}>
                        <span>Low</span>
                        <div className={styles.legendGradient}></div>
                        <span>High</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty State */}
          {!results && !isCalculating && !error && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <span className="material-icons">auto_graph</span>
              </div>
              <h2>Ready to Optimize</h2>
              <p>Select years for In-Sample and Out-of-Sample testing, then click "Run Optimization" to find the best EMA settings.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
