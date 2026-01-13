'use client'

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import MonteCarloChart from '@/components/MonteCarloChart'
import BacktestLightweightChart from '@/components/BacktestLightweightChart'
import { API_URL } from '@/lib/api'
import { performBootstrapResampling, applyStrategyToResampled, runMonteCarloSimulation, generateHistogramBins, testBucketCountsPreserved, testBucketization } from '@/lib/resampling'
import styles from './page.module.css'

// Constants moved outside component to prevent recreation
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
  const [maxIndicatorTop, setMaxIndicatorTop] = useState(80) // Max top for RSI (0-200)
  const [minIndicatorBottom, setMinIndicatorBottom] = useState(-20) // Min bottom for RSI (-200-0)
  const [maxIndicatorTopCci, setMaxIndicatorTopCci] = useState(100) // Max top for CCI (0-200)
  const [minIndicatorBottomCci, setMinIndicatorBottomCci] = useState(-100) // Min bottom for CCI (-200-0)
  const [maxIndicatorTopZscore, setMaxIndicatorTopZscore] = useState(1) // Max top for Z-Score (0-2)
  const [minIndicatorBottomZscore, setMinIndicatorBottomZscore] = useState(-1) // Min bottom for Z-Score (-2-0)
  
  // Out-of-Sample single values (can be auto-filled from in-sample table)
  const [outSampleEmaShort, setOutSampleEmaShort] = useState(12)
  const [outSampleEmaLong, setOutSampleEmaLong] = useState(26)
  const [outSampleIndicatorBottom, setOutSampleIndicatorBottom] = useState(-2)
  const [outSampleIndicatorTop, setOutSampleIndicatorTop] = useState(2)
  const [initialCapital, setInitialCapital] = useState(10000)
  
  // Position type: 'long_only', 'short_only', or 'both'
  const [positionType, setPositionType] = useState('both')
  
  // Risk-free rate for Sharpe ratio calculation (annualized, e.g., 0.02 = 2%)
  const [riskFreeRate, setRiskFreeRate] = useState(0)
  
  // Selected heatmap cell for comparison
  const [selectedCell, setSelectedCell] = useState(null)
  
  // In-Sample results state
  const [isCalculatingInSample, setIsCalculatingInSample] = useState(false)
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
  const [stressTestEntryDelay, setStressTestEntryDelay] = useState(1)
  const [stressTestExitDelay, setStressTestExitDelay] = useState(1)
  const [stressTestPositionType, setStressTestPositionType] = useState('long_only')
  const [stressTestResults, setStressTestResults] = useState(null)
  const [isStressTestLoading, setIsStressTestLoading] = useState(false)
  const [stressTestError, setStressTestError] = useState(null)
  
  // Hypothesis Testing state
  const [hypothesisNullReturn, setHypothesisNullReturn] = useState(0) // Daily benchmark return (%)
  const [hypothesisConfidenceLevel, setHypothesisConfidenceLevel] = useState(95) // Confidence level (%)
  const [hypothesisResults, setHypothesisResults] = useState(null)
  const [isHypothesisLoading, setIsHypothesisLoading] = useState(false)
  const [hypothesisError, setHypothesisError] = useState(null)
  
  // Heatmap hover state
  const [heatmapHover, setHeatmapHover] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  
  // Saved Optimization Configs state
  const [savedOptimizationConfigs, setSavedOptimizationConfigs] = useState([])
  const [selectedConfigId, setSelectedConfigId] = useState(null)
  const [showSaveConfigModal, setShowSaveConfigModal] = useState(false)
  const [newConfigName, setNewConfigName] = useState('')
  
  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState({
    savedConfigs: true,  // Expanded by default - new section at top
    strategyRobustTest: true,  // Expanded by default
    resampling: false,
    simulation: false,
    significance: false,
    stressTest: false
  })
  
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

  // Load saved optimization configs from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('optimizationConfigs')
      if (saved) {
        const configs = JSON.parse(saved)
        setSavedOptimizationConfigs(configs)
      }
    } catch (e) {
      console.warn('Failed to load optimization configs from localStorage:', e)
    }
  }, [])

  // Save current configuration
  const handleSaveConfig = useCallback(() => {
    if (!newConfigName.trim()) return

    const config = {
      id: Date.now().toString(),
      name: newConfigName.trim(),
      createdAt: new Date().toISOString(),
      // Strategy settings
      symbol,
      interval,
      indicatorType,
      positionType,
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
      maxIndicatorTop,
      minIndicatorBottom,
      maxIndicatorTopCci,
      minIndicatorBottomCci,
      maxIndicatorTopZscore,
      minIndicatorBottomZscore,
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

    const updatedConfigs = [...savedOptimizationConfigs, config]
    setSavedOptimizationConfigs(updatedConfigs)
    localStorage.setItem('optimizationConfigs', JSON.stringify(updatedConfigs))
    setShowSaveConfigModal(false)
    setNewConfigName('')
    setSelectedConfigId(config.id)
  }, [
    newConfigName, symbol, interval, indicatorType, positionType, initialCapital, riskFreeRate,
    inSampleYears, outSampleYears, maxEmaShort, maxEmaLong, outSampleEmaShort, outSampleEmaLong,
    indicatorLength, maxIndicatorTop, minIndicatorBottom, maxIndicatorTopCci, minIndicatorBottomCci,
    maxIndicatorTopZscore, minIndicatorBottomZscore, outSampleIndicatorBottom, outSampleIndicatorTop,
    stressTestStartYear, stressTestEntryDelay, stressTestExitDelay, stressTestPositionType,
    hypothesisNullReturn, hypothesisConfidenceLevel, resamplingVolatilityPercent, resamplingNumShuffles,
    resamplingSeed, monteCarloNumSims, monteCarloSeed, savedOptimizationConfigs
  ])

  // Load a saved configuration
  const handleLoadConfig = useCallback((configId) => {
    const config = savedOptimizationConfigs.find(c => c.id === configId)
    if (!config) return

    // Apply all settings from the config
    setSymbol(config.symbol || 'BTC-USD')
    setInterval(config.interval || '1d')
    setIndicatorType(config.indicatorType || 'ema')
    setPositionType(config.positionType || 'both')
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
    setStressTestEntryDelay(config.stressTestEntryDelay || 1)
    setStressTestExitDelay(config.stressTestExitDelay || 1)
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
  const handleDeleteConfig = useCallback((configId) => {
    const updatedConfigs = savedOptimizationConfigs.filter(c => c.id !== configId)
    setSavedOptimizationConfigs(updatedConfigs)
    localStorage.setItem('optimizationConfigs', JSON.stringify(updatedConfigs))
    if (selectedConfigId === configId) {
      setSelectedConfigId(null)
    }
  }, [savedOptimizationConfigs, selectedConfigId])

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
    setMaxIndicatorTop(80)
    setMinIndicatorBottom(-20)
    setMaxIndicatorTopCci(100)
    setMinIndicatorBottomCci(-100)
    setMaxIndicatorTopZscore(1)
    setMinIndicatorBottomZscore(-1)
    setOutSampleIndicatorBottom(-2)
    setOutSampleIndicatorTop(2)
    setStressTestStartYear(2020)
    setStressTestEntryDelay(1)
    setStressTestExitDelay(1)
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
    if (inSampleYears.length === 0) {
      setInSampleError('Please select at least one year for In-Sample testing')
      return
    }

    setIsCalculatingInSample(true)
    setInSampleError(null)
    setInSampleResults(null)
    setSelectedCell(null) // Reset selection

    // Build indicator parameters based on type
    let indicatorParams = {}
    let maxX, maxY, minX, minY
    
    if (indicatorType === 'ema') {
      indicatorParams = { fast: 3, slow: 10 } // Min values, max will be from max_ema_short/long
      maxX = maxEmaShort
      maxY = maxEmaLong
    } else if (indicatorType === 'rsi') {
      indicatorParams = { length: indicatorLength } // Fixed length
      minX = minIndicatorBottom // Bottom range: -200 to 0
      maxX = 0
      minY = 0
      maxY = maxIndicatorTop // Top range: 0 to 200
    } else if (indicatorType === 'cci') {
      indicatorParams = { length: indicatorLength } // Fixed length
      minX = minIndicatorBottomCci // Bottom range: -200 to 0
      maxX = 0
      minY = 0
      maxY = maxIndicatorTopCci // Top range: 0 to 200
    } else if (indicatorType === 'zscore') {
      indicatorParams = { length: indicatorLength } // Fixed length
      minX = minIndicatorBottomZscore // Bottom range: -2 to 0
      maxX = 0
      minY = 0
      maxY = maxIndicatorTopZscore // Top range: 0 to 2
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

  const calculateOutSample = async () => {
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
    const setup = {
      symbol,
      interval,
      indicatorType,
      positionType,
      riskFreeRate,
      initialCapital,
      inSampleYears: [...inSampleYears],
      outSampleYears: [...outSampleYears],
      // Indicator-specific parameters
      ...(indicatorType === 'ema' ? {
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
      if (savedSetup.indicatorType !== 'ema') {
        indicatorParams = {
          length: savedSetup.indicatorLength,
          top: savedSetup.indicatorTop,
          bottom: savedSetup.indicatorBottom
        }
      }

      // Construct backtest config with entry/exit delays
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

      setStressTestResults({
        trades: filteredTrades,
        openPosition: data.open_position,
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

  // Hypothesis Testing calculation function
  const handleRunHypothesisTest = useCallback(() => {
    if (!savedSetup?.strategyReturns || savedSetup.strategyReturns.length === 0) {
      setHypothesisError('No trade returns available. Please ensure your saved setup has trade data.')
      return
    }

    setIsHypothesisLoading(true)
    setHypothesisError(null)
    setHypothesisResults(null)

    try {
      const returns = savedSetup.strategyReturns // Array of trade returns (as decimals)
      const n = returns.length
      
      if (n < 2) {
        throw new Error('Need at least 2 trades to perform hypothesis testing')
      }

      // Calculate sample statistics
      const mean = returns.reduce((sum, r) => sum + r, 0) / n
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (n - 1)
      const stdDev = Math.sqrt(variance)
      const stdError = stdDev / Math.sqrt(n)
      
      // Null hypothesis value (convert from percentage to decimal)
      const nullMean = hypothesisNullReturn / 100
      
      // Calculate t-statistic: (sample_mean - null_mean) / standard_error
      const tStatistic = stdError > 0 ? (mean - nullMean) / stdError : 0
      
      // Degrees of freedom
      const df = n - 1
      
      // Calculate p-value using t-distribution approximation
      // One-tailed test (testing if mean > null)
      const pValueOneTailed = tDistributionPValue(Math.abs(tStatistic), df)
      const pValueTwoTailed = pValueOneTailed * 2
      
      // Critical value based on confidence level
      const alpha = (100 - hypothesisConfidenceLevel) / 100
      const criticalValue = tDistributionCritical(alpha, df)
      
      // Determine if we reject the null hypothesis
      const rejectNull = Math.abs(tStatistic) > criticalValue
      
      // Calculate confidence interval
      const marginOfError = criticalValue * stdError
      const confidenceIntervalLow = mean - marginOfError
      const confidenceIntervalHigh = mean + marginOfError
      
      // Effect size (Cohen's d)
      const cohensD = stdDev > 0 ? (mean - nullMean) / stdDev : 0
      
      // Interpretation
      let interpretation = ''
      let significance = ''
      
      if (rejectNull) {
        if (mean > nullMean) {
          interpretation = `The strategy's returns are statistically significantly GREATER than ${hypothesisNullReturn}% at the ${hypothesisConfidenceLevel}% confidence level.`
          significance = 'profitable'
        } else {
          interpretation = `The strategy's returns are statistically significantly LESS than ${hypothesisNullReturn}% at the ${hypothesisConfidenceLevel}% confidence level.`
          significance = 'unprofitable'
        }
      } else {
        interpretation = `Cannot reject the null hypothesis. There is insufficient evidence to conclude that the strategy's returns are significantly different from ${hypothesisNullReturn}%.`
        significance = 'inconclusive'
      }
      
      setHypothesisResults({
        sampleSize: n,
        sampleMean: mean,
        sampleStdDev: stdDev,
        stdError,
        nullMean,
        tStatistic,
        degreesOfFreedom: df,
        pValueOneTailed,
        pValueTwoTailed,
        criticalValue,
        confidenceLevel: hypothesisConfidenceLevel,
        rejectNull,
        confidenceIntervalLow,
        confidenceIntervalHigh,
        cohensD,
        interpretation,
        significance
      })

    } catch (err) {
      console.error('Hypothesis test error:', err)
      setHypothesisError(err.message || 'Failed to run hypothesis test')
    } finally {
      setIsHypothesisLoading(false)
    }
  }, [savedSetup, hypothesisNullReturn, hypothesisConfidenceLevel])

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
    if (indicatorType === 'ema') {
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
    if (indicatorType === 'ema') {
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
      const x = indicatorType === 'ema' ? (r.ema_short || r.indicator_bottom) : (r.indicator_bottom || r.ema_short)
      const y = indicatorType === 'ema' ? (r.ema_long || r.indicator_top) : (r.indicator_top || r.ema_long)
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
    if (indicatorType === 'ema') {
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
    link.download = `optimization_${symbol}_${interval}_${inSampleYears.join('-')}.csv`
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
            <h1>Strategy Optimizer</h1>
            <p className={styles.subtitle}>Find the optimal indicator parameters for your trading strategy</p>
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
                  <label>
                    <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>show_chart</span>
                    Indicator Type
                  </label>
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
                      <label>Length (Fixed)</label>
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
                      <label>Length (Fixed)</label>
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
                      <label>Length (Fixed)</label>
                      <input type="number" value={indicatorLength} onChange={(e) => setIndicatorLength(Number(e.target.value))} min={3} max={100} className={styles.input} />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Min Bottom</label>
                      <input type="number" value={minIndicatorBottomZscore} onChange={(e) => setMinIndicatorBottomZscore(Number(e.target.value))} min={-2} max={0} step={0.1} className={styles.input} />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Max Top</label>
                      <input type="number" value={maxIndicatorTopZscore} onChange={(e) => setMaxIndicatorTopZscore(Number(e.target.value))} min={0} max={2} step={0.1} className={styles.input} />
                    </div>
                  </>
                )}

                <div className={styles.formGroup}>
                  <label>Risk-Free Rate (%)</label>
                  <input 
                    type="number" 
                    value={riskFreeRate * 100} 
                    onChange={(e) => setRiskFreeRate(Number(e.target.value) / 100)} 
                    min={0} 
                    max={20} 
                    step={0.1}
                    className={styles.input} 
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Saved Optimization Configs Section */}
          <div className={styles.collapsibleSection}>
            <div 
              className={styles.sectionHeader}
              onClick={() => toggleSection('savedConfigs')}
            >
              <h2>
                <span className="material-icons">folder_open</span>
                Optimization Strategies
              </h2>
              <span className={`material-icons ${styles.chevron} ${expandedSections.savedConfigs ? styles.expanded : ''}`}>
                expand_more
              </span>
            </div>
            
            {expandedSections.savedConfigs && (
              <div className={styles.sectionContent}>
                <div className={styles.savedConfigsContainer}>
                  {/* Action Buttons */}
                  <div className={styles.configActions}>
                    <button 
                      className={`${styles.configActionButton} ${styles.primary}`}
                      onClick={() => setShowSaveConfigModal(true)}
                    >
                      <span className="material-icons">save</span>
                      Save Current
                    </button>
                    <button 
                      className={styles.configActionButton}
                      onClick={handleNewConfig}
                    >
                      <span className="material-icons">add</span>
                      New Strategy
                    </button>
                  </div>

                  {/* Saved Configs List */}
                  {savedOptimizationConfigs.length > 0 ? (
                    <div className={styles.configsList}>
                      <h4>
                        <span className="material-icons">history</span>
                        Saved Strategies ({savedOptimizationConfigs.length})
                      </h4>
                      <div className={styles.configsGrid}>
                        {savedOptimizationConfigs.map((config) => (
                          <div 
                            key={config.id}
                            className={`${styles.configCard} ${selectedConfigId === config.id ? styles.selected : ''}`}
                          >
                            <div className={styles.configCardHeader}>
                              <h5>{config.name}</h5>
                              <span className={styles.configDate}>
                                {new Date(config.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <div className={styles.configCardDetails}>
                              <span className={styles.configTag}>{config.symbol}</span>
                              <span className={styles.configTag}>{config.interval}</span>
                              <span className={styles.configTag}>{config.indicatorType.toUpperCase()}</span>
                              <span className={styles.configTag}>{config.positionType.replace('_', ' ')}</span>
                            </div>
                            <div className={styles.configCardActions}>
                              <button 
                                className={styles.configLoadButton}
                                onClick={() => handleLoadConfig(config.id)}
                              >
                                <span className="material-icons">upload</span>
                                Load
                              </button>
                              <button 
                                className={styles.configDeleteButton}
                                onClick={() => handleDeleteConfig(config.id)}
                              >
                                <span className="material-icons">delete</span>
                              </button>
                            </div>
                            {selectedConfigId === config.id && (
                              <div className={styles.configActiveIndicator}>
                                <span className="material-icons">check_circle</span>
                                Active
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.noConfigsMessage}>
                      <span className="material-icons">inventory_2</span>
                      <p>No saved strategies yet. Configure your optimization settings and click "Save Current" to save them.</p>
                    </div>
                  )}

                  {/* Current Config Summary */}
                  {selectedConfigId && (
                    <div className={styles.currentConfigSummary}>
                      <span className="material-icons">info</span>
                      <span>
                        Currently using: <strong>{savedOptimizationConfigs.find(c => c.id === selectedConfigId)?.name}</strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
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
                  disabled={isCalculatingInSample || inSampleYears.length === 0}
                >
                  {isCalculatingInSample ? (
                    <><span className={`material-icons ${styles.spinning}`}>sync</span> Calculating...</>
                  ) : (
                    <><span className="material-icons">calculate</span> Calculate In-Sample</>
                  )}
                </button>
              </div>

              {inSampleError && (
                <div className={styles.errorMessage}>
                  <span className="material-icons">error</span>
                  {inSampleError}
                </div>
              )}

              {inSampleResults && (
                <div className={styles.resultsContainer}>
                  {/* Summary */}
                  <div className={styles.resultsSummary}>
                    <div className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>
                        {indicatorType === 'ema' ? 'Best EMA' : 
                         indicatorType === 'rsi' ? 'Best RSI' :
                         indicatorType === 'cci' ? 'Best CCI' : 'Best Z-Score'}
                      </span>
                      <span className={styles.summaryValue}>
                        {indicatorType === 'ema' 
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
                      <span className={styles.summaryValue}>{inSampleResults.period}</span>
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
                            {indicatorType === 'ema' ? 'Long EMA →' : 'Top →'}
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
                                    const isValid = (indicatorType === 'ema' ? x < y : true) && result
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
                                          ...(indicatorType === 'ema' ? { emaShort: x, emaLong: y } : { indicator_bottom: x, indicator_top: y }),
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
                              {indicatorType === 'ema' ? 'Short EMA →' : 'Bottom →'}
                            </div>
                          </div>
                          
                          {/* Hover tooltip - follows mouse */}
                          {heatmapHover && (
                            <div 
                              className={styles.heatmapTooltip}
                              style={{ left: mousePos.x, top: mousePos.y }}
                            >
                              <div className={styles.tooltipHeader}>
                                {indicatorType === 'ema' 
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
                        <h4>All Combinations <span className={styles.tableHint}>(Click row to use in Out-of-Sample)</span></h4>
                        <button className={styles.exportButton} onClick={exportToCSV}>
                          <span className="material-icons">download</span>
                          Export CSV
                        </button>
                      </div>
                      <div className={styles.tableContainer}>
                        <table className={styles.resultsTable}>
                          <thead>
                            <tr>
                              {indicatorType === 'ema' ? (
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
                              const xValue = indicatorType === 'ema' ? (row.ema_short || row.indicator_bottom) : (row.indicator_bottom || row.ema_short)
                              const yValue = indicatorType === 'ema' ? (row.ema_long || row.indicator_top) : (row.indicator_top || row.ema_long)
                              const isSelected = indicatorType === 'ema' 
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
                  </div>
                </div>

                {/* Out-of-Sample Section */}
                <div className={styles.sampleSection}>
                  <div className={`${styles.sampleCard} ${styles.outSampleCard}`}>
                    <div className={styles.sampleHeader}>
                      <h3>
                        <span className="material-icons">verified</span>
                        Out-of-Sample Validation
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
                    {indicatorType === 'ema' ? (
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
                  </div>
                  <div className={styles.emaHint}>
                    <span className="material-icons">info</span>
                    Click a row in the In-Sample table or heatmap to auto-fill values
                  </div>
                </div>

                <button 
                  className={`${styles.calculateButton} ${styles.outSampleButton}`}
                  onClick={calculateOutSample}
                  disabled={isCalculatingOutSample || outSampleYears.length === 0}
                >
                  {isCalculatingOutSample ? (
                    <><span className={`material-icons ${styles.spinning}`}>sync</span> Calculating...</>
                  ) : (
                    <><span className="material-icons">verified</span> Validate Strategy</>
                  )}
                </button>
              </div>

              {outSampleError && (
                <div className={styles.errorMessage}>
                  <span className="material-icons">error</span>
                  {outSampleError}
                </div>
              )}

              {outSampleResult && (
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
                        <div className={styles.chartArea}>
                          <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className={styles.equitySvg}>
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
                          </svg>
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
                            {savedSetup.indicatorType === 'ema' 
                              ? `EMA ${savedSetup.emaShort}/${savedSetup.emaLong}`
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
                            <div className={styles.miniChart}>
                              <svg viewBox="0 0 400 150" preserveAspectRatio="none">
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
                                    <polyline
                                      points={points}
                                      fill="none"
                                      stroke="#4488ff"
                                      strokeWidth="2"
                                    />
                                  )
                                })()}
                              </svg>
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
                            <div className={styles.miniChart}>
                              <svg viewBox="0 0 400 150" preserveAspectRatio="none">
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
                                    <polyline
                                      points={points}
                                      fill="none"
                                      stroke="#22c55e"
                                      strokeWidth="2"
                                    />
                                  )
                                })()}
                              </svg>
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
                          <h5>
                            <span className="material-icons">analytics</span>
                            Resampling Distribution Summary
                          </h5>
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
                                {savedSetup?.indicatorType === 'ema' 
                                  ? `EMA ${savedSetup?.emaShort}/${savedSetup?.emaLong}`
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
                        <h4>
                          <span className="material-icons">insights</span>
                          Simulation Results ({monteCarloResults.statistics.numSimulations.toLocaleString()} runs)
                        </h4>

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
                    {/* Setup Info */}
                    <div className={styles.savedSetupInfo}>
                      <div className={styles.savedSetupHeader}>
                        <span className="material-icons">check_circle</span>
                        <h4>Using Saved Validated Setup</h4>
                      </div>
                      <div className={styles.savedSetupDetails}>
                        <div className={styles.setupDetailRow}>
                          <span className={styles.setupLabel}>Trades:</span>
                          <span className={styles.setupValue}>{savedSetup.strategyReturns?.length || 0}</span>
                        </div>
                        <div className={styles.setupDetailRow}>
                          <span className={styles.setupLabel}>Avg Return:</span>
                          <span className={styles.setupValue}>
                            {savedSetup.strategyReturns?.length > 0 
                              ? ((savedSetup.strategyReturns.reduce((a, b) => a + b, 0) / savedSetup.strategyReturns.length) * 100).toFixed(2) + '%'
                              : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Hypothesis Test Controls */}
                    <div className={styles.hypothesisControls}>
                      <h4>
                        <span className="material-icons">science</span>
                        Hypothesis Test Configuration
                      </h4>
                      <p className={styles.hypothesisDescription}>
                        Test whether your strategy's returns are statistically significantly different from a benchmark return.
                        This helps determine if profits are due to skill or random chance.
                      </p>
                      
                      <div className={styles.hypothesisInputsGrid}>
                        {/* Null Hypothesis (Benchmark Return) */}
                        <div className={styles.inputGroup}>
                          <label>Benchmark Daily Return (%)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={hypothesisNullReturn}
                            onChange={(e) => {
                              setHypothesisNullReturn(parseFloat(e.target.value) || 0)
                              setHypothesisResults(null)
                            }}
                            className={styles.input}
                          />
                          <span className={styles.inputHint}>H₀: Strategy return = benchmark</span>
                        </div>

                        {/* Confidence Level */}
                        <div className={styles.inputGroup}>
                          <label>Confidence Level</label>
                          <div className={styles.confidenceSelector}>
                            {[90, 95, 99].map(level => (
                              <button
                                key={level}
                                className={`${styles.confidenceButton} ${hypothesisConfidenceLevel === level ? styles.active : ''}`}
                                onClick={() => {
                                  setHypothesisConfidenceLevel(level)
                                  setHypothesisResults(null)
                                }}
                              >
                                {level}%
                              </button>
                            ))}
                          </div>
                          <span className={styles.inputHint}>α = {((100 - hypothesisConfidenceLevel) / 100).toFixed(2)}</span>
                        </div>
                      </div>

                      <button
                        className={styles.calculateButton}
                        onClick={handleRunHypothesisTest}
                        disabled={isHypothesisLoading || !savedSetup?.strategyReturns?.length}
                      >
                        {isHypothesisLoading ? (
                          <>
                            <span className="material-icons spinning">sync</span>
                            Running Test...
                          </>
                        ) : (
                          <>
                            <span className="material-icons">analytics</span>
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
                    </div>

                    {/* Hypothesis Test Results */}
                    {hypothesisResults && (
                      <div className={`${styles.hypothesisResults} ${
                        hypothesisResults.significance === 'profitable' ? styles.profitableResult :
                        hypothesisResults.significance === 'unprofitable' ? styles.unprofitableResult :
                        styles.inconclusiveResult
                      }`}>
                        <h4>
                          <span className="material-icons">
                            {hypothesisResults.rejectNull ? 'verified' : 'help_outline'}
                          </span>
                          Test Results
                        </h4>

                        {/* Conclusion Banner */}
                        <div className={`${styles.conclusionBanner} ${
                          hypothesisResults.significance === 'profitable' ? styles.profitable :
                          hypothesisResults.significance === 'unprofitable' ? styles.unprofitable :
                          styles.inconclusive
                        }`}>
                          <span className="material-icons">
                            {hypothesisResults.significance === 'profitable' ? 'check_circle' :
                             hypothesisResults.significance === 'unprofitable' ? 'cancel' : 'help'}
                          </span>
                          <div>
                            <strong>
                              {hypothesisResults.rejectNull ? 'Reject Null Hypothesis' : 'Fail to Reject Null Hypothesis'}
                            </strong>
                            <p>{hypothesisResults.interpretation}</p>
                          </div>
                        </div>

                        {/* Statistics Grid */}
                        <div className={styles.hypothesisStatsGrid}>
                          <div className={styles.statCard}>
                            <span className={styles.statLabel}>Sample Size (n)</span>
                            <span className={styles.statValue}>{hypothesisResults.sampleSize}</span>
                          </div>
                          <div className={styles.statCard}>
                            <span className={styles.statLabel}>Sample Mean</span>
                            <span className={`${styles.statValue} ${hypothesisResults.sampleMean >= 0 ? styles.positive : styles.negative}`}>
                              {(hypothesisResults.sampleMean * 100).toFixed(3)}%
                            </span>
                          </div>
                          <div className={styles.statCard}>
                            <span className={styles.statLabel}>Std Deviation</span>
                            <span className={styles.statValue}>
                              {(hypothesisResults.sampleStdDev * 100).toFixed(3)}%
                            </span>
                          </div>
                          <div className={styles.statCard}>
                            <span className={styles.statLabel}>Std Error</span>
                            <span className={styles.statValue}>
                              {(hypothesisResults.stdError * 100).toFixed(4)}%
                            </span>
                          </div>
                          <div className={styles.statCard}>
                            <span className={styles.statLabel}>t-Statistic</span>
                            <span className={`${styles.statValue} ${Math.abs(hypothesisResults.tStatistic) > hypothesisResults.criticalValue ? styles.significant : ''}`}>
                              {hypothesisResults.tStatistic.toFixed(3)}
                            </span>
                          </div>
                          <div className={styles.statCard}>
                            <span className={styles.statLabel}>Critical Value</span>
                            <span className={styles.statValue}>
                              ±{hypothesisResults.criticalValue.toFixed(3)}
                            </span>
                          </div>
                          <div className={styles.statCard}>
                            <span className={styles.statLabel}>p-value (two-tailed)</span>
                            <span className={`${styles.statValue} ${hypothesisResults.pValueTwoTailed < (100 - hypothesisResults.confidenceLevel) / 100 ? styles.significant : ''}`}>
                              {hypothesisResults.pValueTwoTailed < 0.0001 ? '< 0.0001' : hypothesisResults.pValueTwoTailed.toFixed(4)}
                            </span>
                          </div>
                          <div className={styles.statCard}>
                            <span className={styles.statLabel}>Cohen's d</span>
                            <span className={styles.statValue}>
                              {hypothesisResults.cohensD.toFixed(3)}
                              <span className={styles.effectSize}>
                                ({Math.abs(hypothesisResults.cohensD) < 0.2 ? 'negligible' :
                                  Math.abs(hypothesisResults.cohensD) < 0.5 ? 'small' :
                                  Math.abs(hypothesisResults.cohensD) < 0.8 ? 'medium' : 'large'})
                              </span>
                            </span>
                          </div>
                        </div>

                        {/* Confidence Interval */}
                        <div className={styles.confidenceInterval}>
                          <h5>
                            <span className="material-icons">straighten</span>
                            {hypothesisResults.confidenceLevel}% Confidence Interval for Mean Return
                          </h5>
                          <div className={styles.intervalVisual}>
                            <div className={styles.intervalBar}>
                              <div 
                                className={styles.intervalRange}
                                style={{
                                  left: `${Math.max(0, 50 + (hypothesisResults.confidenceIntervalLow * 500))}%`,
                                  width: `${Math.min(100, (hypothesisResults.confidenceIntervalHigh - hypothesisResults.confidenceIntervalLow) * 500)}%`
                                }}
                              />
                              <div className={styles.intervalZero} style={{ left: '50%' }} />
                            </div>
                            <div className={styles.intervalLabels}>
                              <span className={hypothesisResults.confidenceIntervalLow >= 0 ? styles.positive : styles.negative}>
                                {(hypothesisResults.confidenceIntervalLow * 100).toFixed(3)}%
                              </span>
                              <span className={styles.intervalCenter}>0%</span>
                              <span className={hypothesisResults.confidenceIntervalHigh >= 0 ? styles.positive : styles.negative}>
                                {(hypothesisResults.confidenceIntervalHigh * 100).toFixed(3)}%
                              </span>
                            </div>
                          </div>
                          {hypothesisResults.confidenceIntervalLow > 0 && (
                            <p className={styles.intervalNote}>
                              <span className="material-icons">check</span>
                              The entire confidence interval is above zero, suggesting consistent profitability.
                            </p>
                          )}
                          {hypothesisResults.confidenceIntervalHigh < 0 && (
                            <p className={styles.intervalNote}>
                              <span className="material-icons">warning</span>
                              The entire confidence interval is below zero, suggesting consistent losses.
                            </p>
                          )}
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
                            {savedSetup.indicatorType === 'ema' 
                              ? `EMA ${savedSetup.emaShort}/${savedSetup.emaLong}`
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
                            {[1, 2, 3, 4, 5].map(delay => (
                              <button
                                key={delay}
                                className={`${styles.delayButton} ${stressTestEntryDelay === delay ? styles.active : ''}`}
                                onClick={() => setStressTestEntryDelay(delay)}
                              >
                                {delay}
                              </button>
                            ))}
                          </div>
                          <span className={styles.inputHint}>Bars after signal to enter</span>
                        </div>

                        {/* Exit Delay */}
                        <div className={styles.inputGroup}>
                          <label>Exit Delay (Bars)</label>
                          <div className={styles.delaySelector}>
                            {[1, 2, 3, 4, 5].map(delay => (
                              <button
                                key={delay}
                                className={`${styles.delayButton} ${stressTestExitDelay === delay ? styles.active : ''}`}
                                onClick={() => setStressTestExitDelay(delay)}
                              >
                                {delay}
                              </button>
                            ))}
                          </div>
                          <span className={styles.inputHint}>Bars after signal to exit</span>
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
                        <h4>
                          <span className="material-icons">assessment</span>
                          Test Results ({stressTestStartYear} - Present)
                        </h4>

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
                            Price Chart with Trade Annotations
                          </h5>
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
