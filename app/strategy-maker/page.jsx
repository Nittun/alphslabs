'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import styles from './page.module.css'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'

// ============================================
// CONSTANTS & CONFIGURATION
// ============================================

const MAX_INDICATORS = 20
const MAX_NESTING_DEPTH = 5
const MAX_LOOKBACK = 500

const INDICATOR_TYPES = {
  RSI: { name: 'RSI', defaultLength: 14, minLength: 2, maxLength: 200, description: 'Relative Strength Index' },
  EMA: { name: 'EMA', defaultLength: 20, minLength: 2, maxLength: 500, description: 'Exponential Moving Average' },
  MA: { name: 'MA', defaultLength: 20, minLength: 2, maxLength: 500, description: 'Simple Moving Average' },
  ZSCORE: { name: 'Z-Score', defaultLength: 20, minLength: 5, maxLength: 200, description: 'Z-Score Normalization' },
  CCI: { name: 'CCI', defaultLength: 20, minLength: 5, maxLength: 200, description: 'Commodity Channel Index' }
}

const OPERATORS = {
  gt: { symbol: '>', name: 'Greater Than' },
  lt: { symbol: '<', name: 'Less Than' },
  gte: { symbol: '>=', name: 'Greater or Equal' },
  lte: { symbol: '<=', name: 'Less or Equal' },
  crossesAbove: { symbol: '↗', name: 'Crosses Above' },
  crossesBelow: { symbol: '↘', name: 'Crosses Below' },
  equals: { symbol: '=', name: 'Equals' }
}

const LOGIC_GATES = {
  AND: { name: 'AND', description: 'All conditions must be true' },
  OR: { name: 'OR', description: 'Any condition can be true' },
  NOT: { name: 'NOT', description: 'Inverts the condition' }
}

