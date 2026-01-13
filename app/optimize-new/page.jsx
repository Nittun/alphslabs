'use client'

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import MonteCarloChart from '@/components/MonteCarloChart'
import BacktestLightweightChart from '@/components/BacktestLightweightChart'
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
  { value: 'ema', label: 'EMA (Exponential Moving Average)', description: 'Crossover of two EMAs' },
  { value: 'rsi', label: 'RSI (Relative Strength Index)', description: 'Overbought/Oversold levels' },
  { value: 'cci', label: 'CCI (Commodity Channel Index)', description: 'Overbought/Oversold levels' },
  { value: 'zscore', label: 'Z-Score', description: 'Statistical deviation from mean' },
]

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
  const [riskFreeRate, setRiskFreeRate] = useState(0)
  
  // Components/cells state - only strategyRobustTest by default when created
  const [activeComponents, setActiveComponents] = useState([])
  const [expandedComponents, setExpandedComponents] = useState({})
  const [showComponentMenu, setShowComponentMenu] = useState(false)
  
  // In-Sample results state
  const [isCalculatingInSample, setIsCalculatingInSample] = useState(false)
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
  
  // Hypothesis state
  const [hypothesisNullReturn, setHypothesisNullReturn] = useState(0)
  const [hypothesisConfidenceLevel, setHypothesisConfidenceLevel] = useState(95)
  const [hypothesisResults, setHypothesisResults] = useState(null)
  const [isHypothesisLoading, setIsHypothesisLoading] = useState(false)
  const [hypothesisError, setHypothesisError] = useState(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

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
      title: 'Reset Strategy?',
      text: 'This will clear all your progress and start fresh.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff4444',
      cancelButtonColor: '#333',
      confirmButtonText: 'Yes, reset',
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
    setInSampleError(null)
    setInSampleResults(null)
    setSelectedCell(null)

    let indicatorParams = {}
    let maxX, maxY, minX, minY
    
    if (indicatorType === 'ema') {
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
          max_ema_short: indicatorType === 'ema' ? maxX : null,
          max_ema_long: indicatorType === 'ema' ? maxY : null,
          indicator_length: indicatorType !== 'ema' ? indicatorLength : null,
          min_indicator_bottom: indicatorType !== 'ema' ? minX : null,
          max_indicator_bottom: indicatorType !== 'ema' ? maxX : null,
          min_indicator_top: indicatorType !== 'ema' ? minY : null,
          max_indicator_top: indicatorType !== 'ema' ? maxY : null,
          sample_type: 'in_sample',
          return_heatmap: true,
          position_type: positionType,
          risk_free_rate: riskFreeRate,
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

    if (indicatorType === 'ema') {
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
      const setup = {
        symbol,
        interval,
        indicatorType,
        positionType,
        riskFreeRate,
        initialCapital,
        inSampleYears: [...inSampleYears],
        outSampleYears: [...outSampleYears],
        ...(indicatorType === 'ema' ? {
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
    const xKey = indicatorType === 'ema' ? 'ema_short' : 'indicator_bottom'
    const yKey = indicatorType === 'ema' ? 'ema_long' : 'indicator_top'
    
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

  const handleCellClick = useCallback((result, x, y) => {
    if (!result) return
    
    if (indicatorType === 'ema') {
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
    
    const xHeader = indicatorType === 'ema' ? 'EMA_Short' : 'Indicator_Bottom'
    const yHeader = indicatorType === 'ema' ? 'EMA_Long' : 'Indicator_Top'
    const headers = [xHeader, yHeader, 'Sharpe_Ratio', 'Total_Return', 'Max_Drawdown', 'Win_Rate', 'Total_Trades']
    const rows = sortedInSampleResults.map(r => {
      const xValue = indicatorType === 'ema' ? (r.ema_short || r.indicator_bottom) : (r.indicator_bottom || r.ema_short)
      const yValue = indicatorType === 'ema' ? (r.ema_long || r.indicator_top) : (r.indicator_top || r.ema_long)
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

          {/* Strategy Creation Step */}
          {!isStrategyCreated ? (
            <div className={styles.strategyCreationCard}>
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
                <div className={styles.configCard}>
                  <h3>
                    <span className="material-icons">tune</span>
                    Global Parameters
                  </h3>
                  
                  <div className={styles.configGrid}>
                    <div className={styles.formGroup}>
                      <label>Indicator Type</label>
                      <select value={indicatorType} onChange={(e) => setIndicatorType(e.target.value)} className={styles.select}>
                        {INDICATOR_TYPES.map(ind => (
                          <option key={ind.value} value={ind.value}>{ind.label}</option>
                        ))}
                      </select>
                    </div>

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

                    {indicatorType === 'ema' && (
                      <>
                        <div className={styles.formGroup}>
                          <label>Max Short EMA</label>
                          <input type="number" value={maxEmaShort} onChange={(e) => setMaxEmaShort(Number(e.target.value))} min={5} max={50} className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Max Long EMA</label>
                          <input type="number" value={maxEmaLong} onChange={(e) => setMaxEmaLong(Number(e.target.value))} min={20} max={200} className={styles.input} />
                        </div>
                      </>
                    )}

                    {indicatorType === 'rsi' && (
                      <>
                        <div className={styles.formGroup}>
                          <label>Length</label>
                          <input type="number" value={indicatorLength} onChange={(e) => setIndicatorLength(Number(e.target.value))} min={3} max={100} className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Min Bottom</label>
                          <input type="number" value={minIndicatorBottom} onChange={(e) => setMinIndicatorBottom(Number(e.target.value))} min={-200} max={0} className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Max Top</label>
                          <input type="number" value={maxIndicatorTop} onChange={(e) => setMaxIndicatorTop(Number(e.target.value))} min={0} max={200} className={styles.input} />
                        </div>
                      </>
                    )}

                    {indicatorType === 'cci' && (
                      <>
                        <div className={styles.formGroup}>
                          <label>Length</label>
                          <input type="number" value={indicatorLength} onChange={(e) => setIndicatorLength(Number(e.target.value))} min={3} max={100} className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Min Bottom</label>
                          <input type="number" value={minIndicatorBottomCci} onChange={(e) => setMinIndicatorBottomCci(Number(e.target.value))} min={-200} max={0} className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Max Top</label>
                          <input type="number" value={maxIndicatorTopCci} onChange={(e) => setMaxIndicatorTopCci(Number(e.target.value))} min={0} max={200} className={styles.input} />
                        </div>
                      </>
                    )}

                    {indicatorType === 'zscore' && (
                      <>
                        <div className={styles.formGroup}>
                          <label>Length</label>
                          <input type="number" value={indicatorLength} onChange={(e) => setIndicatorLength(Number(e.target.value))} min={3} max={100} className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Min Bottom</label>
                          <input type="number" value={minIndicatorBottomZscore} onChange={(e) => setMinIndicatorBottomZscore(Number(e.target.value))} step={0.1} className={styles.input} />
                        </div>
                        <div className={styles.formGroup}>
                          <label>Max Top</label>
                          <input type="number" value={maxIndicatorTopZscore} onChange={(e) => setMaxIndicatorTopZscore(Number(e.target.value))} step={0.1} className={styles.input} />
                        </div>
                      </>
                    )}

                    <div className={styles.formGroup}>
                      <label>Initial Capital</label>
                      <input type="number" value={initialCapital} onChange={(e) => setInitialCapital(Number(e.target.value))} min={1000} className={styles.input} />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Risk-Free Rate (%)</label>
                      <input type="number" value={riskFreeRate * 100} onChange={(e) => setRiskFreeRate(Number(e.target.value) / 100)} step={0.1} className={styles.input} />
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
          ) : (
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
                  <button className={styles.editBtn} onClick={() => setIsEditingConfig(!isEditingConfig)}>
                    <span className="material-icons">{isEditingConfig ? 'close' : 'edit'}</span>
                    {isEditingConfig ? 'Close' : 'Edit Config'}
                  </button>
                  <button className={styles.resetBtn} onClick={handleResetStrategy}>
                    <span className="material-icons">restart_alt</span>
                    Reset
                  </button>
                </div>
              </div>

              {/* Edit Configuration Panel */}
              {isEditingConfig && (
                <div className={styles.configSection}>
                  <div className={styles.configCard}>
                    <h3>
                      <span className="material-icons">tune</span>
                      Edit Global Parameters
                    </h3>
                    
                    <div className={styles.configGrid}>
                      <div className={styles.formGroup}>
                        <label>Indicator Type</label>
                        <select value={indicatorType} onChange={(e) => setIndicatorType(e.target.value)} className={styles.select}>
                          {INDICATOR_TYPES.map(ind => (
                            <option key={ind.value} value={ind.value}>{ind.label}</option>
                          ))}
                        </select>
                      </div>

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

                      {indicatorType === 'ema' && (
                        <>
                          <div className={styles.formGroup}>
                            <label>Max Short EMA</label>
                            <input type="number" value={maxEmaShort} onChange={(e) => setMaxEmaShort(Number(e.target.value))} min={5} max={50} className={styles.input} />
                          </div>
                          <div className={styles.formGroup}>
                            <label>Max Long EMA</label>
                            <input type="number" value={maxEmaLong} onChange={(e) => setMaxEmaLong(Number(e.target.value))} min={20} max={200} className={styles.input} />
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
                                          Calculating...
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
                                                  {indicatorType === 'ema' ? 'EMA Short' : 'Indicator Bottom'}
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
                                                {indicatorType === 'ema' 
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
                                                  <th>{indicatorType === 'ema' ? 'Short' : 'Bottom'}</th>
                                                  <th>{indicatorType === 'ema' ? 'Long' : 'Top'}</th>
                                                  <SortableHeader label="Sharpe" sortKey="sharpe_ratio" onSort={handleSort} />
                                                  <SortableHeader label="Return" sortKey="total_return" onSort={handleSort} />
                                                  <SortableHeader label="Drawdown" sortKey="max_drawdown" onSort={handleSort} />
                                                  <SortableHeader label="Win Rate" sortKey="win_rate" onSort={handleSort} />
                                                  <th>Trades</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {sortedInSampleResults.slice(0, 60).map((r, i) => {
                                                  const xVal = indicatorType === 'ema' ? r.ema_short : r.indicator_bottom
                                                  const yVal = indicatorType === 'ema' ? r.ema_long : r.indicator_top
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
                                          {indicatorType === 'ema' ? (
                                            <>
                                              <div className={styles.formGroup}>
                                                <label>Short EMA</label>
                                                <input
                                                  type="number"
                                                  value={outSampleEmaShort}
                                                  onChange={(e) => setOutSampleEmaShort(Number(e.target.value))}
                                                  className={styles.input}
                                                />
                                              </div>
                                              <div className={styles.formGroup}>
                                                <label>Long EMA</label>
                                                <input
                                                  type="number"
                                                  value={outSampleEmaLong}
                                                  onChange={(e) => setOutSampleEmaLong(Number(e.target.value))}
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
                                                  className={styles.input}
                                                />
                                              </div>
                                              <div className={styles.formGroup}>
                                                <label>Top</label>
                                                <input
                                                  type="number"
                                                  value={outSampleIndicatorTop}
                                                  onChange={(e) => setOutSampleIndicatorTop(Number(e.target.value))}
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
                          
                          {/* Other components placeholder */}
                          {componentId === 'resampling' && (
                            <div className={styles.placeholderContent}>
                              <span className="material-icons">shuffle</span>
                              <p>Bootstrap Resampling Analysis</p>
                              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                {savedSetup ? 'Ready to run analysis' : 'Please complete Strategy Robust Test first'}
                              </p>
                            </div>
                          )}
                          
                          {componentId === 'simulation' && (
                            <div className={styles.placeholderContent}>
                              <span className="material-icons">casino</span>
                              <p>Monte Carlo Simulation</p>
                              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                {savedSetup ? 'Ready to run simulation' : 'Please complete Strategy Robust Test first'}
                              </p>
                            </div>
                          )}
                          
                          {componentId === 'significance' && (
                            <div className={styles.placeholderContent}>
                              <span className="material-icons">analytics</span>
                              <p>Statistical Significance Testing</p>
                              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                {savedSetup ? 'Ready to run hypothesis test' : 'Please complete Strategy Robust Test first'}
                              </p>
                            </div>
                          )}
                          
                          {componentId === 'stressTest' && (
                            <div className={styles.placeholderContent}>
                              <span className="material-icons">warning_amber</span>
                              <p>Stress Test Analysis</p>
                              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                {savedSetup ? 'Ready to run stress test' : 'Please complete Strategy Robust Test first'}
                              </p>
                            </div>
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
