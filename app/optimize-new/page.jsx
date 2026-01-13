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
      if (savedSetup.indicatorType !== 'ema') {
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
        exit_delay: stressTestExitDelay
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

  const handleRunHypothesisTest = useCallback(() => {
    if (!savedSetup?.strategyReturns || savedSetup.strategyReturns.length === 0) {
      setHypothesisError('No trade returns available.')
      return
    }

    setIsHypothesisLoading(true)
    setHypothesisError(null)
    setHypothesisResults(null)

    try {
      const returns = savedSetup.strategyReturns
      const n = returns.length
      if (n < 2) throw new Error('Need at least 2 trades')

      const mean = returns.reduce((sum, r) => sum + r, 0) / n
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (n - 1)
      const stdDev = Math.sqrt(variance)
      const stdError = stdDev / Math.sqrt(n)
      
      const nullMean = hypothesisNullReturn / 100
      const tStatistic = stdError > 0 ? (mean - nullMean) / stdError : 0
      const df = n - 1
      
      const pValueOneTailed = tDistributionPValue(Math.abs(tStatistic), df)
      const pValueTwoTailed = pValueOneTailed * 2
      
      const alpha = (100 - hypothesisConfidenceLevel) / 100
      const criticalValue = tDistributionCritical(alpha, df)
      const rejectNull = Math.abs(tStatistic) > criticalValue
      
      const marginOfError = criticalValue * stdError
      const confidenceIntervalLow = mean - marginOfError
      const confidenceIntervalHigh = mean + marginOfError
      const cohensD = stdDev > 0 ? (mean - nullMean) / stdDev : 0
      
      let interpretation = '', significance = ''
      if (rejectNull) {
        if (mean > nullMean) {
          interpretation = `Strategy returns are significantly GREATER than ${hypothesisNullReturn}% at ${hypothesisConfidenceLevel}% confidence.`
          significance = 'profitable'
        } else {
          interpretation = `Strategy returns are significantly LESS than ${hypothesisNullReturn}% at ${hypothesisConfidenceLevel}% confidence.`
          significance = 'unprofitable'
        }
      } else {
        interpretation = `Cannot reject null hypothesis. Insufficient evidence that returns differ from ${hypothesisNullReturn}%.`
        significance = 'inconclusive'
      }
      
      setHypothesisResults({
        sampleSize: n, sampleMean: mean, sampleStdDev: stdDev, stdError, nullMean,
        tStatistic, degreesOfFreedom: df, pValueOneTailed, pValueTwoTailed,
        criticalValue, confidenceLevel: hypothesisConfidenceLevel, rejectNull,
        confidenceIntervalLow, confidenceIntervalHigh, cohensD, interpretation, significance
      })
    } catch (err) {
      console.error('Hypothesis test error:', err)
      setHypothesisError(err.message || 'Failed to run hypothesis test')
    } finally {
      setIsHypothesisLoading(false)
    }
  }, [savedSetup, hypothesisNullReturn, hypothesisConfidenceLevel])

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
                                  <h4><span className="material-icons">tune</span> Resampling Parameters</h4>
                                  <p className={styles.description}>Bootstrap resampling tests strategy robustness by shuffling market data while preserving statistical properties.</p>
                                  
                                  <div className={styles.inputsGrid}>
                                    <div className={styles.inputGroup}>
                                      <label>Volatility %</label>
                                      <input type="number" min={1} max={100} value={resamplingVolatilityPercent} 
                                        onChange={(e) => setResamplingVolatilityPercent(Math.min(100, Math.max(1, parseInt(e.target.value) || 20)))} className={styles.input} />
                                    </div>
                                    <div className={styles.inputGroup}>
                                      <label>Num Shuffles</label>
                                      <input type="number" min={5} max={100} value={resamplingNumShuffles} 
                                        onChange={(e) => setResamplingNumShuffles(Math.min(100, Math.max(5, parseInt(e.target.value) || 10)))} className={styles.input} />
                                    </div>
                                    <div className={styles.inputGroup}>
                                      <label>Seed</label>
                                      <input type="number" value={resamplingSeed} onChange={(e) => setResamplingSeed(parseInt(e.target.value) || 42)} className={styles.input} />
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
                                  <h4><span className="material-icons">tune</span> Simulation Parameters</h4>
                                  <p className={styles.description}>Monte Carlo shuffles trade order to show possible equity paths, revealing luck vs skill.</p>
                                  
                                  <div className={styles.inputsGrid}>
                                    <div className={styles.inputGroup}>
                                      <label>Simulations</label>
                                      <input type="number" min={100} max={10000} step={100} value={monteCarloNumSims} 
                                        onChange={(e) => setMonteCarloNumSims(Math.min(10000, Math.max(100, parseInt(e.target.value) || 1000)))} className={styles.input} />
                                    </div>
                                    <div className={styles.inputGroup}>
                                      <label>Seed</label>
                                      <input type="number" value={monteCarloSeed} onChange={(e) => setMonteCarloSeed(parseInt(e.target.value) || 42)} className={styles.input} />
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
                          
                          {/* Statistical Significance Testing Component */}
                          {componentId === 'significance' && (
                            savedSetup ? (
                              <div className={styles.analysisContainer}>
                                <div className={styles.savedSetupInfo}>
                                  <div className={styles.savedSetupHeader}>
                                    <span className="material-icons">check_circle</span>
                                    <h4>Using Saved Setup</h4>
                                  </div>
                                  <div className={styles.savedSetupDetails}>
                                    <span>Trades: {savedSetup.strategyReturns?.length || 0}</span>
                                    <span>Avg Return: {savedSetup.strategyReturns?.length > 0 ? ((savedSetup.strategyReturns.reduce((a, b) => a + b, 0) / savedSetup.strategyReturns.length) * 100).toFixed(2) + '%' : 'N/A'}</span>
                                  </div>
                                </div>

                                <div className={styles.controlsSection}>
                                  <h4><span className="material-icons">science</span> Hypothesis Test Configuration</h4>
                                  <p className={styles.description}>Test if strategy returns are statistically significant vs a benchmark, separating skill from luck.</p>
                                  
                                  <div className={styles.inputsGrid}>
                                    <div className={styles.inputGroup}>
                                      <label>Benchmark Return (%)</label>
                                      <input type="number" step="0.01" value={hypothesisNullReturn} 
                                        onChange={(e) => { setHypothesisNullReturn(parseFloat(e.target.value) || 0); setHypothesisResults(null); }} className={styles.input} />
                                      <span className={styles.hint}>H₀: Strategy return = benchmark</span>
                                    </div>
                                    <div className={styles.inputGroup}>
                                      <label>Confidence Level</label>
                                      <div className={styles.confidenceSelector}>
                                        {[90, 95, 99].map(level => (
                                          <button key={level} className={`${styles.confidenceButton} ${hypothesisConfidenceLevel === level ? styles.active : ''}`}
                                            onClick={() => { setHypothesisConfidenceLevel(level); setHypothesisResults(null); }}>{level}%</button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  <button className={styles.calculateButton} onClick={handleRunHypothesisTest} disabled={isHypothesisLoading || !savedSetup?.strategyReturns?.length}>
                                    {isHypothesisLoading ? (<><span className={`material-icons ${styles.spinning}`}>sync</span> Testing...</>) 
                                      : (<><span className="material-icons">analytics</span> Run Hypothesis Test</>)}
                                  </button>
                                </div>

                                {hypothesisError && <div className={styles.errorMessage}><span className="material-icons">error</span>{hypothesisError}</div>}

                                {hypothesisResults && (
                                  <div className={`${styles.resultsContainer} ${hypothesisResults.significance === 'profitable' ? styles.profitableResult : hypothesisResults.significance === 'unprofitable' ? styles.unprofitableResult : styles.inconclusiveResult}`}>
                                    <div className={`${styles.conclusionBanner} ${hypothesisResults.significance === 'profitable' ? styles.profitable : hypothesisResults.significance === 'unprofitable' ? styles.unprofitable : styles.inconclusive}`}>
                                      <span className="material-icons">{hypothesisResults.significance === 'profitable' ? 'check_circle' : hypothesisResults.significance === 'unprofitable' ? 'cancel' : 'help'}</span>
                                      <div>
                                        <strong>{hypothesisResults.rejectNull ? 'Reject Null Hypothesis' : 'Fail to Reject'}</strong>
                                        <p>{hypothesisResults.interpretation}</p>
                                      </div>
                                    </div>

                                    <div className={styles.statsGrid}>
                                      <div className={styles.statItem}><span>Sample Size</span><strong>{hypothesisResults.sampleSize}</strong></div>
                                      <div className={styles.statItem}><span>Sample Mean</span><strong className={hypothesisResults.sampleMean >= 0 ? styles.positive : styles.negative}>{(hypothesisResults.sampleMean * 100).toFixed(3)}%</strong></div>
                                      <div className={styles.statItem}><span>t-Statistic</span><strong className={Math.abs(hypothesisResults.tStatistic) > hypothesisResults.criticalValue ? styles.significant : ''}>{hypothesisResults.tStatistic.toFixed(3)}</strong></div>
                                      <div className={styles.statItem}><span>p-value</span><strong className={hypothesisResults.pValueTwoTailed < 0.05 ? styles.significant : ''}>{hypothesisResults.pValueTwoTailed < 0.0001 ? '< 0.0001' : hypothesisResults.pValueTwoTailed.toFixed(4)}</strong></div>
                                      <div className={styles.statItem}><span>Critical Value</span><strong>±{hypothesisResults.criticalValue.toFixed(3)}</strong></div>
                                      <div className={styles.statItem}><span>Cohen's d</span><strong>{hypothesisResults.cohensD.toFixed(3)} ({Math.abs(hypothesisResults.cohensD) < 0.2 ? 'negligible' : Math.abs(hypothesisResults.cohensD) < 0.5 ? 'small' : Math.abs(hypothesisResults.cohensD) < 0.8 ? 'medium' : 'large'})</strong></div>
                                    </div>

                                    <div className={styles.confidenceInterval}>
                                      <h5>{hypothesisResults.confidenceLevel}% Confidence Interval</h5>
                                      <div className={styles.intervalVisual}>
                                        <span className={hypothesisResults.confidenceIntervalLow >= 0 ? styles.positive : styles.negative}>{(hypothesisResults.confidenceIntervalLow * 100).toFixed(3)}%</span>
                                        <span className={styles.intervalTo}>to</span>
                                        <span className={hypothesisResults.confidenceIntervalHigh >= 0 ? styles.positive : styles.negative}>{(hypothesisResults.confidenceIntervalHigh * 100).toFixed(3)}%</span>
                                      </div>
                                      {hypothesisResults.confidenceIntervalLow > 0 && <p className={styles.intervalNote}><span className="material-icons">check</span> Entire CI above zero - suggests consistent profitability</p>}
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
                                    <span>Indicator: {savedSetup.indicatorType === 'ema' ? `EMA ${savedSetup.emaShort}/${savedSetup.emaLong}` : `${savedSetup.indicatorType?.toUpperCase()} (${savedSetup.indicatorLength})`}</span>
                                  </div>
                                </div>

                                <div className={styles.controlsSection}>
                                  <h4><span className="material-icons">tune</span> Stress Test Parameters</h4>
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
                                      <input type="number" min={0} max={10} value={stressTestEntryDelay} onChange={(e) => setStressTestEntryDelay(parseInt(e.target.value) || 0)} className={styles.input} />
                                    </div>
                                    <div className={styles.inputGroup}>
                                      <label>Exit Delay</label>
                                      <input type="number" min={0} max={10} value={stressTestExitDelay} onChange={(e) => setStressTestExitDelay(parseInt(e.target.value) || 0)} className={styles.input} />
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
                                      <h5><span className="material-icons">assessment</span> Performance Summary</h5>
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
