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

// Constants moved outside component to prevent recreation
const CURRENT_YEAR = new Date().getFullYear()
const AVAILABLE_YEARS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i)

const SYMBOLS = {
  'Cryptocurrencies': [
  'BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD',
  'ADA-USD', 'DOGE-USD', 'AVAX-USD', 'DOT-USD', 'MATIC-USD',
    'LINK-USD', 'UNI-USD', 'ATOM-USD', 'LTC-USD', 'TRX-USD',
    'SHIB-USD', 'PEPE-USD', 'NEAR-USD', 'SUI-USD'
  ],
  'Top US Stocks': [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META',
    'BRK-B', 'JPM', 'V', 'JNJ', 'WMT', 'PG', 'UNH', 'HD',
    'MA', 'BAC', 'XOM', 'CVX', 'KO', 'PEP', 'DIS', 'NFLX',
    'AMD', 'INTC', 'CRM', 'ORCL', 'CSCO', 'ADBE'
  ],
  'ETFs & Indices': [
    'SPY', 'QQQ', 'DIA', 'IWM', 'VTI'
  ],
  'Commodities': [
    'GC=F', 'GLD', 'SI=F', 'SLV', 'CL=F', 'USO'
  ]
}

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

// Tooltip component for indicator info
const IndicatorInfoTooltip = memo(({ indicatorType }) => {
  const [showTooltip, setShowTooltip] = useState(false)
  const logic = getIndicatorLogic(indicatorType)
  
  return (
    <div style={{ position: 'relative', display: 'inline-block', marginLeft: '0.5rem' }}>
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
        style={{
          background: 'rgba(0, 212, 170, 0.15)',
          border: '1px solid rgba(0, 212, 170, 0.3)',
          borderRadius: '50%',
          width: '22px',
          height: '22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0
        }}
      >
        <span className="material-icons" style={{ fontSize: '14px', color: '#00d4aa' }}>info</span>
      </button>
      {showTooltip && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '8px',
          background: '#1a1f2e',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '10px',
          padding: '1rem',
          minWidth: '320px',
          maxWidth: '400px',
          zIndex: 1000,
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)'
        }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#00d4aa', marginBottom: '0.75rem' }}>
            Entry & Exit Logic
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Entry Signals</div>
            <div style={{ fontSize: '0.8rem', color: '#fff', whiteSpace: 'pre-line', lineHeight: '1.5' }}>
              {logic.entry}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Exit Logic</div>
            <div style={{ fontSize: '0.8rem', color: '#fff', lineHeight: '1.5' }}>
              {logic.exit}
            </div>
          </div>
          <div style={{
            position: 'absolute',
            bottom: '-6px',
            left: '50%',
            transform: 'translateX(-50%) rotate(45deg)',
            width: '12px',
            height: '12px',
            background: '#1a1f2e',
            borderRight: '1px solid rgba(255,255,255,0.15)',
            borderBottom: '1px solid rgba(255,255,255,0.15)'
          }}></div>
        </div>
      )}
    </div>
  )
})

const HEATMAP_METRIC_OPTIONS = [
  { value: 'sharpe_ratio', label: 'Sharpe Ratio' },
  { value: 'total_return', label: 'Total Return' },
  { value: 'win_rate', label: 'Win Rate' },
  { value: 'max_drawdown', label: 'Max Drawdown' },
]

// Pure utility functions moved outside component
const getSharpeColor = (sharpe) => {
  if (sharpe >= 2) return '#00ff88'
  if (sharpe >= 1) return '#88ff00'
  if (sharpe >= 0.5) return '#ffcc00'
  if (sharpe >= 0) return '#ff8800'
  return '#ff4444'
}

// Helper for number inputs - allows empty string for better UX
const handleNumberInput = (setter, defaultVal = 0) => (e) => {
  const val = e.target.value
  setter(val === '' ? '' : Number(val))
}

const handleNumberBlur = (setter, defaultVal, minVal = null) => (e) => {
  const val = Number(e.target.value)
  if (isNaN(val) || e.target.value === '') {
    setter(defaultVal)
  } else if (minVal !== null && val < minVal) {
    setter(minVal)
  }
}

