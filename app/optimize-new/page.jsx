'use client'

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import MonteCarloChart from '@/components/MonteCarloChart'
import BacktestLightweightChart from '@/components/BacktestLightweightChart'
import StrategySelectorSection from '@/components/StrategySelectorSection'
import { API_URL } from '@/lib/api'
import { performBootstrapResampling, applyStrategyToResampled, runMonteCarloSimulation, generateHistogramBins, testBucketCountsPreserved, testBucketization } from '@/lib/resampling'
import styles from './page.module.css'

// Constants
const CURRENT_YEAR = new Date().getFullYear()
const AVAILABLE_YEARS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i)

const SYMBOLS = [
  'BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD',
  'ADA-USD', 'DOGE-USD', 'AVAX-USD', 'DOT-USD', 'MATIC-USD',
  'TOTAL-USD'
]

const INTERVALS = [
  { value: '1h', label: '1 Hour' },
  { value: '4h', label: '4 Hours' },
  { value: '1d', label: '1 Day' },
  { value: '1wk', label: '1 Week' },
]

const INDICATOR_TYPES = [
  // Crossover indicators
  { 
    value: 'ema', 
    label: 'EMA (Exponential Moving Average)', 
    description: 'Crossover of two EMAs', 
    signalType: 'crossover',
    entryLogic: '🟢 LONG: Fast EMA crosses ABOVE Slow EMA (Golden Cross)\n🔴 SHORT: Fast EMA crosses BELOW Slow EMA (Death Cross)',
    exitLogic: 'Position reverses on opposite crossover signal'
  },
  { 
    value: 'ma', 
    label: 'MA (Simple Moving Average)', 
    description: 'Crossover of two MAs', 
    signalType: 'crossover',
    entryLogic: '🟢 LONG: Fast MA crosses ABOVE Slow MA (Golden Cross)\n🔴 SHORT: Fast MA crosses BELOW Slow MA (Death Cross)',
    exitLogic: 'Position reverses on opposite crossover signal'
  },
  { 
    value: 'dema', 
    label: 'DEMA (Double Exponential MA)', 
    description: 'Crossover of two DEMAs', 
    signalType: 'crossover',
    entryLogic: '🟢 LONG: Fast DEMA crosses ABOVE Slow DEMA\n🔴 SHORT: Fast DEMA crosses BELOW Slow DEMA',
    exitLogic: 'Position reverses on opposite crossover signal'
  },
  // Threshold indicators
  { 
    value: 'rsi', 
    label: 'RSI (Relative Strength Index)', 
    description: 'Overbought/Oversold levels', 
    signalType: 'threshold',
    entryLogic: '🟢 LONG: RSI crosses ABOVE oversold level (e.g., 30)\n🔴 SHORT: RSI crosses BELOW overbought level (e.g., 70)',
    exitLogic: 'Position reverses when RSI crosses opposite threshold'
  },
  { 
    value: 'cci', 
    label: 'CCI (Commodity Channel Index)', 
    description: 'Overbought/Oversold levels', 
    signalType: 'threshold',
    entryLogic: '🟢 LONG: CCI crosses ABOVE oversold level (e.g., -100)\n🔴 SHORT: CCI crosses BELOW overbought level (e.g., +100)',
    exitLogic: 'Position reverses when CCI crosses opposite threshold'
  },
  { 
    value: 'zscore', 
    label: 'Z-Score', 
    description: 'Statistical deviation from mean', 
    signalType: 'threshold',
    entryLogic: '🟢 LONG: Z-Score crosses ABOVE lower threshold (e.g., -2)\n🔴 SHORT: Z-Score crosses BELOW upper threshold (e.g., +2)',
    exitLogic: 'Position reverses when Z-Score crosses opposite threshold'
  },
  { 
    value: 'roll_std', 
    label: 'Rolling Standard Deviation', 
    description: 'Volatility threshold signals', 
    signalType: 'threshold',
    entryLogic: '🟢 LONG: Volatility drops BELOW low threshold (calm market)\n🔴 SHORT: Volatility rises ABOVE high threshold (volatile market)',
    exitLogic: 'Position reverses when volatility crosses opposite threshold'
  },
  { 
    value: 'roll_median', 
    label: 'Rolling Median', 
    description: 'Price crosses median line', 
    signalType: 'price_cross',
    entryLogic: '🟢 LONG: Price crosses ABOVE rolling median\n🔴 SHORT: Price crosses BELOW rolling median',
    exitLogic: 'Position reverses when price crosses median in opposite direction'
  },
  { 
    value: 'roll_percentile', 
    label: 'Rolling Percentile', 
    description: 'Percentile threshold signals', 
    signalType: 'threshold',
    entryLogic: '🟢 LONG: Percentile crosses ABOVE oversold level (e.g., 20)\n🔴 SHORT: Percentile crosses BELOW overbought level (e.g., 80)',
    exitLogic: 'Position reverses when percentile crosses opposite threshold'
  },
]

// Helper to check if indicator uses crossover signals (fast/slow)
const isCrossoverIndicator = (type) => {
  const indicator = INDICATOR_TYPES.find(i => i.value === type)
  return indicator?.signalType === 'crossover'
}

// Helper to get indicator label
const getIndicatorLabel = (type) => {
  const indicator = INDICATOR_TYPES.find(i => i.value === type)
  return indicator?.label || type.toUpperCase()
}

// Helper to get indicator entry/exit logic
const getIndicatorLogic = (type) => {
  const indicator = INDICATOR_TYPES.find(i => i.value === type)
  return {
    entry: indicator?.entryLogic || 'No entry logic defined',
    exit: indicator?.exitLogic || 'No exit logic defined',
    description: indicator?.description || ''
  }
}

const COMPARISON_TIMEFRAMES = [
  { value: '1h', label: '1 Hour' },
  { value: '4h', label: '4 Hours' },
  { value: '1d', label: '1 Day' },
  { value: '3d', label: '3 Days' },
  { value: '1wk', label: '1 Week' },
  { value: '1M', label: '1 Month' },
]

// Helper component for number inputs that allows proper editing
const NumberInput = ({ value, onChange, min, max, step, className, ...props }) => {
  const [localValue, setLocalValue] = useState(String(value))
  
  // Sync with external value changes
  useEffect(() => {
    setLocalValue(String(value))
  }, [value])
  
  const handleChange = (e) => {
    const newValue = e.target.value
    setLocalValue(newValue)
    
    // Only call onChange if the value is a valid number
    if (newValue === '' || newValue === '-') {
      // Don't update parent state for incomplete input
      return
    }
    
    const parsed = parseFloat(newValue)
    if (!isNaN(parsed)) {
      onChange(parsed)
    }
  }
  
  const handleBlur = () => {
    // On blur, if empty or invalid, reset to original value
    if (localValue === '' || localValue === '-' || isNaN(parseFloat(localValue))) {
      setLocalValue(String(value))
    } else {
      // Ensure the value is within bounds
      let parsed = parseFloat(localValue)
      if (min !== undefined && parsed < min) parsed = min
      if (max !== undefined && parsed > max) parsed = max
      onChange(parsed)
      setLocalValue(String(parsed))
    }
  }
  
  return (
    <input
      type="text"
      inputMode="decimal"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
      {...props}
    />
  )
}

// Available components that can be added
const AVAILABLE_COMPONENTS = [
  {
    id: 'strategyRobustTest',
    title: 'Strategy Robust Test',
    icon: 'science',
    description: 'Test your strategy with in-sample and out-of-sample validation to find optimal parameters.',
    required: true
  },
  {
    id: 'resampling',
    title: 'Bootstrap Resampling',
    icon: 'shuffle',
    description: 'Apply bootstrap resampling to test strategy robustness under different market conditions.'
  },
  {
    id: 'simulation',
    title: 'Monte Carlo Simulation',
    icon: 'casino',
    description: 'Run Monte Carlo simulations to estimate the distribution of possible outcomes.'
  },
  {
    id: 'significance',
    title: 'Statistical Significance',
    icon: 'analytics',
    description: 'Perform hypothesis testing to validate if strategy returns are statistically significant.'
  },
  {
    id: 'stressTest',
    title: 'Stress Test',
    icon: 'warning_amber',
    description: 'Stress test your strategy with delayed entries/exits across different time periods.'
  },
  {
    id: 'timeframeComparison',
    title: 'Timeframe Comparison',
    icon: 'compare_arrows',
    description: 'Compare strategy performance across multiple timeframes to find optimal trading frequency.'
  }
]

const HEATMAP_METRIC_OPTIONS = [
  { value: 'sharpe_ratio', label: 'Sharpe Ratio' },
  { value: 'total_return', label: 'Total Return' },
  { value: 'win_rate', label: 'Win Rate' },
  { value: 'max_drawdown', label: 'Max Drawdown' },
]

