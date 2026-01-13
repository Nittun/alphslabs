'use client'

import { useState, useEffect, memo, useCallback } from 'react'
import Swal from 'sweetalert2'
import styles from './MyStrategiesSection.module.css'

// ============================================
// MY STRATEGIES SECTION
// Component for Profile page to manage saved strategies
// ============================================

function MyStrategiesSection({
  strategies = [],
  isLoading = false,
  onEdit,
  onDuplicate,
  onDelete,
  onCreateNew,
  onRefresh,
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('updatedAt') // 'updatedAt', 'name', 'createdAt'
  const [sortOrder, setSortOrder] = useState('desc')

  // Filter and sort strategies
  const filteredStrategies = strategies
    .filter(s => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      return (
        s.name?.toLowerCase().includes(query) ||
        s.description?.toLowerCase().includes(query)
      )
    })
    .sort((a, b) => {
      let aVal = a[sortBy]
      let bVal = b[sortBy]
      
      if (sortBy === 'name') {
        aVal = aVal?.toLowerCase() || ''
        bVal = bVal?.toLowerCase() || ''
      } else {
        aVal = new Date(aVal || 0).getTime()
        bVal = new Date(bVal || 0).getTime()
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1
      }
      return aVal < bVal ? 1 : -1
    })

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getIndicatorsList = (strategy) => {
    if (!strategy?.dsl?.indicators) return []
    return [...new Set(Object.values(strategy.dsl.indicators).map(i => i.type))]
  }

  const generatePreview = (strategy) => {
    if (!strategy?.dsl) return 'No conditions defined'
    
    const { entry, exit, indicators } = strategy.dsl
    const parts = []
    
    if (entry) {
      const entryText = parseCondition(entry, indicators)
      parts.push(`Enter: ${entryText}`)
    }
    
    if (exit) {
      const exitText = parseCondition(exit, indicators)
      parts.push(`Exit: ${exitText}`)
    }
    
    return parts.join(' | ') || 'No conditions defined'
  }

  const parseCondition = (condition, indicators) => {
    if (!condition) return '?'
    
    if (condition.all) {
      return condition.all.map(c => parseCondition(c, indicators)).join(' AND ')
    }
    if (condition.any) {
      return condition.any.map(c => parseCondition(c, indicators)).join(' OR ')
    }
    
    const { op, left, right, value } = condition
    
    if (op === 'stopLossPct') return `SL ${value}%`
    if (op === 'takeProfitPct') return `TP ${value}%`
    
    const leftStr = indicators?.[left] 
      ? `${indicators[left].type}(${indicators[left].length || indicators[left].window})` 
      : left
    const rightStr = typeof right === 'number' 
      ? right 
      : indicators?.[right] 
        ? `${indicators[right].type}(${indicators[right].length || indicators[right].window})` 
        : right
    
    const opMap = {
      '>': '>',
      '<': '<',
      '>=': '≥',
      '<=': '≤',
      'crossesAbove': '↑',
      'crossesBelow': '↓',
      'equals': '=',
    }
    
    return `${leftStr} ${opMap[op] || op} ${rightStr}`
  }

  const handleDelete = useCallback(async (strategy) => {
    const result = await Swal.fire({
      title: 'Delete Strategy?',
      text: `Are you sure you want to delete "${strategy.name}"? This action cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      background: '#1a1a2e',
      color: '#fff',
    })

    if (result.isConfirmed) {
      onDelete?.(strategy.id)
    }
  }, [onDelete])

  const handleDuplicate = useCallback(async (strategy) => {
    const { value: newName } = await Swal.fire({
      title: 'Duplicate Strategy',
      input: 'text',
      inputLabel: 'Enter a name for the copy',
      inputValue: `${strategy.name} (Copy)`,
      showCancelButton: true,
      confirmButtonColor: '#8b5cf6',
      cancelButtonColor: '#6b7280',
      background: '#1a1a2e',
      color: '#fff',
      inputValidator: (value) => {
        if (!value) {
          return 'Please enter a name'
        }
      }
    })

    if (newName) {
      onDuplicate?.(strategy.id, newName)
    }
  }, [onDuplicate])

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h3 className={styles.title}>
            <span className="material-icons">psychology</span>
            My Strategies
          </h3>
          <span className={styles.count}>{strategies.length} saved</span>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.refreshBtn} onClick={onRefresh} title="Refresh">
            <span className="material-icons">refresh</span>
          </button>
          <button className={styles.createBtn} onClick={onCreateNew}>
            <span className="material-icons">add</span>
            Create New
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <span className="material-icons">search</span>
          <input
            type="text"
            placeholder="Search strategies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              className={styles.clearSearch}
              onClick={() => setSearchQuery('')}
            >
              <span className="material-icons">close</span>
            </button>
          )}
        </div>
        <div className={styles.sortBtns}>
          <button
            className={`${styles.sortBtn} ${sortBy === 'updatedAt' ? styles.active : ''}`}
            onClick={() => toggleSort('updatedAt')}
          >
            Last Updated
            {sortBy === 'updatedAt' && (
              <span className="material-icons">
                {sortOrder === 'desc' ? 'arrow_downward' : 'arrow_upward'}
              </span>
            )}
          </button>
          <button
            className={`${styles.sortBtn} ${sortBy === 'name' ? styles.active : ''}`}
            onClick={() => toggleSort('name')}
          >
            Name
            {sortBy === 'name' && (
              <span className="material-icons">
                {sortOrder === 'desc' ? 'arrow_downward' : 'arrow_upward'}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Strategy List */}
      <div className={styles.strategyList}>
        {isLoading ? (
          <div className={styles.loading}>
            <span className="material-icons">hourglass_empty</span>
            Loading strategies...
          </div>
        ) : filteredStrategies.length === 0 ? (
          <div className={styles.emptyState}>
            {searchQuery ? (
              <>
                <span className="material-icons">search_off</span>
                <p>No strategies match "{searchQuery}"</p>
              </>
            ) : (
              <>
                <span className="material-icons">folder_open</span>
                <p>No saved strategies yet</p>
                <p className={styles.emptyHint}>
                  Create your first strategy in the Indicator Sandbox
                </p>
              </>
            )}
          </div>
        ) : (
          filteredStrategies.map((strategy) => (
            <div key={strategy.id} className={styles.strategyCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>
                  <span className="material-icons">description</span>
                  {strategy.name}
                </div>
                <div className={styles.cardMeta}>
                  <span className={styles.metaItem}>
                    <span className="material-icons">schedule</span>
                    {formatDate(strategy.updatedAt)}
                  </span>
                </div>
              </div>

              {strategy.description && (
                <p className={styles.cardDescription}>{strategy.description}</p>
              )}

              {/* Indicators Used */}
              <div className={styles.indicatorTags}>
                {getIndicatorsList(strategy).map((ind, idx) => (
                  <span key={idx} className={styles.indicatorTag}>
                    {ind}
                  </span>
                ))}
                {getIndicatorsList(strategy).length === 0 && (
                  <span className={styles.noIndicators}>No indicators</span>
                )}
              </div>

              {/* Condition Preview */}
              <div className={styles.conditionPreview}>
                {generatePreview(strategy)}
              </div>

              {/* Actions */}
              <div className={styles.cardActions}>
                <button
                  className={`${styles.actionBtn} ${styles.editBtn}`}
                  onClick={() => onEdit?.(strategy.id)}
                >
                  <span className="material-icons">edit</span>
                  Edit
                </button>
                <button
                  className={`${styles.actionBtn} ${styles.duplicateBtn}`}
                  onClick={() => handleDuplicate(strategy)}
                >
                  <span className="material-icons">content_copy</span>
                  Duplicate
                </button>
                <button
                  className={`${styles.actionBtn} ${styles.deleteBtn}`}
                  onClick={() => handleDelete(strategy)}
                >
                  <span className="material-icons">delete</span>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default memo(MyStrategiesSection)
