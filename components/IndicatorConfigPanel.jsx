'use client'

import { useState, useCallback, memo, useEffect } from 'react'
import styles from './IndicatorConfigPanel.module.css'

// Unified indicator definitions with signal/display capabilities
const INDICATOR_DEFINITIONS = {
  // Crossover indicators (typically for signals)
  ema: {
    name: 'EMA',
    fullName: 'Exponential Moving Average',
    pane: 'overlay',
    canSignal: true,
    signalType: 'crossover', // needs fast/slow
    defaultParams: { fast: 12, slow: 26 },
    paramSchema: [
      { key: 'fast', label: 'Fast Length', type: 'number', min: 2, max: 500, default: 12 },
      { key: 'slow', label: 'Slow Length', type: 'number', min: 2, max: 500, default: 26 }
    ]
  },
  ma: {
    name: 'MA',
    fullName: 'Simple Moving Average',
    pane: 'overlay',
    canSignal: true,
    signalType: 'crossover',
    defaultParams: { fast: 10, slow: 50 },
    paramSchema: [
      { key: 'fast', label: 'Fast Length', type: 'number', min: 2, max: 500, default: 10 },
      { key: 'slow', label: 'Slow Length', type: 'number', min: 2, max: 500, default: 50 }
    ]
  },
  // Threshold indicators (overbought/oversold signals)
  rsi: {
    name: 'RSI',
    fullName: 'Relative Strength Index',
    pane: 'oscillator',
    canSignal: true,
    signalType: 'threshold',
    defaultParams: { length: 14, overbought: 70, oversold: 30 },
    paramSchema: [
      { key: 'length', label: 'Length', type: 'number', min: 2, max: 200, default: 14 },
      { key: 'overbought', label: 'Overbought', type: 'number', min: 50, max: 100, default: 70 },
      { key: 'oversold', label: 'Oversold', type: 'number', min: 0, max: 50, default: 30 }
    ]
  },
  cci: {
    name: 'CCI',
    fullName: 'Commodity Channel Index',
    pane: 'oscillator',
    canSignal: true,
    signalType: 'threshold',
    defaultParams: { length: 20, overbought: 100, oversold: -100 },
    paramSchema: [
      { key: 'length', label: 'Length', type: 'number', min: 2, max: 200, default: 20 },
      { key: 'overbought', label: 'Overbought', type: 'number', min: 0, max: 300, default: 100 },
      { key: 'oversold', label: 'Oversold', type: 'number', min: -300, max: 0, default: -100 }
    ]
  },
  zscore: {
    name: 'Z-Score',
    fullName: 'Z-Score Normalization',
    pane: 'oscillator',
    canSignal: true,
    signalType: 'threshold',
    defaultParams: { length: 20, overbought: 2, oversold: -2 },
    paramSchema: [
      { key: 'length', label: 'Length', type: 'number', min: 2, max: 500, default: 20 },
      { key: 'overbought', label: 'Upper Threshold', type: 'number', min: 0, max: 5, step: 0.1, default: 2 },
      { key: 'oversold', label: 'Lower Threshold', type: 'number', min: -5, max: 0, step: 0.1, default: -2 }
    ]
  },
  // Display-only indicators
  dema: {
    name: 'DEMA',
    fullName: 'Double Exponential Moving Average',
    pane: 'overlay',
    canSignal: false,
    defaultParams: { length: 20 },
    paramSchema: [
      { key: 'length', label: 'Length', type: 'number', min: 2, max: 500, default: 20 }
    ]
  },
  roll_std: {
    name: 'Rolling Std',
    fullName: 'Rolling Standard Deviation',
    pane: 'oscillator',
    canSignal: false,
    defaultParams: { length: 20 },
    paramSchema: [
      { key: 'length', label: 'Length', type: 'number', min: 2, max: 500, default: 20 }
    ]
  },
  roll_median: {
    name: 'Rolling Median',
    fullName: 'Rolling Median',
    pane: 'overlay',
    canSignal: false,
    defaultParams: { length: 20 },
    paramSchema: [
      { key: 'length', label: 'Length', type: 'number', min: 2, max: 500, default: 20 }
    ]
  },
  roll_percentile: {
    name: 'Rolling Percentile',
    fullName: 'Rolling Percentile',
    pane: 'overlay',
    canSignal: false,
    defaultParams: { length: 20, percentile: 50 },
    paramSchema: [
      { key: 'length', label: 'Length', type: 'number', min: 2, max: 500, default: 20 },
      { key: 'percentile', label: 'Percentile', type: 'number', min: 1, max: 99, default: 50 }
    ]
  }
}