export default function OptimizeNewPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  
  // View mode: 'select' (initial), 'create' (new strategy form), 'active' (strategy in progress)
  const [viewMode, setViewMode] = useState('select')
  
  // Saved strategies state (optimization configs)
  const [savedStrategies, setSavedStrategies] = useState([])
  const [isLoadingStrategies, setIsLoadingStrategies] = useState(true)
  const [selectedStrategyId, setSelectedStrategyId] = useState(null)
  
  // User strategies from Indicator Sandbox
  const [userSavedStrategies, setUserSavedStrategies] = useState([])
  const [userStrategiesLoading, setUserStrategiesLoading] = useState(false)
  const [selectedUserStrategyId, setSelectedUserStrategyId] = useState(null)
  const [useCustomIndicatorConfig, setUseCustomIndicatorConfig] = useState(true)
  
  // Strategy creation state
  const [strategyName, setStrategyName] = useState('')
  const [isStrategyCreated, setIsStrategyCreated] = useState(false)
  const [isEditingConfig, setIsEditingConfig] = useState(false)
  
  // Configuration state
  const [symbol, setSymbol] = useState('BTC-USD')
  const [interval, setInterval] = useState('1d')
  const [indicatorType, setIndicatorType] = useState('ema')
  const [inSampleYears, setInSampleYears] = useState([CURRENT_YEAR - 2, CURRENT_YEAR - 3])
  const [outSampleYears, setOutSampleYears] = useState([CURRENT_YEAR - 1, CURRENT_YEAR])
  const [maxEmaShort, setMaxEmaShort] = useState(20)
  const [maxEmaLong, setMaxEmaLong] = useState(50)
  
  // Indicator-specific parameters
  const [indicatorLength, setIndicatorLength] = useState(14)
  const [maxIndicatorTop, setMaxIndicatorTop] = useState(80)
  const [minIndicatorBottom, setMinIndicatorBottom] = useState(-20)
  const [maxIndicatorTopCci, setMaxIndicatorTopCci] = useState(100)
  const [minIndicatorBottomCci, setMinIndicatorBottomCci] = useState(-100)
  const [maxIndicatorTopZscore, setMaxIndicatorTopZscore] = useState(1)
  const [minIndicatorBottomZscore, setMinIndicatorBottomZscore] = useState(-1)
  
  // Out-of-Sample single values
  const [outSampleEmaShort, setOutSampleEmaShort] = useState(12)
  const [outSampleEmaLong, setOutSampleEmaLong] = useState(26)
  const [outSampleIndicatorBottom, setOutSampleIndicatorBottom] = useState(-2)
  const [outSampleIndicatorTop, setOutSampleIndicatorTop] = useState(2)
  const [initialCapital, setInitialCapital] = useState(10000)
  
  // Position type and risk-free rate
  const [positionType, setPositionType] = useState('both')
  const [stopLossMode, setStopLossMode] = useState('support_resistance')
  const [riskFreeRate, setRiskFreeRate] = useState(0)
  
  // Components/cells state - only strategyRobustTest by default when created
  const [activeComponents, setActiveComponents] = useState([])
  const [expandedComponents, setExpandedComponents] = useState({})
  const [showComponentMenu, setShowComponentMenu] = useState(false)
  
  // In-Sample results state
  const [isCalculatingInSample, setIsCalculatingInSample] = useState(false)
  const [inSampleProgress, setInSampleProgress] = useState(0)
  const [inSampleResults, setInSampleResults] = useState(null)
  const [inSampleError, setInSampleError] = useState(null)
  const [inSampleSortConfig, setInSampleSortConfig] = useState([])
  
  // Heatmap
  const [heatmapMetric, setHeatmapMetric] = useState('sharpe_ratio')
  const [selectedCell, setSelectedCell] = useState(null)
  const [heatmapHover, setHeatmapHover] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  
  // Color settings
  const [colorSettings, setColorSettings] = useState({
    sharpe_ratio: { red: -2, yellow: 0, green: 1, max: 3 },
    total_return: { red: -0.5, yellow: 0, green: 0.5, max: 1 },
    win_rate: { red: 0.3, yellow: 0.4, green: 0.5, max: 0.8 },
    max_drawdown: { red: -0.5, yellow: -0.3, green: -0.1, max: 0 }
  })
  
  // Out-of-Sample results state
  const [isCalculatingOutSample, setIsCalculatingOutSample] = useState(false)
  const [outSampleResult, setOutSampleResult] = useState(null)
  const [outSampleError, setOutSampleError] = useState(null)
  
  // Saved setup state
  const [savedSetup, setSavedSetup] = useState(null)
  
  // Resampling state
  const [resamplingVolatilityPercent, setResamplingVolatilityPercent] = useState(20)
  const [resamplingNumShuffles, setResamplingNumShuffles] = useState(10)
  const [resamplingSeed, setResamplingSeed] = useState(42)
  const [resamplingResults, setResamplingResults] = useState(null)
  const [resamplingSelectedIndex, setResamplingSelectedIndex] = useState(0)
  const [isResamplingLoading, setIsResamplingLoading] = useState(false)
  const [resamplingError, setResamplingError] = useState(null)
  const [resamplingStrategyResults, setResamplingStrategyResults] = useState(null)
  const [isApplyingStrategy, setIsApplyingStrategy] = useState(false)
  
  // Monte Carlo state
  const [monteCarloNumSims, setMonteCarloNumSims] = useState(1000)
  const [monteCarloSeed, setMonteCarloSeed] = useState(42)
  const [monteCarloResults, setMonteCarloResults] = useState(null)
  const [isMonteCarloLoading, setIsMonteCarloLoading] = useState(false)
  const [monteCarloError, setMonteCarloError] = useState(null)
  
  // Stress Test state
  const [stressTestStartYear, setStressTestStartYear] = useState(2020)
  const [stressTestEntryDelay, setStressTestEntryDelay] = useState(1)
  const [stressTestExitDelay, setStressTestExitDelay] = useState(1)
  const [stressTestPositionType, setStressTestPositionType] = useState('long_only')
  const [stressTestResults, setStressTestResults] = useState(null)
  const [isStressTestLoading, setIsStressTestLoading] = useState(false)
  const [stressTestError, setStressTestError] = useState(null)
  
  // Timeframe Comparison state
  const [selectedComparisonTimeframes, setSelectedComparisonTimeframes] = useState(['1h', '4h', '1d'])
  const [timeframeComparisonResults, setTimeframeComparisonResults] = useState({})
  const [timeframeComparisonLoading, setTimeframeComparisonLoading] = useState({})
  const [timeframeComparisonErrors, setTimeframeComparisonErrors] = useState({})
  const [isTimeframeComparisonRunning, setIsTimeframeComparisonRunning] = useState(false)
  const [normalizeEquityCurves, setNormalizeEquityCurves] = useState(true)
  const [timeframeComparisonProgress, setTimeframeComparisonProgress] = useState({ completed: 0, total: 0 })
  const [timeframeComparisonCache, setTimeframeComparisonCache] = useState({})
  const [equityCurveHover, setEquityCurveHover] = useState(null) // { x, values: { tf: equity } }
  
  // Hypothesis Testing state - New Stepper Flow
  const [hypothesisStep, setHypothesisStep] = useState(1) // 1, 2, or 3
  const [hypothesisTestType, setHypothesisTestType] = useState('one-sample') // 'one-sample', 'two-sample', 'correlation'
  const [hypothesisTail, setHypothesisTail] = useState('two-sided') // 'two-sided', 'right', 'left'
  const [hypothesisAlpha, setHypothesisAlpha] = useState(0.05)
  const [hypothesisMu0, setHypothesisMu0] = useState(0) // For one-sample: target mean (%)
  const [hypothesisTestVariant, setHypothesisTestVariant] = useState('default') // 'default', 'pooled' for two-sample; 'pearson', 'spearman' for correlation
  const [hypothesisResults, setHypothesisResults] = useState(null)
  const [isHypothesisLoading, setIsHypothesisLoading] = useState(false)
  const [hypothesisError, setHypothesisError] = useState(null)
  // For backward compatibility
  const [hypothesisNullReturn, setHypothesisNullReturn] = useState(0)
  const [hypothesisConfidenceLevel, setHypothesisConfidenceLevel] = useState(95)
  
  // User role state - for export functionality (admin/moderator only)
  const [canExportLogs, setCanExportLogs] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])
  
  // Check if user is admin/moderator for export functionality
  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const response = await fetch('/api/user')
        const data = await response.json()
        if (data.success && data.user) {
          const role = (data.user.role || '').toLowerCase()
          const isAdminOrMod = data.user.id === 'cmjzbir7y0000eybbir608elt' || 
                               role === 'admin' || role === 'moderator'
          setCanExportLogs(isAdminOrMod)
        }
      } catch (error) {
        console.error('Error checking user role:', error)
        setCanExportLogs(false)
      }
    }
    if (status === 'authenticated') {
      checkUserRole()
    }
  }, [status])

  // Load saved strategies on mount
  useEffect(() => {
    const loadStrategies = async () => {
      try {
        const response = await fetch('/api/optimization-configs')
        const data = await response.json()
        if (data.success) {
          setSavedStrategies(data.configs || [])
        }
      } catch (error) {
        console.error('Failed to load strategies:', error)
      } finally {
        setIsLoadingStrategies(false)
      }
    }
    loadStrategies()
  }, [])

  // Load user strategies from Indicator Sandbox
  const loadUserStrategies = useCallback(async () => {
    setUserStrategiesLoading(true)
    try {
      const response = await fetch('/api/user-strategies')
      const data = await response.json()
      if (data.success) {
        setUserSavedStrategies(data.strategies || [])
      }
    } catch (error) {
      console.warn('Failed to fetch user strategies:', error)
    } finally {
      setUserStrategiesLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUserStrategies()
  }, [loadUserStrategies])

  const handleSelectUserStrategy = useCallback((strategyId) => {
    setSelectedUserStrategyId(strategyId)
    
    // If a strategy is selected, apply its indicator settings
    if (strategyId) {
      const strategy = userSavedStrategies.find(s => s.id === strategyId)
      if (strategy?.dsl?.indicators) {
        const indicators = Object.values(strategy.dsl.indicators)
        if (indicators.length > 0) {
          const firstIndicator = indicators[0]
          const indicatorTypeMap = {
            'EMA': 'ema',
            'MA': 'ema',
            'RSI': 'rsi',
            'CCI': 'cci',
            'Z-Score': 'zscore',
            'ZSCORE': 'zscore'
          }
          const mappedType = indicatorTypeMap[firstIndicator.type?.toUpperCase()] || 'ema'
          setIndicatorType(mappedType)
          
          if (mappedType === 'rsi' && firstIndicator.length) {
            setIndicatorLength(firstIndicator.length)
          } else if (mappedType === 'cci' && firstIndicator.length) {
            setIndicatorLength(firstIndicator.length)
          } else if (mappedType === 'zscore' && (firstIndicator.window || firstIndicator.length)) {
            setIndicatorLength(firstIndicator.window || firstIndicator.length)
          }
        }
      }
    }
  }, [userSavedStrategies])

  const handleEditUserStrategy = useCallback((strategyId) => {
    router.push(`/strategy-maker?edit=${strategyId}`)
  }, [router])

  const handleCreateNewUserStrategy = useCallback(() => {
    router.push('/strategy-maker')
  }, [router])

  const handleToggleUserStrategyMode = useCallback((useCustom) => {
    setUseCustomIndicatorConfig(useCustom)
    if (useCustom) {
      setSelectedUserStrategyId(null)
    }
  }, [])

  // Save strategy to database
  const handleSaveStrategy = useCallback(async () => {
    if (!strategyName.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Strategy Name Required',
        text: 'Please enter a name for your strategy',
        background: '#1a1a2e',
        color: '#fff',
        confirmButtonColor: '#4488ff'
      })
      return
    }

    const strategyData = {
      symbol,
      interval,
      indicatorType,
      positionType,
      stopLossMode,
      initialCapital,
      riskFreeRate,
      inSampleYears,
      outSampleYears,
      maxEmaShort,
      maxEmaLong,
      outSampleEmaShort,
      outSampleEmaLong,
      indicatorLength,
      maxIndicatorTop,
      minIndicatorBottom,
      maxIndicatorTopCci,
      minIndicatorBottomCci,
      maxIndicatorTopZscore,
      minIndicatorBottomZscore,
      outSampleIndicatorBottom,
      outSampleIndicatorTop,
      stressTestStartYear,
      stressTestEntryDelay,
      stressTestExitDelay,
      stressTestPositionType,
      hypothesisNullReturn,
      hypothesisConfidenceLevel,
      resamplingVolatilityPercent,
      resamplingNumShuffles,
      resamplingSeed,
      monteCarloNumSims,
      monteCarloSeed,
      // Store active components and their results
      activeComponents,
      savedSetup: savedSetup ? {
        emaShort: savedSetup.emaShort,
        emaLong: savedSetup.emaLong,
        indicatorBottom: savedSetup.indicatorBottom,
        indicatorTop: savedSetup.indicatorTop,
      } : null,
    }

    try {
      const method = selectedStrategyId ? 'PUT' : 'POST'
      const url = selectedStrategyId 
        ? `/api/optimization-configs?id=${selectedStrategyId}`
        : '/api/optimization-configs'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: strategyName.trim(),
          config: strategyData
        })
      })

      const data = await response.json()
      if (data.success) {
        if (selectedStrategyId) {
          setSavedStrategies(prev => prev.map(s => s.id === selectedStrategyId ? data.config : s))
        } else {
          setSavedStrategies(prev => [...prev, data.config])
          setSelectedStrategyId(data.config.id)
        }
        
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: selectedStrategyId ? 'Strategy updated!' : 'Strategy saved!',
          showConfirmButton: false,
          timer: 2000,
          background: '#1a1a2e',
          color: '#fff'
        })
      } else {
        throw new Error(data.error || 'Failed to save strategy')
      }
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Save Failed',
        text: error.message,
        background: '#1a1a2e',
        color: '#fff',
        confirmButtonColor: '#ff4444'
      })
    }
  }, [
    strategyName, selectedStrategyId, symbol, interval, indicatorType, positionType, stopLossMode,
    initialCapital, riskFreeRate, inSampleYears, outSampleYears, maxEmaShort, maxEmaLong,
    outSampleEmaShort, outSampleEmaLong, indicatorLength, maxIndicatorTop, minIndicatorBottom,
    maxIndicatorTopCci, minIndicatorBottomCci, maxIndicatorTopZscore, minIndicatorBottomZscore,
    outSampleIndicatorBottom, outSampleIndicatorTop, stressTestStartYear, stressTestEntryDelay,
    stressTestExitDelay, stressTestPositionType, hypothesisNullReturn, hypothesisConfidenceLevel,
    resamplingVolatilityPercent, resamplingNumShuffles, resamplingSeed, monteCarloNumSims,
    monteCarloSeed, activeComponents, savedSetup
  ])

  // Load a saved strategy
  const handleLoadStrategy = useCallback((strategy) => {
    const config = strategy.config || strategy
    
    setStrategyName(strategy.name)
    setSelectedStrategyId(strategy.id)
    setSymbol(config.symbol || 'BTC-USD')
    setInterval(config.interval || '1d')
    setIndicatorType(config.indicatorType || 'ema')
    setPositionType(config.positionType || 'both')
    setStopLossMode(config.stopLossMode || 'support_resistance')
    setInitialCapital(config.initialCapital || 10000)
    setRiskFreeRate(config.riskFreeRate || 0)
    setInSampleYears(config.inSampleYears || [CURRENT_YEAR - 2, CURRENT_YEAR - 3])
    setOutSampleYears(config.outSampleYears || [CURRENT_YEAR - 1, CURRENT_YEAR])
    setMaxEmaShort(config.maxEmaShort || 20)
    setMaxEmaLong(config.maxEmaLong || 50)
    setOutSampleEmaShort(config.outSampleEmaShort || 12)
    setOutSampleEmaLong(config.outSampleEmaLong || 26)
    setIndicatorLength(config.indicatorLength || 14)
    setMaxIndicatorTop(config.maxIndicatorTop || 80)
    setMinIndicatorBottom(config.minIndicatorBottom || -20)
    setMaxIndicatorTopCci(config.maxIndicatorTopCci || 100)
    setMinIndicatorBottomCci(config.minIndicatorBottomCci || -100)
    setMaxIndicatorTopZscore(config.maxIndicatorTopZscore || 1)
    setMinIndicatorBottomZscore(config.minIndicatorBottomZscore || -1)
    setOutSampleIndicatorBottom(config.outSampleIndicatorBottom || -2)
    setOutSampleIndicatorTop(config.outSampleIndicatorTop || 2)
    setStressTestStartYear(config.stressTestStartYear || 2020)
    setStressTestEntryDelay(config.stressTestEntryDelay ?? 1)
    setStressTestExitDelay(config.stressTestExitDelay ?? 1)
    setStressTestPositionType(config.stressTestPositionType || 'long_only')
    setHypothesisNullReturn(config.hypothesisNullReturn || 0)
    setHypothesisConfidenceLevel(config.hypothesisConfidenceLevel || 95)
    setResamplingVolatilityPercent(config.resamplingVolatilityPercent || 20)
    setResamplingNumShuffles(config.resamplingNumShuffles || 10)
    setResamplingSeed(config.resamplingSeed || 42)
    setMonteCarloNumSims(config.monteCarloNumSims || 1000)
    setMonteCarloSeed(config.monteCarloSeed || 42)
    
    // Restore active components if saved
    if (config.activeComponents && config.activeComponents.length > 0) {
      setActiveComponents(config.activeComponents)
      const expanded = {}
      config.activeComponents.forEach(c => { expanded[c] = true })
      setExpandedComponents(expanded)
    } else {
      setActiveComponents(['strategyRobustTest'])
      setExpandedComponents({ strategyRobustTest: true })
    }
    
    // Restore saved setup if available
    if (config.savedSetup) {
      setSavedSetup({
        ...config.savedSetup,
        symbol: config.symbol,
        interval: config.interval,
        indicatorType: config.indicatorType,
        initialCapital: config.initialCapital,
      })
    }
    
    setIsStrategyCreated(true)
    setViewMode('active')
    
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `Loaded "${strategy.name}"`,
      showConfirmButton: false,
      timer: 2000,
      background: '#1a1a2e',
      color: '#fff'
    })
  }, [])

  // Delete a saved strategy
  const handleDeleteStrategy = useCallback(async (strategyId, strategyName) => {
    const result = await Swal.fire({
      title: 'Delete Strategy?',
      text: `Are you sure you want to delete "${strategyName}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff4444',
      cancelButtonColor: '#333',
      confirmButtonText: 'Yes, delete it',
      background: '#1a1a2e',
      color: '#fff'
    })
    
    if (result.isConfirmed) {
      try {
        const response = await fetch(`/api/optimization-configs?id=${strategyId}`, {
          method: 'DELETE'
        })
        const data = await response.json()
        if (data.success) {
          setSavedStrategies(prev => prev.filter(s => s.id !== strategyId))
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'Strategy deleted',
            showConfirmButton: false,
            timer: 2000,
            background: '#1a1a2e',
            color: '#fff'
          })
        }
      } catch (error) {
        console.error('Failed to delete strategy:', error)
      }
    }
  }, [])

  // Create strategy handler
  const handleCreateStrategy = () => {
    if (!strategyName.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Strategy Name Required',
        text: 'Please enter a name for your strategy',
        background: '#1a1a2e',
        color: '#fff',
        confirmButtonColor: '#4488ff'
      })
      return
    }
    
    setIsStrategyCreated(true)
    setActiveComponents(['strategyRobustTest'])
    setExpandedComponents({ strategyRobustTest: true })
    setViewMode('active')
    setSelectedStrategyId(null) // New strategy, no ID yet
    
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `Strategy "${strategyName}" created!`,
      showConfirmButton: false,
      timer: 2000,
      background: '#1a1a2e',
      color: '#fff'
    })
  }

  // Reset strategy
  const handleResetStrategy = () => {
    Swal.fire({
      title: 'Close Strategy?',
      text: 'This will close the current strategy. Make sure to save your progress first.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff4444',
      cancelButtonColor: '#333',
      confirmButtonText: 'Yes, close',
      background: '#1a1a2e',
      color: '#fff'
    }).then((result) => {
      if (result.isConfirmed) {
        setStrategyName('')
        setIsStrategyCreated(false)
        setActiveComponents([])
        setExpandedComponents({})
        setInSampleResults(null)
        setOutSampleResult(null)
        setSavedSetup(null)
        setResamplingResults(null)
        setMonteCarloResults(null)
        setStressTestResults(null)
        setHypothesisResults(null)
        setTimeframeComparisonResults({})
        setTimeframeComparisonErrors({})
        setSelectedStrategyId(null)
        setViewMode('select')
      }
    })
  }

  // Add component
  const handleAddComponent = (componentId) => {
    if (!activeComponents.includes(componentId)) {
      setActiveComponents(prev => [...prev, componentId])
      setExpandedComponents(prev => ({ ...prev, [componentId]: true }))
    }
    setShowComponentMenu(false)
  }

  // Remove component
  const handleRemoveComponent = (componentId) => {
    if (componentId === 'strategyRobustTest') return // Can't remove required component
    setActiveComponents(prev => prev.filter(id => id !== componentId))
    setExpandedComponents(prev => {
      const newState = { ...prev }
      delete newState[componentId]
      return newState
    })
  }

  // Toggle component expansion
  const toggleComponent = (componentId) => {
    setExpandedComponents(prev => ({
      ...prev,
      [componentId]: !prev[componentId]
    }))
  }

  // Year toggle functions
  const toggleInSampleYear = useCallback((year) => {
    setInSampleYears(prev => {
      if (prev.includes(year)) {
        return prev.filter(y => y !== year)
      } else {
        setOutSampleYears(out => out.filter(y => y !== year))
        return [...prev, year].sort((a, b) => a - b)
      }
    })
  }, [])

  const toggleOutSampleYear = useCallback((year) => {
    setOutSampleYears(prev => {
      if (prev.includes(year)) {
        return prev.filter(y => y !== year)
      } else {
        setInSampleYears(ins => ins.filter(y => y !== year))
        return [...prev, year].sort((a, b) => a - b)
      }
    })
  }, [])

  // Calculate In-Sample
  const calculateInSample = async () => {
    if (inSampleYears.length === 0) {
      setInSampleError('Please select at least one year for In-Sample testing')
      return
    }

    setIsCalculatingInSample(true)
    setInSampleProgress(0)
    setInSampleError(null)
    setInSampleResults(null)
    setSelectedCell(null)

    let indicatorParams = {}
    let maxX, maxY, minX, minY
    
    if (isCrossoverIndicator(indicatorType)) {
      indicatorParams = { fast: 3, slow: 10 }
      maxX = maxEmaShort
      maxY = maxEmaLong
    } else if (indicatorType === 'rsi') {
      indicatorParams = { length: indicatorLength }
      minX = minIndicatorBottom
      maxX = 0
      minY = 0
      maxY = maxIndicatorTop
    } else if (indicatorType === 'cci') {
      indicatorParams = { length: indicatorLength }
      minX = minIndicatorBottomCci
      maxX = 0
      minY = 0
      maxY = maxIndicatorTopCci
    } else if (indicatorType === 'zscore') {
      indicatorParams = { length: indicatorLength }
      minX = minIndicatorBottomZscore
      maxX = 0
      minY = 0
      maxY = maxIndicatorTopZscore
    }
    
    // Calculate estimated combinations for progress estimation
    let estimatedCombinations = 1
    if (isCrossoverIndicator(indicatorType)) {
      const shortRange = maxEmaShort - 3 + 1
      const longRange = maxEmaLong - 10 + 1
      estimatedCombinations = (shortRange * longRange) / 2
    } else {
      estimatedCombinations = 100 // Default estimate for other indicators
    }
    
    // Estimate time: ~50ms per combination on average
    const estimatedTimeMs = Math.max(estimatedCombinations * 50, 2000)
    const startTime = Date.now()
    
    // Progress simulation interval
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(Math.floor((elapsed / estimatedTimeMs) * 95), 95)
      setInSampleProgress(progress)
    }, 200)

    try {
      const response = await fetch(`${API_URL}/api/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          interval,
          years: inSampleYears.sort((a, b) => a - b),
          indicator_type: indicatorType,
          indicator_params: indicatorParams,
          max_ema_short: isCrossoverIndicator(indicatorType) ? maxX : null,
          max_ema_long: isCrossoverIndicator(indicatorType) ? maxY : null,
          indicator_length: !isCrossoverIndicator(indicatorType) ? indicatorLength : null,
          min_indicator_bottom: !isCrossoverIndicator(indicatorType) ? minX : null,
          max_indicator_bottom: !isCrossoverIndicator(indicatorType) ? maxX : null,
          min_indicator_top: !isCrossoverIndicator(indicatorType) ? minY : null,
          max_indicator_top: !isCrossoverIndicator(indicatorType) ? maxY : null,
          sample_type: 'in_sample',
          return_heatmap: true,
          position_type: positionType,
          risk_free_rate: riskFreeRate,
        }),
      })

      if (!response.ok) throw new Error('Failed to calculate optimization')
      const data = await response.json()
      setInSampleProgress(100)
      setInSampleResults(data)
    } catch (err) {
      setInSampleError(err.message)
    } finally {
      clearInterval(progressInterval)
      setIsCalculatingInSample(false)
      setInSampleProgress(0)
    }
  }

  // Calculate Out-of-Sample
  const calculateOutSample = async () => {
    if (outSampleYears.length === 0) {
      setOutSampleError('Please select at least one year for Out-of-Sample testing')
      return
    }

    setIsCalculatingOutSample(true)
    setOutSampleError(null)
    setOutSampleResult(null)

    let requestBody = {
      symbol,
      interval,
      in_sample_years: inSampleYears.sort((a, b) => a - b),
      out_sample_years: outSampleYears.sort((a, b) => a - b),
      initial_capital: initialCapital,
      position_type: positionType,
      risk_free_rate: riskFreeRate,
    }

    if (isCrossoverIndicator(indicatorType)) {
      requestBody.ema_short = outSampleEmaShort
      requestBody.ema_long = outSampleEmaLong
    } else {
      requestBody.indicator_type = indicatorType
      requestBody.indicator_length = indicatorLength
      requestBody.indicator_bottom = outSampleIndicatorBottom
      requestBody.indicator_top = outSampleIndicatorTop
    }

    try {
      const response = await fetch(`${API_URL}/api/optimize-equity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) throw new Error('Failed to calculate')
      const data = await response.json()
      setOutSampleResult(data)
      
      // Auto-save setup
      // Get DSL from selected saved strategy if using saved strategy mode
      let dslConfig = null
      if (!useCustomConfig && selectedUserStrategyId) {
        const selectedStrategy = userSavedStrategies.find(s => s.id === selectedUserStrategyId)
        if (selectedStrategy?.dsl) {
          dslConfig = {
            indicators: selectedStrategy.dsl.indicators || {},
            entry: selectedStrategy.dsl.entry || null,
            exit: selectedStrategy.dsl.exit || null
          }
        }
      }
      
      const setup = {
        symbol,
        interval,
        indicatorType,
        positionType,
        stopLossMode,
        useStopLoss: stopLossMode !== 'none',
        riskFreeRate,
        initialCapital,
        inSampleYears: [...inSampleYears],
        outSampleYears: [...outSampleYears],
        // Include DSL config if using saved strategy
        dsl: dslConfig,
        useSavedStrategy: !useCustomConfig && selectedUserStrategyId !== null,
        savedStrategyId: selectedUserStrategyId,
        ...(isCrossoverIndicator(indicatorType) ? {
          emaShort: outSampleEmaShort,
          emaLong: outSampleEmaLong
        } : {
          indicatorLength,
          indicatorBottom: outSampleIndicatorBottom,
          indicatorTop: outSampleIndicatorTop
        }),
        outSampleResult: data,
        inSampleResults: inSampleResults,
        equityCurve: data?.equity_curve || [],
        metrics: {
          inSample: data?.in_sample || null,
          outSample: data?.out_sample || null,
          segments: data?.segments || []
        },
        strategyReturns: data?.equity_curve?.map((p, i, arr) => 
          i > 0 ? (p.equity - arr[i-1].equity) / arr[i-1].equity : 0
        ).filter(r => r !== 0) || [],
        savedAt: new Date().toISOString()
      }
      
      setSavedSetup(setup)
      
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Strategy validated and saved!',
        showConfirmButton: false,
        timer: 2000,
        background: '#1a1a2e',
        color: '#fff'
      })
    } catch (err) {
      setOutSampleError(err.message)
    } finally {
      setIsCalculatingOutSample(false)
    }
  }

  // Sorting functions
  const getSortInfo = useCallback((key) => {
    const idx = inSampleSortConfig.findIndex(s => s.key === key)
    if (idx === -1) return null
    return { ...inSampleSortConfig[idx], priority: idx + 1 }
  }, [inSampleSortConfig])

  const handleSort = useCallback((key, event) => {
    setInSampleSortConfig(prev => {
      const existingIndex = prev.findIndex(s => s.key === key)
      
      if (event.shiftKey) {
        if (existingIndex >= 0) {
          const existing = prev[existingIndex]
          if (existing.direction === 'desc') {
            const newConfig = [...prev]
            newConfig[existingIndex] = { key, direction: 'asc' }
            return newConfig
          } else {
            return prev.filter((_, i) => i !== existingIndex)
          }
        } else {
          return [...prev, { key, direction: 'desc' }]
        }
      } else {
        if (existingIndex >= 0) {
          const existing = prev[existingIndex]
          if (existing.direction === 'desc') {
            return [{ key, direction: 'asc' }]
          } else {
            return []
          }
        } else {
          return [{ key, direction: 'desc' }]
        }
      }
    })
  }, [])

  // Sorted results
  const sortedInSampleResults = useMemo(() => {
    if (!inSampleResults?.results) return []
    if (inSampleSortConfig.length === 0) return inSampleResults.results
    
    return [...inSampleResults.results].sort((a, b) => {
      for (const { key, direction } of inSampleSortConfig) {
        const aVal = a[key] ?? 0
        const bVal = b[key] ?? 0
        if (aVal !== bVal) {
          return direction === 'asc' ? aVal - bVal : bVal - aVal
        }
      }
      return 0
    })
  }, [inSampleResults?.results, inSampleSortConfig])

  // Heatmap data
  const heatmapData = useMemo(() => {
    if (!inSampleResults?.results) return null
    
    const results = inSampleResults.results
    const xKey = isCrossoverIndicator(indicatorType) ? 'ema_short' : 'indicator_bottom'
    const yKey = isCrossoverIndicator(indicatorType) ? 'ema_long' : 'indicator_top'
    
    const xValues = [...new Set(results.map(r => r[xKey]))].sort((a, b) => a - b)
    const yValues = [...new Set(results.map(r => r[yKey]))].sort((a, b) => a - b)
    
    const lookup = {}
    results.forEach(r => {
      lookup[`${r[xKey]}_${r[yKey]}`] = r
    })
    
    return { xValues, yValues, lookup }
  }, [inSampleResults?.results, indicatorType])

  // Color calculation
  const calculateColor = useCallback((value, redThreshold, yellowThreshold, greenThreshold, maxValue, reverse = false) => {
    const settings = colorSettings[heatmapMetric] || {}
    const red = settings.red ?? redThreshold
    const yellow = settings.yellow ?? yellowThreshold
    const green = settings.green ?? greenThreshold
    const max = settings.max ?? maxValue

    if (reverse) {
      if (value <= red) {
        const intensity = Math.min(1, Math.abs(value - red) / Math.abs(max - red))
        const r = Math.round(255 - intensity * 55)
        const g = Math.round(120 - intensity * 80)
        const b = Math.round(120 - intensity * 80)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      } else if (value <= yellow) {
        const intensity = (value - red) / (yellow - red)
        const r = Math.round(255 - intensity * 30)
        const g = Math.round(180 + intensity * 35)
        const b = Math.round(80 + intensity * 40)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      } else {
        const intensity = Math.min(1, (value - yellow) / (green - yellow))
        const r = Math.round(200 - intensity * 150)
        const g = Math.round(180 + intensity * 65)
        const b = Math.round(100 - intensity * 20)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      }
    } else {
      if (value < red) {
        const intensity = Math.min(1, Math.abs(value - red) / Math.abs(red - (red - Math.abs(max - red))))
        const r = Math.round(255 - intensity * 55)
        const g = Math.round(120 - intensity * 80)
        const b = Math.round(120 - intensity * 80)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      } else if (value < yellow) {
        const intensity = (value - red) / (yellow - red)
        const r = Math.round(255 - intensity * 30)
        const g = Math.round(180 + intensity * 35)
        const b = Math.round(80 + intensity * 40)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      } else if (value < green) {
        const intensity = (value - yellow) / (green - yellow)
        const r = Math.round(225 - intensity * 85)
        const g = Math.round(215 + intensity * 20)
        const b = Math.round(120 - intensity * 60)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      } else {
        const intensity = Math.min(1, (value - green) / (max - green))
        const r = Math.round(140 - intensity * 90)
        const g = Math.round(210 + intensity * 35)
        const b = Math.round(140 - intensity * 60)
        return `rgba(${r}, ${g}, ${b}, 0.9)`
      }
    }
  }, [colorSettings, heatmapMetric])

  const getHeatmapColor = useCallback((value) => {
    if (value === null || value === undefined) return 'rgba(40, 40, 45, 0.6)'
    
    if (heatmapMetric === 'sharpe_ratio') {
      return calculateColor(value, -2, 0, 1, 3)
    } else if (heatmapMetric === 'total_return') {
      return calculateColor(value, -0.5, 0, 0.5, 1)
    } else if (heatmapMetric === 'win_rate') {
      return calculateColor(value, 0.3, 0.4, 0.5, 0.8)
    } else if (heatmapMetric === 'max_drawdown') {
      return calculateColor(value, -0.5, -0.3, -0.1, 0, true)
    }
    
    return 'rgba(100, 100, 100, 0.5)'
  }, [heatmapMetric, calculateColor])

  // ============ Bootstrap Resampling Handler ============
  const handleGenerateResampling = useCallback(async () => {
    if (!savedSetup?.equityCurve || savedSetup.equityCurve.length < 31) {
      setResamplingError('Need at least 31 data points for resampling. Please ensure your saved setup has sufficient data.')
      return
    }

    setIsResamplingLoading(true)
    setResamplingError(null)

    try {
      const validEquityCurve = savedSetup.equityCurve.filter(point => 
        point && typeof point.equity === 'number' && !isNaN(point.equity) && point.equity > 0
      )
      
      if (validEquityCurve.length < 31) {
        setResamplingError('Need at least 31 valid data points.')
        return
      }

      const candles = validEquityCurve.map((point, i, arr) => {
        const equity = point.equity
        const prevEquity = i > 0 ? arr[i - 1].equity : equity
        const changeRatio = prevEquity > 0 ? Math.abs((equity - prevEquity) / prevEquity) : 0
        const open = prevEquity
        const close = equity
        const high = Math.max(open, close) * (1 + changeRatio * 0.1)
        const low = Math.min(open, close) * (1 - changeRatio * 0.1)
        
        return {
          date: point.date || `day-${i}`,
          open: open || 1,
          high: high || 1,
          low: low || 1,
          close: close || 1,
          sample_type: point.sample_type
        }
      })

      await new Promise(resolve => setTimeout(resolve, 0))
      
      const results = performBootstrapResampling(
        candles,
        resamplingVolatilityPercent,
        resamplingNumShuffles,
        resamplingSeed
      )

      setResamplingResults(results)
      setResamplingSelectedIndex(0)
    } catch (err) {
      console.error('Resampling error:', err)
      setResamplingError(err.message || 'Failed to generate resampling')
    } finally {
      setIsResamplingLoading(false)
    }
  }, [savedSetup, resamplingVolatilityPercent, resamplingNumShuffles, resamplingSeed])

  // Apply strategy to resampled data
  const handleApplyStrategy = useCallback(async () => {
    if (!resamplingResults || !savedSetup) {
      setResamplingError('Please generate resamples first.')
      return
    }

    setIsApplyingStrategy(true)
    setResamplingError(null)

    try {
      const strategyResults = { original: null, resamples: [] }

      const originalResult = applyStrategyToResampled(resamplingResults.original.candles, savedSetup)
      strategyResults.original = originalResult

      for (const resample of resamplingResults.resamples) {
        const result = applyStrategyToResampled(resample.candles, savedSetup)
        strategyResults.resamples.push({ index: resample.index, seed: resample.seed, ...result })
      }

      const allReturns = strategyResults.resamples.map(r => r?.metrics?.totalReturn || 0).filter(r => isFinite(r))
      const allDrawdowns = strategyResults.resamples.map(r => r?.metrics?.maxDrawdown || 0).filter(r => isFinite(r))
      const allWinRates = strategyResults.resamples.map(r => r?.metrics?.winRate || 0).filter(r => isFinite(r))
      
      strategyResults.distribution = {
        avgReturn: allReturns.length > 0 ? allReturns.reduce((a, b) => a + b, 0) / allReturns.length : 0,
        minReturn: allReturns.length > 0 ? Math.min(...allReturns) : 0,
        maxReturn: allReturns.length > 0 ? Math.max(...allReturns) : 0,
        avgDrawdown: allDrawdowns.length > 0 ? allDrawdowns.reduce((a, b) => a + b, 0) / allDrawdowns.length : 0,
        worstDrawdown: allDrawdowns.length > 0 ? Math.max(...allDrawdowns) : 0,
        avgWinRate: allWinRates.length > 0 ? allWinRates.reduce((a, b) => a + b, 0) / allWinRates.length : 0
      }

      setResamplingStrategyResults(strategyResults)
    } catch (err) {
      console.error('Strategy application error:', err)
      setResamplingError(err.message || 'Failed to apply strategy')
    } finally {
      setIsApplyingStrategy(false)
    }
  }, [resamplingResults, savedSetup])

  // ============ Monte Carlo Handler ============
  const handleRunMonteCarlo = useCallback(async () => {
    if (!savedSetup?.strategyReturns || savedSetup.strategyReturns.length === 0) {
      setMonteCarloError('No trade returns available.')
      return
    }

    setIsMonteCarloLoading(true)
    setMonteCarloError(null)

    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      
      const results = runMonteCarloSimulation(
        savedSetup.strategyReturns,
        monteCarloNumSims,
        savedSetup.initialCapital,
        monteCarloSeed
      )

      if (!results.success) {
        throw new Error(results.error || 'Failed to run simulation')
      }

      results.histograms = {
        returns: generateHistogramBins(results.distributions.totalReturns, 25),
        drawdowns: generateHistogramBins(results.distributions.maxDrawdowns, 25)
      }

      setMonteCarloResults(results)
    } catch (err) {
      console.error('Monte Carlo error:', err)
      setMonteCarloError(err.message || 'Failed to run Monte Carlo simulation')
    } finally {
      setIsMonteCarloLoading(false)
    }
  }, [savedSetup, monteCarloNumSims, monteCarloSeed])

  // ============ Stress Test Handler ============
  const handleRunStressTest = useCallback(async () => {
    if (!savedSetup) {
      setStressTestError('No saved setup found.')
      return
    }

    setIsStressTestLoading(true)
    setStressTestError(null)
    setStressTestResults(null)

    try {
      const startDate = `${stressTestStartYear}-01-01`
      const endDate = new Date().toISOString().split('T')[0]
      
      let strategyMode
      if (stressTestPositionType === 'long_only') {
        strategyMode = 'long_only'
      } else if (stressTestPositionType === 'short_only') {
        strategyMode = 'short_only'
      } else {
        strategyMode = savedSetup.positionType === 'both' ? 'reversal' : savedSetup.positionType
      }

      let indicatorParams = null
      if (!isCrossoverIndicator(savedSetup.indicatorType)) {
        indicatorParams = {
          length: savedSetup.indicatorLength,
          top: savedSetup.indicatorTop,
          bottom: savedSetup.indicatorBottom
        }
      }

      const backtestConfig = {
        asset: savedSetup.symbol?.replace('-USD', '/USDT') || 'BTC/USDT',
        start_date: startDate,
        end_date: endDate,
        interval: savedSetup.interval || '1d',
        initial_capital: savedSetup.initialCapital || 10000,
        enable_short: stressTestPositionType !== 'long_only',
        strategy_mode: strategyMode,
        ema_fast: savedSetup.emaShort || 12,
        ema_slow: savedSetup.emaLong || 26,
        indicator_type: savedSetup.indicatorType || 'ema',
        indicator_params: indicatorParams,
        entry_delay: stressTestEntryDelay,
        exit_delay: stressTestExitDelay,
        use_stop_loss: savedSetup.useStopLoss ?? true,
        // Include DSL for saved strategy execution
        dsl: savedSetup.dsl || null
      }

      const response = await fetch(`${API_URL}/api/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backtestConfig),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error ${response.status}`)
      }

      const data = await response.json()
      if (!data.success) throw new Error(data.error || 'Backtest failed')

      const trades = data.trades || []
      let filteredTrades = trades
      if (stressTestPositionType === 'long_only') {
        filteredTrades = trades.filter(t => (t.Position_Type || '').toUpperCase() === 'LONG')
      } else if (stressTestPositionType === 'short_only') {
        filteredTrades = trades.filter(t => (t.Position_Type || '').toUpperCase() === 'SHORT')
      }

      const totalTrades = filteredTrades.length
      const winningTrades = filteredTrades.filter(t => (t.PnL || 0) > 0).length
      const losingTrades = filteredTrades.filter(t => (t.PnL || 0) < 0).length
      const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0
      
      const grossProfit = filteredTrades.filter(t => (t.PnL || 0) > 0).reduce((sum, t) => sum + (t.PnL || 0), 0)
      const grossLoss = Math.abs(filteredTrades.filter(t => (t.PnL || 0) < 0).reduce((sum, t) => sum + (t.PnL || 0), 0))
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
      
      const avgWin = winningTrades > 0 ? grossProfit / winningTrades : 0
      const avgLoss = losingTrades > 0 ? grossLoss / losingTrades : 0
      
      const totalPnL = filteredTrades.reduce((sum, t) => sum + (t.PnL || 0), 0)
      const totalReturn = totalPnL / (savedSetup.initialCapital || 10000)

      setStressTestResults({
        trades: filteredTrades,
        openPosition: data.open_position,
        performance: {
          ...data.performance,
          totalTrades,
          winningTrades,
          losingTrades,
          winRate,
          grossProfit,
          grossLoss,
          profitFactor,
          avgWin,
          avgLoss,
          totalPnL,
          totalReturn,
        },
        config: backtestConfig
      })

    } catch (err) {
      console.error('Stress test error:', err)
      setStressTestError(err.message || 'Failed to run stress test')
    } finally {
      setIsStressTestLoading(false)
    }
  }, [savedSetup, stressTestStartYear, stressTestEntryDelay, stressTestExitDelay, stressTestPositionType])

  // Export Stress Test trade log to CSV (admin/moderator only)
  const exportStressTestToCSV = useCallback(() => {
    if (!stressTestResults?.trades) return
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const perf = stressTestResults.performance
    
    // Export trades
    const headers = ['Entry_Date', 'Exit_Date', 'Position_Type', 'Entry_Price', 'Exit_Price', 'Stop_Loss', 'PnL', 'PnL_%', 'Entry_Reason', 'Exit_Reason']
    const rows = stressTestResults.trades.map(t => [
      t.Entry_Date,
      t.Exit_Date,
      t.Position_Type,
      (t.Entry_Price || 0).toFixed(2),
      (t.Exit_Price || 0).toFixed(2),
      t.Stop_Loss ? t.Stop_Loss.toFixed(2) : 'N/A',
      (t.PnL || 0).toFixed(2),
      (t.PnL_Pct || 0).toFixed(4),
      t.Entry_Reason || 'N/A',
      t.Exit_Reason || 'N/A'
    ])
    
    // Add performance summary
    rows.push([''])
    rows.push(['--- Performance Summary ---'])
    rows.push(['Total_Trades', perf?.totalTrades || 0])
    rows.push(['Winning_Trades', perf?.winningTrades || 0])
    rows.push(['Losing_Trades', perf?.losingTrades || 0])
    rows.push(['Win_Rate_%', ((perf?.winRate || 0) * 100).toFixed(2)])
    rows.push(['Total_PnL', (perf?.totalPnL || 0).toFixed(2)])
    rows.push(['Total_Return_%', ((perf?.totalReturn || 0) * 100).toFixed(2)])
    rows.push(['Profit_Factor', perf?.profitFactor === Infinity ? 'Infinity' : (perf?.profitFactor || 0).toFixed(4)])
    rows.push(['Avg_Win', (perf?.avgWin || 0).toFixed(2)])
    rows.push(['Avg_Loss', (perf?.avgLoss || 0).toFixed(2)])
    rows.push(['Entry_Delay', stressTestEntryDelay])
    rows.push(['Exit_Delay', stressTestExitDelay])
    rows.push(['DSL_Used', savedSetup?.dsl ? 'Yes' : 'No'])
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `trade_log_stress_test_${timestamp}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [stressTestResults, stressTestEntryDelay, stressTestExitDelay, savedSetup])

  // ============ Timeframe Comparison Handler ============
  const generateStrategyConfigHash = useCallback((config) => {
    // Simple hash of strategy config for caching
    // Use both possible field names for compatibility
    const str = JSON.stringify({
      indicator: config.indicatorType,
      emaShort: config.emaShort || config.fastEMA,
      emaLong: config.emaLong || config.slowEMA,
      indicatorLength: config.indicatorLength,
      indicatorTop: config.indicatorTop,
      indicatorBottom: config.indicatorBottom,
      stopLossMode: config.stopLossMode,
      useStopLoss: config.useStopLoss,
    })
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return hash.toString(16)
  }, [])

  const getCacheKey = useCallback((symbol, timeframe, dateRange, configHash) => {
    return `${symbol}_${timeframe}_${dateRange.start}_${dateRange.end}_${configHash}`
  }, [])

  const handleRunTimeframeComparison = useCallback(async () => {
    if (!savedSetup) {
      Swal.fire({ icon: 'warning', title: 'No Strategy', text: 'Please save a strategy setup first.' })
      return
    }
    if (selectedComparisonTimeframes.length === 0) {
      Swal.fire({ icon: 'warning', title: 'No Timeframes', text: 'Please select at least one timeframe to compare.' })
      return
    }

    setIsTimeframeComparisonRunning(true)
    setTimeframeComparisonProgress({ completed: 0, total: selectedComparisonTimeframes.length })
    
    const newResults = {}
    const newErrors = {}
    const newLoading = {}
    
    // Set all selected timeframes to loading
    selectedComparisonTimeframes.forEach(tf => {
      newLoading[tf] = true
    })
    setTimeframeComparisonLoading(newLoading)
    setTimeframeComparisonErrors({})
    
    const configHash = generateStrategyConfigHash(savedSetup)
    
    // Get date range from inSampleYears and outSampleYears arrays
    const allYears = [...(savedSetup.inSampleYears || []), ...(savedSetup.outSampleYears || [])]
    const startYear = allYears.length > 0 ? Math.min(...allYears) : new Date().getFullYear() - 3
    const endYear = allYears.length > 0 ? Math.max(...allYears) : new Date().getFullYear()
    
    const dateRange = {
      start: `${startYear}-01-01`,
      end: `${endYear}-12-31`
    }

    let completed = 0
    
    for (const tf of selectedComparisonTimeframes) {
      const cacheKey = getCacheKey(savedSetup.symbol, tf, dateRange, configHash)
      
      // Check cache first
      if (timeframeComparisonCache[cacheKey]) {
        newResults[tf] = timeframeComparisonCache[cacheKey]
        completed++
        setTimeframeComparisonProgress({ completed, total: selectedComparisonTimeframes.length })
        setTimeframeComparisonLoading(prev => ({ ...prev, [tf]: false }))
        continue
      }
      
      try {
        // Build backtest config for this timeframe
        // Map savedSetup fields to API expected fields
        const backtestConfig = {
          symbol: savedSetup.symbol,
          interval: tf,
          start_date: dateRange.start,
          end_date: dateRange.end,
          indicator: savedSetup.indicatorType,
          // EMA fields - savedSetup uses emaShort/emaLong
          fast_ema: savedSetup.emaShort || savedSetup.fastEMA || 12,
          slow_ema: savedSetup.emaLong || savedSetup.slowEMA || 26,
          // Other indicator fields - savedSetup uses indicatorLength, indicatorBottom/Top
          rsi_length: savedSetup.indicatorLength || savedSetup.rsiLength || 14,
          rsi_overbought: savedSetup.indicatorTop || savedSetup.rsiOverbought || 70,
          rsi_oversold: savedSetup.indicatorBottom || savedSetup.rsiOversold || 30,
          cci_length: savedSetup.indicatorLength || savedSetup.cciLength || 20,
          cci_overbought: savedSetup.indicatorTop || savedSetup.cciOverbought || 100,
          cci_oversold: savedSetup.indicatorBottom || savedSetup.cciOversold || -100,
          zscore_window: savedSetup.indicatorLength || savedSetup.zscoreWindow || 20,
          zscore_overbought: savedSetup.indicatorTop || savedSetup.zscoreOverbought || 2,
          zscore_oversold: savedSetup.indicatorBottom || savedSetup.zscoreOversold || -2,
          initial_capital: savedSetup.initialCapital || 10000,
          trade_size_pct: savedSetup.tradeSizePct || 100,
          // Include DSL for saved strategy execution
          dsl: savedSetup.dsl || null,
          entry_delay: 1,
          exit_delay: 1,
          use_stop_loss: savedSetup.useStopLoss !== false && savedSetup.stopLossMode !== 'none',
        }

        const response = await fetch(`${API_URL}/api/backtest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(backtestConfig),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `HTTP error ${response.status}`)
        }

        const data = await response.json()
        if (!data.success) throw new Error(data.error || 'Backtest failed')

        const trades = data.trades || []
        
        // Build equity curve from trades (since /api/backtest doesn't return equity_curve)
        const initialCapitalValue = savedSetup.initialCapital || 10000
        let equityCurve = []
        
        if (trades.length > 0) {
          // Sort trades by exit date
          const sortedTrades = [...trades].sort((a, b) => 
            new Date(a.Exit_Date || a.Entry_Date) - new Date(b.Exit_Date || b.Entry_Date)
          )
          
          let currentEquity = initialCapitalValue
          equityCurve.push({ date: sortedTrades[0]?.Entry_Date?.slice(0, 10) || '', equity: currentEquity })
          
          for (const trade of sortedTrades) {
            currentEquity += (trade.PnL || 0)
            equityCurve.push({
              date: trade.Exit_Date?.slice(0, 10) || trade.Entry_Date?.slice(0, 10) || '',
              equity: currentEquity
            })
          }
        } else {
          // No trades - flat equity line
          equityCurve = [{ date: dateRange.start, equity: initialCapitalValue }]
        }
        
        // Calculate metrics
        const totalTrades = trades.length
        const winningTrades = trades.filter(t => (t.PnL || 0) > 0)
        const losingTrades = trades.filter(t => (t.PnL || 0) < 0)
        const winRate = totalTrades > 0 ? winningTrades.length / totalTrades : 0
        
        const grossProfit = winningTrades.reduce((sum, t) => sum + (t.PnL || 0), 0)
        const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + (t.PnL || 0), 0))
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
        
        // Use the already calculated initialCapitalValue
        const finalEquity = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : initialCapitalValue
        const totalReturn = ((finalEquity - initialCapitalValue) / initialCapitalValue) * 100
        
        // Calculate CAGR
        const yearsCount = endYear - startYear + 1
        const cagr = yearsCount > 0 ? (Math.pow(finalEquity / initialCapitalValue, 1 / yearsCount) - 1) * 100 : 0
        
        // Calculate max drawdown
        let peak = initialCapitalValue
        let maxDrawdown = 0
        for (const point of equityCurve) {
          if (point.equity > peak) peak = point.equity
          const dd = (peak - point.equity) / peak
          if (dd > maxDrawdown) maxDrawdown = dd
        }
        
        // Calculate Sharpe (simplified)
        const returns = []
        for (let i = 1; i < equityCurve.length; i++) {
          const ret = (equityCurve[i].equity - equityCurve[i-1].equity) / equityCurve[i-1].equity
          returns.push(ret)
        }
        const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
        const stdReturn = returns.length > 1 
          ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1))
          : 0
        const sharpe = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0

        // Calculate avg holding period (in days)
        let totalHoldingDays = 0
        for (const trade of trades) {
          if (trade.Entry_Date && trade.Exit_Date) {
            const entryDate = new Date(trade.Entry_Date)
            const exitDate = new Date(trade.Exit_Date)
            totalHoldingDays += (exitDate - entryDate) / (1000 * 60 * 60 * 24)
          }
        }
        const avgHoldingPeriod = totalTrades > 0 ? totalHoldingDays / totalTrades : 0

        // Calculate time in market
        const firstDate = equityCurve.length > 0 ? new Date(equityCurve[0].date) : null
        const lastDate = equityCurve.length > 0 ? new Date(equityCurve[equityCurve.length - 1].date) : null
        const totalDays = firstDate && lastDate ? (lastDate - firstDate) / (1000 * 60 * 60 * 24) : 1
        const timeInMarket = totalDays > 0 ? (totalHoldingDays / totalDays) * 100 : 0

        // Calculate trades per month
        const tradesPerMonth = yearsCount > 0 ? totalTrades / (yearsCount * 12) : 0

        // Long/Short split
        const longTrades = trades.filter(t => (t.Position_Type || '').toUpperCase() === 'LONG').length
        const shortTrades = trades.filter(t => (t.Position_Type || '').toUpperCase() === 'SHORT').length

        const result = {
          timeframe: tf,
          equityCurve,
          trades,
          metrics: {
            totalReturn,
            cagr,
            sharpe,
            maxDrawdown: maxDrawdown * 100,
            winRate: winRate * 100,
            profitFactor,
            totalTrades,
            avgHoldingPeriod,
            timeInMarket,
            tradesPerMonth,
            longTrades,
            shortTrades,
          },
          configHash,
        }

        newResults[tf] = result
        
        // Update cache
        setTimeframeComparisonCache(prev => ({
          ...prev,
          [cacheKey]: result
        }))
        
      } catch (err) {
        console.error(`Timeframe comparison error for ${tf}:`, err)
        newErrors[tf] = err.message || `Failed to run backtest for ${tf}`
      }
      
      completed++
      setTimeframeComparisonProgress({ completed, total: selectedComparisonTimeframes.length })
      setTimeframeComparisonLoading(prev => ({ ...prev, [tf]: false }))
    }
    
    setTimeframeComparisonResults(newResults)
    setTimeframeComparisonErrors(newErrors)
    setIsTimeframeComparisonRunning(false)
  }, [savedSetup, selectedComparisonTimeframes, generateStrategyConfigHash, getCacheKey, timeframeComparisonCache])

  const toggleComparisonTimeframe = useCallback((tf) => {
    setSelectedComparisonTimeframes(prev => 
      prev.includes(tf) 
        ? prev.filter(t => t !== tf)
        : [...prev, tf]
    )
  }, [])

  const getMetricBestWorst = useCallback((metricKey, results) => {
    const values = Object.entries(results)
      .filter(([tf, r]) => r.metrics && r.metrics[metricKey] !== undefined && !timeframeComparisonErrors[tf])
      .map(([tf, r]) => ({ tf, value: r.metrics[metricKey] }))
    
    if (values.length === 0) return { best: null, worst: null }
    
    // Determine if higher is better or lower is better
    const higherIsBetter = ['totalReturn', 'cagr', 'sharpe', 'winRate', 'profitFactor'].includes(metricKey)
    
    const sorted = [...values].sort((a, b) => higherIsBetter ? b.value - a.value : a.value - b.value)
    
    return {
      best: sorted[0]?.tf || null,
      worst: sorted[sorted.length - 1]?.tf || null
    }
  }, [timeframeComparisonErrors])

  // ============ Hypothesis Testing Handler ============
  // T-distribution helpers
  const lgamma = (z) => {
    const g = 7
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z)
    z -= 1
    let x = c[0]
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i)
    const t = z + g + 0.5
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
  }

  const betaCf = (x, a, b) => {
    const maxIter = 100, eps = 1e-10
    let qab = a + b, qap = a + 1, qam = a - 1
    let c = 1, d = 1 - qab * x / qap
    if (Math.abs(d) < eps) d = eps
    d = 1 / d
    let h = d
    for (let m = 1; m <= maxIter; m++) {
      let m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2))
      d = 1 + aa * d; if (Math.abs(d) < eps) d = eps
      c = 1 + aa / c; if (Math.abs(c) < eps) c = eps
      d = 1 / d; h *= d * c
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
      d = 1 + aa * d; if (Math.abs(d) < eps) d = eps
      c = 1 + aa / c; if (Math.abs(c) < eps) c = eps
      d = 1 / d
      let del = d * c; h *= del
      if (Math.abs(del - 1) < eps) break
    }
    return h
  }

  const incompleteBeta = (x, a, b) => {
    if (x === 0) return 0
    if (x === 1) return 1
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x))
    if (x < (a + 1) / (a + b + 2)) return bt * betaCf(x, a, b) / a
    return 1 - bt * betaCf(1 - x, b, a) / b
  }

  const tDistributionPValue = (t, df) => {
    const x = df / (df + t * t)
    return incompleteBeta(x, df / 2, 0.5) / 2
  }

  const tDistributionCritical = (alpha, df) => {
    if (df >= 30) {
      const z = { 0.10: 1.282, 0.05: 1.645, 0.025: 1.960, 0.01: 2.326, 0.005: 2.576 }
      return z[alpha] || 1.96
    }
    const criticalValues = {
      1: { 0.10: 3.078, 0.05: 6.314, 0.025: 12.706, 0.01: 31.821, 0.005: 63.657 },
      2: { 0.10: 1.886, 0.05: 2.920, 0.025: 4.303, 0.01: 6.965, 0.005: 9.925 },
      5: { 0.10: 1.476, 0.05: 2.015, 0.025: 2.571, 0.01: 3.365, 0.005: 4.032 },
      10: { 0.10: 1.372, 0.05: 1.812, 0.025: 2.228, 0.01: 2.764, 0.005: 3.169 },
      20: { 0.10: 1.325, 0.05: 1.725, 0.025: 2.086, 0.01: 2.528, 0.005: 2.845 },
      29: { 0.10: 1.311, 0.05: 1.699, 0.025: 2.045, 0.01: 2.462, 0.005: 2.756 }
    }
    const dfKeys = Object.keys(criticalValues).map(Number).sort((a, b) => a - b)
    let closestDf = dfKeys[0]
    for (const key of dfKeys) if (key <= df) closestDf = key
    const alphaKey = alpha <= 0.005 ? 0.005 : alpha <= 0.01 ? 0.01 : alpha <= 0.025 ? 0.025 : alpha <= 0.05 ? 0.05 : 0.10
    return criticalValues[closestDf]?.[alphaKey] || 1.96
  }

  // Statistical utility functions
  const calcMean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length
  const calcStd = (arr, mean) => {
    if (arr.length < 2) return 0
    const variance = arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (arr.length - 1)
    return Math.sqrt(variance)
  }
  const calcCovariance = (x, y, meanX, meanY) => {
    if (x.length < 2) return 0
    return x.reduce((s, xi, i) => s + (xi - meanX) * (y[i] - meanY), 0) / (x.length - 1)
  }
  const calcPearsonR = (x, y) => {
    const meanX = calcMean(x)
    const meanY = calcMean(y)
    const stdX = calcStd(x, meanX)
    const stdY = calcStd(y, meanY)
    if (stdX === 0 || stdY === 0) return 0
    const cov = calcCovariance(x, y, meanX, meanY)
    return cov / (stdX * stdY)
  }
  const calcSpearmanR = (x, y) => {
    const rankArray = (arr) => {
      const sorted = [...arr].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
      const ranks = new Array(arr.length)
      sorted.forEach((item, rank) => { ranks[item.i] = rank + 1 })
      return ranks
    }
    return calcPearsonR(rankArray(x), rankArray(y))
  }

  // Hypothesis Testing calculation function (new comprehensive version)
  const handleRunHypothesisTest = useCallback(() => {
    if (!savedSetup?.strategyReturns || savedSetup.strategyReturns.length === 0) {
      setHypothesisError('No trade returns available. Please ensure your saved setup has trade data.')
      return
    }

    setIsHypothesisLoading(true)
    setHypothesisError(null)

    try {
      const returns = savedSetup.strategyReturns
      const n = returns.length
      
      if (n < 2) {
        throw new Error('Need at least 2 data points to perform hypothesis testing')
      }

      let results = {}
      
      if (hypothesisTestType === 'one-sample') {
        // One-sample t-test
        const mean = calcMean(returns)
        const std = calcStd(returns, mean)
        const se = std / Math.sqrt(n)
        const mu0 = hypothesisMu0 / 100 // Convert from percentage
        const tStat = se > 0 ? (mean - mu0) / se : 0
        const df = n - 1
        
        // P-value calculation
        let pValue = tDistributionPValue(Math.abs(tStat), df)
        if (hypothesisTail === 'two-sided') {
          pValue = pValue * 2
        } else if ((hypothesisTail === 'right' && tStat < 0) || (hypothesisTail === 'left' && tStat > 0)) {
          pValue = 1 - pValue
        }
        pValue = Math.min(1, Math.max(0, pValue))
        
        // Confidence interval
        const critVal = tDistributionCritical(hypothesisAlpha, df)
        const ciLow = mean - critVal * se
        const ciHigh = mean + critVal * se
        
        // Effect size (Cohen's d)
        const cohensD = std > 0 ? (mean - mu0) / std : 0
        
        // Decision
        const rejectNull = pValue <= hypothesisAlpha
        const decision = rejectNull ? 'Reject H₀' : 'Fail to reject H₀'
        
        // Interpretation
        let interpretation = ''
        if (rejectNull) {
          if (hypothesisTail === 'two-sided') {
            interpretation = `The mean return (${(mean * 100).toFixed(2)}%) is significantly different from ${hypothesisMu0}% (p = ${pValue.toFixed(4)}).`
          } else if (hypothesisTail === 'right') {
            interpretation = `The mean return (${(mean * 100).toFixed(2)}%) is significantly greater than ${hypothesisMu0}% (p = ${pValue.toFixed(4)}).`
          } else {
            interpretation = `The mean return (${(mean * 100).toFixed(2)}%) is significantly less than ${hypothesisMu0}% (p = ${pValue.toFixed(4)}).`
          }
        } else {
          interpretation = `There is insufficient evidence to conclude that the mean return differs from ${hypothesisMu0}% (p = ${pValue.toFixed(4)}).`
        }
        
        results = {
          testType: 'one-sample',
          testName: 'One-Sample t-Test',
          n, mean, std, se, mu0,
          tStatistic: tStat, df, pValue,
          alpha: hypothesisAlpha,
          tail: hypothesisTail,
          ciLow, ciHigh, cohensD,
          rejectNull, decision, interpretation,
          significance: rejectNull ? (mean > mu0 ? 'profitable' : 'unprofitable') : 'inconclusive',
          data: returns.map(r => r * 100),
          mu0Display: hypothesisMu0
        }
        
      } else if (hypothesisTestType === 'two-sample') {
        // Two-sample t-test (compare first half vs second half)
        const midpoint = Math.floor(n / 2)
        const group1 = returns.slice(0, midpoint)
        const group2 = returns.slice(midpoint)
        
        if (group1.length < 2 || group2.length < 2) {
          throw new Error('Each group needs at least 2 data points')
        }
        
        const n1 = group1.length
        const n2 = group2.length
        const mean1 = calcMean(group1)
        const mean2 = calcMean(group2)
        const std1 = calcStd(group1, mean1)
        const std2 = calcStd(group2, mean2)
        
        let tStat, df, se
        
        if (hypothesisTestVariant === 'pooled') {
          const pooledVar = ((n1 - 1) * std1 * std1 + (n2 - 1) * std2 * std2) / (n1 + n2 - 2)
          se = Math.sqrt(pooledVar * (1/n1 + 1/n2))
          df = n1 + n2 - 2
        } else {
          const var1 = std1 * std1
          const var2 = std2 * std2
          se = Math.sqrt(var1/n1 + var2/n2)
          const num = Math.pow(var1/n1 + var2/n2, 2)
          const denom = Math.pow(var1/n1, 2)/(n1-1) + Math.pow(var2/n2, 2)/(n2-1)
          df = denom > 0 ? num / denom : n1 + n2 - 2
        }
        
        tStat = se > 0 ? (mean1 - mean2) / se : 0
        
        let pValue = tDistributionPValue(Math.abs(tStat), df)
        if (hypothesisTail === 'two-sided') {
          pValue = pValue * 2
        } else if ((hypothesisTail === 'right' && tStat < 0) || (hypothesisTail === 'left' && tStat > 0)) {
          pValue = 1 - pValue
        }
        pValue = Math.min(1, Math.max(0, pValue))
        
        const critVal = tDistributionCritical(hypothesisAlpha, df)
        const diff = mean1 - mean2
        const ciLow = diff - critVal * se
        const ciHigh = diff + critVal * se
        
        const pooledStd = Math.sqrt(((n1 - 1) * std1 * std1 + (n2 - 1) * std2 * std2) / (n1 + n2 - 2))
        const cohensD = pooledStd > 0 ? diff / pooledStd : 0
        
        const rejectNull = pValue <= hypothesisAlpha
        const decision = rejectNull ? 'Reject H₀' : 'Fail to reject H₀'
        
        let interpretation = ''
        if (rejectNull) {
          interpretation = `The means of the two groups are significantly different (p = ${pValue.toFixed(4)}). First half: ${(mean1 * 100).toFixed(2)}%, Second half: ${(mean2 * 100).toFixed(2)}%.`
        } else {
          interpretation = `There is insufficient evidence to conclude that the group means differ (p = ${pValue.toFixed(4)}).`
        }
        
        results = {
          testType: 'two-sample',
          testName: hypothesisTestVariant === 'pooled' ? 'Pooled t-Test' : "Welch's t-Test",
          n1, n2, mean1, mean2, std1, std2, diff, se,
          tStatistic: tStat, df, pValue,
          alpha: hypothesisAlpha,
          tail: hypothesisTail,
          ciLow, ciHigh, cohensD,
          rejectNull, decision, interpretation,
          significance: rejectNull ? (diff > 0 ? 'profitable' : 'unprofitable') : 'inconclusive',
          group1Data: group1.map(r => r * 100),
          group2Data: group2.map(r => r * 100)
        }
        
      } else if (hypothesisTestType === 'correlation') {
        const x = returns.map((_, i) => i + 1)
        const y = returns
        
        const r = hypothesisTestVariant === 'spearman' ? calcSpearmanR(x, y) : calcPearsonR(x, y)
        const rSquared = r * r
        
        const tStat = Math.sqrt(n - 2) * r / Math.sqrt(1 - r * r)
        const df = n - 2
        
        let pValue = df > 0 ? tDistributionPValue(Math.abs(tStat), df) : 1
        if (hypothesisTail === 'two-sided') {
          pValue = pValue * 2
        } else if ((hypothesisTail === 'right' && tStat < 0) || (hypothesisTail === 'left' && tStat > 0)) {
          pValue = 1 - pValue
        }
        pValue = Math.min(1, Math.max(0, pValue))
        
        const z = 0.5 * Math.log((1 + r) / (1 - r))
        const zSe = 1 / Math.sqrt(n - 3)
        const zCrit = {0.01: 2.576, 0.05: 1.96, 0.10: 1.645}[hypothesisAlpha] || 1.96
        const zLow = z - zCrit * zSe
        const zHigh = z + zCrit * zSe
        const ciLow = (Math.exp(2 * zLow) - 1) / (Math.exp(2 * zLow) + 1)
        const ciHigh = (Math.exp(2 * zHigh) - 1) / (Math.exp(2 * zHigh) + 1)
        
        const rejectNull = pValue <= hypothesisAlpha
        const decision = rejectNull ? 'Reject H₀' : 'Fail to reject H₀'
        
        let interpretation = ''
        if (rejectNull) {
          const direction = r > 0 ? 'positive' : 'negative'
          const strength = Math.abs(r) > 0.7 ? 'strong' : Math.abs(r) > 0.4 ? 'moderate' : 'weak'
          interpretation = `There is a statistically significant ${strength} ${direction} correlation (r = ${r.toFixed(3)}, p = ${pValue.toFixed(4)}). Returns show a ${direction} trend over time.`
        } else {
          interpretation = `There is no significant correlation between trade sequence and returns (r = ${r.toFixed(3)}, p = ${pValue.toFixed(4)}).`
        }
        
        const meanX = calcMean(x)
        const meanY = calcMean(y)
        const slope = calcCovariance(x, y, meanX, meanY) / (calcStd(x, meanX) ** 2 || 1)
        const intercept = meanY - slope * meanX
        
        results = {
          testType: 'correlation',
          testName: hypothesisTestVariant === 'spearman' ? 'Spearman Correlation' : 'Pearson Correlation',
          n, r, rSquared,
          tStatistic: tStat, df, pValue,
          alpha: hypothesisAlpha,
          tail: hypothesisTail,
          ciLow, ciHigh,
          rejectNull, decision, interpretation,
          significance: rejectNull ? (r > 0 ? 'profitable' : 'unprofitable') : 'inconclusive',
          xData: x,
          yData: y.map(v => v * 100),
          slope: slope * 100,
          intercept: intercept * 100
        }
      }
      
      setHypothesisResults(results)
      setHypothesisStep(3) // Move to interpretation step

    } catch (err) {
      console.error('Hypothesis test error:', err)
      setHypothesisError(err.message || 'Failed to run hypothesis test')
    } finally {
      setIsHypothesisLoading(false)
    }
  }, [savedSetup, hypothesisTestType, hypothesisTail, hypothesisAlpha, hypothesisMu0, hypothesisTestVariant])

  const handleCellClick = useCallback((result, x, y) => {
    if (!result) return
    
    if (isCrossoverIndicator(indicatorType)) {
      setOutSampleEmaShort(x)
      setOutSampleEmaLong(y)
    } else {
      setOutSampleIndicatorBottom(x)
      setOutSampleIndicatorTop(y)
    }
    
    setSelectedCell({ result, x, y })
  }, [indicatorType])

  const exportToCSV = () => {
    if (!inSampleResults?.results) return
    
    const xHeader = isCrossoverIndicator(indicatorType) ? 'EMA_Short' : 'Indicator_Bottom'
    const yHeader = isCrossoverIndicator(indicatorType) ? 'EMA_Long' : 'Indicator_Top'
    const headers = [xHeader, yHeader, 'Sharpe_Ratio', 'Total_Return', 'Max_Drawdown', 'Win_Rate', 'Total_Trades']
    const rows = sortedInSampleResults.map(r => {
      const xValue = isCrossoverIndicator(indicatorType) ? (r.ema_short || r.indicator_bottom) : (r.indicator_bottom || r.ema_short)
      const yValue = isCrossoverIndicator(indicatorType) ? (r.ema_long || r.indicator_top) : (r.indicator_top || r.ema_long)
      return [
        xValue,
        yValue,
        r.sharpe_ratio.toFixed(4),
        (r.total_return * 100).toFixed(2) + '%',
        (r.max_drawdown * 100).toFixed(2) + '%',
        (r.win_rate * 100).toFixed(2) + '%',
        r.total_trades
      ]
    })
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${strategyName}_${symbol}_${interval}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const SortableHeader = ({ label, sortKey, onSort }) => {
    const sortInfo = getSortInfo(sortKey)
    const isActive = sortInfo !== null
    return (
      <th onClick={(e) => onSort(sortKey, e)} className={styles.sortableHeader} title="Click to sort, Shift+Click for multi-column">
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

  // Get component info
  const getComponentInfo = (id) => AVAILABLE_COMPONENTS.find(c => c.id === id)

  // Check if component has results
  const getComponentStatus = (id) => {
    switch (id) {
      case 'strategyRobustTest':
        return savedSetup ? 'completed' : 'pending'
      case 'resampling':
        return resamplingResults ? 'completed' : 'pending'
      case 'simulation':
        return monteCarloResults ? 'completed' : 'pending'
      case 'significance':
        return hypothesisResults ? 'completed' : 'pending'
      case 'stressTest':
        return stressTestResults ? 'completed' : 'pending'
      case 'timeframeComparison':
        return Object.keys(timeframeComparisonResults).length > 0 ? 'completed' : 'pending'
      default:
        return 'pending'
    }
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
            <h1>Strategy Builder</h1>
            <p className={styles.subtitle}>Create, test, and validate your trading strategy step by step</p>
          </div>

          {/* Strategy Selection / Creation Step */}
          {viewMode === 'select' && (
            <div className={styles.strategySelectionCard}>
              <div className={styles.selectionHeader}>
                <span className="material-icons">psychology</span>
                <h2>Strategy Builder</h2>
                <p>Load an existing strategy to continue working on it, or create a new one from scratch.</p>
              </div>
              
              <div className={styles.selectionOptions}>
                {/* Saved Strategies */}
                <div className={styles.selectionColumn}>
                  <div className={styles.columnHeader}>
                    <span className="material-icons">folder_open</span>
                    <h3>Saved Strategies</h3>
                  </div>
                  
                  {isLoadingStrategies ? (
                    <div className={styles.loadingState}>
                      <span className="material-icons spin">sync</span>
                      <span>Loading strategies...</span>
                    </div>
                  ) : savedStrategies.length === 0 ? (
                    <div className={styles.emptyState}>
                      <span className="material-icons">inbox</span>
                      <p>No saved strategies yet</p>
                      <span>Create your first strategy to get started</span>
                    </div>
                  ) : (
                    <div className={styles.strategiesList}>
                      {savedStrategies.map((strategy) => (
                        <div key={strategy.id} className={styles.strategyItem}>
                          <div className={styles.strategyInfo} onClick={() => handleLoadStrategy(strategy)}>
                            <span className="material-icons">insights</span>
                            <div>
                              <h4>{strategy.name}</h4>
                              <span>
                                {strategy.config?.symbol || 'BTC-USD'} • {strategy.config?.indicatorType?.toUpperCase() || 'EMA'}
                              </span>
                            </div>
                          </div>
                          <button 
                            className={styles.deleteStrategyBtn}
                            onClick={(e) => { e.stopPropagation(); handleDeleteStrategy(strategy.id, strategy.name); }}
                          >
                            <span className="material-icons">delete</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Create New */}
                <div className={styles.selectionColumn}>
                  <div className={styles.columnHeader}>
                    <span className="material-icons">add_circle</span>
                    <h3>Create New Strategy</h3>
                  </div>
                  
                  <div className={styles.createNewCard} onClick={() => setViewMode('create')}>
                    <span className="material-icons">rocket_launch</span>
                    <h4>Start Fresh</h4>
                    <p>Create a new strategy with custom parameters and run backtests to validate it.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Strategy Creation Form */}
          {viewMode === 'create' && (
            <div className={styles.strategyCreationCard}>
              <button className={styles.backButton} onClick={() => setViewMode('select')}>
                <span className="material-icons">arrow_back</span>
                Back to Selection
              </button>
              
              <div className={styles.strategyCreationHeader}>
                <span className="material-icons">add_chart</span>
                <h2>Create New Strategy</h2>
                <p>Start by naming your strategy and configuring the global parameters. The strategy robust test will be shown first for validation.</p>
              </div>
              
              <div className={styles.strategyNameInput}>
                <label>Strategy Name</label>
                <input
                  type="text"
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value)}
                  placeholder="Enter strategy name..."
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateStrategy()}
                />
              </div>

              {/* Global Configuration */}
              <div className={styles.configSection}>
                {/* Strategy Selector from Indicator Sandbox */}
                <StrategySelectorSection
                  strategies={userSavedStrategies}
                  selectedStrategyId={selectedUserStrategyId}
                  onSelectStrategy={handleSelectUserStrategy}
                  onEditStrategy={handleEditUserStrategy}
                  onCreateNew={handleCreateNewUserStrategy}
                  isLoading={userStrategiesLoading}
                  useCustomConfig={useCustomIndicatorConfig}
                  onToggleMode={handleToggleUserStrategyMode}
                />

                <div className={styles.configCard}>
                  <h3>
                    <span className="material-icons">tune</span>
                    Global Parameters
                    <span className={styles.sectionInfoIcon}>
                      <span className="material-icons">info_outline</span>
                      <div className={styles.sectionInfoTooltip}>
                        <h5>Global Parameters</h5>
                        <p>Configure core settings for your strategy. These apply to all analysis components.</p>
                        <ul>
                          <li>Select trading asset and timeframe</li>
                          <li>Choose indicator type and parameters</li>
                          <li>Set position type and risk settings</li>
                        </ul>
                      </div>
                    </span>
                  </h3>
                  
                  <div className={styles.configGrid}>
                    {/* Only show indicator selector when using custom config */}
                    {useCustomIndicatorConfig && (
                      <div className={styles.formGroup}>
                        <label>Indicator Type</label>
                        <select value={indicatorType} onChange={(e) => setIndicatorType(e.target.value)} className={styles.select}>
                          {INDICATOR_TYPES.map(ind => (
                            <option key={ind.value} value={ind.value}>{ind.label}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className={styles.formGroup}>
                      <label>Trading Pair</label>
                      <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className={styles.select}>
                        {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label>Timeframe</label>
                      <select value={interval} onChange={(e) => setInterval(e.target.value)} className={styles.select}>
                        {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label>Position Type</label>
                      <select value={positionType} onChange={(e) => setPositionType(e.target.value)} className={styles.select}>
                        <option value="both">Both (Long & Short)</option>
                        <option value="long_only">Long Only</option>
                        <option value="short_only">Short Only</option>
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label>
                        <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>security</span>
                        Stop Loss
                      </label>
                      <select value={stopLossMode} onChange={(e) => setStopLossMode(e.target.value)} className={styles.select}>
                        <option value="support_resistance">Support/Resistance Based</option>
                        <option value="none">No Stop Loss</option>
                      </select>
                    </div>

                    {useCustomIndicatorConfig && isCrossoverIndicator(indicatorType) && (
                      <>
                        <div className={styles.formGroup}>
                          <label>Max Short EMA</label>
                          <NumberInput value={maxEmaShort} onChange={setMaxEmaShort} min={5} max={50} className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Max Long EMA</label>
                          <NumberInput value={maxEmaLong} onChange={setMaxEmaLong} min={20} max={200} className={styles.input} />
                        </div>
                      </>
                    )}

                    {useCustomIndicatorConfig && indicatorType === 'rsi' && (
                      <>
                        <div className={styles.formGroup}>
                          <label>Length</label>
                          <NumberInput value={indicatorLength} onChange={setIndicatorLength} min={3} max={100} className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Min Bottom</label>
                          <NumberInput value={minIndicatorBottom} onChange={setMinIndicatorBottom} min={-200} max={0} className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Max Top</label>
                          <NumberInput value={maxIndicatorTop} onChange={setMaxIndicatorTop} min={0} max={200} className={styles.input} />
                        </div>
                      </>
                    )}

                    {useCustomIndicatorConfig && indicatorType === 'cci' && (
                      <>
                        <div className={styles.formGroup}>
                          <label>Length</label>
                          <NumberInput value={indicatorLength} onChange={setIndicatorLength} min={3} max={100} className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Min Bottom</label>
                          <NumberInput value={minIndicatorBottomCci} onChange={setMinIndicatorBottomCci} min={-200} max={0} className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Max Top</label>
                          <NumberInput value={maxIndicatorTopCci} onChange={setMaxIndicatorTopCci} min={0} max={200} className={styles.input} />
                        </div>
                      </>
                    )}

                    {useCustomIndicatorConfig && indicatorType === 'zscore' && (
                      <>
                        <div className={styles.formGroup}>
                          <label>Length</label>
                          <NumberInput value={indicatorLength} onChange={setIndicatorLength} min={3} max={100} className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Min Bottom</label>
                          <NumberInput value={minIndicatorBottomZscore} onChange={setMinIndicatorBottomZscore} step={0.1} className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Max Top</label>
                          <NumberInput value={maxIndicatorTopZscore} onChange={setMaxIndicatorTopZscore} step={0.1} className={styles.input} />
                        </div>
                      </>
                    )}

                    <div className={styles.formGroup}>
                      <label>Initial Capital</label>
                      <NumberInput value={initialCapital} onChange={setInitialCapital} min={1000} className={styles.input} />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Risk-Free Rate (%)</label>
                      <NumberInput value={riskFreeRate * 100} onChange={(val) => setRiskFreeRate(val / 100)} step={0.1} className={styles.input} />
                    </div>
                  </div>
                </div>
              </div>

              <button 
                className={styles.createStrategyBtn}
                onClick={handleCreateStrategy}
                disabled={!strategyName.trim()}
              >
                <span className="material-icons">rocket_launch</span>
                Create Strategy
              </button>
            </div>
          )}

          {/* Active Strategy View */}
          {viewMode === 'active' && (
            <>
              {/* Active Strategy Header */}
              <div className={styles.activeStrategyHeader}>
                <div className={styles.activeStrategyInfo}>
                  <span className="material-icons">insights</span>
                  <div>
                    <h3>{strategyName}</h3>
                    <span>{symbol} • {INTERVALS.find(i => i.value === interval)?.label} • {INDICATOR_TYPES.find(i => i.value === indicatorType)?.label}</span>
                  </div>
                </div>
                <div className={styles.activeStrategyActions}>
                  <button className={styles.saveBtn} onClick={handleSaveStrategy}>
                    <span className="material-icons">save</span>
                    {selectedStrategyId ? 'Save' : 'Save as New'}
                  </button>
                  <button className={styles.editBtn} onClick={() => setIsEditingConfig(!isEditingConfig)}>
                    <span className="material-icons">{isEditingConfig ? 'close' : 'edit'}</span>
                    {isEditingConfig ? 'Close' : 'Edit Config'}
                  </button>
                  <button className={styles.resetBtn} onClick={handleResetStrategy}>
                    <span className="material-icons">close</span>
                    Close
                  </button>
                </div>
              </div>

              {/* Edit Configuration Panel */}
              {isEditingConfig && (
                <div className={styles.configSection}>
                  {/* Strategy Selector from Indicator Sandbox */}
                  <StrategySelectorSection
                    strategies={userSavedStrategies}
                    selectedStrategyId={selectedUserStrategyId}
                    onSelectStrategy={handleSelectUserStrategy}
                    onEditStrategy={handleEditUserStrategy}
                    onCreateNew={handleCreateNewUserStrategy}
                    isLoading={userStrategiesLoading}
                    useCustomConfig={useCustomIndicatorConfig}
                    onToggleMode={handleToggleUserStrategyMode}
                  />

                  <div className={styles.configCard}>
                    <h3>
                      <span className="material-icons">tune</span>
                      Edit Global Parameters
                    </h3>
                    
                    <div className={styles.configGrid}>
                      {/* Only show indicator selector when using custom config */}
                      {useCustomIndicatorConfig && (
                        <div className={styles.formGroup}>
                          <label>Indicator Type</label>
                          <select value={indicatorType} onChange={(e) => setIndicatorType(e.target.value)} className={styles.select}>
                            {INDICATOR_TYPES.map(ind => (
                              <option key={ind.value} value={ind.value}>{ind.label}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className={styles.formGroup}>
                        <label>Trading Pair</label>
                        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className={styles.select}>
                          {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>

                      <div className={styles.formGroup}>
                        <label>Timeframe</label>
                        <select value={interval} onChange={(e) => setInterval(e.target.value)} className={styles.select}>
                          {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                        </select>
                      </div>

                      <div className={styles.formGroup}>
                        <label>Position Type</label>
                        <select value={positionType} onChange={(e) => setPositionType(e.target.value)} className={styles.select}>
                          <option value="both">Both (Long & Short)</option>
                          <option value="long_only">Long Only</option>
                          <option value="short_only">Short Only</option>
                        </select>
                      </div>

                      <div className={styles.formGroup}>
                        <label>
                          <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>security</span>
                          Stop Loss
                        </label>
                        <select value={stopLossMode} onChange={(e) => setStopLossMode(e.target.value)} className={styles.select}>
                          <option value="support_resistance">Support/Resistance Based</option>
                          <option value="none">No Stop Loss</option>
                        </select>
                      </div>

                      {useCustomIndicatorConfig && isCrossoverIndicator(indicatorType) && (
                        <>
                          <div className={styles.formGroup}>
                            <label>Max Short EMA</label>
                            <NumberInput value={maxEmaShort} onChange={setMaxEmaShort} min={5} max={50} className={styles.input} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Max Long EMA</label>
                            <NumberInput value={maxEmaLong} onChange={setMaxEmaLong} min={20} max={200} className={styles.input} />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Notebook Container */}
              <div className={styles.notebookContainer}>
                {activeComponents.map((componentId, index) => {
                  const info = getComponentInfo(componentId)
                  if (!info) return null
                  const isExpanded = expandedComponents[componentId]
                  const status = getComponentStatus(componentId)
                  
                  return (
                    <div key={componentId} className={styles.notebookCell}>
                      <div className={styles.cellHeader} onClick={() => toggleComponent(componentId)}>
                        <div className={styles.cellHeaderLeft}>
                          <span className={styles.cellNumber}>{index + 1}</span>
                          <div className={styles.cellTitle}>
                            <span className="material-icons">{info.icon}</span>
                            {info.title}
                          </div>
                        </div>
                        <div className={styles.cellHeaderRight}>
                          <div className={`${styles.cellStatus} ${status === 'pending' ? styles.pending : ''}`}>
                            <span className="material-icons">{status === 'completed' ? 'check_circle' : 'pending'}</span>
                            {status === 'completed' ? 'Completed' : 'Pending'}
                          </div>
                          {!info.required && (
                            <button 
                              className={styles.removeBtn} 
                              onClick={(e) => { e.stopPropagation(); handleRemoveComponent(componentId); }}
                              title="Remove component"
                            >
                              <span className="material-icons">close</span>
                            </button>
                          )}
                          <span className={`material-icons ${styles.chevron} ${isExpanded ? styles.expanded : ''}`}>
                            expand_more
                          </span>
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className={styles.cellContent}>
                          {/* Strategy Robust Test */}
                          {componentId === 'strategyRobustTest' && (
                            <>
                              {/* In-Sample Section */}
                              <div className={styles.sampleSection}>
                                <div className={styles.sampleCard}>
                                  <div className={styles.sampleHeader}>
                                    <h3>
                                      <span className="material-icons">science</span>
                                      In-Sample Optimization
                                      <span className={styles.sectionInfoIcon}>
                                        <span className="material-icons">info_outline</span>
                                        <div className={styles.sectionInfoTooltip}>
                                          <h5>In-Sample Optimization</h5>
                                          <p>Find optimal parameters using historical training data. Tests all parameter combinations.</p>
                                          <ul>
                                            <li>Select years for training</li>
                                            <li>Review heatmap for sensitivity</li>
                                            <li>Click rows for Out-of-Sample</li>
                                          </ul>
                                        </div>
                                      </span>
                                    </h3>
                                  </div>
                                  
                                  <div className={styles.sampleConfig}>
                                    <div className={styles.yearSelection}>
                                      <label>Select In-Sample Years</label>
                                      <div className={styles.yearChips}>
                                        {AVAILABLE_YEARS.map(year => (
                                          <button
                                            key={year}
                                            className={`${styles.yearChip} ${inSampleYears.includes(year) ? styles.selected : ''}`}
                                            onClick={() => toggleInSampleYear(year)}
                                          >
                                            {year}
                                          </button>
                                        ))}
                                      </div>
                                      <span className={styles.selectedInfo}>
                                        {inSampleYears.length > 0 ? `Selected: ${inSampleYears.sort((a,b) => a-b).join(', ')}` : 'No years selected'}
                                      </span>
                                    </div>
                                    
                                    <button
                                      className={styles.calculateButton}
                                      onClick={calculateInSample}
                                      disabled={isCalculatingInSample || inSampleYears.length === 0}
                                    >
                                      {isCalculatingInSample ? (
                                        <>
                                          <span className={`material-icons ${styles.spinning}`}>sync</span>
                                          Calculating... {inSampleProgress}%
                                        </>
                                      ) : (
                                        <>
                                          <span className="material-icons">analytics</span>
                                          Run Optimization
                                        </>
                                      )}
                                    </button>
                                  </div>
                                  
                                  {inSampleError && (
                                    <div className={styles.errorMessage}>
                                      <span className="material-icons">error</span>
                                      {inSampleError}
                                    </div>
                                  )}
                                  
                                  {/* In-Sample Results */}
                                  {inSampleResults && (
                                    <div className={styles.resultsContainer}>
                                      <div className={styles.resultsGrid}>
                                        {/* Heatmap */}
                                        <div className={styles.heatmapSection}>
                                          <div className={styles.heatmapHeader}>
                                            <h4>Parameter Heatmap</h4>
                                            <div className={styles.heatmapControls}>
                                              <select
                                                value={heatmapMetric}
                                                onChange={(e) => setHeatmapMetric(e.target.value)}
                                                className={styles.metricSelect}
                                              >
                                                {HEATMAP_METRIC_OPTIONS.map(opt => (
                                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                              </select>
                                            </div>
                                          </div>
                                          
                                          {heatmapData && (
                                            <div className={styles.heatmapContainer}>
                                              <div className={styles.heatmapWrapper}>
                                                <div className={styles.heatmapXLabels}>
                                                  <div className={styles.heatmapCorner}></div>
                                                  {heatmapData.xValues.map(x => (
                                                    <div key={x} className={styles.heatmapXLabel}>{x}</div>
                                                  ))}
                                                </div>
                                                <div className={styles.heatmapBody}>
                                                  {heatmapData.yValues.map(y => (
                                                    <div key={y} className={styles.heatmapRow}>
                                                      <div className={styles.heatmapYLabelCell}>{y}</div>
                                                      {heatmapData.xValues.map(x => {
                                                        const result = heatmapData.lookup[`${x}_${y}`]
                                                        const isSelected = selectedCell?.x === x && selectedCell?.y === y
                                                        return (
                                                          <div
                                                            key={`${x}_${y}`}
                                                            className={`${styles.heatmapCell} ${result ? styles.valid : ''} ${isSelected ? styles.selectedCell : ''}`}
                                                            style={{ backgroundColor: getHeatmapColor(result?.[heatmapMetric]) }}
                                                            onClick={() => handleCellClick(result, x, y)}
                                                            onMouseEnter={(e) => {
                                                              if (result) {
                                                                setHeatmapHover({ result, x, y })
                                                                setMousePos({ x: e.clientX, y: e.clientY })
                                                              }
                                                            }}
                                                            onMouseMove={(e) => {
                                                              if (result) setMousePos({ x: e.clientX, y: e.clientY })
                                                            }}
                                                            onMouseLeave={() => setHeatmapHover(null)}
                                                          />
                                                        )
                                                      })}
                                                    </div>
                                                  ))}
                                                </div>
                                                <div className={styles.heatmapXAxisLabel}>
                                                  {isCrossoverIndicator(indicatorType) ? 'EMA Short' : 'Indicator Bottom'}
                                                </div>
                                              </div>
                                              
                                              <div className={styles.heatmapLegend}>
                                                <span className={styles.legendLabel}>Worse</span>
                                                <div className={styles.legendGradient}></div>
                                                <span className={styles.legendLabel}>Better</span>
                                              </div>
                                            </div>
                                          )}
                                          
                                          {/* Tooltip */}
                                          {heatmapHover && (
                                            <div 
                                              className={styles.heatmapTooltip}
                                              style={{ left: mousePos.x, top: mousePos.y }}
                                            >
                                              <div className={styles.tooltipHeader}>
                                                {isCrossoverIndicator(indicatorType) 
                                                  ? `EMA ${heatmapHover.x}/${heatmapHover.y}`
                                                  : `${heatmapHover.x}/${heatmapHover.y}`
                                                }
                                              </div>
                                              <div className={styles.tooltipRow}>
                                                <span>Sharpe:</span>
                                                <span>{heatmapHover.result.sharpe_ratio?.toFixed(3)}</span>
                                              </div>
                                              <div className={styles.tooltipRow}>
                                                <span>Return:</span>
                                                <span>{(heatmapHover.result.total_return * 100).toFixed(2)}%</span>
                                              </div>
                                              <div className={styles.tooltipRow}>
                                                <span>Drawdown:</span>
                                                <span>{(heatmapHover.result.max_drawdown * 100).toFixed(2)}%</span>
                                              </div>
                                              <div className={styles.tooltipRow}>
                                                <span>Win Rate:</span>
                                                <span>{(heatmapHover.result.win_rate * 100).toFixed(1)}%</span>
                                              </div>
                                              <div className={styles.tooltipHint}>Click to select</div>
                                            </div>
                                          )}
                                        </div>
                                        
                                        {/* Results Table */}
                                        <div className={styles.tableSection}>
                                          <div className={styles.tableHeader}>
                                            <h4>
                                              Results <span className={styles.tableHint}>(Top 60)</span>
                                            </h4>
                                            <button className={styles.exportButton} onClick={exportToCSV}>
                                              <span className="material-icons">download</span>
                                              Export
                                            </button>
                                          </div>
                                          <div className={styles.tableContainer}>
                                            <table className={styles.resultsTable}>
                                              <thead>
                                                <tr>
                                                  <th>{isCrossoverIndicator(indicatorType) ? 'Short' : 'Bottom'}</th>
                                                  <th>{isCrossoverIndicator(indicatorType) ? 'Long' : 'Top'}</th>
                                                  <SortableHeader label="Sharpe" sortKey="sharpe_ratio" onSort={handleSort} />
                                                  <SortableHeader label="Return" sortKey="total_return" onSort={handleSort} />
                                                  <SortableHeader label="Drawdown" sortKey="max_drawdown" onSort={handleSort} />
                                                  <SortableHeader label="Win Rate" sortKey="win_rate" onSort={handleSort} />
                                                  <th>Trades</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {sortedInSampleResults.slice(0, 60).map((r, i) => {
                                                  const xVal = isCrossoverIndicator(indicatorType) ? r.ema_short : r.indicator_bottom
                                                  const yVal = isCrossoverIndicator(indicatorType) ? r.ema_long : r.indicator_top
                                                  const isSelected = selectedCell?.x === xVal && selectedCell?.y === yVal
                                                  return (
                                                    <tr 
                                                      key={i} 
                                                      className={`${styles.clickableRow} ${isSelected ? styles.selectedRow : ''}`}
                                                      onClick={() => handleCellClick(r, xVal, yVal)}
                                                    >
                                                      <td>{xVal}</td>
                                                      <td>{yVal}</td>
                                                      <td className={r.sharpe_ratio >= 0 ? styles.positive : styles.negative}>
                                                        {r.sharpe_ratio?.toFixed(3)}
                                                      </td>
                                                      <td className={r.total_return >= 0 ? styles.positive : styles.negative}>
                                                        {(r.total_return * 100).toFixed(2)}%
                                                      </td>
                                                      <td className={styles.negative}>
                                                        {(r.max_drawdown * 100).toFixed(2)}%
                                                      </td>
                                                      <td>{(r.win_rate * 100).toFixed(1)}%</td>
                                                      <td>{r.total_trades}</td>
                                                    </tr>
                                                  )
                                                })}
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
                              {inSampleResults && (
                                <div className={styles.sampleSection}>
                                  <div className={`${styles.sampleCard} ${styles.outSampleCard}`}>
                                    <div className={styles.sampleHeader}>
                                      <h3>
                                        <span className="material-icons">verified</span>
                                        Out-of-Sample Validation
                                        <span className={styles.sectionInfoIcon}>
                                          <span className="material-icons">info_outline</span>
                                          <div className={styles.sectionInfoTooltip}>
                                            <h5>Out-of-Sample Validation</h5>
                                            <p>Test optimized parameters on unseen data to validate real-world performance.</p>
                                            <ul>
                                              <li>Use different years than In-Sample</li>
                                              <li>Compare to detect overfitting</li>
                                              <li>Save validated setups</li>
                                            </ul>
                                          </div>
                                        </span>
                                      </h3>
                                    </div>
                                    
                                    <div className={styles.outSampleConfig}>
                                      <div className={styles.yearSelection}>
                                        <label>Select Out-of-Sample Years</label>
                                        <div className={styles.yearChips}>
                                          {AVAILABLE_YEARS.map(year => (
                                            <button
                                              key={year}
                                              className={`${styles.yearChip} ${styles.outSample} ${outSampleYears.includes(year) ? styles.selected : ''}`}
                                              onClick={() => toggleOutSampleYear(year)}
                                              disabled={inSampleYears.includes(year)}
                                            >
                                              {year}
                                            </button>
                                          ))}
                                        </div>
                                        <span className={styles.selectedInfo}>
                                          {outSampleYears.length > 0 ? `Selected: ${outSampleYears.sort((a,b) => a-b).join(', ')}` : 'No years selected'}
                                        </span>
                                      </div>
                                      
                                      <div className={styles.emaSelection}>
                                        <div className={styles.emaInputGroup}>
                                          {isCrossoverIndicator(indicatorType) ? (
                                            <>
                                              <div className={styles.formGroup}>
                                                <label>Short EMA</label>
                                                <NumberInput
                                                  value={outSampleEmaShort}
                                                  onChange={setOutSampleEmaShort}
                                                  className={styles.input}
                                                />
                                              </div>
                                              <div className={styles.formGroup}>
                                                <label>Long EMA</label>
                                                <NumberInput
                                                  value={outSampleEmaLong}
                                                  onChange={setOutSampleEmaLong}
                                                  className={styles.input}
                                                />
                                              </div>
                                            </>
                                          ) : (
                                            <>
                                              <div className={styles.formGroup}>
                                                <label>Bottom</label>
                                                <NumberInput
                                                  value={outSampleIndicatorBottom}
                                                  onChange={setOutSampleIndicatorBottom}
                                                  className={styles.input}
                                                />
                                              </div>
                                              <div className={styles.formGroup}>
                                                <label>Top</label>
                                                <NumberInput
                                                  value={outSampleIndicatorTop}
                                                  onChange={setOutSampleIndicatorTop}
                                                  className={styles.input}
                                                />
                                              </div>
                                            </>
                                          )}
                                        </div>
                                        <div className={styles.emaHint}>
                                          <span className="material-icons">info</span>
                                          Click table row or heatmap to auto-fill
                                        </div>
                                      </div>
                                      
                                      <button
                                        className={`${styles.calculateButton} ${styles.outSampleButton}`}
                                        onClick={calculateOutSample}
                                        disabled={isCalculatingOutSample || outSampleYears.length === 0}
                                      >
                                        {isCalculatingOutSample ? (
                                          <>
                                            <span className={`material-icons ${styles.spinning}`}>sync</span>
                                            Validating...
                                          </>
                                        ) : (
                                          <>
                                            <span className="material-icons">verified</span>
                                            Validate Strategy
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    
                                    {outSampleError && (
                                      <div className={styles.errorMessage}>
                                        <span className="material-icons">error</span>
                                        {outSampleError}
                                      </div>
                                    )}
                                    
                                    {/* Out-of-Sample Results */}
                                    {outSampleResult && (
                                      <div className={styles.resultsContainer}>
                                        <div className={styles.resultsSummary}>
                                          <div className={styles.summaryItem}>
                                            <span className={styles.summaryLabel}>In-Sample Sharpe</span>
                                            <span className={`${styles.summaryValue} ${outSampleResult.in_sample?.sharpe_ratio >= 0 ? styles.positive : styles.negative}`}>
                                              {outSampleResult.in_sample?.sharpe_ratio?.toFixed(3) || 'N/A'}
                                            </span>
                                          </div>
                                          <div className={styles.summaryItem}>
                                            <span className={styles.summaryLabel}>Out-Sample Sharpe</span>
                                            <span className={`${styles.summaryValue} ${outSampleResult.out_sample?.sharpe_ratio >= 0 ? styles.positive : styles.negative}`}>
                                              {outSampleResult.out_sample?.sharpe_ratio?.toFixed(3) || 'N/A'}
                                            </span>
                                          </div>
                                          <div className={styles.summaryItem}>
                                            <span className={styles.summaryLabel}>In-Sample Return</span>
                                            <span className={`${styles.summaryValue} ${outSampleResult.in_sample?.total_return >= 0 ? styles.positive : styles.negative}`}>
                                              {outSampleResult.in_sample?.total_return ? `${(outSampleResult.in_sample.total_return * 100).toFixed(2)}%` : 'N/A'}
                                            </span>
                                          </div>
                                          <div className={styles.summaryItem}>
                                            <span className={styles.summaryLabel}>Out-Sample Return</span>
                                            <span className={`${styles.summaryValue} ${outSampleResult.out_sample?.total_return >= 0 ? styles.positive : styles.negative}`}>
                                              {outSampleResult.out_sample?.total_return ? `${(outSampleResult.out_sample.total_return * 100).toFixed(2)}%` : 'N/A'}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                          
                          {/* Bootstrap Resampling Component */}
                          {componentId === 'resampling' && (
                            savedSetup ? (
                              <div className={styles.analysisContainer}>
                                <div className={styles.savedSetupInfo}>
                                  <div className={styles.savedSetupHeader}>
                                    <span className="material-icons">check_circle</span>
                                    <h4>Using Saved Setup</h4>
                                  </div>
                                  <div className={styles.savedSetupDetails}>
                                    <span>Asset: {savedSetup.symbol}</span>
                                    <span>Data Points: {savedSetup.equityCurve?.length || 0}</span>
                                  </div>
                                </div>

                                <div className={styles.controlsSection}>
                                  <h4>
                                    <span className="material-icons">tune</span> Resampling Parameters
                                    <span className={styles.sectionInfoIcon}>
                                      <span className="material-icons">info_outline</span>
                                      <div className={styles.sectionInfoTooltip}>
                                        <h5>Bootstrap Resampling</h5>
                                        <p>Tests robustness by shuffling data in blocks while preserving market patterns.</p>
                                        <ul>
                                          <li>Shuffles: Number of scenarios</li>
                                          <li>Shows outcome distribution</li>
                                          <li>Identifies luck vs skill</li>
                                        </ul>
                                      </div>
                                    </span>
                                  </h4>
                                  <p className={styles.description}>Bootstrap resampling tests strategy robustness by shuffling market data while preserving statistical properties.</p>
                                  
                                  <div className={styles.inputsGrid}>
                                    <div className={styles.inputGroup}>
                                      <label>Volatility %</label>
                                      <NumberInput min={1} max={100} value={resamplingVolatilityPercent} 
                                        onChange={(val) => setResamplingVolatilityPercent(Math.min(100, Math.max(1, val || 20)))} className={styles.input} />
                                    </div>
                                    <div className={styles.inputGroup}>
                                      <label>Num Shuffles</label>
                                      <NumberInput min={5} max={100} value={resamplingNumShuffles} 
                                        onChange={(val) => setResamplingNumShuffles(Math.min(100, Math.max(5, val || 10)))} className={styles.input} />
                                    </div>
                                    <div className={styles.inputGroup}>
                                      <label>Seed</label>
                                      <NumberInput value={resamplingSeed} onChange={(val) => setResamplingSeed(val || 42)} className={styles.input} />
                                    </div>
                                  </div>

                                  <div className={styles.buttonGroup}>
                                    <button className={styles.calculateButton} onClick={handleGenerateResampling} disabled={isResamplingLoading}>
                                      {isResamplingLoading ? (<><span className={`material-icons ${styles.spinning}`}>sync</span> Generating...</>) 
                                        : (<><span className="material-icons">shuffle</span> Generate Resamples</>)}
                                    </button>
                                    {resamplingResults && (
                                      <button className={styles.calculateButton} onClick={handleApplyStrategy} disabled={isApplyingStrategy}>
                                        {isApplyingStrategy ? (<><span className={`material-icons ${styles.spinning}`}>sync</span> Applying...</>) 
                                          : (<><span className="material-icons">trending_up</span> Apply Strategy</>)}
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {resamplingError && <div className={styles.errorMessage}><span className="material-icons">error</span>{resamplingError}</div>}

                                {resamplingResults && (
                                  <div className={styles.resultsContainer}>
                                    <div className={styles.resamplingControls}>
                                      <label>Select Resample:</label>
                                      <input type="range" min={0} max={resamplingResults.resamples.length - 1} value={resamplingSelectedIndex}
                                        onChange={(e) => setResamplingSelectedIndex(parseInt(e.target.value))} className={styles.slider} />
                                      <span>#{resamplingSelectedIndex + 1} / {resamplingResults.resamples.length}</span>
                                    </div>

                                    <div className={styles.chartsGrid}>
                                      <div className={styles.chartCard}>
                                        <h5>Original Equity</h5>
                                        <div className={styles.miniChart}>
                                          <svg viewBox="0 0 400 120" preserveAspectRatio="none">
                                            {(() => {
                                              const candles = resamplingResults.original.candles?.filter(c => c && typeof c.close === 'number' && isFinite(c.close))
                                              if (!candles || candles.length < 2) return null
                                              const closes = candles.map(c => c.close)
                                              const minY = Math.min(...closes), maxY = Math.max(...closes), range = maxY - minY || 1
                                              const points = candles.map((c, i) => `${(i / (candles.length - 1)) * 400},${110 - ((c.close - minY) / range) * 100}`).join(' ')
                                              return <polyline points={points} fill="none" stroke="#4488ff" strokeWidth="2" />
                                            })()}
                                          </svg>
                                        </div>
                                        <div className={styles.chartMetrics}>
                                          <span className={(resamplingResults.original.metrics?.totalReturn || 0) >= 0 ? styles.positive : styles.negative}>
                                            Return: {((resamplingResults.original.metrics?.totalReturn || 0) * 100).toFixed(2)}%
                                          </span>
                                        </div>
                                      </div>

                                      <div className={styles.chartCard}>
                                        <h5>Resample #{resamplingSelectedIndex + 1}</h5>
                                        <div className={styles.miniChart}>
                                          <svg viewBox="0 0 400 120" preserveAspectRatio="none">
                                            {(() => {
                                              const resample = resamplingResults.resamples[resamplingSelectedIndex]
                                              const candles = resample?.candles?.filter(c => c && typeof c.close === 'number' && isFinite(c.close))
                                              if (!candles || candles.length < 2) return null
                                              const closes = candles.map(c => c.close)
                                              const minY = Math.min(...closes), maxY = Math.max(...closes), range = maxY - minY || 1
                                              const points = candles.map((c, i) => `${(i / (candles.length - 1)) * 400},${110 - ((c.close - minY) / range) * 100}`).join(' ')
                                              return <polyline points={points} fill="none" stroke="#22c55e" strokeWidth="2" />
                                            })()}
                                          </svg>
                                        </div>
                                        <div className={styles.chartMetrics}>
                                          <span className={(resamplingResults.resamples[resamplingSelectedIndex]?.metrics?.totalReturn || 0) >= 0 ? styles.positive : styles.negative}>
                                            Return: {((resamplingResults.resamples[resamplingSelectedIndex]?.metrics?.totalReturn || 0) * 100).toFixed(2)}%
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className={styles.summaryStats}>
                                      <h5><span className="material-icons">analytics</span> Distribution Summary</h5>
                                      <div className={styles.statsGrid}>
                                        {(() => {
                                          const returns = resamplingResults.resamples.map(r => r?.metrics?.totalReturn || 0).filter(r => isFinite(r))
                                          const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
                                          const stdDev = returns.length > 0 ? Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length) : 0
                                          return (<>
                                            <div className={styles.statItem}><span>Avg Return</span><strong>{(avgReturn * 100).toFixed(2)}%</strong></div>
                                            <div className={styles.statItem}><span>Std Dev</span><strong>{(stdDev * 100).toFixed(2)}%</strong></div>
                                            <div className={styles.statItem}><span>Min</span><strong>{(Math.min(...returns) * 100).toFixed(2)}%</strong></div>
                                            <div className={styles.statItem}><span>Max</span><strong>{(Math.max(...returns) * 100).toFixed(2)}%</strong></div>
                                          </>)
                                        })()}
                                      </div>
                                    </div>

                                    {resamplingStrategyResults && (
                                      <div className={styles.strategyResultsSection}>
                                        <h5><span className="material-icons">trending_up</span> Strategy Performance Distribution</h5>
                                        <div className={styles.statsGrid}>
                                          <div className={styles.statItem}><span>Avg Return</span><strong className={(resamplingStrategyResults.distribution?.avgReturn || 0) >= 0 ? styles.positive : styles.negative}>{((resamplingStrategyResults.distribution?.avgReturn || 0) * 100).toFixed(2)}%</strong></div>
                                          <div className={styles.statItem}><span>Range</span><strong>{((resamplingStrategyResults.distribution?.minReturn || 0) * 100).toFixed(1)}% to {((resamplingStrategyResults.distribution?.maxReturn || 0) * 100).toFixed(1)}%</strong></div>
                                          <div className={styles.statItem}><span>Avg Drawdown</span><strong className={styles.negative}>{((resamplingStrategyResults.distribution?.avgDrawdown || 0) * 100).toFixed(2)}%</strong></div>
                                          <div className={styles.statItem}><span>Avg Win Rate</span><strong>{((resamplingStrategyResults.distribution?.avgWinRate || 0) * 100).toFixed(1)}%</strong></div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className={styles.placeholderContent}>
                                <span className="material-icons">info</span>
                                <p>Please complete Strategy Robust Test first</p>
                              </div>
                            )
                          )}
                          
                          {/* Monte Carlo Simulation Component */}
                          {componentId === 'simulation' && (
                            savedSetup ? (
                              <div className={styles.analysisContainer}>
                                <div className={styles.savedSetupInfo}>
                                  <div className={styles.savedSetupHeader}>
                                    <span className="material-icons">check_circle</span>
                                    <h4>Using Saved Setup</h4>
                                  </div>
                                  <div className={styles.savedSetupDetails}>
                                    <span>Trades: {savedSetup.strategyReturns?.length || 0}</span>
                                    <span>Initial: ${savedSetup.initialCapital?.toLocaleString()}</span>
                                  </div>
                                </div>

                                <div className={styles.controlsSection}>
                                  <h4>
                                    <span className="material-icons">tune</span> Simulation Parameters
                                    <span className={styles.sectionInfoIcon}>
                                      <span className="material-icons">info_outline</span>
                                      <div className={styles.sectionInfoTooltip}>
                                        <h5>Monte Carlo Simulation</h5>
                                        <p>Shuffles trade order thousands of times to show all possible equity paths.</p>
                                        <ul>
                                          <li>Reveals luck vs skill</li>
                                          <li>Shows worst-case drawdowns</li>
                                          <li>Confidence intervals for returns</li>
                                        </ul>
                                      </div>
                                    </span>
                                  </h4>
                                  <p className={styles.description}>Monte Carlo shuffles trade order to show possible equity paths, revealing luck vs skill.</p>
                                  
                                  <div className={styles.inputsGrid}>
                                    <div className={styles.inputGroup}>
                                      <label>Simulations</label>
                                      <NumberInput min={100} max={10000} step={100} value={monteCarloNumSims} 
                                        onChange={(val) => setMonteCarloNumSims(Math.min(10000, Math.max(100, val || 1000)))} className={styles.input} />
                                    </div>
                                    <div className={styles.inputGroup}>
                                      <label>Seed</label>
                                      <NumberInput value={monteCarloSeed} onChange={(val) => setMonteCarloSeed(val || 42)} className={styles.input} />
                                    </div>
                                  </div>

                                  <button className={styles.calculateButton} onClick={handleRunMonteCarlo} disabled={isMonteCarloLoading || !savedSetup?.strategyReturns?.length}>
                                    {isMonteCarloLoading ? (<><span className={`material-icons ${styles.spinning}`}>sync</span> Simulating...</>) 
                                      : (<><span className="material-icons">casino</span> Run Simulation</>)}
                                  </button>
                                </div>

                                {monteCarloError && <div className={styles.errorMessage}><span className="material-icons">error</span>{monteCarloError}</div>}

                                {monteCarloResults && (
                                  <div className={styles.resultsContainer}>
                                    <MonteCarloChart simulations={monteCarloResults.simulations} statistics={monteCarloResults.statistics} initialCapital={savedSetup.initialCapital} maxPathsToShow={100} height={300} />

                                    <div className={styles.percentileSection}>
                                      <h5><span className="material-icons">trending_up</span> Return Distribution</h5>
                                      <div className={styles.percentileCards}>
                                        <div className={styles.percentileCard}>
                                          <span>5th %ile</span>
                                          <strong className={monteCarloResults.statistics.totalReturn.p5 >= 0 ? styles.positive : styles.negative}>{(monteCarloResults.statistics.totalReturn.p5 * 100).toFixed(2)}%</strong>
                                        </div>
                                        <div className={styles.percentileCard}>
                                          <span>Median</span>
                                          <strong className={monteCarloResults.statistics.totalReturn.median >= 0 ? styles.positive : styles.negative}>{(monteCarloResults.statistics.totalReturn.median * 100).toFixed(2)}%</strong>
                                        </div>
                                        <div className={styles.percentileCard}>
                                          <span>95th %ile</span>
                                          <strong className={monteCarloResults.statistics.totalReturn.p95 >= 0 ? styles.positive : styles.negative}>{(monteCarloResults.statistics.totalReturn.p95 * 100).toFixed(2)}%</strong>
                                        </div>
                                      </div>
                                    </div>

                                    <div className={styles.riskSummary}>
                                      <h5><span className="material-icons">security</span> Risk Analysis</h5>
                                      <div className={styles.statsGrid}>
                                        <div className={styles.statItem}><span>Prob. of Profit</span><strong className={monteCarloResults.statistics.probabilityOfProfit >= 0.5 ? styles.positive : styles.negative}>{(monteCarloResults.statistics.probabilityOfProfit * 100).toFixed(1)}%</strong></div>
                                        <div className={styles.statItem}><span>Prob. of Loss</span><strong className={styles.negative}>{(monteCarloResults.statistics.probabilityOfLoss * 100).toFixed(1)}%</strong></div>
                                        <div className={styles.statItem}><span>Expected Return</span><strong className={monteCarloResults.statistics.totalReturn.mean >= 0 ? styles.positive : styles.negative}>{(monteCarloResults.statistics.totalReturn.mean * 100).toFixed(2)}%</strong></div>
                                        <div className={styles.statItem}><span>Expected Max DD</span><strong className={styles.negative}>{(monteCarloResults.statistics.maxDrawdown.mean * 100).toFixed(2)}%</strong></div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className={styles.placeholderContent}>
                                <span className="material-icons">info</span>
                                <p>Please complete Strategy Robust Test first</p>
                              </div>
                            )
                          )}
                          
                          {/* Statistical Significance Testing Component - Stepper UI */}
                          {componentId === 'significance' && (
                            savedSetup ? (
                              <div className={styles.analysisContainer}>
                                {/* Stepper Header */}
                                <div className={styles.stepperHeader}>
                                  {[
                                    { step: 1, label: 'State Hypotheses', icon: 'edit_note' },
                                    { step: 2, label: 'Calculate Statistics', icon: 'calculate' },
                                    { step: 3, label: 'Interpret Results', icon: 'insights' }
                                  ].map(({ step, label, icon }) => (
                                    <div 
                                      key={step}
                                      className={`${styles.stepperItem} ${hypothesisStep === step ? styles.active : ''} ${hypothesisStep > step ? styles.completed : ''}`}
                                      onClick={() => step < hypothesisStep && setHypothesisStep(step)}
                                    >
                                      <div className={styles.stepNumber}>
                                        {hypothesisStep > step ? <span className="material-icons">check</span> : step}
                                      </div>
                                      <span className={styles.stepLabel}>{label}</span>
                                    </div>
                                  ))}
                                </div>

                                {/* Step 1: State Hypotheses */}
                                {hypothesisStep === 1 && (
                                  <div className={styles.stepContent}>
                                    <h4>
                                      <span className="material-icons">edit_note</span> Step 1: State Your Hypotheses
                                      <span className={styles.sectionInfoIcon}>
                                        <span className="material-icons">info_outline</span>
                                        <div className={styles.sectionInfoTooltip}>
                                          <h5>State Hypotheses</h5>
                                          <p>Define what you want to test statistically.</p>
                                          <ul>
                                            <li>One-sample: Is mean ≠ target?</li>
                                            <li>Two-sample: Are groups different?</li>
                                            <li>Set alpha (typically 0.05)</li>
                                          </ul>
                                        </div>
                                      </span>
                                    </h4>
                                    
                                    {/* Test Type Selection */}
                                    <div className={styles.testTypeSelector}>
                                      <label>Select Test Type</label>
                                      <div className={styles.testTypeOptions}>
                                        {[
                                          { value: 'one-sample', label: 'One-Sample Mean', desc: 'Compare mean to target μ₀' },
                                          { value: 'two-sample', label: 'Two-Sample Mean', desc: 'Compare first half vs second half' },
                                          { value: 'correlation', label: 'Correlation', desc: 'Test trend over time' }
                                        ].map(({ value, label, desc }) => (
                                          <button
                                            key={value}
                                            className={`${styles.testTypeCard} ${hypothesisTestType === value ? styles.active : ''}`}
                                            onClick={() => { setHypothesisTestType(value); setHypothesisResults(null); }}
                                          >
                                            <strong>{label}</strong>
                                            <span>{desc}</span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Data Info */}
                                    <div className={styles.dataInfoCard}>
                                      <span className="material-icons">dataset</span>
                                      <div>
                                        <strong>Data: Strategy Trade Returns</strong>
                                        <span>{savedSetup.strategyReturns?.length || 0} observations • Mean: {savedSetup.strategyReturns?.length > 0 ? ((savedSetup.strategyReturns.reduce((a, b) => a + b, 0) / savedSetup.strategyReturns.length) * 100).toFixed(2) : 0}%</span>
                                      </div>
                                    </div>

                                    {/* Configuration Row */}
                                    <div className={styles.inputsGrid}>
                                      <div className={styles.inputGroup}>
                                        <label>Test Direction</label>
                                        <div className={styles.tailSelector}>
                                          {[
                                            { value: 'two-sided', label: '≠ Two-sided' },
                                            { value: 'right', label: '> Right' },
                                            { value: 'left', label: '< Left' }
                                          ].map(({ value, label }) => (
                                            <button key={value} className={`${styles.tailButton} ${hypothesisTail === value ? styles.active : ''}`}
                                              onClick={() => setHypothesisTail(value)}>{label}</button>
                                          ))}
                                        </div>
                                      </div>
                                      <div className={styles.inputGroup}>
                                        <label>Significance Level (α)</label>
                                        <div className={styles.alphaSelector}>
                                          {[0.10, 0.05, 0.01].map(a => (
                                            <button key={a} className={`${styles.alphaButton} ${hypothesisAlpha === a ? styles.active : ''}`}
                                              onClick={() => setHypothesisAlpha(a)}>{a}</button>
                                          ))}
                                        </div>
                                      </div>
                                      {hypothesisTestType === 'one-sample' && (
                                        <div className={styles.inputGroup}>
                                          <label>Target Mean μ₀ (%)</label>
                                          <NumberInput step={0.1} value={hypothesisMu0}
                                            onChange={(val) => setHypothesisMu0(val || 0)} className={styles.input} />
                                        </div>
                                      )}
                                    </div>

                                    {/* Hypotheses Display */}
                                    <div className={styles.hypothesesDisplay}>
                                      <h5>Hypotheses</h5>
                                      <div className={styles.hypothesesBox}>
                                        {hypothesisTestType === 'one-sample' && (
                                          <>
                                            <div className={styles.hypothesisLine}><span className={styles.h0}>H₀:</span> μ = {hypothesisMu0}%</div>
                                            <div className={styles.hypothesisLine}><span className={styles.h1}>H₁:</span> μ {hypothesisTail === 'two-sided' ? '≠' : hypothesisTail === 'right' ? '>' : '<'} {hypothesisMu0}%</div>
                                          </>
                                        )}
                                        {hypothesisTestType === 'two-sample' && (
                                          <>
                                            <div className={styles.hypothesisLine}><span className={styles.h0}>H₀:</span> μ₁ − μ₂ = 0</div>
                                            <div className={styles.hypothesisLine}><span className={styles.h1}>H₁:</span> μ₁ − μ₂ {hypothesisTail === 'two-sided' ? '≠' : hypothesisTail === 'right' ? '>' : '<'} 0</div>
                                          </>
                                        )}
                                        {hypothesisTestType === 'correlation' && (
                                          <>
                                            <div className={styles.hypothesisLine}><span className={styles.h0}>H₀:</span> ρ = 0</div>
                                            <div className={styles.hypothesisLine}><span className={styles.h1}>H₁:</span> ρ {hypothesisTail === 'two-sided' ? '≠' : hypothesisTail === 'right' ? '>' : '<'} 0</div>
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    <div className={styles.stepActions}>
                                      <button className={styles.nextStepBtn} onClick={() => setHypothesisStep(2)}>
                                        Next: Calculate <span className="material-icons">arrow_forward</span>
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Step 2: Calculate Statistics */}
                                {hypothesisStep === 2 && (
                                  <div className={styles.stepContent}>
                                    <h4><span className="material-icons">calculate</span> Step 2: Calculate Test Statistics</h4>

                                    {/* Test Variant Toggle */}
                                    <div className={styles.testVariantSection}>
                                      {hypothesisTestType === 'one-sample' && (
                                        <div className={styles.variantInfo}>
                                          <span className="material-icons">info</span> Using One-Sample t-Test
                                        </div>
                                      )}
                                      {hypothesisTestType === 'two-sample' && (
                                        <div className={styles.variantButtons}>
                                          <button className={`${styles.variantBtn} ${hypothesisTestVariant === 'default' ? styles.active : ''}`}
                                            onClick={() => setHypothesisTestVariant('default')}>Welch's t-Test</button>
                                          <button className={`${styles.variantBtn} ${hypothesisTestVariant === 'pooled' ? styles.active : ''}`}
                                            onClick={() => setHypothesisTestVariant('pooled')}>Pooled t-Test</button>
                                        </div>
                                      )}
                                      {hypothesisTestType === 'correlation' && (
                                        <div className={styles.variantButtons}>
                                          <button className={`${styles.variantBtn} ${hypothesisTestVariant !== 'spearman' ? styles.active : ''}`}
                                            onClick={() => setHypothesisTestVariant('pearson')}>Pearson</button>
                                          <button className={`${styles.variantBtn} ${hypothesisTestVariant === 'spearman' ? styles.active : ''}`}
                                            onClick={() => setHypothesisTestVariant('spearman')}>Spearman</button>
                                        </div>
                                      )}
                                    </div>

                                    <button className={styles.runTestBtn} onClick={handleRunHypothesisTest} disabled={isHypothesisLoading}>
                                      {isHypothesisLoading ? (<><span className={`material-icons ${styles.spinning}`}>sync</span> Calculating...</>) 
                                        : (<><span className="material-icons">play_arrow</span> Run Hypothesis Test</>)}
                                    </button>

                                    {hypothesisError && <div className={styles.errorMessage}><span className="material-icons">error</span>{hypothesisError}</div>}

                                    <div className={styles.stepActions}>
                                      <button className={styles.backStepBtn} onClick={() => setHypothesisStep(1)}>
                                        <span className="material-icons">arrow_back</span> Back
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Step 3: Interpret Results */}
                                {hypothesisStep === 3 && hypothesisResults && (
                                  <div className={styles.stepContent}>
                                    <h4><span className="material-icons">insights</span> Step 3: Interpretation & Results</h4>

                                    {/* Decision Banner */}
                                    <div className={`${styles.decisionBanner} ${hypothesisResults.rejectNull ? styles.reject : styles.fail}`}>
                                      <span className="material-icons">{hypothesisResults.rejectNull ? 'gavel' : 'pending'}</span>
                                      <div>
                                        <strong>{hypothesisResults.decision}</strong>
                                        <p>{hypothesisResults.interpretation}</p>
                                      </div>
                                    </div>

                                    {/* Visualization */}
                                    <div className={styles.visualizationCard}>
                                      <h5><span className="material-icons">bar_chart</span> Visualization</h5>
                                      {hypothesisResults.testType === 'one-sample' && hypothesisResults.data && (
                                        <div className={styles.histogramContainer}>
                                          <svg viewBox="0 0 400 180" className={styles.chartSvg}>
                                            {(() => {
                                              const data = hypothesisResults.data
                                              const min = Math.min(...data)
                                              const max = Math.max(...data)
                                              const range = max - min || 1
                                              const binCount = 12
                                              const binWidth = range / binCount
                                              const bins = Array(binCount).fill(0)
                                              data.forEach(v => {
                                                const binIdx = Math.min(Math.floor((v - min) / binWidth), binCount - 1)
                                                bins[binIdx]++
                                              })
                                              const maxBin = Math.max(...bins) || 1
                                              const barW = 360 / binCount
                                              return (
                                                <>
                                                  {bins.map((count, i) => (
                                                    <rect key={i} x={20 + i * barW} y={160 - (count / maxBin) * 140}
                                                      width={barW - 3} height={(count / maxBin) * 140}
                                                      fill="rgba(68, 136, 255, 0.6)" rx={2} />
                                                  ))}
                                                  {(() => {
                                                    const mu0Pos = 20 + ((hypothesisResults.mu0Display - min) / range) * 360
                                                    if (mu0Pos >= 20 && mu0Pos <= 380) {
                                                      return <line x1={mu0Pos} y1={10} x2={mu0Pos} y2={160} stroke="#ff4444" strokeWidth={2} strokeDasharray="4,2" />
                                                    }
                                                    return null
                                                  })()}
                                                  {(() => {
                                                    const meanPos = 20 + ((hypothesisResults.mean * 100 - min) / range) * 360
                                                    return <line x1={meanPos} y1={10} x2={meanPos} y2={160} stroke="#00d4aa" strokeWidth={2} />
                                                  })()}
                                                </>
                                              )
                                            })()}
                                          </svg>
                                          <div className={styles.chartLegend}><span style={{color:'#00d4aa'}}>━</span> Mean <span style={{color:'#ff4444'}}>┅</span> Target μ₀</div>
                                        </div>
                                      )}
                                      {hypothesisResults.testType === 'two-sample' && (
                                        <div className={styles.boxplotContainer}>
                                          <div className={styles.groupComparison}>
                                            <div className={styles.groupBox}>
                                              <span className={styles.groupLabel}>First Half</span>
                                              <strong>{(hypothesisResults.mean1 * 100).toFixed(2)}%</strong>
                                              <span className={styles.groupSubtext}>n={hypothesisResults.n1}</span>
                                            </div>
                                            <div className={styles.groupDiff}>
                                              <span>Δ = {(hypothesisResults.diff * 100).toFixed(2)}%</span>
                                            </div>
                                            <div className={styles.groupBox}>
                                              <span className={styles.groupLabel}>Second Half</span>
                                              <strong>{(hypothesisResults.mean2 * 100).toFixed(2)}%</strong>
                                              <span className={styles.groupSubtext}>n={hypothesisResults.n2}</span>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      {hypothesisResults.testType === 'correlation' && (
                                        <div className={styles.correlationDisplay}>
                                          <div className={styles.correlationValue}>
                                            <span>r = {hypothesisResults.r.toFixed(3)}</span>
                                            <span>r² = {hypothesisResults.rSquared.toFixed(3)}</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Summary Table */}
                                    <div className={styles.summaryTable}>
                                      <h5><span className="material-icons">table_chart</span> Summary Statistics</h5>
                                      <table>
                                        <tbody>
                                          <tr><td>Test Type</td><td>{hypothesisResults.testName}</td></tr>
                                          <tr><td>Tail</td><td>{hypothesisResults.tail === 'two-sided' ? 'Two-sided' : hypothesisResults.tail === 'right' ? 'Right' : 'Left'}</td></tr>
                                          <tr><td>α</td><td>{hypothesisResults.alpha}</td></tr>
                                          {hypothesisResults.testType === 'one-sample' && (
                                            <>
                                              <tr><td>n</td><td>{hypothesisResults.n}</td></tr>
                                              <tr><td>Mean</td><td>{(hypothesisResults.mean * 100).toFixed(4)}%</td></tr>
                                              <tr><td>Std Dev</td><td>{(hypothesisResults.std * 100).toFixed(4)}%</td></tr>
                                            </>
                                          )}
                                          {hypothesisResults.testType === 'two-sample' && (
                                            <>
                                              <tr><td>n₁ / n₂</td><td>{hypothesisResults.n1} / {hypothesisResults.n2}</td></tr>
                                              <tr><td>Mean₁ / Mean₂</td><td>{(hypothesisResults.mean1 * 100).toFixed(3)}% / {(hypothesisResults.mean2 * 100).toFixed(3)}%</td></tr>
                                            </>
                                          )}
                                          {hypothesisResults.testType === 'correlation' && (
                                            <>
                                              <tr><td>n</td><td>{hypothesisResults.n}</td></tr>
                                              <tr><td>r</td><td>{hypothesisResults.r.toFixed(4)}</td></tr>
                                            </>
                                          )}
                                          <tr><td>t-statistic</td><td>{hypothesisResults.tStatistic.toFixed(4)}</td></tr>
                                          <tr><td>df</td><td>{typeof hypothesisResults.df === 'number' ? hypothesisResults.df.toFixed(2) : hypothesisResults.df}</td></tr>
                                          <tr className={hypothesisResults.pValue <= hypothesisResults.alpha ? styles.significantRow : ''}>
                                            <td>p-value</td><td>{hypothesisResults.pValue < 0.0001 ? '< 0.0001' : hypothesisResults.pValue.toFixed(4)}</td>
                                          </tr>
                                          <tr><td>CI ({((1 - hypothesisResults.alpha) * 100).toFixed(0)}%)</td>
                                            <td>[{(hypothesisResults.ciLow * (hypothesisResults.testType === 'correlation' ? 1 : 100)).toFixed(4)}{hypothesisResults.testType !== 'correlation' ? '%' : ''}, {(hypothesisResults.ciHigh * (hypothesisResults.testType === 'correlation' ? 1 : 100)).toFixed(4)}{hypothesisResults.testType !== 'correlation' ? '%' : ''}]</td>
                                          </tr>
                                          {hypothesisResults.cohensD !== undefined && <tr><td>Cohen's d</td><td>{hypothesisResults.cohensD.toFixed(3)}</td></tr>}
                                          <tr className={styles.decisionRow}><td>Decision</td><td><strong>{hypothesisResults.decision}</strong></td></tr>
                                        </tbody>
                                      </table>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className={styles.resultActions}>
                                      <button className={styles.copyReportBtn} onClick={() => {
                                        const report = `Hypothesis Test Report\n${'='.repeat(40)}\nTest: ${hypothesisResults.testName}\nTail: ${hypothesisResults.tail}\nα: ${hypothesisResults.alpha}\np-value: ${hypothesisResults.pValue.toFixed(4)}\nDecision: ${hypothesisResults.decision}\n\n${hypothesisResults.interpretation}`
                                        navigator.clipboard.writeText(report)
                                        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Report copied!', showConfirmButton: false, timer: 1500, background: '#1a1a2e', color: '#fff' })
                                      }}>
                                        <span className="material-icons">content_copy</span> Copy Report
                                      </button>
                                    </div>

                                    <div className={styles.stepActions}>
                                      <button className={styles.backStepBtn} onClick={() => setHypothesisStep(1)}>
                                        <span className="material-icons">arrow_back</span> Start Over
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className={styles.placeholderContent}>
                                <span className="material-icons">info</span>
                                <p>Please complete Strategy Robust Test first</p>
                              </div>
                            )
                          )}
                          
                          {/* Stress Test Component */}
                          {/* Timeframe Comparison Component */}
                          {componentId === 'timeframeComparison' && (
                            savedSetup ? (
                              <div className={styles.analysisContainer}>
                                <div className={styles.savedSetupInfo}>
                                  <div className={styles.savedSetupHeader}>
                                    <span className="material-icons">check_circle</span>
                                    <h5>Compare Across Timeframes</h5>
                                  </div>
                                  <p className={styles.savedSetupNote}>
                                    <span className="material-icons">info</span>
                                    Different timeframes change signal frequency and trade count; compare both performance and stability.
                                  </p>
                                </div>

                                {/* Timeframe Selection */}
                                <div className={styles.configSection}>
                                  <h5><span className="material-icons">schedule</span> Select Timeframes</h5>
                                  <div className={styles.timeframeCheckboxGrid}>
                                    {COMPARISON_TIMEFRAMES.map(tf => (
                                      <label key={tf.value} className={styles.timeframeCheckbox}>
                                        <input 
                                          type="checkbox" 
                                          checked={selectedComparisonTimeframes.includes(tf.value)}
                                          onChange={() => toggleComparisonTimeframe(tf.value)}
                                          disabled={isTimeframeComparisonRunning}
                                        />
                                        <span className={styles.checkboxLabel}>
                                          {tf.label}
                                          {timeframeComparisonLoading[tf.value] && (
                                            <span className={`material-icons ${styles.spinning}`}>sync</span>
                                          )}
                                          {timeframeComparisonErrors[tf.value] && (
                                            <span className={`material-icons ${styles.errorBadge}`} title={timeframeComparisonErrors[tf.value]}>error</span>
                                          )}
                                          {timeframeComparisonResults[tf.value] && !timeframeComparisonLoading[tf.value] && !timeframeComparisonErrors[tf.value] && (
                                            <span className={`material-icons ${styles.successBadge}`}>check_circle</span>
                                          )}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </div>

                                {/* Options */}
                                <div className={styles.configSection}>
                                  <h5><span className="material-icons">tune</span> Options</h5>
                                  <div className={styles.optionsRow}>
                                    <label className={styles.toggleOption}>
                                      <input 
                                        type="checkbox" 
                                        checked={normalizeEquityCurves}
                                        onChange={(e) => setNormalizeEquityCurves(e.target.checked)}
                                        disabled={isTimeframeComparisonRunning}
                                      />
                                      <span>Normalize equity curves (same starting capital)</span>
                                    </label>
                                  </div>
                                </div>

                                {/* Run Button */}
                                <button 
                                  className={styles.calculateButton} 
                                  onClick={handleRunTimeframeComparison} 
                                  disabled={isTimeframeComparisonRunning || selectedComparisonTimeframes.length === 0}
                                >
                                  {isTimeframeComparisonRunning ? (
                                    <>
                                      <span className={`material-icons ${styles.spinning}`}>sync</span>
                                      Comparing... ({timeframeComparisonProgress.completed}/{timeframeComparisonProgress.total})
                                    </>
                                  ) : (
                                    <>
                                      <span className="material-icons">compare_arrows</span>
                                      Compare Timeframes ({selectedComparisonTimeframes.length})
                                    </>
                                  )}
                                </button>

                                {/* Results */}
                                {Object.keys(timeframeComparisonResults).length > 0 && (
                                  <div className={styles.comparisonResults}>
                                    
                                    {/* A) Overlay Equity Curve Chart */}
                                    <div className={styles.comparisonSection}>
                                      <h5><span className="material-icons">show_chart</span> Equity Curves Comparison</h5>
                                      <div className={styles.equityCurveLegend}>
                                        {Object.entries(timeframeComparisonResults).map(([tf, result], idx) => {
                                          const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c']
                                          return (
                                            <span key={tf} className={styles.legendItem} style={{ color: colors[idx % colors.length] }}>
                                              <span className={styles.legendDot} style={{ background: colors[idx % colors.length] }}></span>
                                              {tf} ({result.metrics?.totalTrades || 0} trades)
                                            </span>
                                          )
                                        })}
                                      </div>
                                      <div className={styles.equityChartContainer}>
                                        {(() => {
                                          // Pre-calculate all values for the chart
                                          const initialCapital = savedSetup.initialCapital || 10000
                                          const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c']
                                          
                                          // Collect all equity values for normalization
                                          let allEquityValues = []
                                          const processedCurves = {}
                                          const rawCurves = {}
                                          
                                          Object.entries(timeframeComparisonResults).forEach(([tf, result]) => {
                                            const curve = result.equityCurve || []
                                            if (curve.length > 0) {
                                              const firstEquity = curve[0]?.equity || initialCapital
                                              const normalized = normalizeEquityCurves 
                                                ? curve.map(p => (p.equity / firstEquity) * initialCapital)
                                                : curve.map(p => p.equity)
                                              processedCurves[tf] = normalized
                                              rawCurves[tf] = curve
                                              allEquityValues = allEquityValues.concat(normalized)
                                            }
                                          })
                                          
                                          if (allEquityValues.length === 0) {
                                            return (
                                              <div className={styles.noDataMessage}>
                                                <span className="material-icons">show_chart</span>
                                                <p>No equity curve data available</p>
                                              </div>
                                            )
                                          }
                                          
                                          const minEquity = Math.min(...allEquityValues)
                                          const maxEquity = Math.max(...allEquityValues)
                                          const yRange = maxEquity - minEquity || 1
                                          
                                          // Find the max curve length for x-axis scaling
                                          const maxLength = Math.max(...Object.values(processedCurves).map(c => c.length))
                                          const timeframes = Object.keys(processedCurves)
                                          
                                          const handleMouseMove = (e) => {
                                            const rect = e.currentTarget.getBoundingClientRect()
                                            const svgWidth = 800
                                            const chartLeft = 60
                                            const chartWidth = 720
                                            const mouseX = ((e.clientX - rect.left) / rect.width) * svgWidth
                                            
                                            if (mouseX >= chartLeft && mouseX <= chartLeft + chartWidth) {
                                              const relativeX = (mouseX - chartLeft) / chartWidth
                                              const values = {}
                                              
                                              timeframes.forEach((tf, idx) => {
                                                const curve = processedCurves[tf]
                                                const rawCurve = rawCurves[tf]
                                                if (curve && curve.length > 0) {
                                                  const dataIdx = Math.min(Math.floor(relativeX * (curve.length - 1)), curve.length - 1)
                                                  values[tf] = {
                                                    equity: curve[dataIdx],
                                                    date: rawCurve[dataIdx]?.date || '',
                                                    color: colors[idx % colors.length]
                                                  }
                                                }
                                              })
                                              
                                              setEquityCurveHover({ x: mouseX, relativeX, values })
                                            }
                                          }
                                          
                                          const handleMouseLeave = () => {
                                            setEquityCurveHover(null)
                                          }
                                          
                                          return (
                                            <svg 
                                              viewBox="0 0 800 300" 
                                              className={styles.equityChart}
                                              onMouseMove={handleMouseMove}
                                              onMouseLeave={handleMouseLeave}
                                            >
                                              {/* Background */}
                                              <rect x="60" y="60" width="720" height="180" fill="rgba(0,0,0,0.2)" />
                                              
                                              {/* Grid lines */}
                                              {[0, 1, 2, 3, 4].map(i => (
                                                <line key={i} x1="60" y1={60 + i * 45} x2="780" y2={60 + i * 45} stroke="#333" strokeWidth="1" />
                                              ))}
                                              
                                              {/* Equity curves */}
                                              {Object.entries(processedCurves).map(([tf, curve], idx) => {
                                                if (curve.length < 2) return null
                                                
                                                const xScale = 720 / (curve.length - 1)
                                                const yScale = 180 / yRange
                                                
                                                const pathD = curve.map((equity, i) => {
                                                  const x = 60 + i * xScale
                                                  const y = 240 - (equity - minEquity) * yScale
                                                  return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
                                                }).join(' ')
                                                
                                                return (
                                                  <path 
                                                    key={tf} 
                                                    d={pathD} 
                                                    fill="none" 
                                                    stroke={colors[idx % colors.length]} 
                                                    strokeWidth="2"
                                                    strokeLinejoin="round"
                                                  />
                                                )
                                              })}
                                              
                                              {/* Hover line and dots */}
                                              {equityCurveHover && (
                                                <>
                                                  <line 
                                                    x1={equityCurveHover.x} 
                                                    y1="60" 
                                                    x2={equityCurveHover.x} 
                                                    y2="240" 
                                                    stroke="rgba(255,255,255,0.5)" 
                                                    strokeWidth="1" 
                                                    strokeDasharray="4,4"
                                                  />
                                                  {Object.entries(equityCurveHover.values).map(([tf, data]) => {
                                                    const yScale = 180 / yRange
                                                    const y = 240 - (data.equity - minEquity) * yScale
                                                    return (
                                                      <circle 
                                                        key={tf}
                                                        cx={equityCurveHover.x}
                                                        cy={y}
                                                        r="5"
                                                        fill={data.color}
                                                        stroke="#fff"
                                                        strokeWidth="2"
                                                      />
                                                    )
                                                  })}
                                                </>
                                              )}
                                              
                                              {/* Y-axis labels */}
                                              <text x="55" y="65" textAnchor="end" fontSize="10" fill="#888">
                                                ${maxEquity >= 1000 ? `${(maxEquity / 1000).toFixed(1)}k` : maxEquity.toFixed(0)}
                                              </text>
                                              <text x="55" y="152" textAnchor="end" fontSize="10" fill="#888">
                                                ${((maxEquity + minEquity) / 2) >= 1000 ? `${((maxEquity + minEquity) / 2 / 1000).toFixed(1)}k` : ((maxEquity + minEquity) / 2).toFixed(0)}
                                              </text>
                                              <text x="55" y="245" textAnchor="end" fontSize="10" fill="#888">
                                                ${minEquity >= 1000 ? `${(minEquity / 1000).toFixed(1)}k` : minEquity.toFixed(0)}
                                              </text>
                                              
                                              {/* X-axis labels */}
                                              <text x="60" y="260" textAnchor="start" fontSize="10" fill="#888">Start</text>
                                              <text x="780" y="260" textAnchor="end" fontSize="10" fill="#888">End</text>
                                            </svg>
                                          )
                                        })()}
                                        
                                        {/* Hover tooltip */}
                                        {equityCurveHover && (
                                          <div className={styles.equityCurveTooltip}>
                                            {Object.entries(equityCurveHover.values).map(([tf, data]) => (
                                              <div key={tf} className={styles.tooltipRow}>
                                                <span className={styles.tooltipDot} style={{ background: data.color }}></span>
                                                <span className={styles.tooltipLabel}>{tf}:</span>
                                                <span className={styles.tooltipValue}>${data.equity?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                {data.date && <span className={styles.tooltipDate}>({data.date})</span>}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* B) Metrics Comparison Table */}
                                    <div className={styles.comparisonSection}>
                                      <h5><span className="material-icons">table_chart</span> Metrics Comparison</h5>
                                      <div className={styles.metricsTableContainer}>
                                        <table className={styles.metricsComparisonTable}>
                                          <thead>
                                            <tr>
                                              <th>Metric</th>
                                              {Object.keys(timeframeComparisonResults).map(tf => (
                                                <th key={tf}>
                                                  {tf}
                                                  {timeframeComparisonErrors[tf] && (
                                                    <span className={`material-icons ${styles.errorIcon}`} title={timeframeComparisonErrors[tf]}>warning</span>
                                                  )}
                                                </th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {[
                                              { key: 'totalReturn', label: 'Total Return', format: v => `${v.toFixed(2)}%`, tooltip: 'Total percentage return over the entire period' },
                                              { key: 'cagr', label: 'CAGR', format: v => `${v.toFixed(2)}%`, tooltip: 'Compound Annual Growth Rate' },
                                              { key: 'sharpe', label: 'Sharpe Ratio', format: v => v.toFixed(2), tooltip: 'Risk-adjusted return (higher is better)' },
                                              { key: 'maxDrawdown', label: 'Max Drawdown', format: v => `${v.toFixed(2)}%`, tooltip: 'Largest peak-to-trough decline (lower is better)', lowerIsBetter: true },
                                              { key: 'winRate', label: 'Win Rate', format: v => `${v.toFixed(1)}%`, tooltip: 'Percentage of winning trades' },
                                              { key: 'profitFactor', label: 'Profit Factor', format: v => v === Infinity ? '∞' : v.toFixed(2), tooltip: 'Gross profit / gross loss (higher is better)' },
                                              { key: 'totalTrades', label: '# Trades', format: v => v, tooltip: 'Total number of trades executed' },
                                            ].map(metric => {
                                              const bestWorst = getMetricBestWorst(metric.key, timeframeComparisonResults)
                                              return (
                                                <tr key={metric.key}>
                                                  <td title={metric.tooltip}>
                                                    {metric.label}
                                                    <span className={`material-icons ${styles.tooltipIcon}`}>info</span>
                                                  </td>
                                                  {Object.entries(timeframeComparisonResults).map(([tf, result]) => {
                                                    const value = result.metrics?.[metric.key]
                                                    const isBest = tf === bestWorst.best
                                                    const isWorst = tf === bestWorst.worst && !timeframeComparisonErrors[tf]
                                                    return (
                                                      <td 
                                                        key={tf} 
                                                        className={`${isBest ? styles.bestValue : ''} ${isWorst ? styles.worstValue : ''}`}
                                                      >
                                                        {value !== undefined ? metric.format(value) : '-'}
                                                        {isBest && <span className={styles.bestBadge}>Best</span>}
                                                      </td>
                                                    )
                                                  })}
                                                </tr>
                                              )
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>

                                    {/* C) Behavior Summary Cards */}
                                    <div className={styles.comparisonSection}>
                                      <h5><span className="material-icons">dashboard</span> Behavior Summary</h5>
                                      <div className={styles.behaviorCardsGrid}>
                                        {Object.entries(timeframeComparisonResults).map(([tf, result]) => (
                                          <div key={tf} className={`${styles.behaviorCard} ${timeframeComparisonErrors[tf] ? styles.hasError : ''}`}>
                                            <div className={styles.behaviorCardHeader}>
                                              <span className={styles.timeframeBadge}>{tf}</span>
                                              {timeframeComparisonErrors[tf] && (
                                                <span className={`material-icons ${styles.errorIcon}`} title={timeframeComparisonErrors[tf]}>warning</span>
                                              )}
                                            </div>
                                            {!timeframeComparisonErrors[tf] && result.metrics && (
                                              <div className={styles.behaviorStats}>
                                                <div className={styles.behaviorStat}>
                                                  <span className={styles.statLabel}>Trades/Month</span>
                                                  <span className={styles.statValue}>{result.metrics.tradesPerMonth.toFixed(1)}</span>
                                                </div>
                                                <div className={styles.behaviorStat}>
                                                  <span className={styles.statLabel}>Avg Holding</span>
                                                  <span className={styles.statValue}>{result.metrics.avgHoldingPeriod.toFixed(1)} days</span>
                                                </div>
                                                <div className={styles.behaviorStat}>
                                                  <span className={styles.statLabel}>Time in Market</span>
                                                  <span className={styles.statValue}>{result.metrics.timeInMarket.toFixed(1)}%</span>
                                                </div>
                                                <div className={styles.behaviorStat}>
                                                  <span className={styles.statLabel}>Long/Short</span>
                                                  <span className={styles.statValue}>
                                                    {result.metrics.longTrades} / {result.metrics.shortTrades}
                                                  </span>
                                                </div>
                                              </div>
                                            )}
                                            {timeframeComparisonErrors[tf] && (
                                              <div className={styles.behaviorError}>
                                                <span className="material-icons">error</span>
                                                <span>{timeframeComparisonErrors[tf]}</span>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className={styles.placeholderContent}>
                                <span className="material-icons">info</span>
                                <p>Please complete Strategy Robust Test first</p>
                              </div>
                            )
                          )}
                          
                          {componentId === 'stressTest' && (
                            savedSetup ? (
                              <div className={styles.analysisContainer}>
                                <div className={styles.savedSetupInfo}>
                                  <div className={styles.savedSetupHeader}>
                                    <span className="material-icons">check_circle</span>
                                    <h4>Using Saved Setup</h4>
                                  </div>
                                  <div className={styles.savedSetupDetails}>
                                    <span>Asset: {savedSetup.symbol}</span>
                                    <span>Indicator: {isCrossoverIndicator(savedSetup?.indicatorType) ? `${savedSetup?.indicatorType?.toUpperCase() || 'EMA'} ${savedSetup.emaShort}/${savedSetup.emaLong}` : `${savedSetup.indicatorType?.toUpperCase()} (${savedSetup.indicatorLength})`}</span>
                                  </div>
                                </div>

                                <div className={styles.controlsSection}>
                                  <h4>
                                    <span className="material-icons">tune</span> Stress Test Parameters
                                    <span className={styles.sectionInfoIcon}>
                                      <span className="material-icons">info_outline</span>
                                      <div className={styles.sectionInfoTooltip}>
                                        <h5>Stress Test</h5>
                                        <p>Tests strategy with execution delays to simulate real-world conditions.</p>
                                        <ul>
                                          <li>Entry delay: Bars after signal</li>
                                          <li>Exit delay: Bars after signal</li>
                                          <li>Shows timing sensitivity</li>
                                        </ul>
                                      </div>
                                    </span>
                                  </h4>
                                  <p className={styles.description}>Test strategy with delayed entries/exits across different time periods to assess robustness.</p>
                                  
                                  <div className={styles.inputsGrid}>
                                    <div className={styles.inputGroup}>
                                      <label>Start Year</label>
                                      <select value={stressTestStartYear} onChange={(e) => setStressTestStartYear(parseInt(e.target.value))} className={styles.select}>
                                        {AVAILABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                      </select>
                                    </div>
                                    <div className={styles.inputGroup}>
                                      <label>Entry Delay</label>
                                      <NumberInput min={0} max={10} value={stressTestEntryDelay} onChange={(val) => setStressTestEntryDelay(val || 0)} className={styles.input} />
                                    </div>
                                    <div className={styles.inputGroup}>
                                      <label>Exit Delay</label>
                                      <NumberInput min={0} max={10} value={stressTestExitDelay} onChange={(val) => setStressTestExitDelay(val || 0)} className={styles.input} />
                                    </div>
                                    <div className={styles.inputGroup}>
                                      <label>Position Type</label>
                                      <select value={stressTestPositionType} onChange={(e) => setStressTestPositionType(e.target.value)} className={styles.select}>
                                        <option value="both">Both</option>
                                        <option value="long_only">Long Only</option>
                                        <option value="short_only">Short Only</option>
                                      </select>
                                    </div>
                                  </div>

                                  <button className={styles.calculateButton} onClick={handleRunStressTest} disabled={isStressTestLoading}>
                                    {isStressTestLoading ? (<><span className={`material-icons ${styles.spinning}`}>sync</span> Running...</>) 
                                      : (<><span className="material-icons">warning_amber</span> Run Stress Test</>)}
                                  </button>
                                </div>

                                {stressTestError && <div className={styles.errorMessage}><span className="material-icons">error</span>{stressTestError}</div>}

                                {stressTestResults && (
                                  <div className={styles.resultsContainer}>
                                    <div className={styles.stressTestSummary}>
                                      <div className={styles.sectionHeader}>
                                        <h5><span className="material-icons">assessment</span> Performance Summary</h5>
                                        {canExportLogs && (
                                          <button className={styles.exportLogButton} onClick={exportStressTestToCSV} title="Export trade log (Admin/Mod only)">
                                            <span className="material-icons">download</span>
                                            Export Log
                                          </button>
                                        )}
                                      </div>
                                      <div className={styles.statsGrid}>
                                        <div className={styles.statItem}><span>Total Trades</span><strong>{stressTestResults.performance?.totalTrades || 0}</strong></div>
                                        <div className={styles.statItem}><span>Win Rate</span><strong>{((stressTestResults.performance?.winRate || 0) * 100).toFixed(1)}%</strong></div>
                                        <div className={styles.statItem}><span>Total Return</span><strong className={(stressTestResults.performance?.totalReturn || 0) >= 0 ? styles.positive : styles.negative}>{((stressTestResults.performance?.totalReturn || 0) * 100).toFixed(2)}%</strong></div>
                                        <div className={styles.statItem}><span>Total P&L</span><strong className={(stressTestResults.performance?.totalPnL || 0) >= 0 ? styles.positive : styles.negative}>${(stressTestResults.performance?.totalPnL || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}</strong></div>
                                        <div className={styles.statItem}><span>Profit Factor</span><strong>{(stressTestResults.performance?.profitFactor || 0) === Infinity ? '∞' : (stressTestResults.performance?.profitFactor || 0).toFixed(2)}</strong></div>
                                        <div className={styles.statItem}><span>Winning</span><strong className={styles.positive}>{stressTestResults.performance?.winningTrades || 0}</strong></div>
                                        <div className={styles.statItem}><span>Losing</span><strong className={styles.negative}>{stressTestResults.performance?.losingTrades || 0}</strong></div>
                                        <div className={styles.statItem}><span>Avg Win</span><strong className={styles.positive}>${(stressTestResults.performance?.avgWin || 0).toFixed(2)}</strong></div>
                                        <div className={styles.statItem}><span>Avg Loss</span><strong className={styles.negative}>${(stressTestResults.performance?.avgLoss || 0).toFixed(2)}</strong></div>
                                      </div>
                                    </div>

                                    {stressTestResults.trades?.length > 0 && (
                                      <div className={styles.tradesTable}>
                                        <h5>Recent Trades <span className={styles.tableHint}>({stressTestResults.trades.length} total)</span></h5>
                                        <div className={styles.tableContainer}>
                                          <table className={styles.resultsTable}>
                                            <thead>
                                              <tr>
                                                <th>Entry</th>
                                                <th>Exit</th>
                                                <th>Type</th>
                                                <th>P&L</th>
                                                <th>Return</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {stressTestResults.trades.slice(-10).map((t, i) => (
                                                <tr key={i}>
                                                  <td>{t.Entry_Date?.slice(0, 10)}</td>
                                                  <td>{t.Exit_Date?.slice(0, 10)}</td>
                                                  <td className={t.Position_Type?.toUpperCase() === 'LONG' ? styles.positive : styles.negative}>{t.Position_Type}</td>
                                                  <td className={(t.PnL || 0) >= 0 ? styles.positive : styles.negative}>${(t.PnL || 0).toFixed(2)}</td>
                                                  <td className={(t.Return_Pct || 0) >= 0 ? styles.positive : styles.negative}>{((t.Return_Pct || 0) * 100).toFixed(2)}%</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className={styles.placeholderContent}>
                                <span className="material-icons">info</span>
                                <p>Please complete Strategy Robust Test first</p>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Add Component Button */}
                <div className={styles.addComponentSection}>
                  <button className={styles.addComponentBtn} onClick={() => setShowComponentMenu(true)}>
                    <span className="material-icons">add_circle</span>
                    Add Analysis Component
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Component Menu Modal */}
          {showComponentMenu && (
            <div className={styles.modalOverlay} onClick={() => setShowComponentMenu(false)}>
              <div className={styles.componentMenuModal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                  <h3>
                    <span className="material-icons">widgets</span>
                    Add Analysis Component
                  </h3>
                  <button className={styles.modalCloseButton} onClick={() => setShowComponentMenu(false)}>
                    <span className="material-icons">close</span>
                  </button>
                </div>
                <div className={styles.modalContent}>
                  <div className={styles.componentGrid}>
                    {AVAILABLE_COMPONENTS.map(comp => {
                      const isAdded = activeComponents.includes(comp.id)
                      const isDisabled = comp.required && isAdded
                      
                      return (
                        <div 
                          key={comp.id}
                          className={`${styles.componentCard} ${isAdded ? styles.added : ''} ${isDisabled ? styles.disabled : ''}`}
                          onClick={() => !isDisabled && handleAddComponent(comp.id)}
                        >
                          <div className={styles.componentCardHeader}>
                            <span className="material-icons">{comp.icon}</span>
                            <h4>{comp.title}</h4>
                          </div>
                          <p className={styles.componentCardDesc}>{comp.description}</p>
                          {isAdded && (
                            <div className={styles.addedBadge}>
                              <span className="material-icons">check_circle</span>
                              Already added
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