const TRADE_ACTIONS = {
  stopLoss: { name: 'Stop Loss', unit: '%', defaultValue: 2, min: 0.1, max: 50 },
  takeProfit: { name: 'Take Profit', unit: '%', defaultValue: 5, min: 0.1, max: 100 },
  trailingStop: { name: 'Trailing Stop', unit: '%', defaultValue: 1, min: 0.1, max: 20 }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

const generateId = () => Math.random().toString(36).substr(2, 9)

const createIndicatorBlock = (type) => ({
  id: generateId(),
  blockType: 'indicator',
  indicatorType: type,
  length: INDICATOR_TYPES[type].defaultLength,
  alias: `${type.toLowerCase()}_${generateId().slice(0, 4)}`
})

const createOperatorBlock = (op) => ({
  id: generateId(),
  blockType: 'operator',
  operator: op
})

const createLogicBlock = (gate) => ({
  id: generateId(),
  blockType: 'logic',
  gate: gate,
  children: []
})

const createValueBlock = (value = 0) => ({
  id: generateId(),
  blockType: 'value',
  value: value
})

const createActionBlock = (actionType) => ({
  id: generateId(),
  blockType: 'action',
  actionType: actionType,
  value: TRADE_ACTIONS[actionType]?.defaultValue || 2
})

const createConditionBlock = () => ({
  id: generateId(),
  blockType: 'condition',
  left: null,
  operator: null,
  right: null
})

// ============================================
// VALIDATION FUNCTIONS
// ============================================

const validateStrategy = (strategy) => {
  const errors = []
  const warnings = []
  
  // Check for entry conditions
  if (!strategy.entry || strategy.entry.length === 0) {
    errors.push('Missing entry conditions')
  }
  
  // Check for exit conditions
  if (!strategy.exit || strategy.exit.length === 0) {
    errors.push('Missing exit conditions')
  }
  
  // Count indicators
  const indicators = collectIndicators(strategy)
  if (indicators.length > MAX_INDICATORS) {
    errors.push(`Too many indicators (max ${MAX_INDICATORS})`)
  }
  
  // Check nesting depth
  const entryDepth = calculateNestingDepth(strategy.entry)
  const exitDepth = calculateNestingDepth(strategy.exit)
  if (entryDepth > MAX_NESTING_DEPTH || exitDepth > MAX_NESTING_DEPTH) {
    errors.push(`Nesting too deep (max ${MAX_NESTING_DEPTH} levels)`)
  }
  
  // Check lookback
  const maxLookback = Math.max(...indicators.map(i => i.length || 0), 0)
  if (maxLookback > MAX_LOOKBACK) {
    warnings.push(`High lookback (${maxLookback} bars) may reduce backtest range`)
  }
  
  // Validate indicator parameters
  indicators.forEach(ind => {
    const config = INDICATOR_TYPES[ind.indicatorType]
    if (config) {
      if (ind.length < config.minLength) {
        errors.push(`${config.name} length too small (min ${config.minLength})`)
      }
      if (ind.length > config.maxLength) {
        errors.push(`${config.name} length too large (max ${config.maxLength})`)
      }
    }
  })
  
  return { errors, warnings, maxLookback, indicatorCount: indicators.length }
}

const collectIndicators = (strategy) => {
  const indicators = []
  
  const traverse = (items) => {
    if (!items) return
    if (Array.isArray(items)) {
      items.forEach(traverse)
    } else if (typeof items === 'object') {
      if (items.blockType === 'indicator') {
        indicators.push(items)
      }
      if (items.left) traverse(items.left)
      if (items.right) traverse(items.right)
      if (items.children) traverse(items.children)
    }
  }
  
  traverse(strategy.entry)
  traverse(strategy.exit)
  return indicators
}

const calculateNestingDepth = (items, depth = 0) => {
  if (!items) return depth
  if (Array.isArray(items)) {
    return Math.max(...items.map(i => calculateNestingDepth(i, depth)), depth)
  }
  if (items.children) {
    return calculateNestingDepth(items.children, depth + 1)
  }
  return depth
}

// ============================================
// DSL COMPILER
// ============================================

const compileStrategyToDSL = (strategy, name, description) => {
  const indicators = {}
  const usedIndicators = collectIndicators(strategy)
  
  usedIndicators.forEach(ind => {
    indicators[ind.alias] = {
      type: ind.indicatorType,
      length: ind.length,
      source: 'close'
    }
  })
  
  const compileCondition = (condition) => {
    if (!condition) return null
    
    if (condition.blockType === 'logic') {
      const key = condition.gate === 'AND' ? 'all' : 'any'
      return { [key]: condition.children.map(compileCondition).filter(Boolean) }
    }
    
    if (condition.blockType === 'condition') {
      const left = condition.left?.blockType === 'indicator' 
        ? condition.left.alias 
        : condition.left?.value ?? null
      const right = condition.right?.blockType === 'indicator'
        ? condition.right.alias
        : condition.right?.value ?? null
      const op = condition.operator?.operator || 'gt'
      
      if (left !== null && right !== null) {
        return { op, left, right }
      }
    }
    
    if (condition.blockType === 'action') {
      const actionMap = {
        stopLoss: 'stopLossPct',
        takeProfit: 'takeProfitPct',
        trailingStop: 'trailingStopPct'
      }
      return { op: actionMap[condition.actionType] || condition.actionType, value: condition.value }
    }
    
    return null
  }
  
  const compileSection = (items) => {
    if (!items || items.length === 0) return null
    
    if (items.length === 1) {
      return compileCondition(items[0])
    }
    
    // Multiple items = implicit AND
    return { all: items.map(compileCondition).filter(Boolean) }
  }
  
  return {
    name,
    description: description || '',
    version: 1,
    createdAt: new Date().toISOString(),
    indicators,
    entry: compileSection(strategy.entry),
    exit: compileSection(strategy.exit)
  }
}

// ============================================
// HUMAN READABLE GENERATOR
// ============================================

const generateHumanReadable = (items, prefix = '') => {
  if (!items || items.length === 0) return prefix + 'No conditions defined'
  
  const lines = []
  
  items.forEach((item, idx) => {
    if (item.blockType === 'condition') {
      const leftStr = item.left?.blockType === 'indicator'
        ? `${item.left.indicatorType}(${item.left.length})`
        : item.left?.value ?? '?'
      const opStr = item.operator ? OPERATORS[item.operator.operator]?.symbol || item.operator.operator : '?'
      const rightStr = item.right?.blockType === 'indicator'
        ? `${item.right.indicatorType}(${item.right.length})`
        : item.right?.value ?? '?'
      
      lines.push(`${leftStr} ${opStr} ${rightStr}`)
    } else if (item.blockType === 'logic') {
      const childLines = item.children.map((c, i) => {
        if (c.blockType === 'condition') {
          const leftStr = c.left?.blockType === 'indicator'
            ? `${c.left.indicatorType}(${c.left.length})`
            : c.left?.value ?? '?'
          const opStr = c.operator ? OPERATORS[c.operator.operator]?.symbol || c.operator.operator : '?'
          const rightStr = c.right?.blockType === 'indicator'
            ? `${c.right.indicatorType}(${c.right.length})`
            : c.right?.value ?? '?'
          return `${leftStr} ${opStr} ${rightStr}`
        }
        return '...'
      })
      lines.push(`(${childLines.join(` ${item.gate} `)})`)
    } else if (item.blockType === 'action') {
      const action = TRADE_ACTIONS[item.actionType]
      lines.push(`${action?.name || item.actionType} ${item.value}${action?.unit || ''}`)
    }
    
    if (idx < items.length - 1) {
      lines.push('AND')
    }
  })
  
  return prefix + lines.join(' ')
}

// ============================================
// DRAGGABLE BLOCK COMPONENT
// ============================================

const DraggableBlock = ({ block, type, onDragStart, children, className = '' }) => {
  const handleDragStart = (e) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ block, type }))
    e.dataTransfer.effectAllowed = 'copy'
    if (onDragStart) onDragStart(e, block, type)
  }
  
  return (
    <div 
      className={`${styles.draggableBlock} ${styles[type]} ${className}`}
      draggable
      onDragStart={handleDragStart}
    >
      {children}
    </div>
  )
}

