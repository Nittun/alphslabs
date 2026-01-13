'use client'

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import MonteCarloChart from '@/components/MonteCarloChart'
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
  
  // Heatmap hover state
  const [heatmapHover, setHeatmapHover] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  
  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState({
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
              </h2>
              <span className={`material-icons ${styles.chevron} ${expandedSections.significance ? styles.expanded : ''}`}>
                expand_more
              </span>
            </div>
            
            {expandedSections.significance && (
              <div className={styles.sectionContent}>
                {savedSetup ? (
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
                        <span className={styles.setupLabel}>Interval:</span>
                        <span className={styles.setupValue}>{savedSetup.interval}</span>
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
                        <span className={styles.setupLabel}>Position Type:</span>
                        <span className={styles.setupValue}>{savedSetup.positionType}</span>
                      </div>
                      <div className={styles.setupDetailRow}>
                        <span className={styles.setupLabel}>Initial Capital:</span>
                        <span className={styles.setupValue}>${savedSetup.initialCapital.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={styles.placeholderContent}>
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
              </h2>
              <span className={`material-icons ${styles.chevron} ${expandedSections.stressTest ? styles.expanded : ''}`}>
                expand_more
              </span>
            </div>
            
            {expandedSections.stressTest && (
              <div className={styles.sectionContent}>
                {savedSetup ? (
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
                        <span className={styles.setupLabel}>Interval:</span>
                        <span className={styles.setupValue}>{savedSetup.interval}</span>
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
                        <span className={styles.setupLabel}>Position Type:</span>
                        <span className={styles.setupValue}>{savedSetup.positionType}</span>
                      </div>
                      <div className={styles.setupDetailRow}>
                        <span className={styles.setupLabel}>Initial Capital:</span>
                        <span className={styles.setupValue}>${savedSetup.initialCapital.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={styles.placeholderContent}>
                    <p>Please validate a strategy in the "Strategy Robust Test" section and save the setup to use it here.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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
