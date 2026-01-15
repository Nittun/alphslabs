'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import TradeDetailModal from './TradeDetailModal'
import { API_URL } from '@/lib/api'
import styles from './LogSection.module.css'

export default function LogSection({
  backtestTrades = [],
  openPosition = null,
  onExport = null,
  onDeleteTrade = null,
  compact = false,
  hideHeader = false,
  clearToken = null,
}) {
  const [logs, setLogs] = useState([])
  const [newLog, setNewLog] = useState('')
  const [logType, setLogType] = useState('info')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedTrade, setSelectedTrade] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [positionFilter, setPositionFilter] = useState('all') // 'all', 'long', 'short'
  const [dateSort, setDateSort] = useState('latest') // 'latest', 'earliest'
  const [pnlSort, setPnlSort] = useState('none') // 'none', 'top', 'bottom'
  const logsPerPage = 20
  const lastClearTokenRef = useRef(clearToken)

  // Update logs when backtest trades are received - REPLACE all trade logs with new ones
  useEffect(() => {
    const tradeLogs = []
    
    // Add open position first (if exists) - should be at the top
    if (openPosition) {
      // Use Unrealized_PnL fields for open positions
      const pnlPct = openPosition.Unrealized_PnL_Pct ?? openPosition.PnL_Pct ?? 0
      const pnlAmount = openPosition.Unrealized_PnL ?? openPosition.PnL ?? 0
      // Always calculate holding days dynamically for open positions based on current date
      const holdingDays = openPosition.Entry_Date 
        ? Math.floor((Date.now() - new Date(openPosition.Entry_Date).getTime()) / (1000 * 60 * 60 * 24))
        : 0
      
      const emaInfo = openPosition.EMA_Fast_Period && openPosition.EMA_Slow_Period 
        ? ` | EMA(${openPosition.EMA_Fast_Period}/${openPosition.EMA_Slow_Period})` 
        : ''
      
      const holdingLog = {
        id: `holding-${openPosition.Entry_Date}`,
        timestamp: new Date(openPosition.Entry_Date).toLocaleString(),
        message: `${openPosition.Position_Type} HOLDING: Entry $${(openPosition.Entry_Price || 0).toFixed(2)} → Current $${(openPosition.Current_Price || 0).toFixed(2)} | SL: $${openPosition.Stop_Loss?.toFixed(2) || 'N/A'} | Unrealized P&L: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%${emaInfo}`,
        type: pnlAmount >= 0 ? 'success' : 'error',
        isHolding: true,
        // Store full position data for modal
        positionType: openPosition.Position_Type,
        entryDate: openPosition.Entry_Date,
        exitDate: null,
        entryPrice: openPosition.Entry_Price,
        exitPrice: null,
        currentPrice: openPosition.Current_Price,
        stopLoss: openPosition.Stop_Loss,
        stopLossHit: false,
        pnlPct: pnlPct,
        pnlAmount: pnlAmount,
        entryReason: openPosition.Entry_Reason,
        exitReason: null,
        interval: openPosition.Interval,
        emaFastPeriod: openPosition.EMA_Fast_Period,
        emaSlowPeriod: openPosition.EMA_Slow_Period,
        entryEmaFast: openPosition.Entry_EMA_Fast,
        entryEmaSlow: openPosition.Entry_EMA_Slow,
        holdingDays: holdingDays,
        status: 'HOLDING',
        shouldExit: openPosition.Should_Exit || false,
        exitReasonForExit: openPosition.Exit_Reason || null,
        lastUpdate: openPosition.Last_Update || openPosition.last_update || null,
      }
      tradeLogs.push(holdingLog)
    }
    
    // Add closed trades
    if (backtestTrades && Array.isArray(backtestTrades) && backtestTrades.length > 0) {
      const closedTradeLogs = backtestTrades.map((trade, index) => {
        const tradeEmaInfo = trade.EMA_Fast_Period && trade.EMA_Slow_Period 
          ? ` | EMA(${trade.EMA_Fast_Period}/${trade.EMA_Slow_Period})` 
          : ''
        
        // Add exit reason to message if available
        const exitReasonText = trade.Exit_Reason ? ` | ${trade.Exit_Reason}` : ''
        
        return {
        id: `trade-${trade.Entry_Date}-${trade.Exit_Date}-${index}`,
        timestamp: new Date(trade.Entry_Date).toLocaleString(),
        message: `${trade.Position_Type} ${trade.PnL >= 0 ? 'WIN' : 'LOSS'}: Entry $${trade.Entry_Price.toFixed(2)} → Exit $${trade.Exit_Price.toFixed(2)} | P&L: ${trade.PnL_Pct >= 0 ? '+' : ''}${trade.PnL_Pct.toFixed(2)}%${exitReasonText}${tradeEmaInfo}`,
        type: trade.PnL >= 0 ? 'success' : 'error',
        isHolding: false,
        // Store full trade data for modal
        positionType: trade.Position_Type,
        entryDate: trade.Entry_Date,
        exitDate: trade.Exit_Date,
        entryPrice: trade.Entry_Price,
        exitPrice: trade.Exit_Price,
        stopLoss: trade.Stop_Loss,
        stopLossHit: trade.Stop_Loss_Hit,
        pnlPct: trade.PnL_Pct,
        pnlAmount: trade.PnL,
        entryReason: trade.Entry_Reason,
        exitReason: trade.Exit_Reason,
        interval: trade.Interval,
        emaFastPeriod: trade.EMA_Fast_Period,
        emaSlowPeriod: trade.EMA_Slow_Period,
        entryEmaFast: trade.Entry_EMA_Fast,
        entryEmaSlow: trade.Entry_EMA_Slow,
        exitEmaFast: trade.Exit_EMA_Fast,
        exitEmaSlow: trade.Exit_EMA_Slow,
        holdingDays: trade.Holding_Days,
        isHolding: false,
      }})
      tradeLogs.push(...closedTradeLogs)
    }
    
    // REPLACE logs with new trade logs (keep only manual logs that are not trades)
    setLogs((prevLogs) => {
      // Keep only manual logs (non-trade logs without positionType)
      const manualLogs = prevLogs.filter(log => !log.positionType)
      // Combine: trade logs first (holding at top), then manual logs
      return [...tradeLogs, ...manualLogs]
    })
  }, [backtestTrades, openPosition])

  const handleTradeClick = (log, event) => {
    // Only handle trade logs (not manual logs)
    if (log.positionType) {
      // Open modal directly
      setSelectedTrade(log)
      setIsModalOpen(true)
    }
  }

  const handleDeleteTrade = (log, event) => {
    event.stopPropagation() // Prevent opening modal
    if (onDeleteTrade && log.positionType) {
      // Pass the trade data to parent for deletion
      onDeleteTrade(log)
    }
  }

  const addLog = () => {
    if (!newLog.trim()) return

    const logEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleString(),
      message: newLog,
      type: logType,
    }

    setLogs([logEntry, ...logs])
    setNewLog('')
  }

  const clearLogs = () => {
    setLogs([])
  }

  // Allow parent to trigger clear (used for fullscreen trade log header)
  useEffect(() => {
    if (clearToken === null || clearToken === undefined) return
    if (lastClearTokenRef.current === clearToken) return
    lastClearTokenRef.current = clearToken
    clearLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearToken])

  const getLogColor = (type) => {
    switch (type) {
      case 'error':
        return '#ff4444'
      case 'warning':
        return '#ffaa00'
      case 'success':
        return '#00ff88'
      default:
        return '#4488ff'
    }
  }

  // Filter and sort logic
  const filteredAndSortedLogs = useMemo(() => {
    let result = [...logs]

    // Filter by position type (only for trade logs)
    // Always show holding positions regardless of filter
    if (positionFilter !== 'all') {
      result = result.filter(log => {
        if (!log.positionType) return true // Keep non-trade logs
        if (log.isHolding) return true // Always show holding positions
        return log.positionType.toLowerCase() === positionFilter.toLowerCase()
      })
    }

    // Separate trade logs and non-trade logs
    const tradeLogs = result.filter(log => log.positionType)
    const nonTradeLogs = result.filter(log => !log.positionType)
    
    // Separate holding positions from closed trades for sorting
    const holdingLogs = tradeLogs.filter(log => log.isHolding)
    const closedTradeLogs = tradeLogs.filter(log => !log.isHolding)

    // Sort closed trade logs (holding positions stay at top, not sorted)
    if (closedTradeLogs.length > 0) {
      closedTradeLogs.sort((a, b) => {
        // If P&L sort is selected, prioritize it
        if (pnlSort !== 'none') {
          const pnlA = a.pnlPct || 0
          const pnlB = b.pnlPct || 0
          const pnlDiff = pnlSort === 'top' ? pnlB - pnlA : pnlA - pnlB
          
          // If P&L is different, use it; otherwise use date as secondary sort
          if (Math.abs(pnlDiff) > 0.001) {
            return pnlDiff
          }
        }
        
        // Sort by date (primary if no P&L sort, secondary if P&L is equal)
        const dateA = new Date(a.entryDate || a.timestamp).getTime()
        const dateB = new Date(b.entryDate || b.timestamp).getTime()
        return dateSort === 'latest' ? dateB - dateA : dateA - dateB
      })
    }

    // Sort non-trade logs by timestamp (latest first)
    nonTradeLogs.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime()
      const dateB = new Date(b.timestamp).getTime()
      return dateB - dateA
    })

    // Combine: holding positions first, then closed trades, then non-trade logs
    return [...holdingLogs, ...closedTradeLogs, ...nonTradeLogs]
  }, [logs, positionFilter, dateSort, pnlSort])

  // Pagination logic
  const totalPages = Math.ceil(filteredAndSortedLogs.length / logsPerPage)
  const startIndex = (currentPage - 1) * logsPerPage
  const endIndex = startIndex + logsPerPage
  const currentLogs = useMemo(() => {
    return filteredAndSortedLogs.slice(startIndex, endIndex)
  }, [filteredAndSortedLogs, startIndex, endIndex])

  // Reset to page 1 when logs, filters, or sorts change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1)
    }
  }, [filteredAndSortedLogs.length, currentPage, totalPages, positionFilter, dateSort, pnlSort])

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  const exportToCSV = async () => {
    // If custom onExport callback is provided (for manual mode), use it
    if (onExport) {
      onExport()
      return
    }

    // Otherwise, use the backend API (for auto mode)
    try {
      const response = await fetch(`${API_URL}/api/export-backtest-csv`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `backtest_${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        // Safely remove the anchor element
        if (a.parentNode) {
          a.parentNode.removeChild(a)
        }
      } else {
        const error = await response.json()
        alert(`Export failed: ${error.message || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error exporting CSV:', error)
      alert('Error exporting CSV. Make sure the API server is running.')
    }
  }

  return (
    <div className={`${styles.logSection} ${compact ? styles.compact : ''}`}>
      {!hideHeader && (
        <div className={styles.logHeader}>
          <h2>Trade Log</h2>
          <div className={styles.headerButtons}>
            {backtestTrades && backtestTrades.length > 0 && (
              <button onClick={exportToCSV} className={styles.exportButton}>
                Export CSV
              </button>
            )}
            <button onClick={clearLogs} className={styles.clearButton}>
              Clear Logs
            </button>
          </div>
        </div>
      )}

      {/* Filter and Sort Controls */}
      {!compact && (
        <div className={styles.filterSection}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Position:</label>
            <select
              value={positionFilter}
              onChange={(e) => {
                setPositionFilter(e.target.value)
                setCurrentPage(1)
              }}
              className={styles.filterSelect}
            >
              <option value="all">All</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Date:</label>
            <select
              value={dateSort}
              onChange={(e) => {
                setDateSort(e.target.value)
                setCurrentPage(1)
              }}
              className={styles.filterSelect}
            >
              <option value="latest">Latest First</option>
              <option value="earliest">Earliest First</option>
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>P&L:</label>
            <select
              value={pnlSort}
              onChange={(e) => {
                setPnlSort(e.target.value)
                setCurrentPage(1)
              }}
              className={styles.filterSelect}
            >
              <option value="none">None</option>
              <option value="top">Top %</option>
              <option value="bottom">Bottom %</option>
            </select>
          </div>
        </div>
      )}

      {!compact && (
        <div className={styles.logInputSection}>
          <select
            value={logType}
            onChange={(e) => setLogType(e.target.value)}
            className={styles.logTypeSelect}
          >
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
          <input
            type="text"
            value={newLog}
            onChange={(e) => setNewLog(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addLog()}
            placeholder="Enter log message..."
            className={styles.logInput}
          />
          <button onClick={addLog} className={styles.addLogButton}>
            Add Log
          </button>
        </div>
      )}

      <div className={styles.logList}>
        {currentLogs.length === 0 ? (
          <div className={styles.logEmpty}>
            {filteredAndSortedLogs.length === 0 && logs.length > 0
              ? 'No trades match the current filters.'
              : 'No logs yet. Add your first log entry above.'}
          </div>
        ) : (
          currentLogs.map((log) => {
            const isTrade = !!log.positionType
            const isHolding = log.isHolding
            return (
              <div
                key={log.id}
                className={`${styles.logEntry} ${isTrade ? styles.tradeEntry : ''} ${isHolding ? styles.holdingEntry : ''}`}
                onClick={(e) => isTrade && handleTradeClick(log, e)}
                style={{ cursor: isTrade ? 'pointer' : 'default' }}
              >
                {isTrade ? (
                  <>
                    <div className={styles.tradeOverview}>
                      <span className={`${styles.positionType} ${styles[log.positionType.toLowerCase()]}`}>
                        {log.positionType}
                      </span>
                      {isHolding ? (
                        <>
                          <span className={`${styles.winLoss} ${styles.holding} ${log.shouldExit ? styles.shouldExit : ''}`}>
                            HOLDING {log.shouldExit ? '⚠️' : ''}
                          </span>
                          {log.shouldExit && (
                            <span className={styles.exitWarning} title={log.exitReasonForExit || 'Position should be closed'}>
                              Exit: {log.exitReasonForExit || 'N/A'}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className={`${styles.winLoss} ${styles[log.type === 'success' ? 'win' : 'loss']}`}>
                            {log.type === 'success' ? 'WIN' : 'LOSS'}
                          </span>
                          {log.stopLossHit && (
                            <span className={styles.stopLossBadge} title="Stop Loss Hit">
                              <span className="material-icons" style={{ fontSize: '12px', marginRight: '2px' }}>bolt</span>
                              STOP LOSS
                            </span>
                          )}
                        </>
                      )}
                      <span className={styles.pnl}>
                        {log.pnlPct >= 0 ? '+' : ''}{log.pnlPct?.toFixed(2) || '0.00'}%
                        {isHolding && <span className={styles.unrealizedLabel}> (unrealized)</span>}
                      </span>
                    </div>
                    <div className={styles.tradeActions}>
                      <div className={styles.tradeTimestamp}>
                        {isHolding && log.lastUpdate ? (
                          <>
                            Entry: {log.timestamp} | Last Update: {new Date(log.lastUpdate).toLocaleTimeString()}
                          </>
                        ) : (
                          log.timestamp
                        )}
                      </div>
                      {onDeleteTrade && (
                        <button
                          className={styles.deleteTradeButton}
                          onClick={(e) => handleDeleteTrade(log, e)}
                          title="Delete trade"
                        >
                          <span className="material-icons">delete</span>
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.logTimestamp}>{log.timestamp}</div>
                    <div
                      className={styles.logTypeBadge}
                      style={{ backgroundColor: getLogColor(log.type) }}
                    >
                      {log.type.toUpperCase()}
                    </div>
                    <div className={styles.logMessage}>{log.message}</div>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>

      {filteredAndSortedLogs.length > logsPerPage && (
        <div className={styles.pagination}>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className={styles.pageButton}
          >
            ← Previous
          </button>
          <span className={styles.pageInfo}>
            Page {currentPage} of {totalPages} ({filteredAndSortedLogs.length} filtered logs)
          </span>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={styles.pageButton}
          >
            Next →
          </button>
        </div>
      )}

      <TradeDetailModal
        trade={selectedTrade}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setSelectedTrade(null)
        }}
      />
    </div>
  )
}