const SOURCE_OPTIONS = [
  { value: 'close', label: 'Close' },
  { value: 'open', label: 'Open' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
  { value: 'hl2', label: 'HL2' },
  { value: 'hlc3', label: 'HLC3' },
  { value: 'ohlc4', label: 'OHLC4' }
]

const INDICATOR_COLORS = [
  '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', 
  '#1abc9c', '#e67e22', '#00d4aa', '#ff6b6b', '#4ecdc4'
]

const generateIndicatorId = () => `ind_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

// Single indicator row component
const IndicatorRow = memo(({ indicator, index, onUpdate, onRemove, onToggle, showUsage = true }) => {
  const definition = INDICATOR_DEFINITIONS[indicator.type]
  const [isExpanded, setIsExpanded] = useState(false)
  
  const handleParamChange = useCallback((key, value) => {
    onUpdate(indicator.id, {
      ...indicator,
      params: { ...indicator.params, [key]: value }
    })
  }, [indicator, onUpdate])
  
  const handleSourceChange = useCallback((source) => {
    onUpdate(indicator.id, { ...indicator, source })
  }, [indicator, onUpdate])
  
  const handleUsageChange = useCallback((usage) => {
    onUpdate(indicator.id, { ...indicator, usage })
  }, [indicator, onUpdate])
  
  const color = INDICATOR_COLORS[index % INDICATOR_COLORS.length]
  
  return (
    <div className={`${styles.indicatorRow} ${!indicator.enabled ? styles.disabled : ''}`}>
      <div className={styles.indicatorHeader}>
        <div className={styles.indicatorLeft}>
          <button 
            className={styles.toggleBtn}
            onClick={() => onToggle(indicator.id)}
            title={indicator.enabled ? 'Disable' : 'Enable'}
          >
            <span className="material-icons">
              {indicator.enabled ? 'visibility' : 'visibility_off'}
            </span>
          </button>
          <span className={styles.indicatorColor} style={{ background: color }}></span>
          <span className={styles.indicatorName}>{definition?.name || indicator.type}</span>
          {showUsage && (
            <span className={`${styles.usageBadge} ${styles[indicator.usage]}`}>
              {indicator.usage === 'signal' ? '⚡ Signal' : '👁 Display'}
            </span>
          )}
        </div>
        <div className={styles.indicatorRight}>
          <span className={styles.indicatorSummary}>
            {Object.entries(indicator.params || {}).slice(0, 2).map(([k, v]) => `${v}`).join('/')}
          </span>
          <button 
            className={styles.expandBtn}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <span className="material-icons">
              {isExpanded ? 'expand_less' : 'expand_more'}
            </span>
          </button>
          <button 
            className={styles.removeBtn}
            onClick={() => onRemove(indicator.id)}
          >
            <span className="material-icons">close</span>
          </button>
        </div>
      </div>
      
      {isExpanded && (
        <div className={styles.indicatorParams}>
          {/* Usage selector - only for indicators that can signal */}
          {showUsage && definition?.canSignal && (
            <div className={styles.usageSelector}>
              <label>Usage</label>
              <div className={styles.usageOptions}>
                <button 
                  className={`${styles.usageOption} ${indicator.usage === 'signal' ? styles.active : ''}`}
                  onClick={() => handleUsageChange('signal')}
                >
                  <span className="material-icons">bolt</span>
                  Trading Signal
                </button>
                <button 
                  className={`${styles.usageOption} ${indicator.usage === 'display' ? styles.active : ''}`}
                  onClick={() => handleUsageChange('display')}
                >
                  <span className="material-icons">visibility</span>
                  Display Only
                </button>
              </div>
              <p className={styles.usageHint}>
                {indicator.usage === 'signal' 
                  ? 'This indicator will generate buy/sell signals' 
                  : 'This indicator is shown on chart only'}
              </p>
            </div>
          )}
          
          <div className={styles.paramGrid}>
            <div className={styles.paramRow}>
              <label>Source</label>
              <select 
                value={indicator.source} 
                onChange={(e) => handleSourceChange(e.target.value)}
                className={styles.paramSelect}
              >
                {SOURCE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            
            {definition?.paramSchema?.map(param => (
              <div key={param.key} className={styles.paramRow}>
                <label>{param.label}</label>
                <input
                  type="number"
                  value={indicator.params?.[param.key] ?? param.default}
                  onChange={(e) => handleParamChange(param.key, Number(e.target.value))}
                  min={param.min}
                  max={param.max}
                  step={param.step || 1}
                  className={styles.paramInput}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

IndicatorRow.displayName = 'IndicatorRow'

// Main indicator config panel component
const IndicatorConfigPanel = ({ 
  indicators = [], 
  onChange, 
  title = 'Indicators',
  compact = false,
  showUsage = true, // Show signal/display toggle
  defaultUsage = 'display', // Default usage for new indicators
  allowedTypes = null, // null = all types, or array of allowed types
  maxSignalIndicators = 1, // Max indicators that can be set to 'signal'
}) => {
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [filterCategory, setFilterCategory] = useState('all') // all, signal, display
  
  // Get available indicator types
  const availableTypes = allowedTypes 
    ? Object.entries(INDICATOR_DEFINITIONS).filter(([type]) => allowedTypes.includes(type))
    : Object.entries(INDICATOR_DEFINITIONS)
  
  // Filter by category
  const filteredTypes = filterCategory === 'all' 
    ? availableTypes
    : filterCategory === 'signal'
      ? availableTypes.filter(([_, def]) => def.canSignal)
      : availableTypes.filter(([_, def]) => !def.canSignal)
  
  // Count signal indicators
  const signalCount = indicators.filter(i => i.usage === 'signal' && i.enabled).length
  
  const handleAddIndicator = useCallback((type) => {
    const definition = INDICATOR_DEFINITIONS[type]
    
    // Determine initial usage
    let usage = defaultUsage
    if (!definition.canSignal) {
      usage = 'display' // Force display for non-signal indicators
    } else if (usage === 'signal' && signalCount >= maxSignalIndicators) {
      usage = 'display' // Already have max signal indicators
    }
    
    const newIndicator = {
      id: generateIndicatorId(),
      type,
      enabled: true,
      usage,
      pane: definition.pane,
      source: 'close',
      params: { ...definition.defaultParams }
    }
    onChange([...indicators, newIndicator])
    setShowAddMenu(false)
  }, [indicators, onChange, defaultUsage, signalCount, maxSignalIndicators])
  
  const handleUpdateIndicator = useCallback((id, updatedIndicator) => {
    // Enforce max signal indicators
    if (updatedIndicator.usage === 'signal') {
      const currentSignalCount = indicators.filter(i => i.id !== id && i.usage === 'signal' && i.enabled).length
      if (currentSignalCount >= maxSignalIndicators) {
        // Switch other signal indicators to display
        const updated = indicators.map(ind => {
          if (ind.id === id) return updatedIndicator
          if (ind.usage === 'signal') return { ...ind, usage: 'display' }
          return ind
        })
        onChange(updated)
        return
      }
    }
    onChange(indicators.map(ind => ind.id === id ? updatedIndicator : ind))
  }, [indicators, onChange, maxSignalIndicators])
  
  const handleRemoveIndicator = useCallback((id) => {
    onChange(indicators.filter(ind => ind.id !== id))
  }, [indicators, onChange])
  
  const handleToggleIndicator = useCallback((id) => {
    onChange(indicators.map(ind => 
      ind.id === id ? { ...ind, enabled: !ind.enabled } : ind
    ))
  }, [indicators, onChange])
  
  // Get signal indicator for summary
  const signalIndicator = indicators.find(i => i.usage === 'signal' && i.enabled)
  
  return (
    <div className={`${styles.panel} ${compact ? styles.compact : ''}`}>
      <div className={styles.panelHeader}>
        <h4>
          <span className="material-icons">insights</span>
          {title}
        </h4>
        <div className={styles.headerRight}>
          {signalIndicator && (
            <span className={styles.signalBadge}>
              ⚡ {INDICATOR_DEFINITIONS[signalIndicator.type]?.name}
            </span>
          )}
          <span className={styles.indicatorCount}>
            {indicators.filter(i => i.enabled).length} active
          </span>
        </div>
      </div>
      
      <div className={styles.indicatorList}>
        {indicators.length === 0 ? (
          <div className={styles.emptyState}>
            <span className="material-icons">add_chart</span>
            <p>No indicators added</p>
            <span className={styles.emptyHint}>Click "Add Indicator" below</span>
          </div>
        ) : (
          indicators.map((indicator, index) => (
            <IndicatorRow
              key={indicator.id}
              indicator={indicator}
              index={index}
              onUpdate={handleUpdateIndicator}
              onRemove={handleRemoveIndicator}
              onToggle={handleToggleIndicator}
              showUsage={showUsage}
            />
          ))
        )}
      </div>
      
      <div className={styles.addSection}>
        <button 
          className={styles.addBtn}
          onClick={() => setShowAddMenu(!showAddMenu)}
        >
          <span className="material-icons">add</span>
          Add Indicator
        </button>
        
        {showAddMenu && (
          <div className={styles.addMenu}>
            <div className={styles.addMenuHeader}>
              <span>Select Indicator</span>
              <button onClick={() => setShowAddMenu(false)}>
                <span className="material-icons">close</span>
              </button>
            </div>
            
            {/* Category Filter */}
            <div className={styles.categoryFilter}>
              <button 
                className={`${styles.categoryBtn} ${filterCategory === 'all' ? styles.active : ''}`}
                onClick={() => setFilterCategory('all')}
              >
                All
              </button>
              <button 
                className={`${styles.categoryBtn} ${filterCategory === 'signal' ? styles.active : ''}`}
                onClick={() => setFilterCategory('signal')}
              >
                ⚡ Signal
              </button>
              <button 
                className={`${styles.categoryBtn} ${filterCategory === 'display' ? styles.active : ''}`}
                onClick={() => setFilterCategory('display')}
              >
                👁 Display
              </button>
            </div>
            
            <div className={styles.addMenuList}>
              {filteredTypes.map(([type, def]) => (
                <button
                  key={type}
                  className={styles.addMenuItem}
                  onClick={() => handleAddIndicator(type)}
                >
                  <span className={styles.indicatorTypeIcon}>
                    {def.pane === 'overlay' ? '📈' : '📊'}
                  </span>
                  <div className={styles.indicatorTypeInfo}>
                    <span className={styles.indicatorTypeName}>{def.name}</span>
                    <span className={styles.indicatorTypeDesc}>{def.fullName}</span>
                  </div>
                  <div className={styles.indicatorTypeBadges}>
                    {def.canSignal && (
                      <span className={styles.canSignalBadge}>⚡</span>
                    )}
                    <span className={styles.indicatorTypePane}>
                      {def.pane === 'overlay' ? 'OVL' : 'OSC'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(IndicatorConfigPanel)
export { INDICATOR_DEFINITIONS, SOURCE_OPTIONS, INDICATOR_COLORS, generateIndicatorId }
