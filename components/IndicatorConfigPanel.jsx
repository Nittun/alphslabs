'use client'

import { useState, useCallback, memo } from 'react'
import styles from './IndicatorConfigPanel.module.css'

// Indicator definitions with their default configurations
const INDICATOR_DEFINITIONS = {
  zscore: {
    name: 'Z-Score',
    pane: 'oscillator',
    defaultParams: { length: 20 },
    paramSchema: [
      { key: 'length', label: 'Length', type: 'number', min: 2, max: 500, default: 20 }
    ]
  },
  dema: {
    name: 'DEMA',
    pane: 'overlay',
    defaultParams: { length: 20 },
    paramSchema: [
      { key: 'length', label: 'Length', type: 'number', min: 2, max: 500, default: 20 }
    ]
  },
  roll_std: {
    name: 'Rolling Std Dev',
    pane: 'oscillator',
    defaultParams: { length: 20 },
    paramSchema: [
      { key: 'length', label: 'Length', type: 'number', min: 2, max: 500, default: 20 }
    ]
  },
  roll_median: {
    name: 'Rolling Median',
    pane: 'overlay',
    defaultParams: { length: 20 },
    paramSchema: [
      { key: 'length', label: 'Length', type: 'number', min: 2, max: 500, default: 20 }
    ]
  },
  roll_percentile: {
    name: 'Rolling Percentile',
    pane: 'overlay',
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
  { value: 'hl2', label: 'HL2 (High+Low)/2' },
  { value: 'hlc3', label: 'HLC3 (High+Low+Close)/3' },
  { value: 'ohlc4', label: 'OHLC4 (Open+High+Low+Close)/4' }
]

const INDICATOR_COLORS = [
  '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', 
  '#1abc9c', '#e67e22', '#00d4aa', '#ff6b6b', '#4ecdc4'
]

// Generate a unique ID for each indicator instance
const generateIndicatorId = () => `ind_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

// Single indicator row component
const IndicatorRow = memo(({ indicator, index, onUpdate, onRemove, onToggle }) => {
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
          <span className={styles.indicatorPane}>
            {indicator.pane === 'overlay' ? 'Overlay' : 'Oscillator'}
          </span>
        </div>
        <div className={styles.indicatorRight}>
          <span className={styles.indicatorSummary}>
            {Object.entries(indicator.params || {}).map(([k, v]) => `${k}=${v}`).join(', ')}
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
                className={styles.paramInput}
              />
            </div>
          ))}
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
  compact = false 
}) => {
  const [showAddMenu, setShowAddMenu] = useState(false)
  
  const handleAddIndicator = useCallback((type) => {
    const definition = INDICATOR_DEFINITIONS[type]
    const newIndicator = {
      id: generateIndicatorId(),
      type,
      enabled: true,
      pane: definition.pane,
      source: 'close',
      params: { ...definition.defaultParams }
    }
    onChange([...indicators, newIndicator])
    setShowAddMenu(false)
  }, [indicators, onChange])
  
  const handleUpdateIndicator = useCallback((id, updatedIndicator) => {
    onChange(indicators.map(ind => ind.id === id ? updatedIndicator : ind))
  }, [indicators, onChange])
  
  const handleRemoveIndicator = useCallback((id) => {
    onChange(indicators.filter(ind => ind.id !== id))
  }, [indicators, onChange])
  
  const handleToggleIndicator = useCallback((id) => {
    onChange(indicators.map(ind => 
      ind.id === id ? { ...ind, enabled: !ind.enabled } : ind
    ))
  }, [indicators, onChange])
  
  return (
    <div className={`${styles.panel} ${compact ? styles.compact : ''}`}>
      <div className={styles.panelHeader}>
        <h4>
          <span className="material-icons">insights</span>
          {title}
        </h4>
        <span className={styles.indicatorCount}>
          {indicators.filter(i => i.enabled).length}/{indicators.length} active
        </span>
      </div>
      
      <div className={styles.indicatorList}>
        {indicators.length === 0 ? (
          <div className={styles.emptyState}>
            <span className="material-icons">show_chart</span>
            <p>No indicators added</p>
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
            <div className={styles.addMenuList}>
              {Object.entries(INDICATOR_DEFINITIONS).map(([type, def]) => (
                <button
                  key={type}
                  className={styles.addMenuItem}
                  onClick={() => handleAddIndicator(type)}
                >
                  <span className={styles.indicatorTypeIcon}>
                    {def.pane === 'overlay' ? '📈' : '📊'}
                  </span>
                  <span className={styles.indicatorTypeName}>{def.name}</span>
                  <span className={styles.indicatorTypePane}>
                    {def.pane === 'overlay' ? 'Overlay' : 'Oscillator'}
                  </span>
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