// ============================================
// CONDITION BUILDER COMPONENT
// ============================================

const ConditionBuilder = ({ condition, onChange, onRemove, depth = 0 }) => {
  const updateLeft = (block) => {
    onChange({ ...condition, left: block })
  }
  
  const updateOperator = (op) => {
    onChange({ ...condition, operator: createOperatorBlock(op) })
  }
  
  const updateRight = (block) => {
    onChange({ ...condition, right: block })
  }
  
  const handleDrop = (e, target) => {
    e.preventDefault()
    e.stopPropagation()
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      if (data.type === 'indicator') {
        const newBlock = createIndicatorBlock(data.block)
        if (target === 'left') updateLeft(newBlock)
        else if (target === 'right') updateRight(newBlock)
      } else if (data.type === 'value') {
        const newBlock = createValueBlock(50)
        if (target === 'left') updateLeft(newBlock)
        else if (target === 'right') updateRight(newBlock)
      }
    } catch (err) {
      console.error('Drop error:', err)
    }
  }
  
  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  
  const renderSlot = (slot, target) => {
    if (!slot) {
      return (
        <div 
          className={styles.emptySlot}
          onDrop={(e) => handleDrop(e, target)}
          onDragOver={handleDragOver}
        >
          <span className="material-icons">add_circle_outline</span>
          <span>Drop here</span>
        </div>
      )
    }
    
    if (slot.blockType === 'indicator') {
      return (
        <div className={styles.filledSlot}>
          <span className={styles.indicatorTag}>{slot.indicatorType}</span>
          <input
            type="number"
            value={slot.length}
            onChange={(e) => {
              const newSlot = { ...slot, length: parseInt(e.target.value) || slot.length }
              if (target === 'left') updateLeft(newSlot)
              else updateRight(newSlot)
            }}
            className={styles.lengthInput}
            min={INDICATOR_TYPES[slot.indicatorType]?.minLength || 2}
            max={INDICATOR_TYPES[slot.indicatorType]?.maxLength || 500}
          />
          <button 
            className={styles.removeSlotBtn}
            onClick={() => target === 'left' ? updateLeft(null) : updateRight(null)}
          >
            <span className="material-icons">close</span>
          </button>
        </div>
      )
    }
    
    if (slot.blockType === 'value') {
      return (
        <div className={styles.filledSlot}>
          <input
            type="number"
            value={slot.value}
            onChange={(e) => {
              const newSlot = { ...slot, value: parseFloat(e.target.value) || 0 }
              if (target === 'left') updateLeft(newSlot)
              else updateRight(newSlot)
            }}
            className={styles.valueInput}
          />
          <button 
            className={styles.removeSlotBtn}
            onClick={() => target === 'left' ? updateLeft(null) : updateRight(null)}
          >
            <span className="material-icons">close</span>
          </button>
        </div>
      )
    }
    
    return null
  }
  
  return (
    <div className={styles.conditionBuilder} style={{ marginLeft: depth * 20 }}>
      <div className={styles.conditionRow}>
        {renderSlot(condition.left, 'left')}
        
        <select 
          className={styles.operatorSelect}
          value={condition.operator?.operator || ''}
          onChange={(e) => updateOperator(e.target.value)}
        >
          <option value="">Select</option>
          {Object.entries(OPERATORS).map(([key, op]) => (
            <option key={key} value={key}>{op.symbol} {op.name}</option>
          ))}
        </select>
        
        {renderSlot(condition.right, 'right')}
        
        <button className={styles.removeConditionBtn} onClick={onRemove}>
          <span className="material-icons">delete</span>
        </button>
      </div>
    </div>
  )
}