export default function OptimizePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  
  // Configuration state
  const [symbol, setSymbol] = useState('BTC-USD')
  const [interval, setInterval] = useState('1d')
  const [indicatorType, setIndicatorType] = useState('ema')
  const [inSampleYears, setInSampleYears] = useState([CURRENT_YEAR - 2, CURRENT_YEAR - 3])
  const [outSampleYears, setOutSampleYears] = useState([CURRENT_YEAR - 1, CURRENT_YEAR])
  const [maxEmaShort, setMaxEmaShort] = useState(20)
  const [maxEmaLong, setMaxEmaLong] = useState(50)
  
  // Indicator-specific parameters
  const [indicatorLength, setIndicatorLength] = useState(14) // Fixed length for RSI/CCI/Z-Score
  // RSI: oversold (bottom) 20-35, overbought (top) 65-80
  const [minIndicatorBottom, setMinIndicatorBottom] = useState(20) // Min oversold for RSI
  const [maxIndicatorBottom, setMaxIndicatorBottom] = useState(35) // Max oversold for RSI  
  const [minIndicatorTop, setMinIndicatorTop] = useState(65) // Min overbought for RSI
  const [maxIndicatorTop, setMaxIndicatorTop] = useState(80) // Max overbought for RSI
  // CCI: oversold (bottom) -150 to -50, overbought (top) 50 to 150
  const [minIndicatorBottomCci, setMinIndicatorBottomCci] = useState(-150) // Min oversold for CCI
  const [maxIndicatorBottomCci, setMaxIndicatorBottomCci] = useState(-50) // Max oversold for CCI
  const [minIndicatorTopCci, setMinIndicatorTopCci] = useState(50) // Min overbought for CCI
  const [maxIndicatorTopCci, setMaxIndicatorTopCci] = useState(150) // Max overbought for CCI
  // Z-Score: oversold (bottom) -2.5 to -1.5, overbought (top) 1.5 to 2.5
  const [minIndicatorBottomZscore, setMinIndicatorBottomZscore] = useState(-2.5) // Min oversold for Z-Score
  const [maxIndicatorBottomZscore, setMaxIndicatorBottomZscore] = useState(-1.5) // Max oversold for Z-Score
  const [minIndicatorTopZscore, setMinIndicatorTopZscore] = useState(1.5) // Min overbought for Z-Score
  const [maxIndicatorTopZscore, setMaxIndicatorTopZscore] = useState(2.5) // Max overbought for Z-Score
  // Rolling Std: low volatility (bottom) 0.5 to 1, high volatility (top) 2 to 3
  const [minIndicatorBottomRollStd, setMinIndicatorBottomRollStd] = useState(0.5)
  const [maxIndicatorBottomRollStd, setMaxIndicatorBottomRollStd] = useState(1.0)
  const [minIndicatorTopRollStd, setMinIndicatorTopRollStd] = useState(2.0)
  const [maxIndicatorTopRollStd, setMaxIndicatorTopRollStd] = useState(3.0)
  // Rolling Percentile: oversold (bottom) 10 to 30, overbought (top) 70 to 90
  const [minIndicatorBottomRollPct, setMinIndicatorBottomRollPct] = useState(10)
  const [maxIndicatorBottomRollPct, setMaxIndicatorBottomRollPct] = useState(30)
  const [minIndicatorTopRollPct, setMinIndicatorTopRollPct] = useState(70)
  const [maxIndicatorTopRollPct, setMaxIndicatorTopRollPct] = useState(90)
  
  // Out-of-Sample single values (can be auto-filled from in-sample table)
  const [outSampleEmaShort, setOutSampleEmaShort] = useState(12)
  const [outSampleEmaLong, setOutSampleEmaLong] = useState(26)
  const [outSampleIndicatorBottom, setOutSampleIndicatorBottom] = useState(30)
  const [outSampleIndicatorTop, setOutSampleIndicatorTop] = useState(70)
  const [initialCapital, setInitialCapital] = useState(10000)
  
  // Position type: 'long_only', 'short_only', or 'both'
  const [positionType, setPositionType] = useState('both')
  
  // Stop Loss mode: 'support_resistance' or 'none'
  const [stopLossMode, setStopLossMode] = useState('support_resistance')
  
  // Saved strategies state
  const [savedStrategies, setSavedStrategies] = useState([])
  const [selectedSavedStrategyId, setSelectedSavedStrategyId] = useState(null)
  const [useCustomConfig, setUseCustomConfig] = useState(true)
  const [strategiesLoading, setStrategiesLoading] = useState(false)
  
  // Risk-free rate for Sharpe ratio calculation (annualized, e.g., 0.02 = 2%)
  const [riskFreeRate, setRiskFreeRate] = useState(0)
  
  // Selected heatmap cell for comparison
  const [selectedCell, setSelectedCell] = useState(null)
  
  // In-Sample results state
  const [isCalculatingInSample, setIsCalculatingInSample] = useState(false)
  const [inSampleProgress, setInSampleProgress] = useState(0)
  const [inSampleResults, setInSampleResults] = useState(null)
  const [inSampleError, setInSampleError] = useState(null)
  // Multi-column sort: array of {key, direction} - empty initially (no auto-sort)
  const [inSampleSortConfig, setInSampleSortConfig] = useState([])
  
  // Heatmap metric selector
  const [heatmapMetric, setHeatmapMetric] = useState('sharpe_ratio')
  
  // Color settings state
  const [showColorSettings, setShowColorSettings] = useState(false)
  const [colorSettings, setColorSettings] = useState({
    sharpe_ratio: { red: -2, yellow: 0, green: 1, max: 3 },
    total_return: { red: -0.5, yellow: 0, green: 0.5, max: 1 },
    win_rate: { red: 0.3, yellow: 0.4, green: 0.5, max: 0.8 },
    max_drawdown: { red: -0.5, yellow: -0.3, green: -0.1, max: 0 }
  })
  const [tempColorSettings, setTempColorSettings] = useState(null) // For editing in modal
  
  // Out-of-Sample results state
  const [isCalculatingOutSample, setIsCalculatingOutSample] = useState(false)
  const [outSampleResult, setOutSampleResult] = useState(null)
  const [outSampleError, setOutSampleError] = useState(null)

  // DSL (Saved Strategy) robust test state
  const [dslInSampleResult, setDslInSampleResult] = useState(null)
  const [dslOutSampleResult, setDslOutSampleResult] = useState(null)
  const [dslInSampleError, setDslInSampleError] = useState(null)
  const [dslOutSampleError, setDslOutSampleError] = useState(null)
  const [isRunningDslInSample, setIsRunningDslInSample] = useState(false)
  const [isRunningDslOutSample, setIsRunningDslOutSample] = useState(false)
  
  // Saved setup state for use in other sections
  const [savedSetup, setSavedSetup] = useState(null)
  const [showSaveSetupModal, setShowSaveSetupModal] = useState(false)
  
  // Resampling Analysis state
  const [resamplingVolatilityPercent, setResamplingVolatilityPercent] = useState(20)
  const [resamplingNumShuffles, setResamplingNumShuffles] = useState(10)
  const [resamplingSeed, setResamplingSeed] = useState(42)
  const [resamplingResults, setResamplingResults] = useState(null)
  const [resamplingSelectedIndex, setResamplingSelectedIndex] = useState(0)
  const [isResamplingLoading, setIsResamplingLoading] = useState(false)
  const [resamplingError, setResamplingError] = useState(null)
  const [resamplingStrategyResults, setResamplingStrategyResults] = useState(null)
  const [isApplyingStrategy, setIsApplyingStrategy] = useState(false)
  
  // Monte Carlo Simulation state
  const [monteCarloNumSims, setMonteCarloNumSims] = useState(1000)
  const [monteCarloSeed, setMonteCarloSeed] = useState(42)
  const [monteCarloResults, setMonteCarloResults] = useState(null)
  const [isMonteCarloLoading, setIsMonteCarloLoading] = useState(false)
  const [monteCarloError, setMonteCarloError] = useState(null)
  
  // Stress Test state
  const [stressTestStartYear, setStressTestStartYear] = useState(2020)
  const [stressTestEntryDelay, setStressTestEntryDelay] = useState(0)
  const [stressTestExitDelay, setStressTestExitDelay] = useState(0)
  const [stressTestPositionType, setStressTestPositionType] = useState('long_only')
  const [stressTestResults, setStressTestResults] = useState(null)
  const [isStressTestLoading, setIsStressTestLoading] = useState(false)
  const [stressTestError, setStressTestError] = useState(null)
  
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
  
  // Heatmap hover state
  const [heatmapHover, setHeatmapHover] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  
  // Equity curve hover state
  const [equityCurveHover, setEquityCurveHover] = useState(null)
  
  // Resampling chart hover state
  const [resamplingHover, setResamplingHover] = useState(null)
  
  // Saved Optimization Configs state
  const [savedOptimizationConfigs, setSavedOptimizationConfigs] = useState([])
  const [selectedConfigId, setSelectedConfigId] = useState(null)
  const [showSaveConfigModal, setShowSaveConfigModal] = useState(false)
  const [newConfigName, setNewConfigName] = useState('')
  
  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState({
    strategyRobustTest: true,  // Expanded by default
    resampling: false,
    simulation: false,
    significance: false,
    stressTest: false
  })
  
  // User role state - for export functionality (admin/moderator only)
  const [canExportLogs, setCanExportLogs] = useState(false)
  
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])
  
  // Check if user can export logs (admin or moderator only)
  useEffect(() => {
    const checkUserRole = async () => {
      if (!session?.user) {
        setCanExportLogs(false)
        return
      }
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
    checkUserRole()
  }, [session])

  // Clear results when indicator type changes
  useEffect(() => {
    setInSampleResults(null)
    setInSampleError(null)
    setOutSampleResult(null)
    setOutSampleError(null)
    setSelectedCell(null)
    setInSampleSortConfig([])
  }, [indicatorType])

  // Load saved setup from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('optimizeSetup')
      if (saved) {
        const setup = JSON.parse(saved)
        setSavedSetup(setup)
      }
    } catch (e) {
      console.warn('Failed to load setup from sessionStorage:', e)
    }
  }, [])

  // Load saved optimization configs from database on mount
  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const response = await fetch('/api/optimization-configs')
        const data = await response.json()
        if (data.success) {
          setSavedOptimizationConfigs(data.configs || [])
        }
      } catch (error) {
        console.error('Failed to load optimization configs:', error)
        // Fallback to localStorage for backward compatibility
        try {
          const saved = localStorage.getItem('optimizationConfigs')
          if (saved) {
            const configs = JSON.parse(saved)
            setSavedOptimizationConfigs(configs)
          }
        } catch (e) {
          console.warn('Failed to load from localStorage:', e)
        }
      }
    }
    loadConfigs()
  }, [])

  // Load saved strategies from Indicator Sandbox
  const loadSavedStrategies = useCallback(async () => {
    setStrategiesLoading(true)
    try {
      const response = await fetch('/api/user-strategies')
      const data = await response.json()
      if (data.success) {
        setSavedStrategies(data.strategies || [])
      }
    } catch (error) {
      console.warn('Failed to fetch saved strategies:', error)
    } finally {
      setStrategiesLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSavedStrategies()
  }, [loadSavedStrategies])

  const handleSelectSavedStrategy = useCallback((strategyId) => {
    setSelectedSavedStrategyId(strategyId)
    
    // If a strategy is selected, apply its indicator settings
    if (strategyId) {
      const strategy = savedStrategies.find(s => s.id === strategyId)
      if (strategy?.dsl?.indicators) {
        // Extract indicator types and parameters from the strategy DSL
        const indicators = Object.values(strategy.dsl.indicators)
        if (indicators.length > 0) {
          const firstIndicator = indicators[0]
          const indicatorTypeMap = {
            'EMA': 'ema',
            'MA': 'ma',
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
  }, [savedStrategies])

  const getSelectedStrategyDsl = useCallback(() => {
    if (useCustomConfig || !selectedSavedStrategyId) return null
    const selectedStrategy = savedStrategies.find(s => s.id === selectedSavedStrategyId)
    return selectedStrategy?.dsl || null
  }, [useCustomConfig, selectedSavedStrategyId, savedStrategies])

  const getDslUniqueIndicators = useCallback((dsl) => {
    if (!dsl?.indicators) return []
    const indicatorValues = Object.values(dsl.indicators).filter(Boolean)
    const seen = new Map()
    const uniques = []

    const normalizeType = (t) => {
      const s = String(t || 'ema').toLowerCase()
      return s.replace('-', '_').replace('.', '').replace(' ', '_')
    }

    const normalizeParams = (ind) => {
      // Strategy Builder v1 DSL uses { type, length, source }
      // but we defensively support other shapes.
      if (ind && ind.length !== undefined && ind.length !== null) {
        const length = Number(ind.length)
        return { length: Number.isFinite(length) ? length : ind.length }
      }
      const hasCrossover = ind && (ind.fast !== undefined || ind.slow !== undefined || ind.medium !== undefined)
      if (hasCrossover) {
        const fast = ind.fast !== undefined ? Number(ind.fast) : undefined
        const slow = ind.slow !== undefined ? Number(ind.slow) : undefined
        const medium = ind.medium !== undefined ? Number(ind.medium) : undefined
        const lineCount = ind.lineCount !== undefined ? Number(ind.lineCount) : undefined
        return {
          ...(Number.isFinite(fast) ? { fast } : fast !== undefined ? { fast: ind.fast } : {}),
          ...(Number.isFinite(slow) ? { slow } : slow !== undefined ? { slow: ind.slow } : {}),
          ...(Number.isFinite(medium) ? { medium } : medium !== undefined ? { medium: ind.medium } : {}),
          ...(Number.isFinite(lineCount) ? { lineCount } : lineCount !== undefined ? { lineCount: ind.lineCount } : {}),
        }
      }
      // Fallback: include a stable subset of any remaining params
      const clone = { ...ind }
      delete clone.type
      delete clone.source
      return clone
    }

    for (const ind of indicatorValues) {
      const type = normalizeType(ind?.type)
      const params = normalizeParams(ind)
      const key = `${type}:${JSON.stringify(params)}`
      if (seen.has(key)) continue
      seen.set(key, true)
      uniques.push({ type, params })
    }

    return uniques
  }, [])

  const formatDslIndicator = useCallback((ind) => {
    const t = String(ind?.type || '').toUpperCase()
    const p = ind?.params || {}
    if (p.length !== undefined && p.length !== null) return `${t}(${p.length})`
    if (p.fast !== undefined || p.slow !== undefined) {
      const parts = [p.fast, p.medium, p.slow].filter(v => v !== undefined && v !== null)
      return `${t}(${parts.join('/')})`
    }
    return t || 'INDICATOR'
  }, [])

  const getDslIndicatorCount = useCallback((dsl) => {
    return getDslUniqueIndicators(dsl).length
  }, [getDslUniqueIndicators])

  const toBacktestAsset = useCallback((sym) => {
    if (!sym) return 'BTC/USDT'
    if (sym.includes('/')) return sym
    if (sym.endsWith('-USD')) return sym.replace('-USD', '/USDT')
    return sym
  }, [])

  const buildEquityCurveFromTrades = useCallback((trades, initialCap, startDateFallback) => {
    const initialCapitalValue = typeof initialCap === 'number' && !isNaN(initialCap) ? initialCap : 10000
    if (!trades || trades.length === 0) {
      return [{ date: startDateFallback || new Date().toISOString().slice(0, 10), equity: initialCapitalValue }]
    }
    const sortedTrades = [...trades].sort((a, b) =>
      new Date(a.Exit_Date || a.Entry_Date) - new Date(b.Exit_Date || b.Entry_Date)
    )
    let currentEquity = initialCapitalValue
    const curve = []
    curve.push({ date: sortedTrades[0]?.Entry_Date?.slice(0, 10) || startDateFallback || '', equity: currentEquity })
    for (const t of sortedTrades) {
      currentEquity += (t.PnL || 0)
      curve.push({ date: t.Exit_Date?.slice(0, 10) || t.Entry_Date?.slice(0, 10) || '', equity: currentEquity })
    }
    return curve
  }, [])

  const buildReturnsFromEquityCurve = useCallback((equityCurve) => {
    if (!equityCurve || equityCurve.length < 2) return []
    const returns = []
    for (let i = 1; i < equityCurve.length; i++) {
      const prev = equityCurve[i - 1]?.equity
      const curr = equityCurve[i]?.equity
      if (typeof prev === 'number' && typeof curr === 'number' && prev > 0) {
        const r = (curr - prev) / prev
        if (isFinite(r) && r !== 0) returns.push(r)
      }
    }
    return returns
  }, [])

  const calcMaxDrawdown = useCallback((equityCurve) => {
    if (!equityCurve || equityCurve.length < 2) return 0
    let peak = equityCurve[0]?.equity
    if (typeof peak !== 'number' || !isFinite(peak) || peak <= 0) return 0
    let maxDd = 0
    for (const p of equityCurve) {
      const v = p?.equity
      if (typeof v !== 'number' || !isFinite(v)) continue
      if (v > peak) peak = v
      const dd = (peak - v) / peak
      if (dd > maxDd) maxDd = dd
    }
    return maxDd
  }, [])

  const calcSharpeRatio = useCallback((returns, annualRiskFreeRate = 0) => {
    if (!returns || returns.length < 2) return 0
    const rfPerStep = (annualRiskFreeRate || 0) / 365
    const excess = returns.map(r => r - rfPerStep).filter(r => isFinite(r))
    if (excess.length < 2) return 0
    const mean = excess.reduce((a, b) => a + b, 0) / excess.length
    const variance = excess.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (excess.length - 1)
    const std = Math.sqrt(variance)
    if (!std || !isFinite(std)) return 0
    // Treat step-returns as roughly daily for display consistency with existing UI.
    return Math.sqrt(365) * (mean / std)
  }, [])

  const buildOptimizeRowFromDslResult = useCallback((dslResult) => {
    if (!dslResult) return null
    const equityCurve = dslResult.equityCurve || []
    const returns = dslResult.strategyReturns || []

    const totalReturn = equityCurve.length >= 2 && typeof equityCurve[0]?.equity === 'number'
      ? ((equityCurve[equityCurve.length - 1]?.equity - equityCurve[0]?.equity) / equityCurve[0]?.equity)
      : 0
    const maxDrawdown = calcMaxDrawdown(equityCurve)
    const sharpe = calcSharpeRatio(returns, riskFreeRate)

    const winRatePct = dslResult.performance?.Win_Rate
    const winRate = typeof winRatePct === 'number' ? (winRatePct / 100) : 0

    // Provide numeric x/y for the heatmap/table rendering even though DSL isn't parameter-swept.
    // We keep EMA-style fields populated so crossover table rendering works.
    return {
      ema_short: 1,
      ema_long: 2,
      indicator_bottom: 0,
      indicator_top: 0,
      sharpe_ratio: sharpe,
      total_return: totalReturn,
      max_drawdown: maxDrawdown,
      win_rate: winRate,
      total_trades: dslResult.trades?.length || 0,
      _dsl_period: dslResult.period,
    }
  }, [calcMaxDrawdown, calcSharpeRatio, riskFreeRate])

  const runDslRobustBacktest = useCallback(async (years, sampleType) => {
    const dsl = getSelectedStrategyDsl()
    if (!dsl) {
      Swal.fire({ icon: 'warning', title: 'No Strategy Selected', text: 'Please select a saved strategy first.', background: '#1a1a2e', color: '#fff' })
      return null
    }

    const uniqueIndicators = getDslUniqueIndicators(dsl)
    const indicatorCount = uniqueIndicators.length
    if (indicatorCount > 2) {
      const list = uniqueIndicators.map(formatDslIndicator).join(', ')
      Swal.fire({
        icon: 'warning',
        title: 'Too Many Indicator Conditions',
        text: `This strategy uses ${indicatorCount} unique indicators (${list}). Strategy Robust Test currently supports up to 2 indicators (e.g., EMA + MA). Please reduce to 1–2 to run.`,
        background: '#1a1a2e',
        color: '#fff'
      })
      return null
    }

    if (!years || years.length === 0) {
      Swal.fire({ icon: 'warning', title: 'No Years Selected', text: 'Please select at least one year to run.', background: '#1a1a2e', color: '#fff' })
      return null
    }

    const startYear = Math.min(...years)
    const endYear = Math.max(...years)
    const startDate = `${startYear}-01-01`
    const endDate = `${endYear}-12-31`

    const strategyMode = positionType === 'both' ? 'reversal' : positionType
    const backtestConfig = {
      asset: toBacktestAsset(symbol),
      start_date: startDate,
      end_date: endDate,
      interval,
      initial_capital: initialCapital,
      enable_short: positionType !== 'long_only',
      strategy_mode: strategyMode,
      // Legacy fields (DSL overrides signal generation, but backend expects these fields)
      ema_fast: 12,
      ema_slow: 26,
      indicator_type: 'ema',
      indicator_params: null,
      use_stop_loss: stopLossMode !== 'none',
      dsl
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
    const equityCurve = buildEquityCurveFromTrades(trades, initialCapital, startDate)
    const strategyReturns = buildReturnsFromEquityCurve(equityCurve)

    return {
      sampleType,
      period: `${years.sort((a, b) => a - b).join(', ')} (${startDate} to ${endDate})`,
      years: years.sort((a, b) => a - b),
      config: backtestConfig,
      performance: data.performance || {},
      trades,
      openPosition: data.open_position || null,
      equityCurve,
      strategyReturns,
    }
  }, [
    getSelectedStrategyDsl,
    getDslIndicatorCount,
    positionType,
    symbol,
    interval,
    initialCapital,
    stopLossMode,
    toBacktestAsset,
    buildEquityCurveFromTrades,
    buildReturnsFromEquityCurve
  ])

  const handleEditSavedStrategy = useCallback((strategyId) => {
    router.push(`/strategy-maker?edit=${strategyId}`)
  }, [router])

  const handleCreateNewStrategy = useCallback(() => {
    router.push('/strategy-maker')
  }, [router])

  const handleToggleStrategyMode = useCallback((useCustom) => {
    setUseCustomConfig(useCustom)
    if (useCustom) {
      setSelectedSavedStrategyId(null)
    }
  }, [])

  // Save current configuration
  const handleSaveConfig = useCallback(async () => {
    if (!newConfigName.trim()) return

    const configData = {
      // Strategy settings
      symbol,
      interval,
      indicatorType,
      positionType,
      stopLossMode,
      initialCapital,
      riskFreeRate,
      // Year selections
      inSampleYears,
      outSampleYears,
      // EMA params
      maxEmaShort,
      maxEmaLong,
      outSampleEmaShort,
      outSampleEmaLong,
      // Indicator params
      indicatorLength,
      // RSI params
      minIndicatorBottom,
      maxIndicatorBottom,
      minIndicatorTop,
      maxIndicatorTop,
      // CCI params
      minIndicatorBottomCci,
      maxIndicatorBottomCci,
      minIndicatorTopCci,
      maxIndicatorTopCci,
      // Z-Score params
      minIndicatorBottomZscore,
      maxIndicatorBottomZscore,
      minIndicatorTopZscore,
      maxIndicatorTopZscore,
      // Out-sample indicator values
      outSampleIndicatorBottom,
      outSampleIndicatorTop,
      // Stress test params
      stressTestStartYear,
      stressTestEntryDelay,
      stressTestExitDelay,
      stressTestPositionType,
      // Hypothesis test params
      hypothesisNullReturn,
      hypothesisConfidenceLevel,
      // Resampling params
      resamplingVolatilityPercent,
      resamplingNumShuffles,
      resamplingSeed,
      // Monte Carlo params
      monteCarloNumSims,
      monteCarloSeed,
    }

    try {
      const response = await fetch('/api/optimization-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newConfigName.trim(),
          config: configData
        })
      })

      const data = await response.json()
      if (data.success) {
        const updatedConfigs = [...savedOptimizationConfigs, data.config]
        setSavedOptimizationConfigs(updatedConfigs)
        setShowSaveConfigModal(false)
        setNewConfigName('')
        setSelectedConfigId(data.config.id)
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Configuration saved!',
          showConfirmButton: false,
          timer: 1500,
          background: '#1a1a2e',
          color: '#fff'
        })
      } else {
        throw new Error(data.error || 'Failed to save configuration')
      }
    } catch (error) {
      console.error('Error saving optimization config:', error)
      Swal.fire({
        icon: 'error',
        title: 'Failed to save',
        text: error.message || 'Could not save configuration to database',
        background: '#1a1a2e',
        color: '#fff',
        confirmButtonColor: '#ff4444'
      })
    }
  }, [
    newConfigName, symbol, interval, indicatorType, positionType, stopLossMode, initialCapital, riskFreeRate,
    inSampleYears, outSampleYears, maxEmaShort, maxEmaLong, outSampleEmaShort, outSampleEmaLong,
    indicatorLength, minIndicatorBottom, maxIndicatorBottom, minIndicatorTop, maxIndicatorTop,
    minIndicatorBottomCci, maxIndicatorBottomCci, minIndicatorTopCci, maxIndicatorTopCci,
    minIndicatorBottomZscore, maxIndicatorBottomZscore, minIndicatorTopZscore, maxIndicatorTopZscore,
    outSampleIndicatorBottom, outSampleIndicatorTop,
    stressTestStartYear, stressTestEntryDelay, stressTestExitDelay, stressTestPositionType,
    hypothesisNullReturn, hypothesisConfidenceLevel, resamplingVolatilityPercent, resamplingNumShuffles,
    resamplingSeed, monteCarloNumSims, monteCarloSeed, savedOptimizationConfigs
  ])

  // Load a saved configuration
  const handleLoadConfig = useCallback((configId) => {
    const savedConfig = savedOptimizationConfigs.find(c => c.id === configId)
    if (!savedConfig) return

    // Get config data (either from config field for DB or directly for localStorage)
    const config = savedConfig.config || savedConfig

    // Apply all settings from the config
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
    // RSI params
    setMinIndicatorBottom(config.minIndicatorBottom ?? 20)
    setMaxIndicatorBottom(config.maxIndicatorBottom ?? 35)
    setMinIndicatorTop(config.minIndicatorTop ?? 65)
    setMaxIndicatorTop(config.maxIndicatorTop ?? 80)
    // CCI params
    setMinIndicatorBottomCci(config.minIndicatorBottomCci ?? -150)
    setMaxIndicatorBottomCci(config.maxIndicatorBottomCci ?? -50)
    setMinIndicatorTopCci(config.minIndicatorTopCci ?? 50)
    setMaxIndicatorTopCci(config.maxIndicatorTopCci ?? 150)
    // Z-Score params
    setMinIndicatorBottomZscore(config.minIndicatorBottomZscore ?? -2.5)
    setMaxIndicatorBottomZscore(config.maxIndicatorBottomZscore ?? -1.5)
    setMinIndicatorTopZscore(config.minIndicatorTopZscore ?? 1.5)
    setMaxIndicatorTopZscore(config.maxIndicatorTopZscore ?? 2.5)
    // Out-sample indicator values
    setOutSampleIndicatorBottom(config.outSampleIndicatorBottom ?? 30)
    setOutSampleIndicatorTop(config.outSampleIndicatorTop ?? 70)
    setStressTestStartYear(config.stressTestStartYear || 2020)
    setStressTestEntryDelay(config.stressTestEntryDelay ?? 0)
    setStressTestExitDelay(config.stressTestExitDelay ?? 0)
    setStressTestPositionType(config.stressTestPositionType || 'long_only')
    setHypothesisNullReturn(config.hypothesisNullReturn || 0)
    setHypothesisConfidenceLevel(config.hypothesisConfidenceLevel || 95)
    setResamplingVolatilityPercent(config.resamplingVolatilityPercent || 20)
    setResamplingNumShuffles(config.resamplingNumShuffles || 10)
    setResamplingSeed(config.resamplingSeed || 42)
    setMonteCarloNumSims(config.monteCarloNumSims || 1000)
    setMonteCarloSeed(config.monteCarloSeed || 42)

    setSelectedConfigId(configId)
    
    // Clear all results when loading a new config
    setInSampleResults(null)
    setOutSampleResult(null)
    setResamplingResults(null)
    setResamplingStrategyResults(null)
    setMonteCarloResults(null)
    setHypothesisResults(null)
    setStressTestResults(null)
    setSavedSetup(null)
  }, [savedOptimizationConfigs])

  // Delete a saved configuration
  const handleDeleteConfig = useCallback(async (configId) => {
    try {
      const response = await fetch(`/api/optimization-configs?id=${configId}`, {
        method: 'DELETE'
      })
      const data = await response.json()
      if (data.success) {
        const updatedConfigs = savedOptimizationConfigs.filter(c => c.id !== configId)
        setSavedOptimizationConfigs(updatedConfigs)
        if (selectedConfigId === configId) {
          setSelectedConfigId(null)
        }
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Configuration deleted',
          showConfirmButton: false,
          timer: 1500,
          background: '#1a1a2e',
          color: '#fff'
        })
      } else {
        throw new Error(data.error || 'Failed to delete')
      }
    } catch (error) {
      console.error('Error deleting config:', error)
      Swal.fire({
        icon: 'error',
        title: 'Failed to delete',
        text: error.message || 'Could not delete configuration',
        background: '#1a1a2e',
        color: '#fff',
        confirmButtonColor: '#ff4444'
      })
    }
  }, [savedOptimizationConfigs, selectedConfigId])

  // Update an existing configuration
  const handleUpdateConfig = useCallback(async () => {
    if (!selectedConfigId) return

    const existingConfig = savedOptimizationConfigs.find(c => c.id === selectedConfigId)
    if (!existingConfig) return

    const configData = {
      // Strategy settings
      symbol,
      interval,
      indicatorType,
      positionType,
      stopLossMode,
      initialCapital,
      riskFreeRate,
      // Year selections
      inSampleYears,
      outSampleYears,
      // EMA params
      maxEmaShort,
      maxEmaLong,
      outSampleEmaShort,
      outSampleEmaLong,
      // Indicator params
      indicatorLength,
      // RSI params
      minIndicatorBottom,
      maxIndicatorBottom,
      minIndicatorTop,
      maxIndicatorTop,
      // CCI params
      minIndicatorBottomCci,
      maxIndicatorBottomCci,
      minIndicatorTopCci,
      maxIndicatorTopCci,
      // Z-Score params
      minIndicatorBottomZscore,
      maxIndicatorBottomZscore,
      minIndicatorTopZscore,
      maxIndicatorTopZscore,
      // Out-sample indicator values
      outSampleIndicatorBottom,
      outSampleIndicatorTop,
      // Stress test params
      stressTestStartYear,
      stressTestEntryDelay,
      stressTestExitDelay,
      stressTestPositionType,
      // Hypothesis test params
      hypothesisNullReturn,
      hypothesisConfidenceLevel,
      // Resampling params
      resamplingVolatilityPercent,
      resamplingNumShuffles,
      resamplingSeed,
      // Monte Carlo params
      monteCarloNumSims,
      monteCarloSeed,
    }

    try {
      const response = await fetch('/api/optimization-configs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedConfigId,
          config: configData
        })
      })

      const data = await response.json()
      if (data.success) {
        const updatedConfigs = savedOptimizationConfigs.map(c => 
          c.id === selectedConfigId ? data.config : c
        )
        setSavedOptimizationConfigs(updatedConfigs)
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Configuration updated!',
          showConfirmButton: false,
          timer: 1500,
          background: '#1a1a2e',
          color: '#fff'
        })
      } else {
        throw new Error(data.error || 'Failed to update')
      }
    } catch (error) {
      console.error('Error updating config:', error)
      Swal.fire({
        icon: 'error',
        title: 'Failed to update',
        text: error.message || 'Could not update configuration',
        background: '#1a1a2e',
        color: '#fff',
        confirmButtonColor: '#ff4444'
      })
    }
  }, [
    selectedConfigId, savedOptimizationConfigs, symbol, interval, indicatorType, positionType, 
    initialCapital, riskFreeRate, inSampleYears, outSampleYears, maxEmaShort, maxEmaLong, 
    outSampleEmaShort, outSampleEmaLong, indicatorLength, 
    minIndicatorBottom, maxIndicatorBottom, minIndicatorTop, maxIndicatorTop,
    minIndicatorBottomCci, maxIndicatorBottomCci, minIndicatorTopCci, maxIndicatorTopCci,
    minIndicatorBottomZscore, maxIndicatorBottomZscore, minIndicatorTopZscore, maxIndicatorTopZscore,
    outSampleIndicatorBottom, outSampleIndicatorTop, stressTestStartYear, stressTestEntryDelay, 
    stressTestExitDelay, stressTestPositionType, hypothesisNullReturn, hypothesisConfidenceLevel, 
    resamplingVolatilityPercent, resamplingNumShuffles, resamplingSeed, monteCarloNumSims, monteCarloSeed
  ])

  // Create new (reset) configuration
  const handleNewConfig = useCallback(() => {
    setSymbol('BTC-USD')
    setInterval('1d')
    setIndicatorType('ema')
    setPositionType('both')
    setInitialCapital(10000)
    setRiskFreeRate(0)
    setInSampleYears([CURRENT_YEAR - 2, CURRENT_YEAR - 3])
    setOutSampleYears([CURRENT_YEAR - 1, CURRENT_YEAR])
    setMaxEmaShort(20)
    setMaxEmaLong(50)
    setOutSampleEmaShort(12)
    setOutSampleEmaLong(26)
    setIndicatorLength(14)
    // RSI params
    setMinIndicatorBottom(20)
    setMaxIndicatorBottom(35)
    setMinIndicatorTop(65)
    setMaxIndicatorTop(80)
    // CCI params
    setMinIndicatorBottomCci(-150)
    setMaxIndicatorBottomCci(-50)
    setMinIndicatorTopCci(50)
    setMaxIndicatorTopCci(150)
    // Z-Score params
    setMinIndicatorBottomZscore(-2.5)
    setMaxIndicatorBottomZscore(-1.5)
    setMinIndicatorTopZscore(1.5)
    setMaxIndicatorTopZscore(2.5)
    // Out-sample indicator values
    setOutSampleIndicatorBottom(30)
    setOutSampleIndicatorTop(70)
    setStressTestStartYear(2020)
    setStressTestEntryDelay(0)
    setStressTestExitDelay(0)
    setStressTestPositionType('long_only')
    setHypothesisNullReturn(0)
    setHypothesisConfidenceLevel(95)
    setResamplingVolatilityPercent(20)
    setResamplingNumShuffles(10)
    setResamplingSeed(42)
    setMonteCarloNumSims(1000)
    setMonteCarloSeed(42)
    setSelectedConfigId(null)
    
    // Clear all results
    setInSampleResults(null)
    setOutSampleResult(null)
    setResamplingResults(null)
    setResamplingStrategyResults(null)
    setMonteCarloResults(null)
    setHypothesisResults(null)
    setStressTestResults(null)
    setSavedSetup(null)
  }, [])

  // Load color settings from user's defaultConfig
  useEffect(() => {
    const loadColorSettings = async () => {
      if (!session?.user) return
      
      try {
        const response = await fetch('/api/user')
        const data = await response.json()
        if (data.success && data.user?.defaultConfig?.heatmapColorSettings) {
          setColorSettings(prev => ({
            ...prev,
            ...data.user.defaultConfig.heatmapColorSettings
          }))
        }
      } catch (error) {
        console.error('Error loading color settings:', error)
      }
    }
    
    if (session?.user) {
      loadColorSettings()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email])

  // Memoized toggle functions
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

  const calculateInSample = async () => {
    // Saved Strategy mode: validate DSL-based strategy (supports up to 2 indicators)
    if (!useCustomConfig) {
      setDslInSampleError(null)
      setDslInSampleResult(null)
      setInSampleError(null)
      setInSampleResults(null)
      if (inSampleYears.length === 0) {
        setDslInSampleError('Please select at least one year for In-Sample testing')
        return
      }
      setIsRunningDslInSample(true)
      try {
        const result = await runDslRobustBacktest([...inSampleYears], 'in_sample')
        if (result) {
          setDslInSampleResult(result)
          const row = buildOptimizeRowFromDslResult(result)
          if (row) {
            setInSampleResults({
              success: true,
              symbol,
              interval,
              sample_type: 'in_sample',
              results: [row],
              combinations_tested: 1,
              period: result.period,
              years: result.years,
              data_points: null,
              _dsl: true,
            })
          }
        }
      } catch (e) {
        setDslInSampleError(e.message || 'Failed to run DSL in-sample backtest')
      } finally {
        setIsRunningDslInSample(false)
      }
      return
    }

    if (inSampleYears.length === 0) {
      setInSampleError('Please select at least one year for In-Sample testing')
      return
    }

    setIsCalculatingInSample(true)
    setInSampleProgress(0)
    setInSampleError(null)
    setInSampleResults(null)
    setSelectedCell(null) // Reset selection
    
    // Calculate estimated combinations for progress estimation
    let estimatedCombinations = 1
    if (isCrossoverIndicator(indicatorType)) {
      const shortRange = maxEmaShort - 3 + 1
      const longRange = maxEmaLong - 10 + 1
      estimatedCombinations = (shortRange * longRange) / 2 // Roughly half are valid (short < long)
    } else {
      const bottomRange = Math.abs(maxIndicatorBottom - minIndicatorBottom) + 1
      const topRange = Math.abs(maxIndicatorTop - minIndicatorTop) + 1
      estimatedCombinations = bottomRange * topRange
    }
    
    // Estimate time: ~50ms per combination on average (adjust based on your server)
    const estimatedTimeMs = Math.max(estimatedCombinations * 50, 2000)
    const startTime = Date.now()
    
    // Progress simulation interval
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(Math.floor((elapsed / estimatedTimeMs) * 95), 95) // Cap at 95%
      setInSampleProgress(progress)
    }, 200)

    // Build indicator parameters based on type
    let indicatorParams = {}
    let maxX, maxY, minX, minY
    
    if (isCrossoverIndicator(indicatorType)) {
      indicatorParams = { fast: 3, slow: 10 } // Min values, max will be from max_ema_short/long
      maxX = maxEmaShort
      maxY = maxEmaLong
    } else if (indicatorType === 'rsi') {
      indicatorParams = { length: indicatorLength } // Fixed length
      // RSI: Bottom = oversold (e.g., 20-35), Top = overbought (e.g., 65-80)
      minX = minIndicatorBottom // Min oversold
      maxX = maxIndicatorBottom // Max oversold
      minY = minIndicatorTop // Min overbought
      maxY = maxIndicatorTop // Max overbought
    } else if (indicatorType === 'cci') {
      indicatorParams = { length: indicatorLength } // Fixed length
      // CCI: Bottom = oversold (e.g., -150 to -50), Top = overbought (e.g., 50 to 150)
      minX = minIndicatorBottomCci // Min oversold
      maxX = maxIndicatorBottomCci // Max oversold
      minY = minIndicatorTopCci // Min overbought
      maxY = maxIndicatorTopCci // Max overbought
    } else if (indicatorType === 'zscore') {
      indicatorParams = { length: indicatorLength } // Fixed length
      // Z-Score: Bottom = oversold (e.g., -2.5 to -1.5), Top = overbought (e.g., 1.5 to 2.5)
      minX = minIndicatorBottomZscore // Min oversold
      maxX = maxIndicatorBottomZscore // Max oversold
      minY = minIndicatorTopZscore // Min overbought
      maxY = maxIndicatorTopZscore // Max overbought
    } else if (indicatorType === 'roll_std') {
      indicatorParams = { length: indicatorLength }
      // Rolling Std: low volatility (bottom), high volatility (top)
      minX = minIndicatorBottomRollStd
      maxX = maxIndicatorBottomRollStd
      minY = minIndicatorTopRollStd
      maxY = maxIndicatorTopRollStd
    } else if (indicatorType === 'roll_median') {
      // Rolling Median uses price cross - just uses length, no thresholds needed
      indicatorParams = { length: indicatorLength }
      minX = 0
      maxX = 0
      minY = 0
      maxY = 0
    } else if (indicatorType === 'roll_percentile') {
      indicatorParams = { length: indicatorLength }
      // Rolling Percentile: oversold (bottom), overbought (top)
      minX = minIndicatorBottomRollPct
      maxX = maxIndicatorBottomRollPct
      minY = minIndicatorTopRollPct
      maxY = maxIndicatorTopRollPct
    }

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

  const calculateOutSample = async () => {
    // Saved Strategy mode: validate DSL-based strategy (supports up to 2 indicators)
    if (!useCustomConfig) {
      setDslOutSampleError(null)
      setDslOutSampleResult(null)
      setOutSampleError(null)
      setOutSampleResult(null)
      if (outSampleYears.length === 0) {
        setDslOutSampleError('Please select at least one year for Out-of-Sample testing')
        return
      }
      setIsRunningDslOutSample(true)
      try {
        const result = await runDslRobustBacktest([...outSampleYears], 'out_sample')
        if (result) {
          setDslOutSampleResult(result)
          const inRow = inSampleResults?._dsl ? inSampleResults?.results?.[0] : null
          const outRowRaw = buildOptimizeRowFromDslResult(result)

          // Build a combined equity curve for the shared UI (mark segments by sample type)
          const inCurve = dslInSampleResult?.equityCurve || []
          const outCurveRaw = result.equityCurve || []
          const inEndEquity = inCurve.length ? inCurve[inCurve.length - 1]?.equity : initialCapital

          // Rebase out-sample curve so it continues from end of in-sample equity
          // (outCurveRaw typically starts at initialCapital; scaling keeps drawdown shape intact)
          const outStart = outCurveRaw.length ? outCurveRaw[0]?.equity : null
          const outCurve = (outCurveRaw.length && typeof outStart === 'number' && isFinite(outStart) && outStart !== 0)
            ? outCurveRaw.map(p => ({
                ...p,
                equity: typeof p?.equity === 'number' && isFinite(p.equity)
                  ? (inEndEquity * (p.equity / outStart))
                  : p?.equity
              }))
            : outCurveRaw

          const combinedEquity = [
            ...inCurve.map(p => ({ ...p, sample_type: 'in_sample', segment_id: 0 })),
            ...outCurve.map(p => ({ ...p, sample_type: 'out_sample', segment_id: 1 })),
          ]

          if (outRowRaw) {
            const outSampleTotalReturn = (outCurve.length >= 2 && typeof outCurve[outCurve.length - 1]?.equity === 'number' && typeof inEndEquity === 'number' && inEndEquity > 0)
              ? ((outCurve[outCurve.length - 1].equity - inEndEquity) / inEndEquity)
              : outRowRaw.total_return

            setOutSampleResult({
              success: true,
              symbol,
              interval,
              initial_capital: initialCapital,
              in_sample: inRow ? {
                sharpe_ratio: inRow.sharpe_ratio,
                total_return: inRow.total_return,
                max_drawdown: inRow.max_drawdown,
                win_rate: inRow.win_rate,
                total_trades: inRow.total_trades,
                final_equity: inCurve.length ? inCurve[inCurve.length - 1]?.equity : initialCapital,
                period: dslInSampleResult?.period || '',
                years: dslInSampleResult?.years || [],
              } : null,
              out_sample: {
                sharpe_ratio: outRowRaw.sharpe_ratio,
                total_return: outSampleTotalReturn,
                max_drawdown: outRowRaw.max_drawdown,
                win_rate: outRowRaw.win_rate,
                total_trades: outRowRaw.total_trades,
                final_equity: combinedEquity.length ? combinedEquity[combinedEquity.length - 1]?.equity : initialCapital,
                period: result.period,
                years: result.years,
              },
              equity_curve: combinedEquity,
              segments: [
                { type: 'in_sample', start: 0, end: Math.max(0, inCurve.length - 1) },
                { type: 'out_sample', start: inCurve.length, end: Math.max(inCurve.length, combinedEquity.length - 1) },
              ],
              _dsl: true,
            })
          }
        }

        if (result) {
          const shouldSave = await Swal.fire({
            icon: 'success',
            title: 'Strategy validated',
            text: 'Would you like to save this validated strategy setup to use in other analysis sections?',
            showCancelButton: true,
            confirmButtonText: 'Save Setup',
            cancelButtonText: 'Not now',
            background: '#1a1a2e',
            color: '#fff',
            confirmButtonColor: '#00d4aa',
          })

          if (shouldSave.isConfirmed) {
            const setup = {
              symbol,
              interval,
              indicatorType: 'ema', // Placeholder; DSL drives signals
              positionType,
              stopLossMode,
              useStopLoss: stopLossMode !== 'none',
              riskFreeRate,
              initialCapital,
              inSampleYears: [...inSampleYears],
              outSampleYears: [...outSampleYears],
              dsl: getSelectedStrategyDsl(),
              useSavedStrategy: true,
              savedStrategyId: selectedSavedStrategyId,
              // Equity curve + returns for other analysis tools
              equityCurve: result.equityCurve || [],
              strategyReturns: result.strategyReturns || [],
              // Minimal metrics display compatibility
              metrics: {
                inSample: dslInSampleResult?.performance || null,
                outSample: result.performance || null,
                segments: []
              },
              savedAt: new Date().toISOString()
            }

            setSavedSetup(setup)
            try {
              sessionStorage.setItem('optimizeSetup', JSON.stringify(setup))
            } catch (err) {
              console.warn('Failed to persist setup to sessionStorage:', err)
            }
          }
        }
      } catch (e) {
        setDslOutSampleError(e.message || 'Failed to run DSL out-of-sample backtest')
      } finally {
        setIsRunningDslOutSample(false)
      }
      return
    }

    if (outSampleYears.length === 0) {
      setOutSampleError('Please select at least one year for Out-of-Sample testing')
      return
    }

    setIsCalculatingOutSample(true)
    setOutSampleError(null)
    setOutSampleResult(null)

    // Build request body based on indicator type
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
      
      // Show save setup modal after successful validation
      setShowSaveSetupModal(true)
    } catch (err) {
      setOutSampleError(err.message)
    } finally {
      setIsCalculatingOutSample(false)
    }
  }
  
  // Save the validated setup for use in other sections
  const handleSaveSetup = () => {
    // Get DSL from selected saved strategy if using saved strategy mode
    let dslConfig = null
    if (!useCustomConfig && selectedSavedStrategyId) {
      const selectedStrategy = savedStrategies.find(s => s.id === selectedSavedStrategyId)
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
      useSavedStrategy: !useCustomConfig && selectedSavedStrategyId !== null,
      savedStrategyId: selectedSavedStrategyId,
      // Indicator-specific parameters
      ...(isCrossoverIndicator(indicatorType) ? {
        emaShort: outSampleEmaShort,
        emaLong: outSampleEmaLong
      } : {
        indicatorLength,
        indicatorBottom: outSampleIndicatorBottom,
        indicatorTop: outSampleIndicatorTop
      }),
      // Full results data for calculations in other sections
      outSampleResult: outSampleResult,
      inSampleResults: inSampleResults, // Full in-sample optimization data
      equityCurve: outSampleResult?.equity_curve || [],
      // Calculated metrics for quick reference
      metrics: {
        inSample: outSampleResult?.in_sample || null,
        outSample: outSampleResult?.out_sample || null,
        segments: outSampleResult?.segments || []
      },
      // Trade returns for Monte Carlo / resampling
      strategyReturns: outSampleResult?.equity_curve?.map((p, i, arr) => 
        i > 0 ? (p.equity - arr[i-1].equity) / arr[i-1].equity : 0
      ).filter(r => r !== 0) || [],
      savedAt: new Date().toISOString()
    }
    
    setSavedSetup(setup)
    setShowSaveSetupModal(false)
    
    // Also persist to sessionStorage for page reloads within session
    try {
      sessionStorage.setItem('optimizeSetup', JSON.stringify(setup))
    } catch (e) {
      console.warn('Failed to persist setup to sessionStorage:', e)
    }
  }
  
  const handleDismissSaveSetup = () => {
    setShowSaveSetupModal(false)
  }

  // Generate bootstrap resampling
  const handleGenerateResampling = useCallback(async () => {
    if (!savedSetup?.equityCurve || savedSetup.equityCurve.length < 31) {
      setResamplingError('Need at least 31 data points for resampling. Please ensure your saved setup has sufficient data.')
      return
    }

    setIsResamplingLoading(true)
    setResamplingError(null)

    try {
      // Convert equity curve to candle-like format for resampling
      // We'll use equity as close and simulate OHLC
      const validEquityCurve = savedSetup.equityCurve.filter(point => 
        point && typeof point.equity === 'number' && !isNaN(point.equity) && point.equity > 0
      )
      
      if (validEquityCurve.length < 31) {
        setResamplingError('Need at least 31 valid data points. Some data points may have invalid equity values.')
        return
      }

      const candles = validEquityCurve.map((point, i, arr) => {
        const equity = point.equity
        const prevEquity = i > 0 ? arr[i - 1].equity : equity
        
        // Create synthetic OHLC from equity (for visualization purposes)
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

      // Run resampling in a setTimeout to not block UI
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
      setResamplingError('Please generate resamples first and ensure a strategy is saved.')
      return
    }

    setIsApplyingStrategy(true)
    setResamplingError(null)

    try {
      // Apply strategy to all resampled datasets
      const strategyResults = {
        original: null,
        resamples: []
      }

      // Apply to original
      const originalResult = applyStrategyToResampled(resamplingResults.original.candles, savedSetup)
      strategyResults.original = originalResult

      // Apply to all resamples
      for (const resample of resamplingResults.resamples) {
        const result = applyStrategyToResampled(resample.candles, savedSetup)
        strategyResults.resamples.push({
          index: resample.index,
          seed: resample.seed,
          ...result
        })
      }

      // Calculate distribution statistics
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

  // Run Monte Carlo simulation
  const handleRunMonteCarlo = useCallback(async () => {
    if (!savedSetup?.strategyReturns || savedSetup.strategyReturns.length === 0) {
      setMonteCarloError('No trade returns available. Please ensure your saved setup has trade data.')
      return
    }

    setIsMonteCarloLoading(true)
    setMonteCarloError(null)

    try {
      // Run simulation in next tick to not block UI
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

      // Generate histogram bins for visualization
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

  // Stress Test calculation function
  const handleRunStressTest = useCallback(async () => {
    if (!savedSetup) {
      setStressTestError('No saved setup found. Please save a validated strategy first.')
      return
    }

    setIsStressTestLoading(true)
    setStressTestError(null)
    setStressTestResults(null)

    try {
      // Build the request based on saved setup
      const startDate = `${stressTestStartYear}-01-01`
      const endDate = new Date().toISOString().split('T')[0] // Today
      
      // Determine position mode based on stress test position type
      let strategyMode
      if (stressTestPositionType === 'long_only') {
        strategyMode = 'long_only'
      } else if (stressTestPositionType === 'short_only') {
        strategyMode = 'short_only'
      } else {
        strategyMode = savedSetup.positionType === 'both' ? 'reversal' : savedSetup.positionType
      }

      // Build indicator params if not EMA
      let indicatorParams = null
      if (!isCrossoverIndicator(savedSetup.indicatorType)) {
        indicatorParams = {
          length: savedSetup.indicatorLength,
          top: savedSetup.indicatorTop,
          bottom: savedSetup.indicatorBottom
        }
      }

      // Construct backtest config with entry/exit delays
      // Include DSL if using saved strategy
      const backtestConfig = {
        asset: savedSetup.symbol?.replace('-USD', '/USDT') || 'BTC/USDT',
        start_date: startDate,
        end_date: endDate,
        interval: savedSetup.interval || '1d',
        initial_capital: savedSetup.initialCapital || 10000,
        // Include DSL for saved strategy execution
        dsl: savedSetup.dsl || null,
        enable_short: stressTestPositionType !== 'long_only',
        strategy_mode: strategyMode,
        ema_fast: savedSetup.emaShort || 12,
        ema_slow: savedSetup.emaLong || 26,
        indicator_type: savedSetup.indicatorType || 'ema',
        indicator_params: indicatorParams,
        entry_delay: stressTestEntryDelay,
        exit_delay: stressTestExitDelay,
        use_stop_loss: savedSetup.useStopLoss ?? true
      }

      console.log('Running stress test with config:', backtestConfig)

      const response = await fetch(`${API_URL}/api/backtest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(backtestConfig),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error ${response.status}`)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Backtest failed')
      }

      // Calculate additional metrics
      const trades = data.trades || []
      const performance = data.performance || {}
      
      // Filter trades based on position type (case-insensitive comparison)
      let filteredTrades = trades
      if (stressTestPositionType === 'long_only') {
        filteredTrades = trades.filter(t => (t.Position_Type || '').toUpperCase() === 'LONG')
      } else if (stressTestPositionType === 'short_only') {
        filteredTrades = trades.filter(t => (t.Position_Type || '').toUpperCase() === 'SHORT')
      }

      // Calculate summary metrics
      const totalTrades = filteredTrades.length
      const winningTrades = filteredTrades.filter(t => (t.PnL || 0) > 0).length
      const losingTrades = filteredTrades.filter(t => (t.PnL || 0) < 0).length
      const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0
      
      const grossProfit = filteredTrades.filter(t => (t.PnL || 0) > 0).reduce((sum, t) => sum + (t.PnL || 0), 0)
      const grossLoss = Math.abs(filteredTrades.filter(t => (t.PnL || 0) < 0).reduce((sum, t) => sum + (t.PnL || 0), 0))
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
      
      const avgWin = winningTrades > 0 ? grossProfit / winningTrades : 0
      const avgLoss = losingTrades > 0 ? grossLoss / losingTrades : 0
      const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0
      
      // Calculate total P&L
      const totalPnL = filteredTrades.reduce((sum, t) => sum + (t.PnL || 0), 0)
      const totalReturn = totalPnL / (savedSetup.initialCapital || 10000)
      
      // Get first and last trade dates
      const firstTradeDate = filteredTrades.length > 0 ? filteredTrades[0].Entry_Date : null
      const lastTradeDate = filteredTrades.length > 0 ? filteredTrades[filteredTrades.length - 1].Exit_Date : null

      // Calculate signal markers based on entry/exit delays
      // The signal occurs delay bars before the actual trade entry/exit
      const signalMarkers = []
      const intervalMs = backtestConfig.interval === '1d' ? 86400000 : 
                         backtestConfig.interval === '4h' ? 14400000 :
                         backtestConfig.interval === '1h' ? 3600000 : 86400000
      
      filteredTrades.forEach(trade => {
        // Entry signal: subtract entry_delay bars from entry date
        if (trade.Entry_Date && stressTestEntryDelay > 0) {
          const entryTime = new Date(trade.Entry_Date).getTime()
          const signalTime = entryTime - (stressTestEntryDelay * intervalMs)
          signalMarkers.push({
            time: new Date(signalTime),
            type: 'entry_signal',
            tradeType: trade.Position_Type
          })
        } else if (trade.Entry_Date && stressTestEntryDelay === 0) {
          // Delay 0 means signal and entry are at the same time
          signalMarkers.push({
            time: new Date(trade.Entry_Date),
            type: 'entry_signal',
            tradeType: trade.Position_Type
          })
        }
        
        // Exit signal: subtract exit_delay bars from exit date
        if (trade.Exit_Date && stressTestExitDelay > 0) {
          const exitTime = new Date(trade.Exit_Date).getTime()
          const signalTime = exitTime - (stressTestExitDelay * intervalMs)
          signalMarkers.push({
            time: new Date(signalTime),
            type: 'exit_signal',
            tradeType: trade.Position_Type
          })
        } else if (trade.Exit_Date && stressTestExitDelay === 0) {
          // Delay 0 means signal and exit are at the same time
          signalMarkers.push({
            time: new Date(trade.Exit_Date),
            type: 'exit_signal',
            tradeType: trade.Position_Type
          })
        }
      })

      setStressTestResults({
        trades: filteredTrades,
        openPosition: data.open_position,
        signalMarkers: signalMarkers,
        entryDelay: stressTestEntryDelay,
        exitDelay: stressTestExitDelay,
        performance: {
          ...performance,
          totalTrades,
          winningTrades,
          losingTrades,
          winRate,
          grossProfit,
          grossLoss,
          profitFactor,
          avgWin,
          avgLoss,
          payoffRatio,
          totalPnL,
          totalReturn,
          firstTradeDate,
          lastTradeDate
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
          n,
          mean,
          std,
          se,
          mu0,
          tStatistic: tStat,
          df,
          pValue,
          alpha: hypothesisAlpha,
          tail: hypothesisTail,
          ciLow,
          ciHigh,
          cohensD,
          rejectNull,
          decision,
          interpretation,
          significance: rejectNull ? (mean > mu0 ? 'profitable' : 'unprofitable') : 'inconclusive',
          // For histogram visualization
          data: returns.map(r => r * 100), // Convert to percentage
          mu0Display: hypothesisMu0
        }
        
      } else if (hypothesisTestType === 'two-sample') {
        // Two-sample t-test (compare first half vs second half as proxy)
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
          // Pooled t-test (assumes equal variances)
          const pooledVar = ((n1 - 1) * std1 * std1 + (n2 - 1) * std2 * std2) / (n1 + n2 - 2)
          se = Math.sqrt(pooledVar * (1/n1 + 1/n2))
          df = n1 + n2 - 2
        } else {
          // Welch's t-test (default, unequal variances)
          const var1 = std1 * std1
          const var2 = std2 * std2
          se = Math.sqrt(var1/n1 + var2/n2)
          const num = Math.pow(var1/n1 + var2/n2, 2)
          const denom = Math.pow(var1/n1, 2)/(n1-1) + Math.pow(var2/n2, 2)/(n2-1)
          df = denom > 0 ? num / denom : n1 + n2 - 2
        }
        
        tStat = se > 0 ? (mean1 - mean2) / se : 0
        
        // P-value
        let pValue = tDistributionPValue(Math.abs(tStat), df)
        if (hypothesisTail === 'two-sided') {
          pValue = pValue * 2
        } else if ((hypothesisTail === 'right' && tStat < 0) || (hypothesisTail === 'left' && tStat > 0)) {
          pValue = 1 - pValue
        }
        pValue = Math.min(1, Math.max(0, pValue))
        
        // Confidence interval for difference
        const critVal = tDistributionCritical(hypothesisAlpha, df)
        const diff = mean1 - mean2
        const ciLow = diff - critVal * se
        const ciHigh = diff + critVal * se
      
      // Effect size (Cohen's d)
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
          n1, n2,
          mean1, mean2,
          std1, std2,
          diff,
          se,
          tStatistic: tStat,
          df,
          pValue,
          alpha: hypothesisAlpha,
          tail: hypothesisTail,
          ciLow,
          ciHigh,
          cohensD,
          rejectNull,
          decision,
          interpretation,
          significance: rejectNull ? (diff > 0 ? 'profitable' : 'unprofitable') : 'inconclusive',
          // For visualization
          group1Data: group1.map(r => r * 100),
          group2Data: group2.map(r => r * 100)
        }
        
      } else if (hypothesisTestType === 'correlation') {
        // Correlation test (use returns vs index as X)
        const x = returns.map((_, i) => i + 1)
        const y = returns
        
        const r = hypothesisTestVariant === 'spearman' ? calcSpearmanR(x, y) : calcPearsonR(x, y)
        const rSquared = r * r
        
        // t-statistic for correlation
        const tStat = Math.sqrt(n - 2) * r / Math.sqrt(1 - r * r)
        const df = n - 2
        
        // P-value
        let pValue = df > 0 ? tDistributionPValue(Math.abs(tStat), df) : 1
        if (hypothesisTail === 'two-sided') {
          pValue = pValue * 2
        } else if ((hypothesisTail === 'right' && tStat < 0) || (hypothesisTail === 'left' && tStat > 0)) {
          pValue = 1 - pValue
        }
        pValue = Math.min(1, Math.max(0, pValue))
        
        // Confidence interval for r (Fisher's z transformation)
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
        
        // Linear regression for visualization
        const meanX = calcMean(x)
        const meanY = calcMean(y)
        const slope = calcCovariance(x, y, meanX, meanY) / (calcStd(x, meanX) ** 2 || 1)
        const intercept = meanY - slope * meanX
        
        results = {
          testType: 'correlation',
          testName: hypothesisTestVariant === 'spearman' ? 'Spearman Correlation' : 'Pearson Correlation',
          n,
          r,
          rSquared,
          tStatistic: tStat,
          df,
          pValue,
          alpha: hypothesisAlpha,
          tail: hypothesisTail,
          ciLow,
          ciHigh,
        rejectNull,
          decision,
        interpretation,
          significance: rejectNull ? (r > 0 ? 'profitable' : 'unprofitable') : 'inconclusive',
          // For scatter plot
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

  // T-distribution p-value approximation (one-tailed)
  const tDistributionPValue = (t, df) => {
    // Approximation using the cumulative distribution function
    const x = df / (df + t * t)
    const a = df / 2
    const b = 0.5
    
    // Incomplete beta function approximation
    const beta = incompleteBeta(x, a, b)
    return beta / 2
  }

  // Incomplete beta function approximation
  const incompleteBeta = (x, a, b) => {
    if (x === 0) return 0
    if (x === 1) return 1
    
    // Simple approximation for t-distribution
    const bt = Math.exp(
      lgamma(a + b) - lgamma(a) - lgamma(b) +
      a * Math.log(x) + b * Math.log(1 - x)
    )
    
    if (x < (a + 1) / (a + b + 2)) {
      return bt * betaCf(x, a, b) / a
    } else {
      return 1 - bt * betaCf(1 - x, b, a) / b
    }
  }

  // Continued fraction for incomplete beta
  const betaCf = (x, a, b) => {
    const maxIterations = 100
    const epsilon = 1e-10
    
    let qab = a + b
    let qap = a + 1
    let qam = a - 1
    let c = 1
    let d = 1 - qab * x / qap
    
    if (Math.abs(d) < epsilon) d = epsilon
    d = 1 / d
    let h = d
    
    for (let m = 1; m <= maxIterations; m++) {
      let m2 = 2 * m
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2))
      
      d = 1 + aa * d
      if (Math.abs(d) < epsilon) d = epsilon
      c = 1 + aa / c
      if (Math.abs(c) < epsilon) c = epsilon
      d = 1 / d
      h *= d * c
      
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
      d = 1 + aa * d
      if (Math.abs(d) < epsilon) d = epsilon
      c = 1 + aa / c
      if (Math.abs(c) < epsilon) c = epsilon
      d = 1 / d
      let del = d * c
      h *= del
      
      if (Math.abs(del - 1) < epsilon) break
    }
    
    return h
  }

  // Log gamma function approximation (Lanczos)
  const lgamma = (z) => {
    const g = 7
    const c = [
      0.99999999999980993,
      676.5203681218851,
      -1259.1392167224028,
      771.32342877765313,
      -176.61502916214059,
      12.507343278686905,
      -0.13857109526572012,
      9.9843695780195716e-6,
      1.5056327351493116e-7
    ]
    
    if (z < 0.5) {
      return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z)
    }
    
    z -= 1
    let x = c[0]
    for (let i = 1; i < g + 2; i++) {
      x += c[i] / (z + i)
    }
    
    const t = z + g + 0.5
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
  }

  // T-distribution critical value approximation
  const tDistributionCritical = (alpha, df) => {
    // Approximation for common confidence levels
    if (df >= 30) {
      // Use normal approximation for large df
      const z = {
        0.10: 1.282,
        0.05: 1.645,
        0.025: 1.960,
        0.01: 2.326,
        0.005: 2.576
      }
      return z[alpha] || 1.96
    }
    
    // Table of critical values for small df (two-tailed alpha/2)
    const criticalValues = {
      1: { 0.10: 3.078, 0.05: 6.314, 0.025: 12.706, 0.01: 31.821, 0.005: 63.657 },
      2: { 0.10: 1.886, 0.05: 2.920, 0.025: 4.303, 0.01: 6.965, 0.005: 9.925 },
      3: { 0.10: 1.638, 0.05: 2.353, 0.025: 3.182, 0.01: 4.541, 0.005: 5.841 },
      4: { 0.10: 1.533, 0.05: 2.132, 0.025: 2.776, 0.01: 3.747, 0.005: 4.604 },
      5: { 0.10: 1.476, 0.05: 2.015, 0.025: 2.571, 0.01: 3.365, 0.005: 4.032 },
      10: { 0.10: 1.372, 0.05: 1.812, 0.025: 2.228, 0.01: 2.764, 0.005: 3.169 },
      15: { 0.10: 1.341, 0.05: 1.753, 0.025: 2.131, 0.01: 2.602, 0.005: 2.947 },
      20: { 0.10: 1.325, 0.05: 1.725, 0.025: 2.086, 0.01: 2.528, 0.005: 2.845 },
      25: { 0.10: 1.316, 0.05: 1.708, 0.025: 2.060, 0.01: 2.485, 0.005: 2.787 },
      29: { 0.10: 1.311, 0.05: 1.699, 0.025: 2.045, 0.01: 2.462, 0.005: 2.756 }
    }
    
    // Find closest df
    const dfKeys = Object.keys(criticalValues).map(Number).sort((a, b) => a - b)
    let closestDf = dfKeys[0]
    for (const key of dfKeys) {
      if (key <= df) closestDf = key
    }
    
    // Find closest alpha
    const alphaKey = alpha <= 0.005 ? 0.005 : 
                     alpha <= 0.01 ? 0.01 : 
                     alpha <= 0.025 ? 0.025 : 
                     alpha <= 0.05 ? 0.05 : 0.10
    
    return criticalValues[closestDf]?.[alphaKey] || 1.96
  }

  // Multi-column sorting logic
  const sortDataMulti = (data, sortConfigs) => {
    if (!data || !Array.isArray(data)) return [...(data || [])]
    if (!sortConfigs || sortConfigs.length === 0) return [...data] // No sorting, return original order
    
    return [...data].sort((a, b) => {
      for (const config of sortConfigs) {
        const aVal = a[config.key]
        const bVal = b[config.key]
        if (aVal < bVal) return config.direction === 'asc' ? -1 : 1
        if (aVal > bVal) return config.direction === 'asc' ? 1 : -1
      }
      return 0
    })
  }

  const sortedInSampleResults = useMemo(() => {
    return sortDataMulti(inSampleResults?.results, inSampleSortConfig)
  }, [inSampleResults, inSampleSortConfig])

  // Handle multi-column sort: click adds/toggles column, shift+click for secondary sort
  const handleSort = (key, event) => {
    const isShiftKey = event?.shiftKey
    
    setInSampleSortConfig(prev => {
      const existingIndex = prev.findIndex(s => s.key === key)
      
      if (existingIndex >= 0) {
        // Column already in sort - toggle direction or remove
        const existing = prev[existingIndex]
        if (existing.direction === 'desc') {
          // Toggle to asc
          const newConfig = [...prev]
          newConfig[existingIndex] = { key, direction: 'asc' }
          return newConfig
        } else {
          // Remove from sort
          return prev.filter((_, i) => i !== existingIndex)
        }
      } else {
        // Add new column to sort
        if (isShiftKey && prev.length > 0) {
          // Add as secondary sort
          return [...prev, { key, direction: 'desc' }]
        } else {
          // Replace with single column sort
          return [{ key, direction: 'desc' }]
        }
      }
    })
  }
  
  // Get sort info for a column (memoized)
  const getSortInfo = useCallback((key) => {
    const index = inSampleSortConfig.findIndex(s => s.key === key)
    if (index < 0) return null
    return { ...inSampleSortConfig[index], priority: index + 1 }
  }, [inSampleSortConfig])

  // Auto-fill values from in-sample table row click
  const handleRowClick = useCallback((row) => {
    if (isCrossoverIndicator(indicatorType)) {
      setOutSampleEmaShort(row.ema_short || row.indicator_bottom)
      setOutSampleEmaLong(row.ema_long || row.indicator_top)
    } else {
      // For indicators, we use the fixed length and the bottom/top from the row
      setOutSampleIndicatorTop(row.indicator_top || row.ema_long)
    }
  }, [indicatorType])

  // Build heatmap data structure with min/max for dynamic coloring
  const heatmapData = useMemo(() => {
    if (!inSampleResults?.results) return null
    
    const results = inSampleResults.results
    
    // For EMA: use ema_short and ema_long
    // For indicators: use indicator_bottom (X-axis) and indicator_top (Y-axis)
    let xValues, yValues, lookupKey
    if (isCrossoverIndicator(indicatorType)) {
      xValues = [...new Set(results.map(r => r.ema_short || r.indicator_bottom))].sort((a, b) => a - b)
      yValues = [...new Set(results.map(r => r.ema_long || r.indicator_top))].sort((a, b) => a - b)
      lookupKey = (x, y) => `${x}-${y}`
    } else {
      xValues = [...new Set(results.map(r => r.indicator_bottom || r.ema_short))].sort((a, b) => a - b)
      yValues = [...new Set(results.map(r => r.indicator_top || r.ema_long))].sort((a, b) => a - b)
      lookupKey = (x, y) => `bottom${x}-top${y}`
    }
    
    // Create lookup map
    const lookup = {}
    results.forEach(r => {
      const x = isCrossoverIndicator(indicatorType) ? (r.ema_short || r.indicator_bottom) : (r.indicator_bottom || r.ema_short)
      const y = isCrossoverIndicator(indicatorType) ? (r.ema_long || r.indicator_top) : (r.indicator_top || r.ema_long)
      lookup[lookupKey(x, y)] = r
    })
    
    // Calculate min/max for the selected metric
    const metricValues = results.map(r => r[heatmapMetric]).filter(v => v !== null && v !== undefined)
    const minValue = metricValues.length > 0 ? Math.min(...metricValues) : 0
    const maxValue = metricValues.length > 0 ? Math.max(...metricValues) : 1
    
    return { xValues, yValues, lookup, minValue, maxValue, lookupKey }
  }, [inSampleResults, heatmapMetric, indicatorType])
  
  // Handle heatmap cell click - compare with adjacent cells
  const handleHeatmapCellClick = useCallback((result, x, y) => {
    if (!result || !heatmapData) return
    
    // Auto-fill values from clicked cell
    if (isCrossoverIndicator(indicatorType)) {
      setOutSampleEmaShort(result.ema_short || result.indicator_bottom)
      setOutSampleEmaLong(result.ema_long || result.indicator_top)
    } else {
      // For indicators, set bottom and top
      setOutSampleIndicatorBottom(result.indicator_bottom || result.ema_short || -2)
      setOutSampleIndicatorTop(result.indicator_top || result.ema_long || 2)
    }
    
    // Compare with adjacent cells (3 top, 3 bottom, 3 left, 3 right)
    const comparisons = []
    const currentValue = result[heatmapMetric]
    if (currentValue === null || currentValue === undefined || currentValue === 0) {
      setSelectedCell({ result, x, y, comparisons: [] })
      return
    }
    
    const { xValues, yValues, lookup, lookupKey } = heatmapData
    const xIndex = xValues.indexOf(x)
    const yIndex = yValues.indexOf(y)
    
    // Helper to calculate percentage difference
    const calcDiff = (val1, val2) => {
      if (val2 === 0) return Infinity
      return Math.abs((val1 - val2) / Math.abs(val2)) * 100
    }
    
    // Check left (3 cells)
    for (let i = Math.max(0, xIndex - 3); i < xIndex; i++) {
      const adjX = xValues[i]
      const adjResult = lookup[lookupKey(adjX, y)]
      if (adjResult && adjResult[heatmapMetric] !== null && adjResult[heatmapMetric] !== undefined) {
        const diff = calcDiff(adjResult[heatmapMetric], currentValue)
        if (diff > 30) {
          comparisons.push({ x: adjX, y, diff })
        }
      }
    }
    
    // Check right (3 cells)
    for (let i = xIndex + 1; i <= Math.min(xValues.length - 1, xIndex + 3); i++) {
      const adjX = xValues[i]
      const adjResult = lookup[lookupKey(adjX, y)]
      if (adjResult && adjResult[heatmapMetric] !== null && adjResult[heatmapMetric] !== undefined) {
        const diff = calcDiff(adjResult[heatmapMetric], currentValue)
        if (diff > 30) {
          comparisons.push({ x: adjX, y, diff })
        }
      }
    }
    
    // Check top (3 cells - lower Y values)
    for (let i = Math.max(0, yIndex - 3); i < yIndex; i++) {
      const adjY = yValues[i]
      const adjResult = lookup[lookupKey(x, adjY)]
      if (adjResult && adjResult[heatmapMetric] !== null && adjResult[heatmapMetric] !== undefined) {
        const diff = calcDiff(adjResult[heatmapMetric], currentValue)
        if (diff > 30) {
          comparisons.push({ x, y: adjY, diff })
        }
      }
    }
    
    // Check bottom (3 cells - higher Y values)
    for (let i = yIndex + 1; i <= Math.min(yValues.length - 1, yIndex + 3); i++) {
      const adjY = yValues[i]
      const adjResult = lookup[lookupKey(x, adjY)]
      if (adjResult && adjResult[heatmapMetric] !== null && adjResult[heatmapMetric] !== undefined) {
        const diff = calcDiff(adjResult[heatmapMetric], currentValue)
        if (diff > 30) {
          comparisons.push({ x, y: adjY, diff })
        }
      }
    }
    
    // Store comparisons for highlighting
    setSelectedCell({ result, x, y, comparisons })
  }, [heatmapData, heatmapMetric, indicatorType])
  
  // Helper function to calculate color intensity based on value and thresholds
  const calculateColor = useCallback((value, redThreshold, yellowThreshold, greenThreshold, maxValue, reverse = false) => {
    const settings = colorSettings[heatmapMetric] || {}
    const red = settings.red ?? redThreshold
    const yellow = settings.yellow ?? yellowThreshold
    const green = settings.green ?? greenThreshold
    const max = settings.max ?? maxValue

    if (reverse) {
      // For max_drawdown, lower (more negative) is worse
      if (value <= red) {
        // Red zone (worst)
        const intensity = Math.min(1, Math.abs(value - red) / Math.abs(max - red))
        const r = Math.round(255 - intensity * 55)
        const g = Math.round(120 - intensity * 80)
        const b = Math.round(120 - intensity * 80)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      } else if (value <= yellow) {
        // Yellow zone
        const intensity = (value - red) / (yellow - red)
        const r = Math.round(255 - intensity * 30)
        const g = Math.round(180 + intensity * 35)
        const b = Math.round(80 + intensity * 40)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      } else {
        // Green zone (best)
        const intensity = Math.min(1, (value - yellow) / (green - yellow))
        const r = Math.round(200 - intensity * 150)
        const g = Math.round(180 + intensity * 65)
        const b = Math.round(100 - intensity * 20)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      }
    } else {
      // Normal: higher is better
      if (value < red) {
        // Red zone (worst)
        const intensity = Math.min(1, Math.abs(value - red) / Math.abs(red - (red - Math.abs(max - red))))
        const r = Math.round(255 - intensity * 55)
        const g = Math.round(120 - intensity * 80)
        const b = Math.round(120 - intensity * 80)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      } else if (value < yellow) {
        // Yellow zone
        const intensity = (value - red) / (yellow - red)
        const r = Math.round(255 - intensity * 30)
        const g = Math.round(180 + intensity * 35)
        const b = Math.round(80 + intensity * 40)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      } else if (value < green) {
        // Yellow to Green transition
        const intensity = (value - yellow) / (green - yellow)
        const r = Math.round(225 - intensity * 85)
        const g = Math.round(215 + intensity * 20)
        const b = Math.round(120 - intensity * 60)
        return `rgba(${r}, ${g}, ${b}, 0.85)`
      } else {
        // Green zone (best)
        const intensity = Math.min(1, (value - green) / (max - green))
        const r = Math.round(140 - intensity * 90)
        const g = Math.round(210 + intensity * 35)
        const b = Math.round(140 - intensity * 60)
        return `rgba(${r}, ${g}, ${b}, 0.9)`
      }
    }
  }, [colorSettings, heatmapMetric])

  // Dynamic heatmap color based on selected metric (memoized)
  const getHeatmapColor = useCallback((value) => {
    if (value === null || value === undefined) return 'rgba(40, 40, 45, 0.6)'
    
    // Use custom thresholds from settings
    if (heatmapMetric === 'sharpe_ratio') {
      return calculateColor(value, -2, 0, 1, 3)
    } else if (heatmapMetric === 'total_return') {
      return calculateColor(value, -0.5, 0, 0.5, 1)
    } else if (heatmapMetric === 'win_rate') {
      return calculateColor(value, 0.3, 0.4, 0.5, 0.8)
    } else if (heatmapMetric === 'max_drawdown') {
      // Max drawdown: more negative is worse (reverse logic)
      // Default: red < -0.5, yellow < -0.3, green < -0.1, max = 0
      return calculateColor(value, -0.5, -0.3, -0.1, 0, true)
    }
    
    return 'rgba(100, 100, 100, 0.5)'
  }, [heatmapMetric, calculateColor])

  // Get cell color with red highlighting for comparisons
  const getCellColor = useCallback((result, x, y, selectedCellRef) => {
    // Check if this cell should be highlighted red due to comparison
    if (selectedCellRef?.comparisons) {
      const isComparisonCell = selectedCellRef.comparisons.some(c => c.x === x && c.y === y)
      if (isComparisonCell) {
        return 'rgba(255, 150, 150, 0.8)' // Pastel red for cells with >30% difference
      }
    }
    
    // Return normal heatmap color
    return getHeatmapColor(result?.[heatmapMetric])
  }, [getHeatmapColor, heatmapMetric])
  
  // Get display value for heatmap tooltip based on metric
  const getMetricDisplayValue = useCallback((result) => {
    if (!result) return 'N/A'
    const value = result[heatmapMetric]
    if (heatmapMetric === 'sharpe_ratio') return value?.toFixed(3)
    if (heatmapMetric === 'total_return') return `${(value * 100).toFixed(2)}%`
    if (heatmapMetric === 'win_rate') return `${(value * 100).toFixed(1)}%`
    if (heatmapMetric === 'max_drawdown') return `${(value * 100).toFixed(2)}%`
    return value?.toFixed(3)
  }, [heatmapMetric])

  // Save color settings to user's defaultConfig
  const saveColorSettings = async () => {
    if (!session?.user) {
      alert('Please log in to save color settings')
      return
    }

    try {
      const response = await fetch('/api/default-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heatmapColorSettings: colorSettings
        })
      })

      const data = await response.json()
      if (data.success) {
        setShowColorSettings(false)
        // Optionally show success message
      } else {
        alert('Failed to save color settings: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error saving color settings:', error)
      alert('Error saving color settings')
    }
  }

  // Handle opening color settings modal
  const handleOpenColorSettings = () => {
    setTempColorSettings(JSON.parse(JSON.stringify(colorSettings)))
    setShowColorSettings(true)
  }

  // Handle saving color settings from modal
  const handleSaveColorSettings = () => {
    if (tempColorSettings) {
      setColorSettings(tempColorSettings)
      saveColorSettings()
    }
  }

  // Export results to CSV
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
    link.download = `optimization_${symbol}_${interval}_${inSampleYears.join('-')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Export Bootstrap Resampling logs to CSV
  const exportResamplingToCSV = () => {
    if (!resamplingResults) return
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const headers = ['Resample_Index', 'Seed', 'Total_Return_%', 'Max_Drawdown_%', 'Volatility_%']
    const rows = resamplingResults.resamples.map((r, i) => [
      i + 1,
      r.seed,
      ((r.metrics?.totalReturn || 0) * 100).toFixed(4),
      ((r.metrics?.maxDrawdown || 0) * 100).toFixed(4),
      ((r.metrics?.realizedVolatility || 0) * 100).toFixed(4)
    ])
    
    // Add summary row
    const returns = resamplingResults.resamples.map(r => r.metrics?.totalReturn || 0)
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length
    rows.push(['--- Summary ---', '', '', '', ''])
    rows.push(['Avg_Return', '', (avgReturn * 100).toFixed(4), '', ''])
    rows.push(['Original_Return', '', ((resamplingResults.original?.metrics?.totalReturn || 0) * 100).toFixed(4), '', ''])
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `resampling_log_${symbol}_${timestamp}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Export Monte Carlo Simulation logs to CSV
  const exportMonteCarloToCSV = () => {
    if (!monteCarloResults) return
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const stats = monteCarloResults.statistics
    
    // Export simulation paths summary
    const headers = ['Simulation_Index', 'Total_Return_%', 'Max_Drawdown_%', 'Final_Equity']
    const rows = monteCarloResults.simulations.slice(0, 1000).map((sim, i) => [
      i + 1,
      ((sim.totalReturn || 0) * 100).toFixed(4),
      ((sim.maxDrawdown || 0) * 100).toFixed(4),
      (sim.finalEquity || 0).toFixed(2)
    ])
    
    // Add statistics summary
    rows.push(['--- Statistics ---', '', '', ''])
    rows.push(['Num_Simulations', stats.numSimulations, '', ''])
    rows.push(['Prob_of_Profit_%', (stats.probabilityOfProfit * 100).toFixed(2), '', ''])
    rows.push(['Prob_of_Loss_%', (stats.probabilityOfLoss * 100).toFixed(2), '', ''])
    rows.push(['Return_Mean_%', (stats.totalReturn.mean * 100).toFixed(4), '', ''])
    rows.push(['Return_Median_%', (stats.totalReturn.median * 100).toFixed(4), '', ''])
    rows.push(['Return_P5_%', (stats.totalReturn.p5 * 100).toFixed(4), '', ''])
    rows.push(['Return_P95_%', (stats.totalReturn.p95 * 100).toFixed(4), '', ''])
    rows.push(['MaxDD_Mean_%', (stats.maxDrawdown.mean * 100).toFixed(4), '', ''])
    rows.push(['MaxDD_Median_%', (stats.maxDrawdown.median * 100).toFixed(4), '', ''])
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `montecarlo_log_${symbol}_${timestamp}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Export Hypothesis Test logs to CSV
  const exportHypothesisToCSV = () => {
    if (!hypothesisResults) return
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const h = hypothesisResults
    
    const rows = [
      ['Hypothesis Test Results', ''],
      ['Timestamp', timestamp],
      ['Symbol', symbol],
      ['Test_Type', h.testName],
      ['Tail', h.tail],
      ['Alpha', h.alpha],
      ['']
    ]
    
    if (h.testType === 'one-sample') {
      rows.push(
        ['Sample_Size', h.n],
        ['Sample_Mean_%', (h.mean * 100).toFixed(6)],
        ['Sample_StdDev_%', (h.std * 100).toFixed(6)],
        ['Standard_Error_%', (h.se * 100).toFixed(6)],
        ['Target_Mu0_%', h.mu0 * 100]
      )
    } else if (h.testType === 'two-sample') {
      rows.push(
        ['N1', h.n1],
        ['N2', h.n2],
        ['Mean1_%', (h.mean1 * 100).toFixed(6)],
        ['Mean2_%', (h.mean2 * 100).toFixed(6)],
        ['StdDev1_%', (h.std1 * 100).toFixed(6)],
        ['StdDev2_%', (h.std2 * 100).toFixed(6)],
        ['Difference_%', (h.diff * 100).toFixed(6)]
      )
    } else if (h.testType === 'correlation') {
      rows.push(
        ['Sample_Size', h.n],
        ['Correlation_r', h.r.toFixed(6)],
        ['R_Squared', h.rSquared.toFixed(6)]
      )
    }
    
    rows.push(
      [''],
      ['t_Statistic', h.tStatistic.toFixed(6)],
      ['Degrees_of_Freedom', typeof h.df === 'number' ? h.df.toFixed(2) : h.df],
      ['p_Value', h.pValue.toFixed(6)],
      [''],
      ['CI_Lower', h.testType === 'correlation' ? h.ciLow.toFixed(6) : (h.ciLow * 100).toFixed(6) + '%'],
      ['CI_Upper', h.testType === 'correlation' ? h.ciHigh.toFixed(6) : (h.ciHigh * 100).toFixed(6) + '%']
    )
    
    if (h.cohensD !== undefined) {
      rows.push(['Cohens_d', h.cohensD.toFixed(6)])
    }
    
    rows.push(
      [''],
      ['Decision', h.decision],
      ['Significance', h.significance],
      [''],
      ['Interpretation', `"${h.interpretation}"`]
    )
    
    const csvContent = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `hypothesis_test_log_${symbol}_${timestamp}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Export Stress Test logs to CSV
  const exportStressTestToCSV = () => {
    if (!stressTestResults) return
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const perf = stressTestResults.performance
    
    // Export trades
    const headers = ['Entry_Date', 'Exit_Date', 'Position_Type', 'Entry_Price', 'Exit_Price', 'PnL', 'Return_%']
    const rows = stressTestResults.trades.map(t => [
      t.Entry_Date,
      t.Exit_Date,
      t.Position_Type,
      (t.Entry_Price || 0).toFixed(2),
      (t.Exit_Price || 0).toFixed(2),
      (t.PnL || 0).toFixed(2),
      ((t.Return_Pct || 0) * 100).toFixed(4)
    ])
    
    // Add performance summary
    rows.push([''])
    rows.push(['--- Performance Summary ---', '', '', '', '', '', ''])
    rows.push(['Total_Trades', perf.totalTrades, '', '', '', '', ''])
    rows.push(['Winning_Trades', perf.winningTrades, '', '', '', '', ''])
    rows.push(['Losing_Trades', perf.losingTrades, '', '', '', '', ''])
    rows.push(['Win_Rate_%', (perf.winRate * 100).toFixed(2), '', '', '', '', ''])
    rows.push(['Total_PnL', perf.totalPnL?.toFixed(2), '', '', '', '', ''])
    rows.push(['Total_Return_%', ((perf.totalReturn || 0) * 100).toFixed(2), '', '', '', '', ''])
    rows.push(['Profit_Factor', perf.profitFactor === Infinity ? 'Infinity' : perf.profitFactor?.toFixed(4), '', '', '', '', ''])
    rows.push(['Avg_Win', perf.avgWin?.toFixed(2), '', '', '', '', ''])
    rows.push(['Avg_Loss', perf.avgLoss?.toFixed(2), '', '', '', '', ''])
    rows.push(['Entry_Delay', stressTestEntryDelay, '', '', '', '', ''])
    rows.push(['Exit_Delay', stressTestExitDelay, '', '', '', '', ''])
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `stress_test_log_${symbol}_${timestamp}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const SortableHeader = ({ label, sortKey, onSort }) => {
    const sortInfo = getSortInfo(sortKey)
    const isActive = sortInfo !== null
    return (
      <th onClick={(e) => onSort(sortKey, e)} className={styles.sortableHeader} title="Click to sort, Shift+Click for multi-column sort">
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
            <div className={styles.headerTitleRow}>
              <h1>Algorithmic Optimization</h1>
              <div className={styles.helpTrigger}>
                <span className="material-icons">help_outline</span>
                <div className={styles.helpTooltip}>
                  <h4>How to Use This Page</h4>
                  <ol>
                    <li><strong>Configure Global Parameters</strong> - Select your asset, timeframe, in-sample/out-of-sample years, and indicator type</li>
                    <li><strong>Set Parameter Ranges</strong> - Define the ranges for optimization (fast/slow periods or thresholds)</li>
                    <li><strong>Run Optimization</strong> - Click "Run Optimization" to generate a heatmap of performance metrics</li>
                    <li><strong>Analyze Results</strong> - Review the heatmap to find optimal parameter combinations</li>
                    <li><strong>Save Setup</strong> - Save your configuration to unlock Stress Test and other advanced tools</li>
                    <li><strong>Run Advanced Tests</strong> - Use Bootstrap Resampling, Monte Carlo, or Stress Test for robustness validation</li>
                  </ol>
                  <div className={styles.helpTip}>
                    <span className="material-icons">lightbulb</span>
                    <span>Tip: Start with In-Sample data to find parameters, then validate on Out-of-Sample data</span>
                  </div>
                </div>
              </div>
            </div>
            <p className={styles.subtitle}>Find the optimal indicator parameters for your trading strategy</p>
          </div>

          {/* Saved Strategies Bar */}
          <div className={styles.savedStrategiesBar}>
            <div className={styles.strategiesBarLeft}>
              <button 
                className={`${styles.strategyBarBtn} ${styles.newBtn}`}
                onClick={handleNewConfig}
                title="Create new strategy"
              >
                <span className="material-icons">add</span>
                New
              </button>
              {savedOptimizationConfigs.length > 0 && (
                <div className={styles.strategySelector}>
                  <select
                    value={selectedConfigId || ''}
                    onChange={(e) => e.target.value ? handleLoadConfig(e.target.value) : setSelectedConfigId(null)}
                    className={styles.strategySelect}
                  >
                    <option value="">Load saved strategy...</option>
                    {savedOptimizationConfigs.map((config) => {
                      const configData = config.config || config
                      return (
                        <option key={config.id} value={config.id}>
                          {config.name} ({configData.symbol || 'N/A'}, {(configData.indicatorType || 'ema').toUpperCase()})
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}
              {selectedConfigId && (
                <span className={styles.activeStrategyBadge}>
                  <span className="material-icons">check_circle</span>
                  {savedOptimizationConfigs.find(c => c.id === selectedConfigId)?.name}
                </span>
              )}
            </div>
            <div className={styles.strategiesBarRight}>
              {selectedConfigId && (
                <>
                  <button 
                    className={styles.strategyBarBtn}
                    onClick={() => handleDeleteConfig(selectedConfigId)}
                    title="Delete this strategy"
                  >
                    <span className="material-icons">delete</span>
                  </button>
                  <button 
                    className={`${styles.strategyBarBtn} ${styles.primary}`}
                    onClick={handleUpdateConfig}
                    title="Save changes to this strategy"
                  >
                    <span className="material-icons">save</span>
                    Save
                  </button>
                </>
              )}
              <button 
                className={`${styles.strategyBarBtn} ${!selectedConfigId ? styles.primary : ''}`}
                onClick={() => setShowSaveConfigModal(true)}
                title="Save as new strategy"
              >
                <span className="material-icons">add_circle</span>
                Save As
              </button>
            </div>
          </div>

          {/* Global Configuration */}
          <div className={styles.configSection}>
            {/* Strategy Selector */}
            <StrategySelectorSection
              strategies={savedStrategies}
              selectedStrategyId={selectedSavedStrategyId}
              onSelectStrategy={handleSelectSavedStrategy}
              onEditStrategy={handleEditSavedStrategy}
              onCreateNew={handleCreateNewStrategy}
              isLoading={strategiesLoading}
              useCustomConfig={useCustomConfig}
              onToggleMode={handleToggleStrategyMode}
            />

            <div className={styles.globalParamsCard}>
              <div className={styles.globalParamsHeader}>
                <span className="material-icons">tune</span>
                <h3>Global Parameters</h3>
                <span className={styles.sectionInfoIcon}>
                  <span className="material-icons">info_outline</span>
                  <div className={styles.sectionInfoTooltip}>
                    <h5>Global Parameters</h5>
                    <p>Configure the core settings for your optimization. These settings apply to all analysis components.</p>
                    <ul>
                      <li>Select your trading asset and timeframe</li>
                      <li>Choose indicator type and parameter ranges</li>
                      <li>Define in-sample years for training</li>
                    </ul>
                  </div>
                </span>
              </div>
              
              {/* Row 1: Core Settings */}
              <div className={styles.paramRow}>
                {/* Only show indicator selector when using custom config */}
                {useCustomConfig && (
                  <div className={styles.paramGroup}>
                    <label style={{ display: 'flex', alignItems: 'center' }}>
                      <span className="material-icons">show_chart</span>
                      Indicator
                      <IndicatorInfoTooltip indicatorType={indicatorType} />
                  </label>
                    <select value={indicatorType} onChange={(e) => setIndicatorType(e.target.value)} className={styles.paramSelect}>
                    {INDICATOR_TYPES.map(ind => (
                      <option key={ind.value} value={ind.value}>{ind.label}</option>
                    ))}
                  </select>
                </div>
                )}

                <div className={styles.paramGroup}>
                  <label>
                    <span className="material-icons">currency_bitcoin</span>
                    Trading Pair
                  </label>
                  <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className={styles.paramSelect}>
                    {Object.entries(SYMBOLS).map(([category, symbols]) => (
                      <optgroup key={category} label={category}>
                        {symbols.map(s => <option key={s} value={s}>{s}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className={styles.paramGroup}>
                  <label>
                    <span className="material-icons">schedule</span>
                    Timeframe
                  </label>
                  <select value={interval} onChange={(e) => setInterval(e.target.value)} className={styles.paramSelect}>
                    {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                  </select>
                </div>

                <div className={styles.paramGroup}>
                  <label>
                    <span className="material-icons">swap_vert</span>
                    Position
                  </label>
                  <select value={positionType} onChange={(e) => setPositionType(e.target.value)} className={styles.paramSelect}>
                    <option value="both">Long & Short</option>
                    <option value="long_only">Long Only</option>
                    <option value="short_only">Short Only</option>
                  </select>
                </div>

                <div className={styles.paramGroup}>
                  <label>
                    <span className="material-icons">security</span>
                    Stop Loss
                  </label>
                  <select value={stopLossMode} onChange={(e) => setStopLossMode(e.target.value)} className={styles.paramSelect}>
                    <option value="support_resistance">S/R Based</option>
                    <option value="none">Disabled</option>
                  </select>
                    </div>
                    </div>

              {/* Indicator-Specific Parameters - Only show when using custom config */}
              {useCustomConfig && !isCrossoverIndicator(indicatorType) && (
                <div className={styles.paramDivider}>
                  <span>Indicator Settings</span>
                </div>
              )}

              {useCustomConfig && isCrossoverIndicator(indicatorType) && (
                <div className={styles.paramRow}>
                  <div className={styles.paramGroup}>
                    <label>
                      <span className="material-icons">speed</span>
                      Fast EMA Range
                    </label>
                    <div className={styles.rangeInputWrapper}>
                      <span className={styles.rangeLabel}>3</span>
                      <span className={styles.rangeDash}>→</span>
                      <input type="number" value={maxEmaShort} onChange={handleNumberInput(setMaxEmaShort, 20)} onBlur={handleNumberBlur(setMaxEmaShort, 20, 5)} min={5} max={50} className={styles.paramInput} />
                    </div>
                    </div>
                  <div className={styles.paramGroup}>
                    <label>
                      <span className="material-icons">trending_up</span>
                      Slow EMA Range
                    </label>
                    <div className={styles.rangeInputWrapper}>
                      <span className={styles.rangeLabel}>10</span>
                      <span className={styles.rangeDash}>→</span>
                      <input type="number" value={maxEmaLong} onChange={handleNumberInput(setMaxEmaLong, 50)} onBlur={handleNumberBlur(setMaxEmaLong, 50, 20)} min={20} max={200} className={styles.paramInput} />
                    </div>
                  </div>
                </div>
                )}

              {useCustomConfig && indicatorType === 'rsi' && (
                <div className={styles.paramRow}>
                  <div className={styles.paramGroup}>
                    <label>
                      <span className="material-icons">straighten</span>
                      Period Length
                    </label>
                    <input type="number" value={indicatorLength} onChange={handleNumberInput(setIndicatorLength, 14)} onBlur={handleNumberBlur(setIndicatorLength, 14, 3)} min={3} max={100} className={styles.paramInput} />
                    </div>
                  <div className={styles.paramGroupWide}>
                    <label>
                      <span className="material-icons">arrow_downward</span>
                      Oversold Zone
                    </label>
                    <div className={styles.rangeInputGroup}>
                      <input type="number" value={minIndicatorBottom} onChange={handleNumberInput(setMinIndicatorBottom, 20)} onBlur={handleNumberBlur(setMinIndicatorBottom, 20, 0)} min={0} max={50} className={styles.paramInput} />
                      <span className={styles.rangeDash}>to</span>
                      <input type="number" value={maxIndicatorBottom} onChange={handleNumberInput(setMaxIndicatorBottom, 35)} onBlur={handleNumberBlur(setMaxIndicatorBottom, 35, 0)} min={0} max={50} className={styles.paramInput} />
                      <span className={styles.hintInline}>typical: 20-35</span>
                    </div>
                    </div>
                  <div className={styles.paramGroupWide}>
                    <label>
                      <span className="material-icons">arrow_upward</span>
                      Overbought Zone
                    </label>
                    <div className={styles.rangeInputGroup}>
                      <input type="number" value={minIndicatorTop} onChange={handleNumberInput(setMinIndicatorTop, 65)} onBlur={handleNumberBlur(setMinIndicatorTop, 65, 50)} min={50} max={100} className={styles.paramInput} />
                      <span className={styles.rangeDash}>to</span>
                      <input type="number" value={maxIndicatorTop} onChange={handleNumberInput(setMaxIndicatorTop, 80)} onBlur={handleNumberBlur(setMaxIndicatorTop, 80, 50)} min={50} max={100} className={styles.paramInput} />
                      <span className={styles.hintInline}>typical: 65-80</span>
                    </div>
                  </div>
                </div>
              )}

              {useCustomConfig && indicatorType === 'cci' && (
                <div className={styles.paramRow}>
                  <div className={styles.paramGroup}>
                    <label>
                      <span className="material-icons">straighten</span>
                      Period Length
                    </label>
                    <input type="number" value={indicatorLength} onChange={handleNumberInput(setIndicatorLength, 14)} onBlur={handleNumberBlur(setIndicatorLength, 14, 3)} min={3} max={100} className={styles.paramInput} />
                    </div>
                  <div className={styles.paramGroupWide}>
                    <label>
                      <span className="material-icons">arrow_downward</span>
                      Oversold Zone
                    </label>
                    <div className={styles.rangeInputGroup}>
                      <input type="number" value={minIndicatorBottomCci} onChange={handleNumberInput(setMinIndicatorBottomCci, -150)} onBlur={handleNumberBlur(setMinIndicatorBottomCci, -150)} min={-300} max={0} className={styles.paramInput} />
                      <span className={styles.rangeDash}>to</span>
                      <input type="number" value={maxIndicatorBottomCci} onChange={handleNumberInput(setMaxIndicatorBottomCci, -50)} onBlur={handleNumberBlur(setMaxIndicatorBottomCci, -50)} min={-300} max={0} className={styles.paramInput} />
                      <span className={styles.hintInline}>typical: -150 to -50</span>
                    </div>
                    </div>
                  <div className={styles.paramGroupWide}>
                    <label>
                      <span className="material-icons">arrow_upward</span>
                      Overbought Zone
                    </label>
                    <div className={styles.rangeInputGroup}>
                      <input type="number" value={minIndicatorTopCci} onChange={handleNumberInput(setMinIndicatorTopCci, 50)} onBlur={handleNumberBlur(setMinIndicatorTopCci, 50, 0)} min={0} max={300} className={styles.paramInput} />
                      <span className={styles.rangeDash}>to</span>
                      <input type="number" value={maxIndicatorTopCci} onChange={handleNumberInput(setMaxIndicatorTopCci, 150)} onBlur={handleNumberBlur(setMaxIndicatorTopCci, 150, 0)} min={0} max={300} className={styles.paramInput} />
                      <span className={styles.hintInline}>typical: 50-150</span>
                    </div>
                  </div>
                </div>
              )}

              {useCustomConfig && indicatorType === 'zscore' && (
                <div className={styles.paramRow}>
                  <div className={styles.paramGroup}>
                    <label>
                      <span className="material-icons">straighten</span>
                      Period Length
                    </label>
                    <input type="number" value={indicatorLength} onChange={handleNumberInput(setIndicatorLength, 14)} onBlur={handleNumberBlur(setIndicatorLength, 14, 3)} min={3} max={100} className={styles.paramInput} />
                  </div>
                  <div className={styles.paramGroupWide}>
                    <label>
                      <span className="material-icons">arrow_downward</span>
                      Oversold Zone
                    </label>
                    <div className={styles.rangeInputGroup}>
                      <input type="number" value={minIndicatorBottomZscore} onChange={handleNumberInput(setMinIndicatorBottomZscore, -2.5)} onBlur={handleNumberBlur(setMinIndicatorBottomZscore, -2.5)} min={-5} max={0} step={0.1} className={styles.paramInput} />
                      <span className={styles.rangeDash}>to</span>
                      <input type="number" value={maxIndicatorBottomZscore} onChange={handleNumberInput(setMaxIndicatorBottomZscore, -1.5)} onBlur={handleNumberBlur(setMaxIndicatorBottomZscore, -1.5)} min={-5} max={0} step={0.1} className={styles.paramInput} />
                      <span className={styles.hintInline}>typical: -2.5 to -1.5</span>
                    </div>
                  </div>
                  <div className={styles.paramGroupWide}>
                    <label>
                      <span className="material-icons">arrow_upward</span>
                      Overbought Zone
                    </label>
                    <div className={styles.rangeInputGroup}>
                      <input type="number" value={minIndicatorTopZscore} onChange={handleNumberInput(setMinIndicatorTopZscore, 1.5)} onBlur={handleNumberBlur(setMinIndicatorTopZscore, 1.5, 0)} min={0} max={5} step={0.1} className={styles.paramInput} />
                      <span className={styles.rangeDash}>to</span>
                      <input type="number" value={maxIndicatorTopZscore} onChange={handleNumberInput(setMaxIndicatorTopZscore, 2.5)} onBlur={handleNumberBlur(setMaxIndicatorTopZscore, 2.5, 0)} min={0} max={5} step={0.1} className={styles.paramInput} />
                      <span className={styles.hintInline}>typical: 1.5-2.5</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Rolling Standard Deviation Settings */}
              {useCustomConfig && indicatorType === 'roll_std' && (
                <div className={styles.paramRow}>
                  <div className={styles.paramGroup}>
                    <label>
                      <span className="material-icons">straighten</span>
                      Period Length
                    </label>
                    <input type="number" value={indicatorLength} onChange={handleNumberInput(setIndicatorLength, 20)} onBlur={handleNumberBlur(setIndicatorLength, 20, 5)} min={5} max={200} className={styles.paramInput} />
                  </div>
                  <div className={styles.paramGroupWide}>
                    <label>
                      <span className="material-icons">arrow_downward</span>
                      Low Volatility
                    </label>
                    <div className={styles.rangeInputGroup}>
                      <input type="number" value={minIndicatorBottomRollStd} onChange={handleNumberInput(setMinIndicatorBottomRollStd, 0.5)} onBlur={handleNumberBlur(setMinIndicatorBottomRollStd, 0.5, 0)} min={0} max={5} step={0.1} className={styles.paramInput} />
                      <span className={styles.rangeDash}>to</span>
                      <input type="number" value={maxIndicatorBottomRollStd} onChange={handleNumberInput(setMaxIndicatorBottomRollStd, 1.0)} onBlur={handleNumberBlur(setMaxIndicatorBottomRollStd, 1.0, 0)} min={0} max={5} step={0.1} className={styles.paramInput} />
                      <span className={styles.hintInline}>typical: 0.5-1.0</span>
                    </div>
                  </div>
                  <div className={styles.paramGroupWide}>
                    <label>
                      <span className="material-icons">arrow_upward</span>
                      High Volatility
                    </label>
                    <div className={styles.rangeInputGroup}>
                      <input type="number" value={minIndicatorTopRollStd} onChange={handleNumberInput(setMinIndicatorTopRollStd, 2.0)} onBlur={handleNumberBlur(setMinIndicatorTopRollStd, 2.0, 0)} min={0} max={10} step={0.1} className={styles.paramInput} />
                      <span className={styles.rangeDash}>to</span>
                      <input type="number" value={maxIndicatorTopRollStd} onChange={handleNumberInput(setMaxIndicatorTopRollStd, 3.0)} onBlur={handleNumberBlur(setMaxIndicatorTopRollStd, 3.0, 0)} min={0} max={10} step={0.1} className={styles.paramInput} />
                      <span className={styles.hintInline}>typical: 2.0-3.0</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Rolling Median Settings */}
              {useCustomConfig && indicatorType === 'roll_median' && (
                <div className={styles.paramRow}>
                  <div className={styles.paramGroup}>
                    <label>
                      <span className="material-icons">straighten</span>
                      Period Length
                    </label>
                    <input type="number" value={indicatorLength} onChange={handleNumberInput(setIndicatorLength, 20)} onBlur={handleNumberBlur(setIndicatorLength, 20, 5)} min={5} max={200} className={styles.paramInput} />
                  </div>
                  <div className={styles.paramGroupWide}>
                    <label>
                      <span className="material-icons">info</span>
                      Signal Type
                    </label>
                    <div style={{ fontSize: '0.85rem', color: '#888', padding: '0.5rem 0' }}>
                      Price Cross: Entry when price crosses above/below the rolling median.
                      No threshold parameters needed.
                    </div>
                  </div>
                </div>
              )}

              {/* Rolling Percentile Settings */}
              {useCustomConfig && indicatorType === 'roll_percentile' && (
                <div className={styles.paramRow}>
                  <div className={styles.paramGroup}>
                    <label>
                      <span className="material-icons">straighten</span>
                      Period Length
                    </label>
                    <input type="number" value={indicatorLength} onChange={handleNumberInput(setIndicatorLength, 20)} onBlur={handleNumberBlur(setIndicatorLength, 20, 5)} min={5} max={200} className={styles.paramInput} />
                  </div>
                  <div className={styles.paramGroupWide}>
                    <label>
                      <span className="material-icons">arrow_downward</span>
                      Oversold Zone (%)
                    </label>
                    <div className={styles.rangeInputGroup}>
                      <input type="number" value={minIndicatorBottomRollPct} onChange={handleNumberInput(setMinIndicatorBottomRollPct, 10)} onBlur={handleNumberBlur(setMinIndicatorBottomRollPct, 10, 0)} min={0} max={50} className={styles.paramInput} />
                      <span className={styles.rangeDash}>to</span>
                      <input type="number" value={maxIndicatorBottomRollPct} onChange={handleNumberInput(setMaxIndicatorBottomRollPct, 30)} onBlur={handleNumberBlur(setMaxIndicatorBottomRollPct, 30, 0)} min={0} max={50} className={styles.paramInput} />
                      <span className={styles.hintInline}>typical: 10-30</span>
                    </div>
                  </div>
                  <div className={styles.paramGroupWide}>
                    <label>
                      <span className="material-icons">arrow_upward</span>
                      Overbought Zone (%)
                    </label>
                    <div className={styles.rangeInputGroup}>
                      <input type="number" value={minIndicatorTopRollPct} onChange={handleNumberInput(setMinIndicatorTopRollPct, 70)} onBlur={handleNumberBlur(setMinIndicatorTopRollPct, 70, 50)} min={50} max={100} className={styles.paramInput} />
                      <span className={styles.rangeDash}>to</span>
                      <input type="number" value={maxIndicatorTopRollPct} onChange={handleNumberInput(setMaxIndicatorTopRollPct, 90)} onBlur={handleNumberBlur(setMaxIndicatorTopRollPct, 90, 50)} min={50} max={100} className={styles.paramInput} />
                      <span className={styles.hintInline}>typical: 70-90</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Additional Settings */}
              <div className={styles.paramDivider}>
                <span>Advanced</span>
              </div>
              
              <div className={styles.paramRow}>
                <div className={styles.paramGroup}>
                  <label>
                    <span className="material-icons">percent</span>
                    Risk-Free Rate
                  </label>
                  <div className={styles.inputWithSuffix}>
                  <input 
                    type="number" 
                    value={riskFreeRate * 100} 
                    onChange={(e) => setRiskFreeRate(Number(e.target.value) / 100)} 
                    min={0} 
                    max={20} 
                    step={0.1}
                      className={styles.paramInput} 
                    placeholder="0"
                  />
                    <span className={styles.inputSuffix}>%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Strategy Robust Test Section */}
          <div className={styles.collapsibleSection}>
            <div 
              className={styles.sectionHeader}
              onClick={() => toggleSection('strategyRobustTest')}
            >
              <h2>
                <span className="material-icons">science</span>
                Strategy Robust Test
                <span className={styles.sectionInfoIcon} onClick={(e) => e.stopPropagation()}>
                  <span className="material-icons">info_outline</span>
                  <div className={styles.sectionInfoTooltip}>
                    <h5>Strategy Robust Test</h5>
                    <p>The core optimization workflow. Find optimal parameters using In-Sample data, then validate on Out-of-Sample data to ensure robustness.</p>
                    <ul>
                      <li>In-Sample: Training data to find parameters</li>
                      <li>Out-of-Sample: Validation on unseen data</li>
                      <li>Save validated setups for advanced tests</li>
                    </ul>
                  </div>
                </span>
                {savedSetup && (
                  <span className={styles.completedBadge} title="Section completed">
                    <span className="material-icons">check_circle</span>
                  </span>
                )}
              </h2>
              <span className={`material-icons ${styles.chevron} ${expandedSections.strategyRobustTest ? styles.expanded : ''}`}>
                expand_more
              </span>
            </div>
            
            {expandedSections.strategyRobustTest && (
              <div className={styles.sectionContent}>
                {/* In-Sample Section */}
                <div className={styles.sampleSection}>
                  <div className={styles.sampleCard}>
                    <div className={styles.sampleHeader}>
                      <h3>
                        <span className="material-icons">science</span>
                        In-Sample Analysis (Training Data)
                        <span className={styles.sectionInfoIcon}>
                          <span className="material-icons">info_outline</span>
                          <div className={styles.sectionInfoTooltip}>
                            <h5>In-Sample Analysis</h5>
                            <p>Find optimal indicator parameters using historical "training" data. The system tests all parameter combinations to find the best performers.</p>
                            <ul>
                              <li>Select years for training data</li>
                              <li>Review heatmap for parameter sensitivity</li>
                              <li>Click table rows to use in Out-of-Sample</li>
                            </ul>
                          </div>
                        </span>
                      </h3>
                    </div>

              <div className={styles.sampleConfig}>
                {/* Year Selection */}
                <div className={styles.yearSelection}>
                  <label>Select Years:</label>
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
                  <div className={styles.selectedInfo}>
                    Selected: {inSampleYears.length > 0 ? inSampleYears.sort((a, b) => a - b).join(', ') : 'None'}
                  </div>
                </div>

                <button 
                  className={styles.calculateButton}
                  onClick={calculateInSample}
                  disabled={(useCustomConfig ? isCalculatingInSample : isRunningDslInSample) || inSampleYears.length === 0}
                >
                  {!useCustomConfig ? (
                    isRunningDslInSample ? (
                      <><span className={`material-icons ${styles.spinning}`}>sync</span> Running strategy...</>
                    ) : (
                      <><span className="material-icons">play_arrow</span> Run In-Sample Strategy</>
                    )
                  ) : isCalculatingInSample ? (
                    <><span className={`material-icons ${styles.spinning}`}>sync</span> Calculating... {inSampleProgress}%</>
                  ) : (
                    <><span className="material-icons">calculate</span> Calculate In-Sample</>
                  )}
                </button>
              </div>

              {(useCustomConfig ? inSampleError : dslInSampleError) && (
                <div className={styles.errorMessage}>
                  <span className="material-icons">error</span>
                  {useCustomConfig ? inSampleError : dslInSampleError}
                </div>
              )}

              {(useCustomConfig || inSampleResults?._dsl) && inSampleResults && (
                <div className={styles.resultsContainer}>
                  {/* Summary */}
                  <div className={styles.resultsSummary}>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>
                        {isCrossoverIndicator(indicatorType) ? 'Best EMA' : 
                         indicatorType === 'rsi' ? 'Best RSI' :
                         indicatorType === 'cci' ? 'Best CCI' : 'Best Z-Score'}
                      </span>
                      <span className={styles.summaryValue}>
                        {isCrossoverIndicator(indicatorType) 
                          ? `${sortedInSampleResults[0]?.ema_short || sortedInSampleResults[0]?.indicator_bottom}/${sortedInSampleResults[0]?.ema_long || sortedInSampleResults[0]?.indicator_top}`
                          : `Bottom: ${sortedInSampleResults[0]?.indicator_bottom || sortedInSampleResults[0]?.ema_short}, Top: ${sortedInSampleResults[0]?.indicator_top || sortedInSampleResults[0]?.ema_long}`
                        }
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
                      <div className={styles.periodValue}>
                        <span className={styles.periodYears}>
                          {inSampleResults.period?.split('(')[0]?.trim() || inSampleResults.period}
                        </span>
                        {inSampleResults.period?.includes('(') && (
                          <span className={styles.periodDates}>
                            {inSampleResults.period?.match(/\(([^)]+)\)/)?.[1]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Heatmap and Table Grid */}
                  <div className={styles.resultsGrid}>
                    {/* Heatmap */}
                    {heatmapData && (
                      <div className={styles.heatmapSection}>
                        <div className={styles.heatmapHeader}>
                          <h4>Heatmap</h4>
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
                            <button
                              onClick={handleOpenColorSettings}
                              className={styles.colorSettingsButton}
                              title="Customize color thresholds"
                            >
                              <span className="material-icons">palette</span>
                            </button>
                          </div>
                        </div>
                        <div className={styles.heatmapContainer}>
                          <div className={styles.heatmapYLabel}>
                            {isCrossoverIndicator(indicatorType) ? 'Long EMA →' : 'Top →'}
                          </div>
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
                                    const result = heatmapData.lookup[heatmapData.lookupKey(x, y)]
                                    const metricValue = result?.[heatmapMetric]
                                    const isValid = (isCrossoverIndicator(indicatorType) ? x < y : true) && result
                                    const isSelected = selectedCell?.x === x && selectedCell?.y === y
                                    const isComparison = selectedCell?.comparisons?.some(c => c.x === x && c.y === y)
                                    
                                    return (
                                      <div
                                        key={`${x}-${y}`}
                                        className={`${styles.heatmapCell} ${isValid ? styles.valid : ''} ${isSelected ? styles.selectedCell : ''} ${isComparison ? styles.comparisonCell : ''}`}
                                        style={{ 
                                          backgroundColor: isValid ? getCellColor(result, x, y, selectedCell) : 'transparent',
                                          border: isSelected ? '2px solid #fff' : 'none'
                                        }}
                                        onMouseEnter={() => isValid && setHeatmapHover({ 
                                          x, y, 
                                          ...(isCrossoverIndicator(indicatorType) ? { emaShort: x, emaLong: y } : { indicator_bottom: x, indicator_top: y }),
                                          ...result 
                                        })}
                                        onMouseMove={(e) => isValid && setMousePos({ x: e.clientX, y: e.clientY })}
                                        onMouseLeave={() => setHeatmapHover(null)}
                                        onClick={() => isValid && handleHeatmapCellClick(result, x, y)}
                                      />
                                    )
                                  })}
                                </div>
                              ))}
                            </div>
                            <div className={styles.heatmapXAxisLabel}>
                              {isCrossoverIndicator(indicatorType) ? 'Short EMA →' : 'Bottom →'}
                            </div>
                          </div>
                          
                          {/* Hover tooltip - follows mouse */}
                          {heatmapHover && (
                            <div 
                              className={styles.heatmapTooltip}
                              style={{ left: mousePos.x, top: mousePos.y }}
                            >
                              <div className={styles.tooltipHeader}>
                                {isCrossoverIndicator(indicatorType) 
                                  ? `EMA ${heatmapHover.emaShort || heatmapHover.x}/${heatmapHover.emaLong || heatmapHover.y}`
                                  : `${indicatorType.toUpperCase()} Bottom: ${heatmapHover.indicator_bottom || heatmapHover.x}, Top: ${heatmapHover.indicator_top || heatmapHover.y}`
                                }
                              </div>
                              <div className={styles.tooltipRow}>
                                <span>Sharpe Ratio:</span>
                                <span style={{ color: getSharpeColor(heatmapHover.sharpe_ratio) }}>
                                  {heatmapHover.sharpe_ratio?.toFixed(3)}
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
                              <div className={styles.tooltipRow}>
                                <span>Win Rate:</span>
                                <span>{(heatmapHover.win_rate * 100).toFixed(1)}%</span>
                              </div>
                              <div className={styles.tooltipHint}>Click to use in Out-of-Sample</div>
                            </div>
                          )}

                          {/* Color Legend */}
                          <div className={styles.heatmapLegend}>
                            <span className={styles.legendLabel}>
                              {heatmapMetric === 'sharpe_ratio' ? '<0' : 
                               heatmapMetric === 'total_return' ? '<0%' : 
                               heatmapMetric === 'win_rate' ? '<40%' :
                               '<-50%'} (Red)
                            </span>
                            <div className={styles.legendGradient}></div>
                            <span className={styles.legendLabel}>
                              {heatmapMetric === 'sharpe_ratio' ? '>1' : 
                               heatmapMetric === 'total_return' ? '>100%' : 
                               heatmapMetric === 'win_rate' ? '>50%' :
                               '>-10%'} (Green)
                            </span>
                          </div>
                          <div className={styles.legendCenter}>
                            {heatmapMetric === 'max_drawdown' ? '-30% to -10% (Yellow)' : '0-1 (Yellow)'}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Results Table */}
                    <div className={styles.tableSection}>
                      <div className={styles.tableHeader}>
                        <h4>
                          All Combinations 
                          <span className={styles.tableHint}>(Click row to use in Out-of-Sample)</span>
                          {sortedInSampleResults.length > 60 && (
                            <span className={styles.tableRowLimit}>
                              {' '}• {sortedInSampleResults.length} total rows (scroll to view all)
                            </span>
                          )}
                        </h4>
                        <button className={styles.exportButton} onClick={exportToCSV}>
                          <span className="material-icons">download</span>
                          Export CSV
                        </button>
                      </div>
                      <div className={styles.tableContainer}>
                        <table className={styles.resultsTable}>
                          <thead>
                            <tr>
                              {isCrossoverIndicator(indicatorType) ? (
                                <>
                                  <SortableHeader label="Short" sortKey="ema_short" onSort={handleSort} />
                                  <SortableHeader label="Long" sortKey="ema_long" onSort={handleSort} />
                                </>
                              ) : (
                                <>
                                  <SortableHeader label="Bottom" sortKey="indicator_bottom" onSort={handleSort} />
                                  <SortableHeader label="Top" sortKey="indicator_top" onSort={handleSort} />
                                </>
                              )}
                              <SortableHeader label="Sharpe" sortKey="sharpe_ratio" onSort={handleSort} />
                              <SortableHeader label="Return" sortKey="total_return" onSort={handleSort} />
                              <SortableHeader label="Max DD" sortKey="max_drawdown" onSort={handleSort} />
                              <SortableHeader label="Win %" sortKey="win_rate" onSort={handleSort} />
                              <SortableHeader label="Trades" sortKey="total_trades" onSort={handleSort} />
                            </tr>
                          </thead>
                          <tbody>
                            {sortedInSampleResults.map((row, index) => {
                              const xValue = isCrossoverIndicator(indicatorType) ? (row.ema_short || row.indicator_bottom) : (row.indicator_bottom || row.ema_short)
                              const yValue = isCrossoverIndicator(indicatorType) ? (row.ema_long || row.indicator_top) : (row.indicator_top || row.ema_long)
                              const isSelected = isCrossoverIndicator(indicatorType) 
                                ? (row.ema_short === outSampleEmaShort && row.ema_long === outSampleEmaLong)
                                : (row.indicator_top === outSampleIndicatorTop)
                              
                              return (
                                <tr 
                                  key={index} 
                                  className={`${styles.clickableRow} ${isSelected ? styles.selectedRow : ''}`}
                                  onClick={() => handleRowClick(row)}
                                >
                                  <td>{xValue}</td>
                                  <td>{yValue}</td>
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
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!useCustomConfig && dslInSampleResult && !inSampleResults?._dsl && (
                <div className={styles.resultsContainer}>
                  <div className={styles.resultsSummary}>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Mode</span>
                      <span className={styles.summaryValue}>Saved Strategy (DSL)</span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Period</span>
                      <span className={styles.summaryValue}>{dslInSampleResult.period}</span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Trades</span>
                      <span className={styles.summaryValue}>{dslInSampleResult.trades?.length || 0}</span>
                    </div>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Total Return</span>
                      <span className={styles.summaryValue}>
                        {typeof dslInSampleResult.performance?.Total_Return_Pct === 'number'
                          ? `${dslInSampleResult.performance.Total_Return_Pct.toFixed(2)}%`
                          : 'N/A'}
                      </span>
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
                        <span className={styles.sectionInfoIcon}>
                          <span className="material-icons">info_outline</span>
                          <div className={styles.sectionInfoTooltip}>
                            <h5>Out-of-Sample Validation</h5>
                            <p>Test your optimized parameters on "unseen" data to validate they work in real conditions, not just the training period.</p>
                            <ul>
                              <li>Use different years than In-Sample</li>
                              <li>Compare metrics to detect overfitting</li>
                              <li>Save validated setups for other tests</li>
                            </ul>
                          </div>
                        </span>
                      </h3>
                    </div>

              <div className={styles.outSampleConfig}>
                {/* Year Selection */}
                <div className={styles.yearSelection}>
                  <label>Select Validation Years:</label>
                  <div className={styles.yearChips}>
                    {AVAILABLE_YEARS.map(year => (
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

                {/* Parameter and Capital Selection */}
                <div className={styles.emaSelection}>
                  <div className={styles.emaInputGroup}>
                    {!useCustomConfig ? (
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div className={styles.formGroup}>
                          <label>Initial Capital ($)</label>
                          <input 
                            type="number" 
                            value={initialCapital} 
                            onChange={(e) => setInitialCapital(Number(e.target.value))} 
                            min={100} 
                            step={1000}
                            className={styles.input} 
                          />
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#888', maxWidth: 520 }}>
                          DSL strategies don’t use EMA/threshold parameters here. Validation runs the exact saved indicator logic.
                        </div>
                      </div>
                    ) : isCrossoverIndicator(indicatorType) ? (
                      <>
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
                      </>
                    ) : (
                      <>
                        <div className={styles.formGroup}>
                          <label>Bottom</label>
                          <input 
                            type="number" 
                            value={outSampleIndicatorBottom} 
                            onChange={(e) => setOutSampleIndicatorBottom(Number(e.target.value))} 
                            min={indicatorType === 'zscore' ? -2 : -200}
                            max={0}
                            step={indicatorType === 'zscore' ? 0.1 : 1}
                            className={styles.input} 
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Top</label>
                          <input 
                            type="number" 
                            value={outSampleIndicatorTop} 
                            onChange={(e) => setOutSampleIndicatorTop(Number(e.target.value))} 
                            min={0}
                            max={indicatorType === 'zscore' ? 2 : 200}
                            step={indicatorType === 'zscore' ? 0.1 : 1}
                            className={styles.input} 
                          />
                        </div>
                      </>
                    )}
                  </div>
                  {useCustomConfig && (
                    <div className={styles.emaHint}>
                      <span className="material-icons">info</span>
                      Click a row in the In-Sample table or heatmap to auto-fill values
                    </div>
                  )}
                </div>

                <button 
                  className={`${styles.calculateButton} ${styles.outSampleButton}`}
                  onClick={calculateOutSample}
                  disabled={(useCustomConfig ? isCalculatingOutSample : isRunningDslOutSample) || outSampleYears.length === 0}
                >
                  {!useCustomConfig ? (
                    isRunningDslOutSample ? (
                      <><span className={`material-icons ${styles.spinning}`}>sync</span> Running strategy...</>
                    ) : (
                      <><span className="material-icons">verified</span> Validate Strategy (DSL)</>
                    )
                  ) : isCalculatingOutSample ? (
                    <><span className={`material-icons ${styles.spinning}`}>sync</span> Calculating...</>
                  ) : (
                    <><span className="material-icons">verified</span> Validate Strategy</>
                  )}
                </button>
              </div>

              {(useCustomConfig ? outSampleError : dslOutSampleError) && (
                <div className={styles.errorMessage}>
                  <span className="material-icons">error</span>
                  {useCustomConfig ? outSampleError : dslOutSampleError}
                </div>
              )}

              {!useCustomConfig && dslOutSampleResult && !outSampleResult?._dsl && (
                <div className={styles.outSampleResults}>
                  <div className={styles.metricsRow}>
                    <div className={styles.resultCard}>
                      <div className={styles.resultCardHeader}>
                        <span className="material-icons">verified</span>
                        DSL Strategy Results
                      </div>
                      <div className={styles.resultCardBody}>
                        <div className={styles.mainMetric}>
                          <span className={styles.metricLabel}>Total Return</span>
                          <span className={styles.metricValue}>
                            {typeof dslOutSampleResult.performance?.Total_Return_Pct === 'number'
                              ? `${dslOutSampleResult.performance.Total_Return_Pct.toFixed(2)}%`
                              : 'N/A'}
                          </span>
                        </div>
                        <div className={styles.metricsGrid}>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Trades</span>
                            <span className={styles.metricValue}>{dslOutSampleResult.trades?.length || 0}</span>
                          </div>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Win Rate</span>
                            <span className={styles.metricValue}>
                              {typeof dslOutSampleResult.performance?.Win_Rate === 'number'
                                ? `${(dslOutSampleResult.performance.Win_Rate * 100).toFixed(1)}%`
                                : 'N/A'}
                            </span>
                          </div>
                        </div>
                        <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#888' }}>
                          Period: {dslOutSampleResult.period}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {(useCustomConfig || outSampleResult?._dsl) && outSampleResult && (
                <div className={styles.outSampleResults}>
                  {/* Metrics Cards */}
                  <div className={styles.metricsRow}>
                    {/* In-Sample Metrics */}
                    <div className={styles.resultCard}>
                      <div className={styles.resultCardHeader}>
                        <span className="material-icons">science</span>
                        In-Sample Results
                      </div>
                      <div className={styles.resultCardBody}>
                        <div className={styles.mainMetric}>
                          <span className={styles.metricLabel}>Sharpe Ratio</span>
                          <span className={styles.metricValue} style={{ color: getSharpeColor(outSampleResult.in_sample?.sharpe_ratio) }}>
                            {outSampleResult.in_sample?.sharpe_ratio?.toFixed(3) || 'N/A'}
                          </span>
                        </div>
                        <div className={styles.metricsGrid}>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Return</span>
                            <span className={`${styles.metricValue} ${(outSampleResult.in_sample?.total_return || 0) >= 0 ? styles.positive : styles.negative}`}>
                              {((outSampleResult.in_sample?.total_return || 0) * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Max DD</span>
                            <span className={`${styles.metricValue} ${styles.negative}`}>
                              {((outSampleResult.in_sample?.max_drawdown || 0) * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Win Rate</span>
                            <span className={styles.metricValue}>
                              {((outSampleResult.in_sample?.win_rate || 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Trades</span>
                            <span className={styles.metricValue}>
                              {outSampleResult.in_sample?.total_trades || 0}
                            </span>
                          </div>
                        </div>
                        <div className={styles.periodInfo}>
                          <span className="material-icons">date_range</span>
                          {outSampleResult.in_sample?.period || 'N/A'}
                        </div>
                      </div>
                    </div>

                    {/* Out-Sample Metrics */}
                    <div className={`${styles.resultCard} ${styles.outSampleResultCard}`}>
                      <div className={styles.resultCardHeader}>
                        <span className="material-icons">verified</span>
                        Out-of-Sample Results
                      </div>
                      <div className={styles.resultCardBody}>
                        <div className={styles.mainMetric}>
                          <span className={styles.metricLabel}>Sharpe Ratio</span>
                          <span className={styles.metricValue} style={{ color: getSharpeColor(outSampleResult.out_sample?.sharpe_ratio) }}>
                            {outSampleResult.out_sample?.sharpe_ratio?.toFixed(3) || 'N/A'}
                          </span>
                        </div>
                        <div className={styles.metricsGrid}>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Return</span>
                            <span className={`${styles.metricValue} ${(outSampleResult.out_sample?.total_return || 0) >= 0 ? styles.positive : styles.negative}`}>
                              {((outSampleResult.out_sample?.total_return || 0) * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Max DD</span>
                            <span className={`${styles.metricValue} ${styles.negative}`}>
                              {((outSampleResult.out_sample?.max_drawdown || 0) * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Win Rate</span>
                            <span className={styles.metricValue}>
                              {((outSampleResult.out_sample?.win_rate || 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className={styles.metricItem}>
                            <span className={styles.metricLabel}>Trades</span>
                            <span className={styles.metricValue}>
                              {outSampleResult.out_sample?.total_trades || 0}
                            </span>
                          </div>
                        </div>
                        <div className={styles.periodInfo}>
                          <span className="material-icons">date_range</span>
                          {outSampleResult.out_sample?.period || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Equity Curve Chart */}
                  {outSampleResult.equity_curve && outSampleResult.equity_curve.length > 0 && (
                    <div className={styles.equityCurveSection}>
                      <h4>
                        <span className="material-icons">show_chart</span>
                        Equity Curve - EMA {outSampleResult.ema_short}/{outSampleResult.ema_long}
                      </h4>
                      <div className={styles.equityCurveChart}>
                        <div className={styles.chartYAxis}>
                          <span>${Math.max(...outSampleResult.equity_curve.map(p => p.equity)).toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                          <span>${(initialCapital).toLocaleString()}</span>
                          <span>${Math.min(...outSampleResult.equity_curve.map(p => p.equity)).toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                        </div>
                        <div className={styles.chartArea} style={{ position: 'relative' }}>
                          <svg 
                            viewBox="0 0 1000 300" 
                            preserveAspectRatio="none" 
                            className={styles.equitySvg}
                            onMouseMove={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect()
                              const x = ((e.clientX - rect.left) / rect.width) * 1000
                              const dataIdx = Math.round((x / 1000) * (outSampleResult.equity_curve.length - 1))
                              const point = outSampleResult.equity_curve[Math.max(0, Math.min(dataIdx, outSampleResult.equity_curve.length - 1))]
                              if (point) {
                                const minEquity = Math.min(...outSampleResult.equity_curve.map(p => p.equity))
                                const maxEquity = Math.max(...outSampleResult.equity_curve.map(p => p.equity))
                                const range = maxEquity - minEquity || 1
                                const y = 300 - ((point.equity - minEquity) / range) * 280 - 10
                                setEquityCurveHover({
                                  x: (dataIdx / (outSampleResult.equity_curve.length - 1)) * 1000,
                                  y,
                                  date: point.date,
                                  equity: point.equity,
                                  index: dataIdx,
                                  pctChange: dataIdx > 0 
                                    ? ((point.equity - outSampleResult.equity_curve[0].equity) / outSampleResult.equity_curve[0].equity * 100)
                                    : 0
                                })
                              }
                            }}
                            onMouseLeave={() => setEquityCurveHover(null)}
                          >
                            {/* Render each segment with different colors */}
                            {outSampleResult.segments && outSampleResult.segments.map((segment, segIdx) => {
                              const minEquity = Math.min(...outSampleResult.equity_curve.map(p => p.equity))
                              const maxEquity = Math.max(...outSampleResult.equity_curve.map(p => p.equity))
                              const range = maxEquity - minEquity || 1
                              const totalPoints = outSampleResult.equity_curve.length
                              
                              // Build path for this segment
                              const pathData = []
                              for (let i = segment.start; i <= segment.end; i++) {
                                const point = outSampleResult.equity_curve[i]
                                const x = (i / (totalPoints - 1)) * 1000
                                const y = 300 - ((point.equity - minEquity) / range) * 280 - 10
                                pathData.push(i === segment.start ? `M ${x} ${y}` : `L ${x} ${y}`)
                              }
                              
                              const color = segment.type === 'in_sample' ? '#4488ff' : '#00ff88'
                              
                              return (
                                <path
                                  key={segIdx}
                                  d={pathData.join(' ')}
                                  fill="none"
                                  stroke={color}
                                  strokeWidth="2.5"
                                />
                              )
                            })}
                            
                            {/* Vertical divider lines between segments */}
                            {outSampleResult.segments && outSampleResult.segments.slice(0, -1).map((segment, idx) => {
                              const x = ((segment.end + 0.5) / (outSampleResult.equity_curve.length - 1)) * 1000
                              return (
                                <line 
                                  key={`divider-${idx}`}
                                  x1={x} 
                                  y1="0" 
                                  x2={x} 
                                  y2="300" 
                                  stroke="#666" 
                                  strokeWidth="1.5" 
                                  strokeDasharray="4,4"
                                />
                              )
                            })}
                            
                            {/* Hover indicator */}
                            {equityCurveHover && (
                              <>
                                <line 
                                  x1={equityCurveHover.x} 
                                  y1="0" 
                                  x2={equityCurveHover.x} 
                                  y2="300" 
                                  stroke="#fff" 
                                  strokeWidth="1" 
                                  strokeDasharray="3,3"
                                  opacity="0.5"
                                />
                                <circle 
                                  cx={equityCurveHover.x} 
                                  cy={equityCurveHover.y} 
                                  r="5" 
                                  fill="#fff" 
                                  stroke="#4488ff" 
                                  strokeWidth="2"
                                />
                              </>
                            )}
                          </svg>
                          
                          {/* Hover tooltip */}
                          {equityCurveHover && (
                            <div 
                              className={styles.chartTooltip}
                              style={{
                                left: `${(equityCurveHover.x / 1000) * 100}%`,
                                transform: equityCurveHover.x > 700 ? 'translateX(-100%)' : 'translateX(0)'
                              }}
                            >
                              <div className={styles.tooltipDate}>{equityCurveHover.date}</div>
                              <div className={styles.tooltipValue}>
                                ${equityCurveHover.equity?.toLocaleString(undefined, {maximumFractionDigits: 0})}
                              </div>
                              <div className={`${styles.tooltipChange} ${equityCurveHover.pctChange >= 0 ? styles.positive : styles.negative}`}>
                                {equityCurveHover.pctChange >= 0 ? '+' : ''}{equityCurveHover.pctChange.toFixed(2)}%
                              </div>
                            </div>
                          )}
                          
                          <div className={styles.chartLabels}>
                            <span className={styles.inSampleLabel}>● In-Sample</span>
                            <span className={styles.outSampleLabel}>● Out-of-Sample</span>
                          </div>
                        </div>
                      </div>
                      <div className={styles.strategyInfo}>
                        <span className="material-icons">account_balance</span>
                        Initial: ${initialCapital.toLocaleString()} → Final: ${outSampleResult.equity_curve[outSampleResult.equity_curve.length - 1]?.equity.toLocaleString(undefined, {maximumFractionDigits: 0})}
                      </div>
                    </div>
                  )}
                  
                  {/* Save Setup Prompt */}
                  {showSaveSetupModal && (
                    <div className={styles.saveSetupPrompt}>
                      <div className={styles.saveSetupContent}>
                        <div className={styles.saveSetupHeader}>
                          <span className="material-icons">save</span>
                          <h4>Save Validated Setup?</h4>
                        </div>
                        <p className={styles.saveSetupMessage}>
                          Would you like to save this validated strategy setup to use in other analysis sections (Resampling, Simulation, Significance, Stress Test)?
                        </p>
                        <div className={styles.saveSetupActions}>
                          <button 
                            className={styles.saveSetupButton}
                            onClick={handleSaveSetup}
                          >
                            <span className="material-icons">check</span>
                            Save Setup
                          </button>
                          <button 
                            className={styles.dismissSetupButton}
                            onClick={handleDismissSaveSetup}
                          >
                            <span className="material-icons">close</span>
                            Not Now
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Saved Setup Indicator */}
                  {savedSetup && !showSaveSetupModal && (
                    <div className={styles.savedSetupIndicator}>
                      <span className="material-icons">check_circle</span>
                      <span>Setup saved and ready to use in other sections</span>
                      <button 
                        className={styles.clearSetupButton}
                        onClick={() => {
                          setSavedSetup(null)
                          try {
                            sessionStorage.removeItem('optimizeSetup')
                          } catch (e) {
                            console.warn('Failed to clear setup from sessionStorage:', e)
                          }
                        }}
                        title="Clear saved setup"
                      >
                        <span className="material-icons">close</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Resampling Analysis Section */}
          <div className={styles.collapsibleSection}>
            <div 
              className={styles.sectionHeader}
              onClick={() => toggleSection('resampling')}
            >
              <h2>
                <span className="material-icons">timeline</span>
                Resampling Analysis
                <span className={styles.sectionInfoIcon} onClick={(e) => e.stopPropagation()}>
                  <span className="material-icons">info_outline</span>
                  <div className={styles.sectionInfoTooltip}>
                    <h5>Resampling Analysis</h5>
                    <p>Bootstrap resampling tests if your strategy works across different market scenarios by shuffling historical data while preserving patterns.</p>
                    <ul>
                      <li>Generates multiple "what-if" scenarios</li>
                      <li>Shows distribution of possible results</li>
                      <li>Identifies if results are statistically significant</li>
                    </ul>
                  </div>
                </span>
                {resamplingStrategyResults && (
                  <span className={styles.completedBadge} title="Section completed">
                    <span className="material-icons">check_circle</span>
                  </span>
                )}
              </h2>
              <span className={`material-icons ${styles.chevron} ${expandedSections.resampling ? styles.expanded : ''}`}>
                expand_more
              </span>
            </div>
            
            {expandedSections.resampling && (
              <div className={styles.sectionContent}>
                {savedSetup ? (
                  <div className={styles.resamplingContainer}>
                    {/* Setup Info */}
                    <div className={styles.savedSetupInfo}>
                      <div className={styles.savedSetupHeader}>
                        <span className="material-icons">check_circle</span>
                        <h4>Using Saved Validated Setup</h4>
                      </div>
                      <div className={styles.savedSetupDetails}>
                        <div className={styles.setupDetailRow}>
                          <span className={styles.setupLabel}>Asset:</span>
                          <span className={styles.setupValue}>{savedSetup.symbol}</span>
                        </div>
                        <div className={styles.setupDetailRow}>
                          <span className={styles.setupLabel}>Indicator:</span>
                          <span className={styles.setupValue}>
                            {isCrossoverIndicator(savedSetup.indicatorType) 
                              ? `${savedSetup.indicatorType?.toUpperCase() || 'EMA'} ${savedSetup.emaShort}/${savedSetup.emaLong}`
                              : `${savedSetup.indicatorType.toUpperCase()} (${savedSetup.indicatorLength})`}
                          </span>
                        </div>
                        <div className={styles.setupDetailRow}>
                          <span className={styles.setupLabel}>Data Points:</span>
                          <span className={styles.setupValue}>{savedSetup.equityCurve?.length || 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Resampling Controls */}
                    <div className={styles.resamplingControls}>
                      <h4>
                        <span className="material-icons">tune</span>
                        Bootstrap Resampling Parameters
                        <span className={styles.sectionInfoIcon}>
                          <span className="material-icons">info_outline</span>
                          <div className={styles.sectionInfoTooltip}>
                            <h5>Bootstrap Resampling</h5>
                            <p>Tests strategy robustness by shuffling historical data in blocks while preserving market regime characteristics.</p>
                            <ul>
                              <li>Shuffles: Number of resampled datasets</li>
                              <li>Shows distribution of possible outcomes</li>
                              <li>Identifies if results are due to luck</li>
                            </ul>
                          </div>
                        </span>
                      </h4>
                      <p className={styles.resamplingDescription}>
                        Regime-based block bootstrap: data is divided into volatility regimes, and blocks within each regime are shuffled while preserving regime proportions.
                      </p>
                      
                      <div className={styles.resamplingInputs}>
                        <div className={styles.resamplingInputGroup}>
                          <label>Volatility Bucket Size (%)</label>
                          <input
                            type="range"
                            min={5}
                            max={50}
                            step={5}
                            value={resamplingVolatilityPercent}
                            onChange={(e) => setResamplingVolatilityPercent(parseInt(e.target.value))}
                            className={styles.resamplingSlider}
                          />
                          <div className={styles.sliderValue}>
                            {resamplingVolatilityPercent}% ({Math.ceil(100 / resamplingVolatilityPercent)} buckets)
                          </div>
                        </div>

                        <div className={styles.resamplingInputGroup}>
                          <label>Number of Shuffles</label>
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={resamplingNumShuffles}
                            onChange={(e) => setResamplingNumShuffles(Math.min(500, Math.max(1, parseInt(e.target.value) || 1)))}
                            className={styles.input}
                          />
                        </div>

                        <div className={styles.resamplingInputGroup}>
                          <label>Random Seed</label>
                          <input
                            type="number"
                            value={resamplingSeed}
                            onChange={(e) => setResamplingSeed(parseInt(e.target.value) || 42)}
                            className={styles.input}
                          />
                        </div>

                        <button
                          className={styles.calculateButton}
                          onClick={handleGenerateResampling}
                          disabled={isResamplingLoading}
                        >
                          {isResamplingLoading ? (
                            <>
                              <span className="material-icons spinning">sync</span>
                              Generating...
                            </>
                          ) : (
                            <>
                              <span className="material-icons">shuffle</span>
                              Generate Resamples
                            </>
                          )}
                        </button>

                        {resamplingResults && (
                          <button
                            className={styles.applyStrategyButton}
                            onClick={handleApplyStrategy}
                            disabled={isApplyingStrategy}
                          >
                            {isApplyingStrategy ? (
                              <>
                                <span className="material-icons spinning">sync</span>
                                Applying...
                              </>
                            ) : (
                              <>
                                <span className="material-icons">play_arrow</span>
                                Apply Position
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {resamplingError && (
                        <div className={styles.errorMessage}>
                          <span className="material-icons">error</span>
                          {resamplingError}
                        </div>
                      )}
                    </div>

                    {/* Resampling Results */}
                    {resamplingResults && (
                      <div className={styles.resamplingResults}>
                        <h4>
                          <span className="material-icons">insights</span>
                          Resampling Results
                        </h4>

                        {/* Bucket Info */}
                        <div className={styles.bucketInfo}>
                          <span className="material-icons">category</span>
                          <span>
                            {resamplingResults.bucketInfo.numBuckets} volatility buckets, {resamplingResults.bucketInfo.totalBlocks} total blocks
                          </span>
                        </div>

                        {/* Shuffle Selector */}
                        <div className={styles.shuffleSelector}>
                          <label>View Resample:</label>
                          <select
                            value={resamplingSelectedIndex}
                            onChange={(e) => setResamplingSelectedIndex(parseInt(e.target.value))}
                            className={styles.select}
                          >
                            {resamplingResults.resamples.map((r, i) => (
                              <option key={i} value={i}>
                                Shuffle #{i + 1} (Seed: {r.seed})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Side-by-side Charts */}
                        <div className={styles.resamplingCharts}>
                          {/* Original Chart */}
                          <div className={styles.resamplingChart}>
                            <h5>Original Equity Curve</h5>
                            <div className={styles.miniChart} style={{ position: 'relative' }}>
                              <svg 
                                viewBox="0 0 400 150" 
                                preserveAspectRatio="none"
                                onMouseMove={(e) => {
                                  const candles = resamplingResults.original.candles
                                  if (!candles || candles.length < 2) return
                                  const validCandles = candles.filter(c => c && typeof c.close === 'number' && !isNaN(c.close) && isFinite(c.close))
                                  if (validCandles.length < 2) return
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  const x = ((e.clientX - rect.left) / rect.width) * 400
                                  const dataIdx = Math.round((x / 400) * (validCandles.length - 1))
                                  const point = validCandles[Math.max(0, Math.min(dataIdx, validCandles.length - 1))]
                                  if (point) {
                                    const closes = validCandles.map(c => c.close)
                                    const minY = Math.min(...closes)
                                    const maxY = Math.max(...closes)
                                    const range = maxY - minY || 1
                                    const y = 140 - ((point.close - minY) / range) * 130
                                    setResamplingHover({
                                      type: 'original',
                                      x: (dataIdx / (validCandles.length - 1)) * 400,
                                      y,
                                      value: point.close,
                                      index: dataIdx
                                    })
                                  }
                                }}
                                onMouseLeave={() => setResamplingHover(null)}
                              >
                                {(() => {
                                  const candles = resamplingResults.original.candles
                                  if (!candles || candles.length < 2) return null
                                  // Filter to valid close values
                                  const validCandles = candles.filter(c => c && typeof c.close === 'number' && !isNaN(c.close) && isFinite(c.close))
                                  if (validCandles.length < 2) return null
                                  const closes = validCandles.map(c => c.close)
                                  const minY = Math.min(...closes)
                                  const maxY = Math.max(...closes)
                                  const range = maxY - minY || 1
                                  const points = validCandles.map((c, i) => {
                                    const x = (i / (validCandles.length - 1)) * 400
                                    const y = 140 - ((c.close - minY) / range) * 130
                                    return `${x.toFixed(2)},${y.toFixed(2)}`
                                  }).join(' ')
                                  return (
                                    <>
                                    <polyline
                                      points={points}
                                      fill="none"
                                      stroke="#4488ff"
                                      strokeWidth="2"
                                    />
                                      {resamplingHover && resamplingHover.type === 'original' && (
                                        <>
                                          <line x1={resamplingHover.x} y1="0" x2={resamplingHover.x} y2="150" stroke="#fff" strokeWidth="1" strokeDasharray="2,2" opacity="0.5" />
                                          <circle cx={resamplingHover.x} cy={resamplingHover.y} r="4" fill="#fff" stroke="#4488ff" strokeWidth="2" />
                                        </>
                                      )}
                                    </>
                                  )
                                })()}
                              </svg>
                              {resamplingHover && resamplingHover.type === 'original' && (
                                <div className={styles.miniChartTooltip} style={{ left: `${(resamplingHover.x / 400) * 100}%` }}>
                                  ${resamplingHover.value?.toLocaleString(undefined, {maximumFractionDigits: 0})}
                                </div>
                              )}
                            </div>
                            <div className={styles.chartMetrics}>
                              <div className={styles.metricItem}>
                                <span>Return</span>
                                <strong className={(resamplingResults.original.metrics?.totalReturn || 0) >= 0 ? styles.positive : styles.negative}>
                                  {((resamplingResults.original.metrics?.totalReturn || 0) * 100).toFixed(2)}%
                                </strong>
                              </div>
                              <div className={styles.metricItem}>
                                <span>Max DD</span>
                                <strong className={styles.negative}>
                                  {((resamplingResults.original.metrics?.maxDrawdown || 0) * 100).toFixed(2)}%
                                </strong>
                              </div>
                              <div className={styles.metricItem}>
                                <span>Volatility</span>
                                <strong>
                                  {((resamplingResults.original.metrics?.realizedVolatility || 0) * 100).toFixed(2)}%
                                </strong>
                              </div>
                            </div>
                          </div>

                          {/* Resampled Chart */}
                          <div className={styles.resamplingChart}>
                            <h5>Resampled #{resamplingSelectedIndex + 1}</h5>
                            <div className={styles.miniChart} style={{ position: 'relative' }}>
                              <svg 
                                viewBox="0 0 400 150" 
                                preserveAspectRatio="none"
                                onMouseMove={(e) => {
                                  const resample = resamplingResults.resamples[resamplingSelectedIndex]
                                  if (!resample || !resample.candles || resample.candles.length < 2) return
                                  const validCandles = resample.candles.filter(c => c && typeof c.close === 'number' && !isNaN(c.close) && isFinite(c.close))
                                  if (validCandles.length < 2) return
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  const x = ((e.clientX - rect.left) / rect.width) * 400
                                  const dataIdx = Math.round((x / 400) * (validCandles.length - 1))
                                  const point = validCandles[Math.max(0, Math.min(dataIdx, validCandles.length - 1))]
                                  if (point) {
                                    const closes = validCandles.map(c => c.close)
                                    const minY = Math.min(...closes)
                                    const maxY = Math.max(...closes)
                                    const range = maxY - minY || 1
                                    const y = 140 - ((point.close - minY) / range) * 130
                                    setResamplingHover({
                                      type: 'resampled',
                                      x: (dataIdx / (validCandles.length - 1)) * 400,
                                      y,
                                      value: point.close,
                                      index: dataIdx
                                    })
                                  }
                                }}
                                onMouseLeave={() => setResamplingHover(null)}
                              >
                                {(() => {
                                  const resample = resamplingResults.resamples[resamplingSelectedIndex]
                                  if (!resample || !resample.candles || resample.candles.length < 2) return null
                                  // Filter to valid close values
                                  const validCandles = resample.candles.filter(c => c && typeof c.close === 'number' && !isNaN(c.close) && isFinite(c.close))
                                  if (validCandles.length < 2) return null
                                  const closes = validCandles.map(c => c.close)
                                  const minY = Math.min(...closes)
                                  const maxY = Math.max(...closes)
                                  const range = maxY - minY || 1
                                  const points = validCandles.map((c, i) => {
                                    const x = (i / (validCandles.length - 1)) * 400
                                    const y = 140 - ((c.close - minY) / range) * 130
                                    return `${x.toFixed(2)},${y.toFixed(2)}`
                                  }).join(' ')
                                  return (
                                    <>
                                    <polyline
                                      points={points}
                                      fill="none"
                                      stroke="#22c55e"
                                      strokeWidth="2"
                                    />
                                      {resamplingHover && resamplingHover.type === 'resampled' && (
                                        <>
                                          <line x1={resamplingHover.x} y1="0" x2={resamplingHover.x} y2="150" stroke="#fff" strokeWidth="1" strokeDasharray="2,2" opacity="0.5" />
                                          <circle cx={resamplingHover.x} cy={resamplingHover.y} r="4" fill="#fff" stroke="#22c55e" strokeWidth="2" />
                                        </>
                                      )}
                                    </>
                                  )
                                })()}
                              </svg>
                              {resamplingHover && resamplingHover.type === 'resampled' && (
                                <div className={styles.miniChartTooltip} style={{ left: `${(resamplingHover.x / 400) * 100}%` }}>
                                  ${resamplingHover.value?.toLocaleString(undefined, {maximumFractionDigits: 0})}
                                </div>
                              )}
                            </div>
                            <div className={styles.chartMetrics}>
                              <div className={styles.metricItem}>
                                <span>Return</span>
                                <strong className={(resamplingResults.resamples[resamplingSelectedIndex]?.metrics?.totalReturn || 0) >= 0 ? styles.positive : styles.negative}>
                                  {((resamplingResults.resamples[resamplingSelectedIndex]?.metrics?.totalReturn || 0) * 100).toFixed(2)}%
                                </strong>
                              </div>
                              <div className={styles.metricItem}>
                                <span>Max DD</span>
                                <strong className={styles.negative}>
                                  {((resamplingResults.resamples[resamplingSelectedIndex]?.metrics?.maxDrawdown || 0) * 100).toFixed(2)}%
                                </strong>
                              </div>
                              <div className={styles.metricItem}>
                                <span>Volatility</span>
                                <strong>
                                  {((resamplingResults.resamples[resamplingSelectedIndex]?.metrics?.realizedVolatility || 0) * 100).toFixed(2)}%
                                </strong>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Summary Statistics */}
                        <div className={styles.resamplingSummary}>
                          <div className={styles.sectionHeaderWithExport}>
                          <h5>
                            <span className="material-icons">analytics</span>
                            Resampling Distribution Summary
                          </h5>
                            {canExportLogs && (
                              <button className={styles.exportLogButton} onClick={exportResamplingToCSV} title="Export log (Admin/Mod only)">
                                <span className="material-icons">download</span>
                                Export Log
                              </button>
                            )}
                          </div>
                          <p className={styles.summaryDescription}>
                            Statistics calculated across all {resamplingResults.resamples?.length || 0} resampled equity curves. Shows how performance varies when market data is shuffled by volatility regimes.
                          </p>
                          <div className={styles.summaryGrid}>
                            {(() => {
                              const resamples = resamplingResults.resamples || []
                              const returns = resamples.map(r => r?.metrics?.totalReturn || 0).filter(r => isFinite(r))
                              const drawdowns = resamples.map(r => r?.metrics?.maxDrawdown || 0).filter(r => isFinite(r))
                              
                              const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
                              const mean = avgReturn
                              const variance = returns.length > 0 ? returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length : 0
                              const stdDev = Math.sqrt(variance)
                              const avgDD = drawdowns.length > 0 ? drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length : 0
                              const worstDD = drawdowns.length > 0 ? Math.max(...drawdowns) : 0
                              const minReturn = returns.length > 0 ? Math.min(...returns) : 0
                              const maxReturn = returns.length > 0 ? Math.max(...returns) : 0
                              
                              return (
                                <>
                                  <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>Avg Return</span>
                                    <span className={styles.summaryValue}>
                                      {(avgReturn * 100).toFixed(2)}%
                                    </span>
                                  </div>
                                  <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>Std Dev Return</span>
                                    <span className={styles.summaryValue}>
                                      {(stdDev * 100).toFixed(2)}%
                                    </span>
                                  </div>
                                  <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>Avg Max DD</span>
                                    <span className={styles.summaryValue}>
                                      {(avgDD * 100).toFixed(2)}%
                                    </span>
                                  </div>
                                  <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>Worst DD</span>
                                    <span className={styles.summaryValue}>
                                      {(worstDD * 100).toFixed(2)}%
                                    </span>
                                  </div>
                                  <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>Min Return</span>
                                    <span className={styles.summaryValue}>
                                      {(minReturn * 100).toFixed(2)}%
                                    </span>
                                  </div>
                                  <div className={styles.summaryItem}>
                                    <span className={styles.summaryLabel}>Max Return</span>
                                    <span className={styles.summaryValue}>
                                      {(maxReturn * 100).toFixed(2)}%
                                    </span>
                                  </div>
                                </>
                              )
                            })()}
                          </div>
                        </div>

                        {/* Strategy Application Results */}
                        {resamplingStrategyResults && (
                          <div className={styles.strategyResultsSection}>
                            <h4>
                              <span className="material-icons">trending_up</span>
                              Strategy Performance on Resampled Data
                            </h4>
                            
                            <div className={styles.strategyInfo}>
                              <span className="material-icons">settings</span>
                              <span>
                                {isCrossoverIndicator(savedSetup?.indicatorType) 
                                  ? `${savedSetup?.indicatorType?.toUpperCase() || 'EMA'} ${savedSetup?.emaShort}/${savedSetup?.emaLong}`
                                  : `${savedSetup?.indicatorType?.toUpperCase()} (${savedSetup?.indicatorLength})`
                                } | {savedSetup?.positionType?.replace('_', ' ')}
                              </span>
                            </div>

                            {/* Original vs Selected Resample Comparison */}
                            <div className={styles.strategyComparison}>
                              {/* Original Strategy Results */}
                              <div className={styles.strategyCard}>
                                <h5>Original Data</h5>
                                <div className={styles.strategyMetrics}>
                                  <div className={styles.metricRow}>
                                    <span>Total Return</span>
                                    <strong className={(resamplingStrategyResults.original?.metrics?.totalReturn || 0) >= 0 ? styles.positive : styles.negative}>
                                      {((resamplingStrategyResults.original?.metrics?.totalReturn || 0) * 100).toFixed(2)}%
                                    </strong>
                                  </div>
                                  <div className={styles.metricRow}>
                                    <span>Final Equity</span>
                                    <strong>${(resamplingStrategyResults.original?.metrics?.finalEquity || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}</strong>
                                  </div>
                                  <div className={styles.metricRow}>
                                    <span>Win Rate</span>
                                    <strong>{((resamplingStrategyResults.original?.metrics?.winRate || 0) * 100).toFixed(1)}%</strong>
                                  </div>
                                  <div className={styles.metricRow}>
                                    <span>Profit Factor</span>
                                    <strong>{(resamplingStrategyResults.original?.metrics?.profitFactor || 0).toFixed(2)}</strong>
                                  </div>
                                  <div className={styles.metricRow}>
                                    <span>Max Drawdown</span>
                                    <strong className={styles.negative}>{((resamplingStrategyResults.original?.metrics?.maxDrawdown || 0) * 100).toFixed(2)}%</strong>
                                  </div>
                                  <div className={styles.metricRow}>
                                    <span>Trades</span>
                                    <strong>{resamplingStrategyResults.original?.metrics?.numTrades || 0}</strong>
                                  </div>
                                </div>
                              </div>

                              {/* Selected Resample Strategy Results */}
                              <div className={styles.strategyCard}>
                                <h5>Resample #{resamplingSelectedIndex + 1}</h5>
                                {(() => {
                                  const selectedResult = resamplingStrategyResults.resamples[resamplingSelectedIndex]
                                  return (
                                    <div className={styles.strategyMetrics}>
                                      <div className={styles.metricRow}>
                                        <span>Total Return</span>
                                        <strong className={(selectedResult?.metrics?.totalReturn || 0) >= 0 ? styles.positive : styles.negative}>
                                          {((selectedResult?.metrics?.totalReturn || 0) * 100).toFixed(2)}%
                                        </strong>
                                      </div>
                                      <div className={styles.metricRow}>
                                        <span>Final Equity</span>
                                        <strong>${(selectedResult?.metrics?.finalEquity || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}</strong>
                                      </div>
                                      <div className={styles.metricRow}>
                                        <span>Win Rate</span>
                                        <strong>{((selectedResult?.metrics?.winRate || 0) * 100).toFixed(1)}%</strong>
                                      </div>
                                      <div className={styles.metricRow}>
                                        <span>Profit Factor</span>
                                        <strong>{(selectedResult?.metrics?.profitFactor || 0).toFixed(2)}</strong>
                                      </div>
                                      <div className={styles.metricRow}>
                                        <span>Max Drawdown</span>
                                        <strong className={styles.negative}>{((selectedResult?.metrics?.maxDrawdown || 0) * 100).toFixed(2)}%</strong>
                                      </div>
                                      <div className={styles.metricRow}>
                                        <span>Trades</span>
                                        <strong>{selectedResult?.metrics?.numTrades || 0}</strong>
                                      </div>
                                    </div>
                                  )
                                })()}
                              </div>
                            </div>

                            {/* Distribution Summary */}
                            <div className={styles.distributionSummary}>
                              <h5>
                                <span className="material-icons">bar_chart</span>
                                Strategy Performance Distribution
                              </h5>
                              <div className={styles.distributionGrid}>
                                <div className={styles.distItem}>
                                  <span>Avg Return</span>
                                  <strong className={(resamplingStrategyResults.distribution?.avgReturn || 0) >= 0 ? styles.positive : styles.negative}>
                                    {((resamplingStrategyResults.distribution?.avgReturn || 0) * 100).toFixed(2)}%
                                  </strong>
                                </div>
                                <div className={styles.distItem}>
                                  <span>Return Range</span>
                                  <strong>
                                    {((resamplingStrategyResults.distribution?.minReturn || 0) * 100).toFixed(1)}% to {((resamplingStrategyResults.distribution?.maxReturn || 0) * 100).toFixed(1)}%
                                  </strong>
                                </div>
                                <div className={styles.distItem}>
                                  <span>Avg Win Rate</span>
                                  <strong>{((resamplingStrategyResults.distribution?.avgWinRate || 0) * 100).toFixed(1)}%</strong>
                                </div>
                                <div className={styles.distItem}>
                                  <span>Avg Drawdown</span>
                                  <strong className={styles.negative}>{((resamplingStrategyResults.distribution?.avgDrawdown || 0) * 100).toFixed(2)}%</strong>
                                </div>
                                <div className={styles.distItem}>
                                  <span>Worst Drawdown</span>
                                  <strong className={styles.negative}>{((resamplingStrategyResults.distribution?.worstDrawdown || 0) * 100).toFixed(2)}%</strong>
                                </div>
                                <div className={styles.distItem}>
                                  <span>Original vs Avg</span>
                                  <strong className={((resamplingStrategyResults.original?.metrics?.totalReturn || 0) >= (resamplingStrategyResults.distribution?.avgReturn || 0)) ? styles.positive : styles.negative}>
                                    {((resamplingStrategyResults.original?.metrics?.totalReturn || 0) >= (resamplingStrategyResults.distribution?.avgReturn || 0)) ? 'Outperformed' : 'Underperformed'}
                                  </strong>
                                </div>
                              </div>
                            </div>

                            {/* Equity Curves Comparison */}
                            <div className={styles.equityComparison}>
                              <h5>Equity Curves</h5>
                              <div className={styles.equityCharts}>
                                <div className={styles.equityChart}>
                                  <span className={styles.equityLabel}>Original</span>
                                  <div className={styles.miniEquityChart}>
                                    <svg viewBox="0 0 400 100" preserveAspectRatio="none">
                                      {(() => {
                                        const equity = resamplingStrategyResults.original?.equity || []
                                        if (equity.length < 2) return null
                                        const values = equity.map(e => e.value).filter(v => isFinite(v))
                                        if (values.length < 2) return null
                                        const minY = Math.min(...values)
                                        const maxY = Math.max(...values)
                                        const range = maxY - minY || 1
                                        const points = equity.map((e, i) => {
                                          const x = (i / (equity.length - 1)) * 400
                                          const y = 95 - ((e.value - minY) / range) * 90
                                          return `${x.toFixed(2)},${y.toFixed(2)}`
                                        }).join(' ')
                                        return <polyline points={points} fill="none" stroke="#4488ff" strokeWidth="2" />
                                      })()}
                                    </svg>
                                  </div>
                                </div>
                                <div className={styles.equityChart}>
                                  <span className={styles.equityLabel}>Resample #{resamplingSelectedIndex + 1}</span>
                                  <div className={styles.miniEquityChart}>
                                    <svg viewBox="0 0 400 100" preserveAspectRatio="none">
                                      {(() => {
                                        const selectedResult = resamplingStrategyResults.resamples[resamplingSelectedIndex]
                                        const equity = selectedResult?.equity || []
                                        if (equity.length < 2) return null
                                        const values = equity.map(e => e.value).filter(v => isFinite(v))
                                        if (values.length < 2) return null
                                        const minY = Math.min(...values)
                                        const maxY = Math.max(...values)
                                        const range = maxY - minY || 1
                                        const points = equity.map((e, i) => {
                                          const x = (i / (equity.length - 1)) * 400
                                          const y = 95 - ((e.value - minY) / range) * 90
                                          return `${x.toFixed(2)},${y.toFixed(2)}`
                                        }).join(' ')
                                        return <polyline points={points} fill="none" stroke="#22c55e" strokeWidth="2" />
                                      })()}
                                    </svg>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={styles.placeholderContent}>
                    <span className="material-icons">info</span>
                    <p>Please validate a strategy in the "Strategy Robust Test" section and save the setup to use it here.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Monte Carlo Simulation Section */}
          <div className={styles.collapsibleSection}>
            <div 
              className={styles.sectionHeader}
              onClick={() => toggleSection('simulation')}
            >
              <h2>
                <span className="material-icons">science</span>
                Monte Carlo Simulation
                <span className={styles.sectionInfoIcon} onClick={(e) => e.stopPropagation()}>
                  <span className="material-icons">info_outline</span>
                  <div className={styles.sectionInfoTooltip}>
                    <h5>Monte Carlo Simulation</h5>
                    <p>Simulates thousands of possible equity paths by shuffling trade order to understand the range of outcomes your strategy could produce.</p>
                    <ul>
                      <li>Shows best/worst case scenarios</li>
                      <li>Provides confidence intervals (5th-95th %)</li>
                      <li>Reveals role of luck in your results</li>
                    </ul>
                  </div>
                </span>
                {monteCarloResults && (
                  <span className={styles.completedBadge} title="Section completed">
                    <span className="material-icons">check_circle</span>
                  </span>
                )}
              </h2>
              <span className={`material-icons ${styles.chevron} ${expandedSections.simulation ? styles.expanded : ''}`}>
                expand_more
              </span>
            </div>
            
            {expandedSections.simulation && (
              <div className={styles.sectionContent}>
                {savedSetup ? (
                  <div className={styles.monteCarloContainer}>
                    {/* Setup Info */}
                    <div className={styles.savedSetupInfo}>
                      <div className={styles.savedSetupHeader}>
                        <span className="material-icons">check_circle</span>
                        <h4>Using Saved Validated Setup</h4>
                      </div>
                      <div className={styles.savedSetupDetails}>
                        <div className={styles.setupDetailRow}>
                          <span className={styles.setupLabel}>Asset:</span>
                          <span className={styles.setupValue}>{savedSetup.symbol}</span>
                        </div>
                        <div className={styles.setupDetailRow}>
                          <span className={styles.setupLabel}>Trades:</span>
                          <span className={styles.setupValue}>{savedSetup.strategyReturns?.length || 0}</span>
                        </div>
                        <div className={styles.setupDetailRow}>
                          <span className={styles.setupLabel}>Initial Capital:</span>
                          <span className={styles.setupValue}>${savedSetup.initialCapital?.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Simulation Controls */}
                    <div className={styles.monteCarloControls}>
                      <h4>
                        <span className="material-icons">tune</span>
                        Simulation Parameters
                        <span className={styles.sectionInfoIcon}>
                          <span className="material-icons">info_outline</span>
                          <div className={styles.sectionInfoTooltip}>
                            <h5>Monte Carlo Simulation</h5>
                            <p>Shuffles trade order thousands of times to show all possible equity paths and outcomes.</p>
                            <ul>
                              <li>Reveals luck vs. skill in results</li>
                              <li>Shows worst-case drawdown scenarios</li>
                              <li>Provides confidence intervals for returns</li>
                            </ul>
                          </div>
                        </span>
                      </h4>
                      <p className={styles.monteCarloDescription}>
                        Monte Carlo simulation shuffles the order of trades to show the range of possible equity paths. This helps understand the role of luck vs. skill in your results.
                      </p>
                      
                      <div className={styles.monteCarloInputs}>
                        <div className={styles.inputGroup}>
                          <label>Number of Simulations</label>
                          <input
                            type="number"
                            min={100}
                            max={10000}
                            step={100}
                            value={monteCarloNumSims}
                            onChange={(e) => setMonteCarloNumSims(Math.min(10000, Math.max(100, parseInt(e.target.value) || 1000)))}
                            className={styles.input}
                          />
                        </div>

                        <div className={styles.inputGroup}>
                          <label>Random Seed</label>
                          <input
                            type="number"
                            value={monteCarloSeed}
                            onChange={(e) => setMonteCarloSeed(parseInt(e.target.value) || 42)}
                            className={styles.input}
                          />
                        </div>

                        <button
                          className={styles.calculateButton}
                          onClick={handleRunMonteCarlo}
                          disabled={isMonteCarloLoading || !savedSetup?.strategyReturns?.length}
                        >
                          {isMonteCarloLoading ? (
                            <>
                              <span className="material-icons spinning">sync</span>
                              Simulating...
                            </>
                          ) : (
                            <>
                              <span className="material-icons">casino</span>
                              Run Simulation
                            </>
                          )}
                        </button>
                      </div>

                      {monteCarloError && (
                        <div className={styles.errorMessage}>
                          <span className="material-icons">error</span>
                          {monteCarloError}
                        </div>
                      )}
                    </div>

                    {/* Monte Carlo Results */}
                    {monteCarloResults && (
                      <div className={styles.monteCarloResults}>
                        <div className={styles.sectionHeaderWithExport}>
                        <h4>
                          <span className="material-icons">insights</span>
                          Simulation Results ({monteCarloResults.statistics.numSimulations.toLocaleString()} runs)
                        </h4>
                          {canExportLogs && (
                            <button className={styles.exportLogButton} onClick={exportMonteCarloToCSV} title="Export log (Admin/Mod only)">
                              <span className="material-icons">download</span>
                              Export Log
                            </button>
                          )}
                        </div>

                        {/* Monte Carlo Equity Paths Chart */}
                        <MonteCarloChart
                          simulations={monteCarloResults.simulations}
                          statistics={monteCarloResults.statistics}
                          initialCapital={savedSetup.initialCapital}
                          maxPathsToShow={100}
                          height={350}
                        />

                        {/* Percentile Distribution Cards */}
                        <div className={styles.percentileSection}>
                          <h5>
                            <span className="material-icons">trending_up</span>
                            Total Return Distribution
                          </h5>
                          <div className={styles.percentileCards}>
                            <div className={styles.percentileCard}>
                              <span className={styles.percentileLabel}>5th Percentile</span>
                              <span className={`${styles.percentileValue} ${monteCarloResults.statistics.totalReturn.p5 >= 0 ? styles.positive : styles.negative}`}>
                                {(monteCarloResults.statistics.totalReturn.p5 * 100).toFixed(2)}%
                              </span>
                              <span className={styles.percentileNote}>Worst case</span>
                            </div>
                            <div className={styles.percentileCard}>
                              <span className={styles.percentileLabel}>25th Percentile</span>
                              <span className={`${styles.percentileValue} ${monteCarloResults.statistics.totalReturn.p25 >= 0 ? styles.positive : styles.negative}`}>
                                {(monteCarloResults.statistics.totalReturn.p25 * 100).toFixed(2)}%
                              </span>
                              <span className={styles.percentileNote}>Q1</span>
                            </div>
                            <div className={`${styles.percentileCard} ${styles.highlight}`}>
                              <span className={styles.percentileLabel}>Median (50th)</span>
                              <span className={`${styles.percentileValue} ${monteCarloResults.statistics.totalReturn.median >= 0 ? styles.positive : styles.negative}`}>
                                {(monteCarloResults.statistics.totalReturn.median * 100).toFixed(2)}%
                              </span>
                              <span className={styles.percentileNote}>Typical outcome</span>
                            </div>
                            <div className={styles.percentileCard}>
                              <span className={styles.percentileLabel}>75th Percentile</span>
                              <span className={`${styles.percentileValue} ${monteCarloResults.statistics.totalReturn.p75 >= 0 ? styles.positive : styles.negative}`}>
                                {(monteCarloResults.statistics.totalReturn.p75 * 100).toFixed(2)}%
                              </span>
                              <span className={styles.percentileNote}>Q3</span>
                            </div>
                            <div className={styles.percentileCard}>
                              <span className={styles.percentileLabel}>95th Percentile</span>
                              <span className={`${styles.percentileValue} ${monteCarloResults.statistics.totalReturn.p95 >= 0 ? styles.positive : styles.negative}`}>
                                {(monteCarloResults.statistics.totalReturn.p95 * 100).toFixed(2)}%
                              </span>
                              <span className={styles.percentileNote}>Best case</span>
                            </div>
                          </div>
                        </div>

                        {/* Return Histogram */}
                        <div className={styles.histogramSection}>
                          <h5>Return Distribution Histogram</h5>
                          <div className={styles.histogram}>
                            {monteCarloResults.histograms?.returns?.map((bin, i) => {
                              const maxFreq = Math.max(...monteCarloResults.histograms.returns.map(b => b.frequency))
                              const height = (bin.frequency / maxFreq) * 100
                              const midValue = (bin.min + bin.max) / 2
                              const isPositive = midValue >= 0
                              return (
                                <div 
                                  key={i} 
                                  className={styles.histogramBar}
                                  style={{ height: `${height}%` }}
                                  title={`${(bin.min * 100).toFixed(1)}% to ${(bin.max * 100).toFixed(1)}%: ${bin.count} simulations`}
                                >
                                  <div 
                                    className={`${styles.histogramFill} ${isPositive ? styles.positive : styles.negative}`}
                                  />
                                </div>
                              )
                            })}
                          </div>
                          <div className={styles.histogramLabels}>
                            <span>{(monteCarloResults.statistics.totalReturn.min * 100).toFixed(0)}%</span>
                            <span>0%</span>
                            <span>{(monteCarloResults.statistics.totalReturn.max * 100).toFixed(0)}%</span>
                          </div>
                        </div>

                        {/* Max Drawdown Distribution */}
                        <div className={styles.percentileSection}>
                          <h5>
                            <span className="material-icons">trending_down</span>
                            Max Drawdown Distribution
                          </h5>
                          <div className={styles.percentileCards}>
                            <div className={styles.percentileCard}>
                              <span className={styles.percentileLabel}>Best (Min DD)</span>
                              <span className={`${styles.percentileValue} ${styles.negative}`}>
                                {(monteCarloResults.statistics.maxDrawdown.min * 100).toFixed(2)}%
                              </span>
                            </div>
                            <div className={styles.percentileCard}>
                              <span className={styles.percentileLabel}>25th Percentile</span>
                              <span className={`${styles.percentileValue} ${styles.negative}`}>
                                {(monteCarloResults.statistics.maxDrawdown.p25 * 100).toFixed(2)}%
                              </span>
                            </div>
                            <div className={`${styles.percentileCard} ${styles.highlight}`}>
                              <span className={styles.percentileLabel}>Median (50th)</span>
                              <span className={`${styles.percentileValue} ${styles.negative}`}>
                                {(monteCarloResults.statistics.maxDrawdown.median * 100).toFixed(2)}%
                              </span>
                            </div>
                            <div className={styles.percentileCard}>
                              <span className={styles.percentileLabel}>75th Percentile</span>
                              <span className={`${styles.percentileValue} ${styles.negative}`}>
                                {(monteCarloResults.statistics.maxDrawdown.p75 * 100).toFixed(2)}%
                              </span>
                            </div>
                            <div className={styles.percentileCard}>
                              <span className={styles.percentileLabel}>Worst (Max DD)</span>
                              <span className={`${styles.percentileValue} ${styles.negative}`}>
                                {(monteCarloResults.statistics.maxDrawdown.max * 100).toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Final Equity Distribution */}
                        <div className={styles.percentileSection}>
                          <h5>
                            <span className="material-icons">account_balance</span>
                            Final Equity Distribution
                          </h5>
                          <div className={styles.percentileCards}>
                            <div className={styles.percentileCard}>
                              <span className={styles.percentileLabel}>Minimum</span>
                              <span className={styles.percentileValue}>
                                ${monteCarloResults.statistics.finalEquity.min.toLocaleString(undefined, {maximumFractionDigits: 0})}
                              </span>
                            </div>
                            <div className={styles.percentileCard}>
                              <span className={styles.percentileLabel}>25th Percentile</span>
                              <span className={styles.percentileValue}>
                                ${monteCarloResults.statistics.finalEquity.p25.toLocaleString(undefined, {maximumFractionDigits: 0})}
                              </span>
                            </div>
                            <div className={`${styles.percentileCard} ${styles.highlight}`}>
                              <span className={styles.percentileLabel}>Median (50th)</span>
                              <span className={styles.percentileValue}>
                                ${monteCarloResults.statistics.finalEquity.median.toLocaleString(undefined, {maximumFractionDigits: 0})}
                              </span>
                            </div>
                            <div className={styles.percentileCard}>
                              <span className={styles.percentileLabel}>75th Percentile</span>
                              <span className={styles.percentileValue}>
                                ${monteCarloResults.statistics.finalEquity.p75.toLocaleString(undefined, {maximumFractionDigits: 0})}
                              </span>
                            </div>
                            <div className={styles.percentileCard}>
                              <span className={styles.percentileLabel}>Maximum</span>
                              <span className={styles.percentileValue}>
                                ${monteCarloResults.statistics.finalEquity.max.toLocaleString(undefined, {maximumFractionDigits: 0})}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Risk Summary */}
                        <div className={styles.riskSummary}>
                          <h5>
                            <span className="material-icons">security</span>
                            Risk Analysis
                          </h5>
                          <div className={styles.riskGrid}>
                            <div className={styles.riskItem}>
                              <span className={styles.riskLabel}>Probability of Profit</span>
                              <span className={`${styles.riskValue} ${monteCarloResults.statistics.probabilityOfProfit >= 0.5 ? styles.positive : styles.negative}`}>
                                {(monteCarloResults.statistics.probabilityOfProfit * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className={styles.riskItem}>
                              <span className={styles.riskLabel}>Probability of Loss</span>
                              <span className={`${styles.riskValue} ${styles.negative}`}>
                                {(monteCarloResults.statistics.probabilityOfLoss * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className={styles.riskItem}>
                              <span className={styles.riskLabel}>Expected Return (Mean)</span>
                              <span className={`${styles.riskValue} ${monteCarloResults.statistics.totalReturn.mean >= 0 ? styles.positive : styles.negative}`}>
                                {(monteCarloResults.statistics.totalReturn.mean * 100).toFixed(2)}%
                              </span>
                            </div>
                            <div className={styles.riskItem}>
                              <span className={styles.riskLabel}>Expected Max DD (Mean)</span>
                              <span className={`${styles.riskValue} ${styles.negative}`}>
                                {(monteCarloResults.statistics.maxDrawdown.mean * 100).toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={styles.placeholderContent}>
                    <span className="material-icons">info</span>
                    <p>Please validate a strategy in the "Strategy Robust Test" section and save the setup to use it here.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Statistical Significance Testing Section */}
          <div className={styles.collapsibleSection}>
            <div 
              className={styles.sectionHeader}
              onClick={() => toggleSection('significance')}
            >
              <h2>
                <span className="material-icons">track_changes</span>
                Statistical Significance Testing
                <span className={styles.sectionInfoIcon} onClick={(e) => e.stopPropagation()}>
                  <span className="material-icons">info_outline</span>
                  <div className={styles.sectionInfoTooltip}>
                    <h5>Hypothesis Testing</h5>
                    <p>Statistically validate whether your strategy's performance is significantly different from zero or random chance.</p>
                    <ul>
                      <li>One-sample: Test if mean return ≠ 0</li>
                      <li>Two-sample: Compare two groups</li>
                      <li>Shows p-value and confidence intervals</li>
                    </ul>
                  </div>
                </span>
                {hypothesisResults && (
                  <span className={styles.completedBadge} title="Section completed">
                    <span className="material-icons">check_circle</span>
                  </span>
                )}
              </h2>
              <span className={`material-icons ${styles.chevron} ${expandedSections.significance ? styles.expanded : ''}`}>
                expand_more
              </span>
            </div>
            
            {expandedSections.significance && (
              <div className={styles.sectionContent}>
                {savedSetup ? (
                  <div className={styles.hypothesisContainer}>
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
                          <div className={styles.stepInfo}>
                            <span className={styles.stepLabel}>{label}</span>
                        </div>
                        </div>
                      ))}
                      </div>

                    {/* Step 1: State Hypotheses */}
                    {hypothesisStep === 1 && (
                      <div className={styles.hypothesisStepContent}>
                        <div className={styles.stepTitle}>
                          <span className="material-icons">edit_note</span>
                          <h4>Step 1: State Your Hypotheses</h4>
                    </div>

                        {/* Test Type Selection */}
                        <div className={styles.testTypeSelector}>
                          <label>Select Test Type</label>
                          <div className={styles.testTypeOptions}>
                            {[
                              { value: 'one-sample', label: 'One-Sample Mean', icon: 'straighten', desc: 'Compare mean to target value μ₀' },
                              { value: 'two-sample', label: 'Two-Sample Mean', icon: 'compare_arrows', desc: 'Compare means between two groups' },
                              { value: 'correlation', label: 'Correlation', icon: 'show_chart', desc: 'Test relationship between X and Y' }
                            ].map(({ value, label, icon, desc }) => (
                              <button
                                key={value}
                                className={`${styles.testTypeCard} ${hypothesisTestType === value ? styles.active : ''}`}
                                onClick={() => {
                                  setHypothesisTestType(value)
                                  setHypothesisResults(null)
                                }}
                              >
                                <span className="material-icons">{icon}</span>
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
                        <div className={styles.hypothesisConfigRow}>
                          {/* Tail Selection */}
                          <div className={styles.configGroup}>
                            <label>Test Direction (Tail)</label>
                            <div className={styles.tailSelector}>
                              {[
                                { value: 'two-sided', label: 'Two-sided (≠)' },
                                { value: 'right', label: 'Right-tailed (>)' },
                                { value: 'left', label: 'Left-tailed (<)' }
                              ].map(({ value, label }) => (
                                <button
                                  key={value}
                                  className={`${styles.tailButton} ${hypothesisTail === value ? styles.active : ''}`}
                                  onClick={() => setHypothesisTail(value)}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Alpha Selection */}
                          <div className={styles.configGroup}>
                            <label>Significance Level (α)</label>
                            <div className={styles.alphaSelector}>
                              {[0.10, 0.05, 0.01].map(a => (
                                <button
                                  key={a}
                                  className={`${styles.alphaButton} ${hypothesisAlpha === a ? styles.active : ''}`}
                                  onClick={() => setHypothesisAlpha(a)}
                                >
                                  {a}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Mu0 for one-sample */}
                          {hypothesisTestType === 'one-sample' && (
                            <div className={styles.configGroup}>
                              <label>Target Mean μ₀ (%)</label>
                          <input
                            type="number"
                                step="0.1"
                                value={hypothesisMu0}
                                onChange={(e) => setHypothesisMu0(parseFloat(e.target.value) || 0)}
                            className={styles.input}
                          />
                            </div>
                          )}
                        </div>

                        {/* Hypotheses Display */}
                        <div className={styles.hypothesesDisplay}>
                          <h5>Hypotheses</h5>
                          <div className={styles.hypothesesBox}>
                            {hypothesisTestType === 'one-sample' && (
                              <>
                                <div className={styles.hypothesisLine}>
                                  <span className={styles.h0}>H₀:</span>
                                  <span>μ = {hypothesisMu0}%</span>
                                  <span className={styles.hypothesisDesc}>(Null: Mean equals target)</span>
                                </div>
                                <div className={styles.hypothesisLine}>
                                  <span className={styles.h1}>H₁:</span>
                                  <span>μ {hypothesisTail === 'two-sided' ? '≠' : hypothesisTail === 'right' ? '>' : '<'} {hypothesisMu0}%</span>
                                  <span className={styles.hypothesisDesc}>(Alternative)</span>
                                </div>
                              </>
                            )}
                            {hypothesisTestType === 'two-sample' && (
                              <>
                                <div className={styles.hypothesisLine}>
                                  <span className={styles.h0}>H₀:</span>
                                  <span>μ₁ − μ₂ = 0</span>
                                  <span className={styles.hypothesisDesc}>(Null: No difference between groups)</span>
                                </div>
                                <div className={styles.hypothesisLine}>
                                  <span className={styles.h1}>H₁:</span>
                                  <span>μ₁ − μ₂ {hypothesisTail === 'two-sided' ? '≠' : hypothesisTail === 'right' ? '>' : '<'} 0</span>
                                  <span className={styles.hypothesisDesc}>(Alternative)</span>
                                </div>
                              </>
                            )}
                            {hypothesisTestType === 'correlation' && (
                              <>
                                <div className={styles.hypothesisLine}>
                                  <span className={styles.h0}>H₀:</span>
                                  <span>ρ = 0</span>
                                  <span className={styles.hypothesisDesc}>(Null: No correlation)</span>
                                </div>
                                <div className={styles.hypothesisLine}>
                                  <span className={styles.h1}>H₁:</span>
                                  <span>ρ {hypothesisTail === 'two-sided' ? '≠' : hypothesisTail === 'right' ? '>' : '<'} 0</span>
                                  <span className={styles.hypothesisDesc}>(Alternative)</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        <div className={styles.stepActions}>
                              <button
                            className={styles.nextStepBtn}
                            onClick={() => setHypothesisStep(2)}
                            disabled={!savedSetup?.strategyReturns?.length}
                              >
                            Next: Calculate Statistics
                            <span className="material-icons">arrow_forward</span>
                              </button>
                          </div>
                        </div>
                    )}

                    {/* Step 2: Calculate Statistics */}
                    {hypothesisStep === 2 && (
                      <div className={styles.hypothesisStepContent}>
                        <div className={styles.stepTitle}>
                          <span className="material-icons">calculate</span>
                          <h4>Step 2: Calculate Test Statistics</h4>
                      </div>

                        {/* Test Variant Toggle */}
                        <div className={styles.testVariantSelector}>
                          <label>Test Method</label>
                          {hypothesisTestType === 'one-sample' && (
                            <div className={styles.variantInfo}>
                              <span className="material-icons">info</span>
                              <span>Using One-Sample t-Test</span>
                            </div>
                          )}
                          {hypothesisTestType === 'two-sample' && (
                            <div className={styles.variantButtons}>
                      <button
                                className={`${styles.variantBtn} ${hypothesisTestVariant === 'default' ? styles.active : ''}`}
                                onClick={() => setHypothesisTestVariant('default')}
                              >
                                Welch's t-Test (unequal var.)
                              </button>
                              <button
                                className={`${styles.variantBtn} ${hypothesisTestVariant === 'pooled' ? styles.active : ''}`}
                                onClick={() => setHypothesisTestVariant('pooled')}
                              >
                                Pooled t-Test (equal var.)
                              </button>
                            </div>
                          )}
                          {hypothesisTestType === 'correlation' && (
                            <div className={styles.variantButtons}>
                              <button
                                className={`${styles.variantBtn} ${hypothesisTestVariant === 'default' || hypothesisTestVariant === 'pearson' ? styles.active : ''}`}
                                onClick={() => setHypothesisTestVariant('pearson')}
                              >
                                Pearson (linear)
                              </button>
                              <button
                                className={`${styles.variantBtn} ${hypothesisTestVariant === 'spearman' ? styles.active : ''}`}
                                onClick={() => setHypothesisTestVariant('spearman')}
                              >
                                Spearman (rank)
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Run Test Button */}
                        <button
                          className={styles.runTestBtn}
                        onClick={handleRunHypothesisTest}
                          disabled={isHypothesisLoading}
                      >
                        {isHypothesisLoading ? (
                          <>
                            <span className="material-icons spinning">sync</span>
                              Calculating...
                          </>
                        ) : (
                          <>
                              <span className="material-icons">play_arrow</span>
                            Run Hypothesis Test
                          </>
                        )}
                      </button>

                      {hypothesisError && (
                        <div className={styles.errorMessage}>
                          <span className="material-icons">error</span>
                          {hypothesisError}
                        </div>
                      )}

                        <div className={styles.stepActions}>
                          <button className={styles.backStepBtn} onClick={() => setHypothesisStep(1)}>
                            <span className="material-icons">arrow_back</span>
                            Back
                          </button>
                    </div>
                      </div>
                    )}

                    {/* Step 3: Interpret Results */}
                    {hypothesisStep === 3 && hypothesisResults && (
                      <div className={styles.hypothesisStepContent}>
                        <div className={styles.stepTitle}>
                          <span className="material-icons">insights</span>
                          <h4>Step 3: Interpretation & Results</h4>
                        </div>

                        {/* Decision Banner */}
                        <div className={`${styles.decisionBanner} ${
                          hypothesisResults.rejectNull ? styles.reject : styles.fail
                        }`}>
                          <span className="material-icons">
                            {hypothesisResults.rejectNull ? 'gavel' : 'pending'}
                          </span>
                          <div>
                            <strong>{hypothesisResults.decision}</strong>
                            <p>{hypothesisResults.interpretation}</p>
                          </div>
                        </div>

                        {/* Visualization */}
                        <div className={styles.visualizationCard}>
                          <h5>
                            <span className="material-icons">bar_chart</span>
                            Visualization
                          </h5>
                          {hypothesisResults.testType === 'one-sample' && hypothesisResults.data && (
                            <div className={styles.histogramContainer}>
                              <svg viewBox="0 0 400 200" className={styles.histogramSvg}>
                                {/* Generate histogram bars */}
                                {(() => {
                                  const data = hypothesisResults.data
                                  const min = Math.min(...data)
                                  const max = Math.max(...data)
                                  const range = max - min || 1
                                  const binCount = 15
                                  const binWidth = range / binCount
                                  const bins = Array(binCount).fill(0)
                                  data.forEach(v => {
                                    const binIdx = Math.min(Math.floor((v - min) / binWidth), binCount - 1)
                                    bins[binIdx]++
                                  })
                                  const maxBin = Math.max(...bins) || 1
                                  const barWidth = 380 / binCount
                                  
                                  return (
                                    <>
                                      {bins.map((count, i) => (
                                        <rect
                                          key={i}
                                          x={10 + i * barWidth}
                                          y={180 - (count / maxBin) * 160}
                                          width={barWidth - 2}
                                          height={(count / maxBin) * 160}
                                          fill="rgba(68, 136, 255, 0.6)"
                                          rx={2}
                                        />
                                      ))}
                                      {/* Mu0 line */}
                                      {(() => {
                                        const mu0Pos = 10 + ((hypothesisResults.mu0Display - min) / range) * 380
                                        if (mu0Pos >= 10 && mu0Pos <= 390) {
                                          return (
                                            <>
                                              <line x1={mu0Pos} y1={20} x2={mu0Pos} y2={180} stroke="#ff4444" strokeWidth={2} strokeDasharray="5,3" />
                                              <text x={mu0Pos} y={15} fill="#ff4444" fontSize="10" textAnchor="middle">μ₀={hypothesisResults.mu0Display}%</text>
                                            </>
                                          )
                                        }
                                        return null
                                      })()}
                                      {/* Mean line */}
                                      {(() => {
                                        const meanPos = 10 + ((hypothesisResults.mean * 100 - min) / range) * 380
                                        return (
                                          <>
                                            <line x1={meanPos} y1={20} x2={meanPos} y2={180} stroke="#00d4aa" strokeWidth={2} />
                                            <text x={meanPos} y={195} fill="#00d4aa" fontSize="10" textAnchor="middle">x̄={(hypothesisResults.mean * 100).toFixed(1)}%</text>
                                          </>
                                        )
                                      })()}
                                    </>
                                  )
                                })()}
                              </svg>
                              <div className={styles.chartLegend}>
                                <span><span style={{color: '#00d4aa'}}>━</span> Sample Mean</span>
                                <span><span style={{color: '#ff4444'}}>┅</span> Target μ₀</span>
                          </div>
                          </div>
                          )}
                          {hypothesisResults.testType === 'two-sample' && (
                            <div className={styles.boxplotContainer}>
                              <svg viewBox="0 0 400 200" className={styles.boxplotSvg}>
                                {/* Group 1 box */}
                                <rect x={60} y={50} width={80} height={100} fill="rgba(68, 136, 255, 0.3)" stroke="#4488ff" strokeWidth={2} rx={4} />
                                <line x1={100} y1={70} x2={100} y2={130} stroke="#4488ff" strokeWidth={3} />
                                <text x={100} y={170} fill="#888" fontSize="11" textAnchor="middle">Group 1 (First Half)</text>
                                <text x={100} y={40} fill="#4488ff" fontSize="12" textAnchor="middle">{(hypothesisResults.mean1 * 100).toFixed(2)}%</text>
                                
                                {/* Group 2 box */}
                                <rect x={260} y={50} width={80} height={100} fill="rgba(0, 212, 170, 0.3)" stroke="#00d4aa" strokeWidth={2} rx={4} />
                                <line x1={300} y1={70} x2={300} y2={130} stroke="#00d4aa" strokeWidth={3} />
                                <text x={300} y={170} fill="#888" fontSize="11" textAnchor="middle">Group 2 (Second Half)</text>
                                <text x={300} y={40} fill="#00d4aa" fontSize="12" textAnchor="middle">{(hypothesisResults.mean2 * 100).toFixed(2)}%</text>
                                
                                {/* Difference arrow */}
                                <line x1={150} y1={100} x2={250} y2={100} stroke="#888" strokeWidth={1} strokeDasharray="3,3" />
                                <text x={200} y={95} fill="#fff" fontSize="11" textAnchor="middle">Δ = {(hypothesisResults.diff * 100).toFixed(2)}%</text>
                              </svg>
                          </div>
                          )}
                          {hypothesisResults.testType === 'correlation' && hypothesisResults.xData && (
                            <div className={styles.scatterContainer}>
                              <svg viewBox="0 0 400 200" className={styles.scatterSvg}>
                                {/* Scatter points */}
                                {hypothesisResults.xData.map((x, i) => {
                                  const xPos = 40 + ((x - 1) / (hypothesisResults.xData.length - 1)) * 340
                                  const yMin = Math.min(...hypothesisResults.yData)
                                  const yMax = Math.max(...hypothesisResults.yData)
                                  const yRange = yMax - yMin || 1
                                  const yPos = 180 - ((hypothesisResults.yData[i] - yMin) / yRange) * 160
                                  return <circle key={i} cx={xPos} cy={yPos} r={3} fill="rgba(68, 136, 255, 0.7)" />
                                })}
                                {/* Regression line */}
                                {(() => {
                                  const yMin = Math.min(...hypothesisResults.yData)
                                  const yMax = Math.max(...hypothesisResults.yData)
                                  const yRange = yMax - yMin || 1
                                  const y1 = hypothesisResults.intercept + hypothesisResults.slope * 1
                                  const y2 = hypothesisResults.intercept + hypothesisResults.slope * hypothesisResults.xData.length
                                  const y1Pos = 180 - ((y1 - yMin) / yRange) * 160
                                  const y2Pos = 180 - ((y2 - yMin) / yRange) * 160
                                  return <line x1={40} y1={y1Pos} x2={380} y2={y2Pos} stroke="#00d4aa" strokeWidth={2} />
                                })()}
                                {/* Axes labels */}
                                <text x={200} y={195} fill="#888" fontSize="10" textAnchor="middle">Trade Sequence →</text>
                                <text x={15} y={100} fill="#888" fontSize="10" textAnchor="middle" transform="rotate(-90, 15, 100)">Return %</text>
                              </svg>
                              <div className={styles.chartLegend}>
                                <span>r = {hypothesisResults.r.toFixed(3)}</span>
                                <span>r² = {hypothesisResults.rSquared.toFixed(3)}</span>
                          </div>
                          </div>
                          )}
                        </div>

                        {/* Summary Table */}
                        <div className={styles.summaryTable}>
                          <h5>
                            <span className="material-icons">table_chart</span>
                            Summary Statistics
                          </h5>
                          <table>
                            <tbody>
                              <tr><td>Test Type</td><td>{hypothesisResults.testName}</td></tr>
                              <tr><td>Tail</td><td>{hypothesisResults.tail === 'two-sided' ? 'Two-sided' : hypothesisResults.tail === 'right' ? 'Right-tailed' : 'Left-tailed'}</td></tr>
                              <tr><td>Significance Level (α)</td><td>{hypothesisResults.alpha}</td></tr>
                              {hypothesisResults.testType === 'one-sample' && (
                                <>
                                  <tr><td>Sample Size (n)</td><td>{hypothesisResults.n}</td></tr>
                                  <tr><td>Sample Mean (x̄)</td><td>{(hypothesisResults.mean * 100).toFixed(4)}%</td></tr>
                                  <tr><td>Sample Std Dev (s)</td><td>{(hypothesisResults.std * 100).toFixed(4)}%</td></tr>
                                  <tr><td>Standard Error</td><td>{(hypothesisResults.se * 100).toFixed(4)}%</td></tr>
                                </>
                              )}
                              {hypothesisResults.testType === 'two-sample' && (
                                <>
                                  <tr><td>n₁ / n₂</td><td>{hypothesisResults.n1} / {hypothesisResults.n2}</td></tr>
                                  <tr><td>Mean₁ / Mean₂</td><td>{(hypothesisResults.mean1 * 100).toFixed(3)}% / {(hypothesisResults.mean2 * 100).toFixed(3)}%</td></tr>
                                  <tr><td>Std₁ / Std₂</td><td>{(hypothesisResults.std1 * 100).toFixed(3)}% / {(hypothesisResults.std2 * 100).toFixed(3)}%</td></tr>
                                </>
                              )}
                              {hypothesisResults.testType === 'correlation' && (
                                <>
                                  <tr><td>Sample Size (n)</td><td>{hypothesisResults.n}</td></tr>
                                  <tr><td>Correlation (r)</td><td>{hypothesisResults.r.toFixed(4)}</td></tr>
                                  <tr><td>R-squared (r²)</td><td>{hypothesisResults.rSquared.toFixed(4)}</td></tr>
                                </>
                              )}
                              <tr><td>Test Statistic (t)</td><td>{hypothesisResults.tStatistic.toFixed(4)}</td></tr>
                              <tr><td>Degrees of Freedom (df)</td><td>{typeof hypothesisResults.df === 'number' ? hypothesisResults.df.toFixed(2) : hypothesisResults.df}</td></tr>
                              <tr className={hypothesisResults.pValue <= hypothesisResults.alpha ? styles.significantRow : ''}>
                                <td>p-value</td>
                                <td>{hypothesisResults.pValue < 0.0001 ? '< 0.0001' : hypothesisResults.pValue.toFixed(4)}</td>
                              </tr>
                              <tr><td>{hypothesisResults.testType === 'correlation' ? 'CI for r' : 'CI for Mean'} ({((1 - hypothesisResults.alpha) * 100).toFixed(0)}%)</td><td>[{(hypothesisResults.ciLow * (hypothesisResults.testType === 'correlation' ? 1 : 100)).toFixed(4)}{hypothesisResults.testType !== 'correlation' ? '%' : ''}, {(hypothesisResults.ciHigh * (hypothesisResults.testType === 'correlation' ? 1 : 100)).toFixed(4)}{hypothesisResults.testType !== 'correlation' ? '%' : ''}]</td></tr>
                              {hypothesisResults.cohensD !== undefined && <tr><td>Effect Size (Cohen's d)</td><td>{hypothesisResults.cohensD.toFixed(3)} ({Math.abs(hypothesisResults.cohensD) < 0.2 ? 'negligible' : Math.abs(hypothesisResults.cohensD) < 0.5 ? 'small' : Math.abs(hypothesisResults.cohensD) < 0.8 ? 'medium' : 'large'})</td></tr>}
                              <tr className={styles.decisionRow}><td>Decision</td><td><strong>{hypothesisResults.decision}</strong></td></tr>
                            </tbody>
                          </table>
                        </div>

                        {/* Action Buttons */}
                        <div className={styles.resultActions}>
                          <button
                            className={styles.copyReportBtn}
                            onClick={() => {
                              const report = `Hypothesis Test Report\n${'='.repeat(40)}\nTest: ${hypothesisResults.testName}\nTail: ${hypothesisResults.tail}\nα: ${hypothesisResults.alpha}\np-value: ${hypothesisResults.pValue.toFixed(4)}\nDecision: ${hypothesisResults.decision}\n\n${hypothesisResults.interpretation}`
                              navigator.clipboard.writeText(report)
                              Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Report copied!', showConfirmButton: false, timer: 1500, background: '#1a1a2e', color: '#fff' })
                            }}
                          >
                            <span className="material-icons">content_copy</span>
                            Copy Report
                          </button>
                          {canExportLogs && (
                            <button className={styles.exportLogButton} onClick={exportHypothesisToCSV}>
                              <span className="material-icons">download</span>
                              Download CSV
                            </button>
                          )}
                            </div>

                        <div className={styles.stepActions}>
                          <button className={styles.backStepBtn} onClick={() => setHypothesisStep(1)}>
                            <span className="material-icons">arrow_back</span>
                            Start Over
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={styles.placeholderContent}>
                    <span className="material-icons">info</span>
                    <p>Please validate a strategy in the "Strategy Robust Test" section and save the setup to use it here.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stress Testing Section */}
          <div className={styles.collapsibleSection}>
            <div 
              className={styles.sectionHeader}
              onClick={() => toggleSection('stressTest')}
            >
              <h2>
                <span className="material-icons">warning</span>
                Stress Testing
                <span className={styles.sectionInfoIcon} onClick={(e) => e.stopPropagation()}>
                  <span className="material-icons">info_outline</span>
                  <div className={styles.sectionInfoTooltip}>
                    <h5>Stress Testing</h5>
                    <p>Tests how your strategy performs under adverse conditions by adding execution delays and testing across different time periods.</p>
                    <ul>
                      <li>Simulates slippage and delayed execution</li>
                      <li>Tests across multiple year periods</li>
                      <li>Identifies fragile strategies</li>
                    </ul>
                  </div>
                </span>
                {stressTestResults && (
                  <span className={styles.completedBadge} title="Section completed">
                    <span className="material-icons">check_circle</span>
                  </span>
                )}
              </h2>
              <span className={`material-icons ${styles.chevron} ${expandedSections.stressTest ? styles.expanded : ''}`}>
                expand_more
              </span>
            </div>
            
            {expandedSections.stressTest && (
              <div className={styles.sectionContent}>
                {savedSetup ? (
                  <div className={styles.stressTestContainer}>
                    {/* Strategy Info */}
                    <div className={styles.savedSetupInfo}>
                      <div className={styles.savedSetupHeader}>
                        <span className="material-icons">check_circle</span>
                        <h4>Using Saved Validated Setup</h4>
                      </div>
                      <div className={styles.savedSetupDetails}>
                        <div className={styles.setupDetailRow}>
                          <span className={styles.setupLabel}>Asset:</span>
                          <span className={styles.setupValue}>{savedSetup.symbol}</span>
                        </div>
                        <div className={styles.setupDetailRow}>
                          <span className={styles.setupLabel}>Indicator:</span>
                          <span className={styles.setupValue}>
                            {isCrossoverIndicator(savedSetup.indicatorType) 
                              ? `${savedSetup.indicatorType?.toUpperCase() || 'EMA'} ${savedSetup.emaShort}/${savedSetup.emaLong}`
                              : `${savedSetup.indicatorType.toUpperCase()} (${savedSetup.indicatorLength})`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Stress Test Controls */}
                    <div className={styles.stressTestControls}>
                      <h4>
                        <span className="material-icons">tune</span>
                        Test Configuration
                        <span className={styles.sectionInfoIcon}>
                          <span className="material-icons">info_outline</span>
                          <div className={styles.sectionInfoTooltip}>
                            <h5>Stress Test</h5>
                            <p>Tests strategy with delayed entries/exits to simulate real-world execution conditions.</p>
                            <ul>
                              <li>Entry delay: Bars after signal to enter</li>
                              <li>Exit delay: Bars after signal to exit</li>
                              <li>Shows how timing affects performance</li>
                            </ul>
                          </div>
                        </span>
                      </h4>
                      <p className={styles.stressTestDescription}>
                        Run your strategy across different time periods with entry/exit delays to simulate real trading conditions. 
                        Delays help account for order execution latency.
                      </p>
                      
                      <div className={styles.stressTestInputsGrid}>
                        {/* Start Year */}
                        <div className={styles.inputGroup}>
                          <label>Start Year</label>
                          <select
                            value={stressTestStartYear}
                            onChange={(e) => setStressTestStartYear(parseInt(e.target.value))}
                            className={styles.select}
                          >
                            {Array.from({ length: 15 }, (_, i) => CURRENT_YEAR - i).map(year => (
                              <option key={year} value={year}>{year}</option>
                            ))}
                          </select>
                          <span className={styles.inputHint}>Test from this year to today</span>
                        </div>

                        {/* Entry Delay */}
                        <div className={styles.inputGroup}>
                          <label>Entry Delay (Bars)</label>
                          <div className={styles.delaySelector}>
                            {[0, 1, 2, 3, 4, 5].map(delay => (
                              <button
                                key={delay}
                                className={`${styles.delayButton} ${stressTestEntryDelay === delay ? styles.active : ''}`}
                                onClick={() => setStressTestEntryDelay(delay)}
                              >
                                {delay}
                              </button>
                            ))}
                          </div>
                          <span className={styles.inputHint}>{stressTestEntryDelay === 0 ? 'Enter at signal bar close' : 'Bars after signal to enter'}</span>
                        </div>

                        {/* Exit Delay */}
                        <div className={styles.inputGroup}>
                          <label>Exit Delay (Bars)</label>
                          <div className={styles.delaySelector}>
                            {[0, 1, 2, 3, 4, 5].map(delay => (
                              <button
                                key={delay}
                                className={`${styles.delayButton} ${stressTestExitDelay === delay ? styles.active : ''}`}
                                onClick={() => setStressTestExitDelay(delay)}
                              >
                                {delay}
                              </button>
                            ))}
                          </div>
                          <span className={styles.inputHint}>{stressTestExitDelay === 0 ? 'Exit at signal bar close' : 'Bars after signal to exit'}</span>
                        </div>

                        {/* Position Type */}
                        <div className={styles.inputGroup}>
                          <label>Position Type</label>
                          <div className={styles.positionTypeSelector}>
                            <button
                              className={`${styles.positionTypeButton} ${stressTestPositionType === 'long_only' ? styles.active : ''}`}
                              onClick={() => {
                                setStressTestPositionType('long_only')
                                setStressTestResults(null) // Clear results when changing settings
                              }}
                            >
                              <span className="material-icons">trending_up</span>
                              Long Only
                            </button>
                            <button
                              className={`${styles.positionTypeButton} ${stressTestPositionType === 'short_only' ? styles.active : ''}`}
                              onClick={() => {
                                setStressTestPositionType('short_only')
                                setStressTestResults(null) // Clear results when changing settings
                              }}
                            >
                              <span className="material-icons">trending_down</span>
                              Short Only
                            </button>
                            <button
                              className={`${styles.positionTypeButton} ${stressTestPositionType === 'both' ? styles.active : ''}`}
                              onClick={() => {
                                setStressTestPositionType('both')
                                setStressTestResults(null) // Clear results when changing settings
                              }}
                            >
                              <span className="material-icons">swap_vert</span>
                              Both
                            </button>
                          </div>
                        </div>
                      </div>

                      <button
                        className={styles.calculateButton}
                        onClick={handleRunStressTest}
                        disabled={isStressTestLoading}
                      >
                        {isStressTestLoading ? (
                          <>
                            <span className="material-icons spinning">sync</span>
                            Running Stress Test...
                          </>
                        ) : (
                          <>
                            <span className="material-icons">play_arrow</span>
                            Run Stress Test
                          </>
                        )}
                      </button>

                      {stressTestError && (
                        <div className={styles.errorMessage}>
                          <span className="material-icons">error</span>
                          {stressTestError}
                        </div>
                      )}
                    </div>

                    {/* Stress Test Results */}
                    {stressTestResults && (
                      <div className={styles.stressTestResults}>
                        <div className={styles.sectionHeaderWithExport}>
                        <h4>
                          <span className="material-icons">assessment</span>
                          Test Results ({stressTestStartYear} - Present)
                        </h4>
                          {canExportLogs && (
                            <button className={styles.exportLogButton} onClick={exportStressTestToCSV} title="Export log (Admin/Mod only)">
                              <span className="material-icons">download</span>
                              Export Log
                            </button>
                          )}
                        </div>

                        {/* Summary Stats */}
                        <div className={styles.stressTestSummary}>
                          <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>Total Trades</span>
                            <span className={styles.summaryValue}>{stressTestResults.performance.totalTrades}</span>
                          </div>
                          <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>Win Rate</span>
                            <span className={`${styles.summaryValue} ${stressTestResults.performance.winRate >= 0.5 ? styles.positive : styles.negative}`}>
                              {(stressTestResults.performance.winRate * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>Total Return</span>
                            <span className={`${styles.summaryValue} ${stressTestResults.performance.totalReturn >= 0 ? styles.positive : styles.negative}`}>
                              {(stressTestResults.performance.totalReturn * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>Profit Factor</span>
                            <span className={`${styles.summaryValue} ${stressTestResults.performance.profitFactor >= 1 ? styles.positive : styles.negative}`}>
                              {stressTestResults.performance.profitFactor === Infinity ? '∞' : stressTestResults.performance.profitFactor.toFixed(2)}
                            </span>
                          </div>
                          <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>Payoff Ratio</span>
                            <span className={styles.summaryValue}>
                              {stressTestResults.performance.payoffRatio === Infinity ? '∞' : stressTestResults.performance.payoffRatio.toFixed(2)}
                            </span>
                          </div>
                          <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>Max Drawdown</span>
                            <span className={`${styles.summaryValue} ${styles.negative}`}>
                              {((stressTestResults.performance.max_drawdown || 0) * 100).toFixed(2)}%
                            </span>
                          </div>
                        </div>

                        {/* Trade Breakdown */}
                        <div className={styles.tradeBreakdown}>
                          <div className={styles.breakdownItem}>
                            <span className="material-icons" style={{ color: '#10b981' }}>check_circle</span>
                            <span>Winning: {stressTestResults.performance.winningTrades}</span>
                            <span className={styles.breakdownValue}>
                              +${stressTestResults.performance.grossProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className={styles.breakdownItem}>
                            <span className="material-icons" style={{ color: '#ef4444' }}>cancel</span>
                            <span>Losing: {stressTestResults.performance.losingTrades}</span>
                            <span className={styles.breakdownValue}>
                              -${stressTestResults.performance.grossLoss.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className={styles.breakdownItem}>
                            <span className="material-icons" style={{ color: '#4488ff' }}>account_balance</span>
                            <span>Net P&L:</span>
                            <span className={`${styles.breakdownValue} ${stressTestResults.performance.totalPnL >= 0 ? styles.positive : styles.negative}`}>
                              {stressTestResults.performance.totalPnL >= 0 ? '+' : ''}${stressTestResults.performance.totalPnL.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        {/* Chart with annotations */}
                        <div className={styles.stressTestChart}>
                          <h5>
                            <span className="material-icons">candlestick_chart</span>
                            Price Chart with Trade & Signal Annotations
                          </h5>
                          <div className={styles.chartLegendInfo}>
                            <span className={styles.delayInfo}>
                              <span className="material-icons" style={{ fontSize: '14px' }}>schedule</span>
                              Entry Delay: {stressTestResults.entryDelay} bar{stressTestResults.entryDelay !== 1 ? 's' : ''}
                              {stressTestResults.entryDelay === 0 && ' (at signal close)'}
                            </span>
                            <span className={styles.delayInfo}>
                              <span className="material-icons" style={{ fontSize: '14px' }}>schedule</span>
                              Exit Delay: {stressTestResults.exitDelay} bar{stressTestResults.exitDelay !== 1 ? 's' : ''}
                              {stressTestResults.exitDelay === 0 && ' (at signal close)'}
                            </span>
                          </div>
                          <BacktestLightweightChart
                            trades={stressTestResults.trades}
                            openPosition={stressTestResults.openPosition}
                            config={{
                              asset: stressTestResults.config.asset,
                              start_date: stressTestResults.config.start_date,
                              end_date: stressTestResults.config.end_date,
                              interval: stressTestResults.config.interval,
                              indicator_type: stressTestResults.config.indicator_type,
                              ema_fast: stressTestResults.config.ema_fast,
                              ema_slow: stressTestResults.config.ema_slow,
                              indicator_params: stressTestResults.config.indicator_params
                            }}
                            mode="auto"
                            signalMarkers={stressTestResults.signalMarkers || []}
                            showSignals={true}
                          />
                        </div>

                        {/* Trade Log */}
                        {stressTestResults.trades.length > 0 && (
                          <div className={styles.stressTestTradeLog}>
                            <h5>
                              <span className="material-icons">list_alt</span>
                              Trade Log ({stressTestResults.trades.length} trades)
                            </h5>
                            <div className={styles.tradeLogTable}>
                              <table>
                                <thead>
                                  <tr>
                                    <th>#</th>
                                    <th>Type</th>
                                    <th>Entry Date</th>
                                    <th>Entry Price</th>
                                    <th>Exit Date</th>
                                    <th>Exit Price</th>
                                    <th>P&L</th>
                                    <th>P&L %</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {stressTestResults.trades.slice(-20).map((trade, idx) => (
                                    <tr key={idx} className={trade.PnL >= 0 ? styles.winTrade : styles.loseTrade}>
                                      <td>{stressTestResults.trades.length - 20 + idx + 1}</td>
                                      <td>
                                        <span className={`${styles.tradeTypeBadge} ${(trade.Position_Type || '').toUpperCase() === 'LONG' ? styles.long : styles.short}`}>
                                          {trade.Position_Type}
                                        </span>
                                      </td>
                                      <td>{new Date(trade.Entry_Date).toLocaleDateString()}</td>
                                      <td>${parseFloat(trade.Entry_Price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                                      <td>{new Date(trade.Exit_Date).toLocaleDateString()}</td>
                                      <td>${parseFloat(trade.Exit_Price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                                      <td className={trade.PnL >= 0 ? styles.positive : styles.negative}>
                                        {trade.PnL >= 0 ? '+' : ''}${trade.PnL.toFixed(2)}
                                      </td>
                                      <td className={trade.PnL_Pct >= 0 ? styles.positive : styles.negative}>
                                        {trade.PnL_Pct >= 0 ? '+' : ''}{trade.PnL_Pct.toFixed(2)}%
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {stressTestResults.trades.length > 20 && (
                                <p className={styles.tableNote}>Showing last 20 trades of {stressTestResults.trades.length} total</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={styles.placeholderContent}>
                    <span className="material-icons">info</span>
                    <p>Please validate a strategy in the "Strategy Robust Test" section and save the setup to use it here.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Config Modal */}
      {showSaveConfigModal && (
        <div className={styles.modalOverlay} onClick={() => setShowSaveConfigModal(false)}>
          <div className={styles.saveConfigModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>
                <span className="material-icons">save</span>
                Save Optimization Strategy
              </h3>
              <button 
                className={styles.modalCloseButton}
                onClick={() => setShowSaveConfigModal(false)}
              >
                <span className="material-icons">close</span>
              </button>
            </div>
            
            <div className={styles.modalContent}>
              <div className={styles.saveConfigForm}>
                <div className={styles.inputGroup}>
                  <label>Strategy Name</label>
                  <input
                    type="text"
                    value={newConfigName}
                    onChange={(e) => setNewConfigName(e.target.value)}
                    placeholder="e.g., BTC EMA Crossover Strategy"
                    className={styles.input}
                    autoFocus
                  />
                </div>
                
                <div className={styles.configPreview}>
                  <h4>Configuration Summary</h4>
                  <div className={styles.previewGrid}>
                    <div className={styles.previewItem}>
                      <span className={styles.previewLabel}>Asset</span>
                      <span className={styles.previewValue}>{symbol}</span>
                    </div>
                    <div className={styles.previewItem}>
                      <span className={styles.previewLabel}>Interval</span>
                      <span className={styles.previewValue}>{interval}</span>
                    </div>
                    <div className={styles.previewItem}>
                      <span className={styles.previewLabel}>Indicator</span>
                      <span className={styles.previewValue}>{indicatorType.toUpperCase()}</span>
                    </div>
                    <div className={styles.previewItem}>
                      <span className={styles.previewLabel}>Position</span>
                      <span className={styles.previewValue}>{positionType.replace('_', ' ')}</span>
                    </div>
                    <div className={styles.previewItem}>
                      <span className={styles.previewLabel}>Capital</span>
                      <span className={styles.previewValue}>${initialCapital.toLocaleString()}</span>
                    </div>
                    <div className={styles.previewItem}>
                      <span className={styles.previewLabel}>In-Sample</span>
                      <span className={styles.previewValue}>{inSampleYears.join(', ')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className={styles.modalFooter}>
              <button 
                className={styles.modalCancelButton}
                onClick={() => setShowSaveConfigModal(false)}
              >
                Cancel
              </button>
              <button 
                className={styles.modalSaveButton}
                onClick={handleSaveConfig}
                disabled={!newConfigName.trim()}
              >
                <span className="material-icons">save</span>
                Save Strategy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Color Settings Modal */}
      {showColorSettings && tempColorSettings && (
        <div className={styles.modalOverlay} onClick={() => setShowColorSettings(false)}>
          <div className={styles.colorSettingsModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Customize Heatmap Color Thresholds</h3>
              <button 
                className={styles.modalCloseButton}
                onClick={() => setShowColorSettings(false)}
              >
                <span className="material-icons">close</span>
              </button>
            </div>
            
            <div className={styles.modalContent}>
              {Object.keys(tempColorSettings).map(metric => {
                const settings = tempColorSettings[metric]
                const metricLabel = HEATMAP_METRIC_OPTIONS.find(opt => opt.value === metric)?.label || metric
                const isPercentage = metric === 'total_return' || metric === 'win_rate' || metric === 'max_drawdown'
                
                // Convert percentage values for display (stored as decimals)
                const getDisplayValue = (val) => {
                  if (isPercentage && metric !== 'max_drawdown') {
                    return (val * 100).toFixed(2)
                  } else if (isPercentage && metric === 'max_drawdown') {
                    return (val * 100).toFixed(2)
                  }
                  return val.toFixed(2)
                }
                
                const getStoredValue = (val) => {
                  if (isPercentage) {
                    return parseFloat(val) / 100
                  }
                  return parseFloat(val)
                }
                
                return (
                  <div key={metric} className={styles.colorSettingGroup}>
                    <h4>{metricLabel}</h4>
                    <div className={styles.colorSettingInputs}>
                      <div className={styles.colorInputRow}>
                        <label>
                          <span className={styles.colorSwatch} style={{ backgroundColor: '#ff4444' }}></span>
                          Red Threshold (≤)
                        </label>
                        <input
                          type="number"
                          step={metric === 'sharpe_ratio' ? '0.1' : '0.01'}
                          value={getDisplayValue(settings.red)}
                          onChange={(e) => {
                            const newSettings = { ...tempColorSettings }
                            newSettings[metric] = { ...settings, red: getStoredValue(e.target.value) }
                            setTempColorSettings(newSettings)
                          }}
                        />
                        {isPercentage && <span className={styles.unit}>%</span>}
                      </div>
                      
                      <div className={styles.colorInputRow}>
                        <label>
                          <span className={styles.colorSwatch} style={{ backgroundColor: '#ffcc00' }}></span>
                          Yellow Start
                        </label>
                        <input
                          type="number"
                          step={metric === 'sharpe_ratio' ? '0.1' : '0.01'}
                          value={getDisplayValue(settings.yellow)}
                          onChange={(e) => {
                            const newSettings = { ...tempColorSettings }
                            newSettings[metric] = { ...settings, yellow: getStoredValue(e.target.value) }
                            setTempColorSettings(newSettings)
                          }}
                        />
                        {isPercentage && <span className={styles.unit}>%</span>}
                      </div>
                      
                      <div className={styles.colorInputRow}>
                        <label>
                          <span className={styles.colorSwatch} style={{ backgroundColor: '#00ff88' }}></span>
                          Green Start (≥)
                        </label>
                        <input
                          type="number"
                          step={metric === 'sharpe_ratio' ? '0.1' : '0.01'}
                          value={getDisplayValue(settings.green)}
                          onChange={(e) => {
                            const newSettings = { ...tempColorSettings }
                            newSettings[metric] = { ...settings, green: getStoredValue(e.target.value) }
                            setTempColorSettings(newSettings)
                          }}
                        />
                        {isPercentage && <span className={styles.unit}>%</span>}
                      </div>
                      
                      <div className={styles.colorInputRow}>
                        <label>
                          <span className={styles.colorSwatch} style={{ backgroundColor: '#00aa55' }}></span>
                          Max Value (brightest green)
                        </label>
                        <input
                          type="number"
                          step={metric === 'sharpe_ratio' ? '0.1' : '0.01'}
                          value={getDisplayValue(settings.max)}
                          onChange={(e) => {
                            const newSettings = { ...tempColorSettings }
                            newSettings[metric] = { ...settings, max: getStoredValue(e.target.value) }
                            setTempColorSettings(newSettings)
                          }}
                        />
                        {isPercentage && <span className={styles.unit}>%</span>}
                      </div>
                    </div>
                    
                    <div className={styles.colorSettingHint}>
                      Values below Red = Red, between Red-Yellow = Yellow, between Yellow-Green = Green, above Green = Bright Green
                    </div>
                  </div>
                )
              })}
            </div>
            
            <div className={styles.modalFooter}>
              <button 
                className={styles.modalCancelButton}
                onClick={() => setShowColorSettings(false)}
              >
                Cancel
              </button>
              <button 
                className={styles.modalSaveButton}
                onClick={handleSaveColorSettings}
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
