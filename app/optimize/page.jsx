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
  
  // In-Sample results state
  const [isCalculatingInSample, setIsCalculatingInSample] = useState(false)
  const [inSampleResults, setInSampleResults] = useState(null)
  const [inSampleError, setInSampleError] = useState(null)
  const [inSampleSortConfig, setInSampleSortConfig] = useState({ key: 'sharpe_ratio', direction: 'desc' })
  
  // Out-of-Sample results state
  const [isCalculatingOutSample, setIsCalculatingOutSample] = useState(false)
  const [outSampleResults, setOutSampleResults] = useState(null)
  const [outSampleError, setOutSampleError] = useState(null)
  const [outSampleSortConfig, setOutSampleSortConfig] = useState({ key: 'sharpe_ratio', direction: 'desc' })

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
    setOutSampleResults(null)

    try {
      const response = await fetch(`${API_URL}/api/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          interval,
          years: outSampleYears.sort((a, b) => a - b),
          max_ema_short: maxEmaShort,
          max_ema_long: maxEmaLong,
          sample_type: 'out_sample',
        }),
      })

      if (!response.ok) throw new Error('Failed to calculate optimization')
      const data = await response.json()
      setOutSampleResults(data)
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

  const sortedOutSampleResults = useMemo(() => {
    return sortData(outSampleResults?.results, outSampleSortConfig)
  }, [outSampleResults, outSampleSortConfig])

  const handleSort = (key, isInSample) => {
    if (isInSample) {
      setInSampleSortConfig(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
      }))
    } else {
      setOutSampleSortConfig(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
      }))
    }
  }

  const getSharpeColor = (sharpe) => {
    if (sharpe >= 2) return '#00ff88'
    if (sharpe >= 1) return '#88ff00'
    if (sharpe >= 0.5) return '#ffcc00'
    if (sharpe >= 0) return '#ff8800'
    return '#ff4444'
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

  const ResultsTable = ({ data, sortConfig, onSort, isInSample }) => (
    <div className={styles.tableContainer}>
      <table className={styles.resultsTable}>
        <thead>
          <tr>
            <SortableHeader label="EMA Short" sortKey="ema_short" sortConfig={sortConfig} onSort={(key) => onSort(key, isInSample)} />
            <SortableHeader label="EMA Long" sortKey="ema_long" sortConfig={sortConfig} onSort={(key) => onSort(key, isInSample)} />
            <SortableHeader label="Sharpe Ratio" sortKey="sharpe_ratio" sortConfig={sortConfig} onSort={(key) => onSort(key, isInSample)} />
            <SortableHeader label="Total Return" sortKey="total_return" sortConfig={sortConfig} onSort={(key) => onSort(key, isInSample)} />
            <SortableHeader label="Max Drawdown" sortKey="max_drawdown" sortConfig={sortConfig} onSort={(key) => onSort(key, isInSample)} />
            <SortableHeader label="Win Rate" sortKey="win_rate" sortConfig={sortConfig} onSort={(key) => onSort(key, isInSample)} />
            <SortableHeader label="Trades" sortKey="total_trades" sortConfig={sortConfig} onSort={(key) => onSort(key, isInSample)} />
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={index} className={index === 0 && sortConfig.key === 'sharpe_ratio' && sortConfig.direction === 'desc' ? styles.bestRow : ''}>
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
  )

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

          {/* Two Column Layout for In-Sample and Out-Sample */}
          <div className={styles.sampleGrid}>
            {/* In-Sample Section */}
            <div className={styles.sampleSection}>
              <div className={styles.sampleCard}>
                <div className={styles.sampleHeader}>
                  <h3>
                    <span className="material-icons">science</span>
                    In-Sample (Training Data)
                  </h3>
                </div>

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

                {inSampleError && (
                  <div className={styles.errorMessage}>
                    <span className="material-icons">error</span>
                    {inSampleError}
                  </div>
                )}

                {inSampleResults && (
                  <div className={styles.resultsContainer}>
                    <div className={styles.resultsSummary}>
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Best EMA:</span>
                        <span className={styles.summaryValue}>
                          {sortedInSampleResults[0]?.ema_short}/{sortedInSampleResults[0]?.ema_long}
                        </span>
                      </div>
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Best Sharpe:</span>
                        <span className={styles.summaryValue} style={{ color: getSharpeColor(sortedInSampleResults[0]?.sharpe_ratio || 0) }}>
                          {sortedInSampleResults[0]?.sharpe_ratio?.toFixed(3)}
                        </span>
                      </div>
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Combinations:</span>
                        <span className={styles.summaryValue}>{inSampleResults.combinations_tested}</span>
                      </div>
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Period:</span>
                        <span className={styles.summaryValue}>{inSampleResults.period}</span>
                      </div>
                    </div>
                    <ResultsTable 
                      data={sortedInSampleResults} 
                      sortConfig={inSampleSortConfig} 
                      onSort={handleSort}
                      isInSample={true}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Out-of-Sample Section */}
            <div className={styles.sampleSection}>
              <div className={styles.sampleCard}>
                <div className={styles.sampleHeader}>
                  <h3>
                    <span className="material-icons">verified</span>
                    Out-of-Sample (Validation Data)
                  </h3>
                </div>

                {/* Year Selection */}
                <div className={styles.yearSelection}>
                  <label>Select Years:</label>
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

                <button 
                  className={`${styles.calculateButton} ${styles.outSampleButton}`}
                  onClick={calculateOutSample}
                  disabled={isCalculatingOutSample || outSampleYears.length === 0}
                >
                  {isCalculatingOutSample ? (
                    <><span className={`material-icons ${styles.spinning}`}>sync</span> Calculating...</>
                  ) : (
                    <><span className="material-icons">calculate</span> Calculate Out-of-Sample</>
                  )}
                </button>

                {outSampleError && (
                  <div className={styles.errorMessage}>
                    <span className="material-icons">error</span>
                    {outSampleError}
                  </div>
                )}

                {outSampleResults && (
                  <div className={styles.resultsContainer}>
                    <div className={styles.resultsSummary}>
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Best EMA:</span>
                        <span className={styles.summaryValue}>
                          {sortedOutSampleResults[0]?.ema_short}/{sortedOutSampleResults[0]?.ema_long}
                        </span>
                      </div>
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Best Sharpe:</span>
                        <span className={styles.summaryValue} style={{ color: getSharpeColor(sortedOutSampleResults[0]?.sharpe_ratio || 0) }}>
                          {sortedOutSampleResults[0]?.sharpe_ratio?.toFixed(3)}
                        </span>
                      </div>
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Combinations:</span>
                        <span className={styles.summaryValue}>{outSampleResults.combinations_tested}</span>
                      </div>
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Period:</span>
                        <span className={styles.summaryValue}>{outSampleResults.period}</span>
                      </div>
                    </div>
                    <ResultsTable 
                      data={sortedOutSampleResults} 
                      sortConfig={outSampleSortConfig} 
                      onSort={handleSort}
                      isInSample={false}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