// ============================================
// LOGIC GROUP COMPONENT
// ============================================

const LogicGroup = ({ group, onChange, onRemove, depth = 0 }) => {
  const addCondition = () => {
    onChange({
      ...group,
      children: [...group.children, createConditionBlock()]
    })
  }
  
  const updateChild = (idx, newChild) => {
    const newChildren = [...group.children]
    newChildren[idx] = newChild
    onChange({ ...group, children: newChildren })
  }
  
  const removeChild = (idx) => {
    onChange({
      ...group,
      children: group.children.filter((_, i) => i !== idx)
    })
  }
  
  const toggleGate = () => {
    onChange({
      ...group,
      gate: group.gate === 'AND' ? 'OR' : 'AND'
    })
  }
  
  if (depth >= MAX_NESTING_DEPTH) {
    return (
      <div className={styles.maxDepthWarning}>
        <span className="material-icons">warning</span>
        Max nesting depth reached
      </div>
    )
  }
  
  return (
    <div className={`${styles.logicGroup} ${styles[group.gate.toLowerCase()]}`}>
      <div className={styles.logicHeader}>
        <button className={styles.gateToggle} onClick={toggleGate}>
          <span className={styles.gateLabel}>{group.gate}</span>
          <span className="material-icons">swap_horiz</span>
        </button>
        <button className={styles.removeGroupBtn} onClick={onRemove}>
          <span className="material-icons">close</span>
        </button>
      </div>
      
      <div className={styles.logicChildren}>
        {group.children.map((child, idx) => (
          <div key={child.id} className={styles.logicChild}>
            {child.blockType === 'condition' ? (
              <ConditionBuilder
                condition={child}
                onChange={(c) => updateChild(idx, c)}
                onRemove={() => removeChild(idx)}
                depth={depth + 1}
              />
            ) : child.blockType === 'logic' ? (
              <LogicGroup
                group={child}
                onChange={(g) => updateChild(idx, g)}
                onRemove={() => removeChild(idx)}
                depth={depth + 1}
              />
            ) : null}
            
            {idx < group.children.length - 1 && (
              <div className={styles.gateConnector}>{group.gate}</div>
            )}
          </div>
        ))}
      </div>
      
      <button className={styles.addChildBtn} onClick={addCondition}>
        <span className="material-icons">add</span>
        Add Condition
      </button>
    </div>
  )
}

// ============================================
// ACTION BLOCK COMPONENT
// ============================================

const ActionBlock = ({ action, onChange, onRemove }) => {
  const config = TRADE_ACTIONS[action.actionType]
  
  return (
    <div className={styles.actionBlock}>
      <span className={styles.actionName}>{config?.name || action.actionType}</span>
      <input
        type="number"
        value={action.value}
        onChange={(e) => onChange({ ...action, value: parseFloat(e.target.value) || 0 })}
        className={styles.actionInput}
        min={config?.min || 0}
        max={config?.max || 100}
        step={0.1}
      />
      <span className={styles.actionUnit}>{config?.unit || ''}</span>
      <button className={styles.removeActionBtn} onClick={onRemove}>
        <span className="material-icons">close</span>
      </button>
    </div>
  )
}

// ============================================
// STRATEGY SECTION COMPONENT
// ============================================

