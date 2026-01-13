'use client'

import { useState, useEffect, memo, useCallback } from 'react'
import styles from './StrategySelectorSection.module.css'

// ============================================
// STRATEGY SELECTOR SECTION
// Reusable component for selecting saved strategies in backtest configs
// ============================================

function StrategySelectorSection({
  strategies = [],
  selectedStrategyId = null,
  onSelectStrategy,
  onEditStrategy,
  onCreateNew,
  isLoading = false,
  useCustomConfig = true,
  onToggleMode,
}) {
  const [previewExpanded, setPreviewExpanded] = useState(false)
  
  const selectedStrategy = strategies.find(s => s.id === selectedStrategyId)

  // Generate human-readable preview from DSL
  const generatePreview = useCallback((strategy) => {
    if (!strategy?.dsl) return 'No strategy defined'
    
    const { entry, exit, indicators } = strategy.dsl
    const parts = []
    
    // Entry conditions
    if (entry) {
      const entryText = parseCondition(entry, indicators)
      parts.push(`Enter when ${entryText}`)
    }
    
    // Exit conditions
    if (exit) {
      const exitText = parseCondition(exit, indicators)
      parts.push(`Exit when ${exitText}`)
    }
    
    return parts.join(' | ') || 'No conditions defined'
  }, [])

  const parseCondition = (condition, indicators) => {
    if (!condition) return '?'
    
    if (condition.all) {
      return condition.all.map(c => parseCondition(c, indicators)).join(' AND ')
    }
    if (condition.any) {
      return condition.any.map(c => parseCondition(c, indicators)).join(' OR ')
    }
    
    const { op, left, right, value } = condition
    
    if (op === 'stopLossPct') return `Stop Loss ${value}%`
    if (op === 'takeProfitPct') return `Take Profit ${value}%`
    
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
      'crossesAbove': 'crosses above',
      'crossesBelow': 'crosses below',
      'equals': '=',
    }
    
    return `${leftStr} ${opMap[op] || op} ${rightStr}`
  }

  // Get validation warnings
  const getValidationWarnings = useCallback((strategy) => {
    if (!strategy?.dsl) return []
    
    const warnings = []
    const { entry, exit, indicators } = strategy.dsl
    
    if (!entry || (entry.all?.length === 0 && entry.any?.length === 0)) {
      warnings.push('Missing entry conditions')
    }
    if (!exit || (exit.all?.length === 0 && exit.any?.length === 0)) {
      warnings.push('Missing exit conditions')
    }
    
    // Check for large lookbacks
    if (indicators) {
      const maxLookback = Math.max(
        ...Object.values(indicators).map(i => i.length || i.window || 0)
      )
      if (maxLookback > 200) {
        warnings.push(`Large lookback period: ${maxLookback} bars`)
      }
    }
    
    return warnings
  }, [])

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
    return Object.values(strategy.dsl.indicators).map(i => i.type)
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h4 className={styles.title}>
          <span className="material-icons">show_chart</span>
          Indicator Selection
        </h4>
      </div>

      {/* Mode Toggle */}
      <div className={styles.modeToggle}>
        <button
          className={`${styles.modeBtn} ${useCustomConfig ? styles.active : ''}`}
          onClick={() => onToggleMode?.(true)}
        >
          <span className="material-icons">tune</span>
          Custom Indicator
        </button>
        <button
          className={`${styles.modeBtn} ${!useCustomConfig ? styles.active : ''}`}
          onClick={() => onToggleMode?.(false)}
        >
          <span className="material-icons">bookmark</span>
          Saved Indicator
        </button>
      </div>

      {/* Custom Config Mode */}
      {useCustomConfig && (
        <div className={styles.customConfigNote}>
          <span className="material-icons">info</span>
          <p>Configure indicator parameters manually below. Other settings (symbol, timeframe, etc.) can be adjusted separately.</p>
        </div>
      )}

      {/* Saved Strategy Mode */}
      {!useCustomConfig && (
        <div className={styles.savedStrategyMode}>
          {isLoading ? (
            <div className={styles.loading}>
              <span className="material-icons">hourglass_empty</span>
              Loading strategies...
            </div>
          ) : strategies.length === 0 ? (
            <div className={styles.emptyState}>
              <span className="material-icons">folder_open</span>
              <p>No saved strategies yet</p>
              <button className={styles.createBtn} onClick={onCreateNew}>
                <span className="material-icons">add</span>
                Create Your First Strategy
              </button>
            </div>
          ) : (
            <>
              {/* Strategy Dropdown */}
              <div className={styles.selectGroup}>
                <label>Select Strategy</label>
                <select
                  value={selectedStrategyId || ''}
                  onChange={(e) => onSelectStrategy?.(e.target.value || null)}
                  className={styles.select}
                >
                  <option value="">-- Select a strategy --</option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Updated: {formatDate(s.updatedAt)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Selected Strategy Preview */}
              {selectedStrategy && (
                <div className={styles.strategyPreview}>
                  <div className={styles.previewHeader}>
                    <div className={styles.previewTitle}>
                      <span className="material-icons">description</span>
                      {selectedStrategy.name}
                    </div>
                    <div className={styles.previewActions}>
                      <button
                        className={styles.iconBtn}
                        onClick={() => onEditStrategy?.(selectedStrategy.id)}
                        title="Edit Strategy"
                      >
                        <span className="material-icons">edit</span>
                      </button>
                    </div>
                  </div>

                  {selectedStrategy.description && (
                    <p className={styles.previewDescription}>
                      {selectedStrategy.description}
                    </p>
                  )}

                  {/* Indicators Used */}
                  <div className={styles.indicatorTags}>
                    {getIndicatorsList(selectedStrategy).map((ind, idx) => (
                      <span key={idx} className={styles.indicatorTag}>
                        {ind}
                      </span>
                    ))}
                  </div>

                  {/* Condition Preview */}
                  <div 
                    className={`${styles.conditionPreview} ${previewExpanded ? styles.expanded : ''}`}
                    onClick={() => setPreviewExpanded(!previewExpanded)}
                  >
                    <div className={styles.conditionText}>
                      {generatePreview(selectedStrategy)}
                    </div>
                    <span className="material-icons">
                      {previewExpanded ? 'expand_less' : 'expand_more'}
                    </span>
                  </div>

                  {/* Validation Warnings */}
                  {getValidationWarnings(selectedStrategy).length > 0 && (
                    <div className={styles.warnings}>
                      {getValidationWarnings(selectedStrategy).map((warning, idx) => (
                        <div key={idx} className={styles.warningItem}>
                          <span className="material-icons">warning</span>
                          {warning}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Create New Button */}
              <button className={styles.createNewBtn} onClick={onCreateNew}>
                <span className="material-icons">add</span>
                Create New Strategy
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default memo(StrategySelectorSection)