const StrategySection = ({ title, icon, items, onItemsChange, sectionType }) => {
  const [isDragOver, setIsDragOver] = useState(false)
  
  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      
      if (data.type === 'logic') {
        const newGroup = createLogicBlock(data.block)
        newGroup.children.push(createConditionBlock())
        onItemsChange([...items, newGroup])
      } else if (data.type === 'action') {
        const newAction = createActionBlock(data.block)
        onItemsChange([...items, newAction])
      } else if (data.type === 'condition') {
        onItemsChange([...items, createConditionBlock()])
      }
    } catch (err) {
      console.error('Section drop error:', err)
    }
  }
  
  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragOver(true)
  }
  
  const handleDragLeave = () => {
    setIsDragOver(false)
  }
  
  const updateItem = (idx, newItem) => {
    const newItems = [...items]
    newItems[idx] = newItem
    onItemsChange(newItems)
  }
  
  const removeItem = (idx) => {
    onItemsChange(items.filter((_, i) => i !== idx))
  }
  
  const addCondition = () => {
    onItemsChange([...items, createConditionBlock()])
  }
  
  return (
    <div className={styles.strategySection}>
      <div className={styles.sectionHeader}>
        <span className="material-icons">{icon}</span>
        <h3>{title}</h3>
      </div>
      
      <div 
        className={`${styles.sectionCanvas} ${isDragOver ? styles.dragOver : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {items.length === 0 ? (
          <div className={styles.emptyCanvas}>
            <span className="material-icons">add_box</span>
            <p>Drag blocks here or click to add</p>
          </div>
        ) : (
          <div className={styles.itemsList}>
            {items.map((item, idx) => (
              <div key={item.id} className={styles.canvasItem}>
                {item.blockType === 'condition' && (
                  <ConditionBuilder
                    condition={item}
                    onChange={(c) => updateItem(idx, c)}
                    onRemove={() => removeItem(idx)}
                  />
                )}
                {item.blockType === 'logic' && (
                  <LogicGroup
                    group={item}
                    onChange={(g) => updateItem(idx, g)}
                    onRemove={() => removeItem(idx)}
                  />
                )}
                {item.blockType === 'action' && (
                  <ActionBlock
                    action={item}
                    onChange={(a) => updateItem(idx, a)}
                    onRemove={() => removeItem(idx)}
                  />
                )}
                
                {idx < items.length - 1 && (
                  <div className={styles.itemConnector}>AND</div>
                )}
              </div>
            ))}
          </div>
        )}
        
        <button className={styles.addItemBtn} onClick={addCondition}>
          <span className="material-icons">add</span>
          Add Condition
        </button>
      </div>
    </div>
  )
}

// ============================================
// SAVED STRATEGIES LIST COMPONENT
// ============================================

const SavedStrategiesList = ({ strategies, onSelect, onDelete, onDuplicate, selectedId }) => {
  if (strategies.length === 0) {
    return (
      <div className={styles.noStrategies}>
        <span className="material-icons">folder_open</span>
        <p>No saved strategies yet</p>
      </div>
    )
  }
  
  return (
    <div className={styles.strategiesList}>
      {strategies.map(strat => (
        <div 
          key={strat.id} 
          className={`${styles.strategyCard} ${selectedId === strat.id ? styles.selected : ''}`}
          onClick={() => onSelect(strat)}
        >
          <div className={styles.strategyInfo}>
            <h4>{strat.name}</h4>
            {strat.description && <p>{strat.description}</p>}
            <span className={styles.strategyDate}>
              {new Date(strat.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div className={styles.strategyActions}>
            <button onClick={(e) => { e.stopPropagation(); onDuplicate(strat); }} title="Duplicate">
              <span className="material-icons">content_copy</span>
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(strat.id); }} title="Delete">
              <span className="material-icons">delete</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// MAIN PAGE COMPONENT
// ============================================

export default function StrategyMakerPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  
  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  
  // Strategy state
  const [strategyName, setStrategyName] = useState('')
  const [strategyDescription, setStrategyDescription] = useState('')
  const [entryConditions, setEntryConditions] = useState([])
  const [exitConditions, setExitConditions] = useState([])
  const [savedStrategies, setSavedStrategies] = useState([])
  const [selectedStrategyId, setSelectedStrategyId] = useState(null)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showJsonPreview, setShowJsonPreview] = useState(false)
  
  // Load saved strategies from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('alphalabs_strategies')
      if (saved) {
        setSavedStrategies(JSON.parse(saved))
      }
    } catch (err) {
      console.error('Failed to load strategies:', err)
    }
  }, [])
  
  // Save strategies to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem('alphalabs_strategies', JSON.stringify(savedStrategies))
    } catch (err) {
      console.error('Failed to save strategies:', err)
    }
  }, [savedStrategies])
  
  // Computed validation
  const validation = useMemo(() => {
    return validateStrategy({ entry: entryConditions, exit: exitConditions })
  }, [entryConditions, exitConditions])
  
  // Computed DSL
  const compiledDSL = useMemo(() => {
    if (validation.errors.length > 0) return null
    return compileStrategyToDSL(
      { entry: entryConditions, exit: exitConditions },
      strategyName || 'Untitled Strategy',
      strategyDescription
    )
  }, [entryConditions, exitConditions, strategyName, strategyDescription, validation.errors])
  
  // Human readable preview
  const humanReadable = useMemo(() => ({
    entry: generateHumanReadable(entryConditions, 'Enter when: '),
    exit: generateHumanReadable(exitConditions, 'Exit when: ')
  }), [entryConditions, exitConditions])
  
  // Handlers
  const handleSaveStrategy = () => {
    if (!strategyName.trim()) {
      Swal.fire({
        icon: 'error',
        title: 'Name Required',
        text: 'Please enter a name for your strategy',
        background: '#1a1a2e',
        color: '#fff'
      })
      return
    }
    
    if (validation.errors.length > 0) {
      Swal.fire({
        icon: 'error',
        title: 'Validation Errors',
        text: validation.errors.join(', '),
        background: '#1a1a2e',
        color: '#fff'
      })
      return
    }
    
    const newStrategy = {
      id: selectedStrategyId || generateId(),
      name: strategyName,
      description: strategyDescription,
      createdAt: new Date().toISOString(),
      entry: entryConditions,
      exit: exitConditions,
      dsl: compiledDSL
    }
    
    if (selectedStrategyId) {
      // Update existing
      setSavedStrategies(prev => prev.map(s => s.id === selectedStrategyId ? newStrategy : s))
      Swal.fire({
        icon: 'success',
        title: 'Strategy Updated',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        background: '#1a1a2e',
        color: '#fff'
      })
    } else {
      // Create new
      setSavedStrategies(prev => [newStrategy, ...prev])
      setSelectedStrategyId(newStrategy.id)
      Swal.fire({
        icon: 'success',
        title: 'Strategy Saved',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        background: '#1a1a2e',
        color: '#fff'
      })
    }
    
    setShowSaveModal(false)
  }
  
  const handleSelectStrategy = (strategy) => {
    setSelectedStrategyId(strategy.id)
    setStrategyName(strategy.name)
    setStrategyDescription(strategy.description || '')
    setEntryConditions(strategy.entry || [])
    setExitConditions(strategy.exit || [])
  }
  
  const handleDeleteStrategy = (id) => {
    Swal.fire({
      title: 'Delete Strategy?',
      text: 'This action cannot be undone',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#333',
      confirmButtonText: 'Delete',
      background: '#1a1a2e',
      color: '#fff'
    }).then((result) => {
      if (result.isConfirmed) {
        setSavedStrategies(prev => prev.filter(s => s.id !== id))
        if (selectedStrategyId === id) {
          handleNewStrategy()
        }
      }
    })
  }
  
  const handleDuplicateStrategy = (strategy) => {
    const duplicate = {
      ...strategy,
      id: generateId(),
      name: `${strategy.name} (Copy)`,
      createdAt: new Date().toISOString()
    }
    setSavedStrategies(prev => [duplicate, ...prev])
    handleSelectStrategy(duplicate)
  }
  
  const handleNewStrategy = () => {
    setSelectedStrategyId(null)
    setStrategyName('')
    setStrategyDescription('')
    setEntryConditions([])
    setExitConditions([])
  }
  
  const handleExportJson = () => {
    if (!compiledDSL) return
    const blob = new Blob([JSON.stringify(compiledDSL, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${strategyName || 'strategy'}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  
  // Auth check
  if (status === 'loading') {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Loading...</p>
      </div>
    )
  }
  
  if (status === 'unauthenticated') {
    router.push('/login')
    return null
  }
  
  return (
    <div className={styles.pageContainer}>
      <Sidebar onCollapseChange={setSidebarCollapsed} />
      <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <TopBar />
        
        <div className={styles.strategyMaker}>
          {/* Header */}
          <div className={styles.pageHeader}>
            <div className={styles.headerLeft}>
              <h1>
                <span className="material-icons">construction</span>
                Indicator Sandbox
              </h1>
              <p>Build trading strategies with visual blocks</p>
            </div>
            <div className={styles.headerActions}>
              <button className={styles.newBtn} onClick={handleNewStrategy}>
                <span className="material-icons">add</span>
                New Strategy
              </button>
              <button 
                className={styles.saveBtn} 
                onClick={() => setShowSaveModal(true)}
                disabled={validation.errors.length > 0}
              >
                <span className="material-icons">save</span>
                Save Strategy
              </button>
            </div>
          </div>
          
          {/* Main Layout */}
          <div className={styles.builderLayout}>
            {/* Left Panel - Block Palette */}
            <div className={styles.leftPanel}>
              <div className={styles.paletteSection}>
                <h3>
                  <span className="material-icons">show_chart</span>
                  Indicators
                </h3>
                <div className={styles.paletteGrid}>
                  {Object.entries(INDICATOR_TYPES).map(([key, ind]) => (
                    <DraggableBlock key={key} block={key} type="indicator">
                      <span className={`material-icons ${styles.blockIcon}`}>insights</span>
                      <span className={styles.blockName}>{ind.name}</span>
                    </DraggableBlock>
                  ))}
                </div>
              </div>
              
              <div className={styles.paletteSection}>
                <h3>
                  <span className="material-icons">tune</span>
                  Values
                </h3>
                <div className={styles.paletteGrid}>
                  <DraggableBlock block="number" type="value">
                    <span className={`material-icons ${styles.blockIcon}`}>tag</span>
                    <span className={styles.blockName}>Number</span>
                  </DraggableBlock>
                </div>
              </div>
              
              <div className={styles.paletteSection}>
                <h3>
                  <span className="material-icons">account_tree</span>
                  Logic Gates
                </h3>
                <div className={styles.paletteGrid}>
                  {Object.entries(LOGIC_GATES).map(([key, gate]) => (
                    <DraggableBlock key={key} block={key} type="logic">
                      <span className={`material-icons ${styles.blockIcon}`}>{key === 'AND' ? 'join_inner' : key === 'OR' ? 'join_full' : 'block'}</span>
                      <span className={styles.blockName}>{gate.name}</span>
                    </DraggableBlock>
                  ))}
                </div>
              </div>
              
              <div className={styles.paletteSection}>
                <h3>
                  <span className="material-icons">shield</span>
                  Risk Management
                </h3>
                <div className={styles.paletteGrid}>
                  {Object.entries(TRADE_ACTIONS).map(([key, action]) => (
                    <DraggableBlock key={key} block={key} type="action">
                      <span className={`material-icons ${styles.blockIcon}`}>{key === 'stopLoss' ? 'dangerous' : key === 'takeProfit' ? 'verified' : 'trending_down'}</span>
                      <span className={styles.blockName}>{action.name}</span>
                    </DraggableBlock>
                  ))}
                </div>
              </div>
              
              {/* Saved Strategies */}
              <div className={styles.paletteSection}>
                <h3>
                  <span className="material-icons">folder</span>
                  Saved Strategies
                </h3>
                <SavedStrategiesList
                  strategies={savedStrategies}
                  selectedId={selectedStrategyId}
                  onSelect={handleSelectStrategy}
                  onDelete={handleDeleteStrategy}
                  onDuplicate={handleDuplicateStrategy}
                />
              </div>
            </div>
            
            {/* Center Panel - Strategy Canvas */}
            <div className={styles.centerPanel}>
              <StrategySection
                title="Entry Conditions"
                icon="login"
                items={entryConditions}
                onItemsChange={setEntryConditions}
                sectionType="entry"
              />
              
              <StrategySection
                title="Exit Conditions"
                icon="logout"
                items={exitConditions}
                onItemsChange={setExitConditions}
                sectionType="exit"
              />
            </div>
            
            {/* Right Panel - Preview & Validation */}
            <div className={styles.rightPanel}>
              {/* Strategy Info */}
              <div className={styles.previewSection}>
                <h3>
                  <span className="material-icons">info</span>
                  Strategy Info
                </h3>
                <div className={styles.infoGrid}>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Indicators</span>
                    <span className={styles.infoValue}>{validation.indicatorCount} / {MAX_INDICATORS}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Max Lookback</span>
                    <span className={styles.infoValue}>{validation.maxLookback} bars</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Complexity</span>
                    <span className={`${styles.infoValue} ${validation.indicatorCount > 10 ? styles.warning : ''}`}>
                      {validation.indicatorCount > 10 ? 'Medium' : 'Low'}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Human Readable Preview */}
              <div className={styles.previewSection}>
                <h3>
                  <span className="material-icons">visibility</span>
                  Preview
                </h3>
                <div className={styles.humanReadable}>
                  <div className={styles.previewLine}>
                    <span className={styles.previewLabel}>ENTRY</span>
                    <span className={styles.previewText}>{humanReadable.entry}</span>
                  </div>
                  <div className={styles.previewLine}>
                    <span className={styles.previewLabel}>EXIT</span>
                    <span className={styles.previewText}>{humanReadable.exit}</span>
                  </div>
                </div>
              </div>
              
              {/* Validation */}
              <div className={styles.previewSection}>
                <h3>
                  <span className="material-icons">verified</span>
                  Validation
                </h3>
                
                {validation.errors.length > 0 && (
                  <div className={styles.validationErrors}>
                    {validation.errors.map((err, i) => (
                      <div key={i} className={styles.errorItem}>
                        <span className="material-icons">error</span>
                        {err}
                      </div>
                    ))}
                  </div>
                )}
                
                {validation.warnings.length > 0 && (
                  <div className={styles.validationWarnings}>
                    {validation.warnings.map((warn, i) => (
                      <div key={i} className={styles.warningItem}>
                        <span className="material-icons">warning</span>
                        {warn}
                      </div>
                    ))}
                  </div>
                )}
                
                {validation.errors.length === 0 && validation.warnings.length === 0 && (
                  <div className={styles.validationSuccess}>
                    <span className="material-icons">check_circle</span>
                    Strategy is valid
                  </div>
                )}
              </div>
              
              {/* JSON Preview Toggle */}
              <div className={styles.previewSection}>
                <button 
                  className={styles.jsonToggle}
                  onClick={() => setShowJsonPreview(!showJsonPreview)}
                >
                  <span className="material-icons">{showJsonPreview ? 'expand_less' : 'expand_more'}</span>
                  {showJsonPreview ? 'Hide' : 'Show'} JSON DSL
                </button>
                
                {showJsonPreview && compiledDSL && (
                  <div className={styles.jsonPreview}>
                    <pre>{JSON.stringify(compiledDSL, null, 2)}</pre>
                    <button className={styles.exportJsonBtn} onClick={handleExportJson}>
                      <span className="material-icons">download</span>
                      Export JSON
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Save Modal */}
        {showSaveModal && (
          <div className={styles.modalOverlay} onClick={() => setShowSaveModal(false)}>
            <div className={styles.saveModal} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3>
                  <span className="material-icons">save</span>
                  Save Strategy
                </h3>
                <button className={styles.closeModalBtn} onClick={() => setShowSaveModal(false)}>
                  <span className="material-icons">close</span>
                </button>
              </div>
              
              <div className={styles.modalContent}>
                <div className={styles.formGroup}>
                  <label>Strategy Name *</label>
                  <input
                    type="text"
                    value={strategyName}
                    onChange={(e) => setStrategyName(e.target.value)}
                    placeholder="e.g., EMA Crossover with RSI Filter"
                    className={styles.textInput}
                  />
                </div>
                
                <div className={styles.formGroup}>
                  <label>Description (optional)</label>
                  <textarea
                    value={strategyDescription}
                    onChange={(e) => setStrategyDescription(e.target.value)}
                    placeholder="Describe your strategy..."
                    className={styles.textArea}
                    rows={3}
                  />
                </div>
              </div>
              
              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => setShowSaveModal(false)}>
                  Cancel
                </button>
                <button className={styles.confirmSaveBtn} onClick={handleSaveStrategy}>
                  <span className="material-icons">save</span>
                  {selectedStrategyId ? 'Update Strategy' : 'Save Strategy'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
