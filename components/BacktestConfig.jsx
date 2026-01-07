'use client'

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import Swal from 'sweetalert2'
import { useBacktestConfig } from '@/context/BacktestConfigContext'
import { useDatabase } from '@/hooks/useDatabase'
import { API_URL } from '@/lib/api'
import styles from './BacktestConfig.module.css'

// Constants moved outside component
const INTERVALS = ['1h', '2h', '4h', '1d', '1W', '1M']
const EMA_PERIOD_SUGGESTIONS = [5, 8, 9, 10, 12, 13, 20, 21, 26, 34, 50, 55, 89, 100, 144, 200, 233]
const STRATEGY_MODES = [
  { value: 'reversal', label: 'A: Reversal (Always in market)', description: 'Exit and immediately enter opposite on crossover' },
  { value: 'wait_for_next', label: 'B: Wait for Next (Flat periods)', description: 'Exit on crossover, wait for NEXT crossover to re-enter' },
  { value: 'long_only', label: 'C: Long Only', description: 'Only Long trades - enter on Golden Cross, exit on Death Cross' },
  { value: 'short_only', label: 'D: Short Only', description: 'Only Short trades - enter on Death Cross, exit on Golden Cross' },
]
const INDICATOR_TYPES = [
  { value: 'ema', label: 'EMA (Exponential Moving Average)', description: 'Crossover of two EMAs' },
  { value: 'ma', label: 'MA (Simple Moving Average)', description: 'Crossover of two MAs' },
  { value: 'rsi', label: 'RSI (Relative Strength Index)', description: 'Overbought/Oversold levels' },
  { value: 'cci', label: 'CCI (Commodity Channel Index)', description: 'Overbought/Oversold levels' },
  { value: 'zscore', label: 'Z-Score', description: 'Statistical deviation from mean' },
]

// Max days back for hourly intervals (yfinance limitation)
const MAX_DAYS_HOURLY = 729

// Pure utility functions
const getTypeIcon = (type) => {
  switch(type) {
    case 'crypto': return 'currency_bitcoin'
    case 'stock': return 'trending_up'
    case 'forex': return 'currency_exchange'
    default: return 'show_chart'
  }
}

const getTypeColor = (type) => {
  switch(type) {
    case 'crypto': return '#F7931A'
    case 'stock': return '#00C853'
    case 'forex': return '#2196F3'
    default: return '#888'
  }
}

function BacktestConfig({ onRunBacktest, isLoading, apiConnected }) {
  const { config, updateConfig, isLoaded } = useBacktestConfig()
  const { saveConfig, setDefaultConfig } = useDatabase()
  const [isSaving, setIsSaving] = useState(false)
  const [isSettingDefault, setIsSettingDefault] = useState(false)
  
  const [asset, setAsset] = useState('BTC/USDT')
  const [assetSearch, setAssetSearch] = useState('BTC/USDT')
  const [assetSuggestions, setAssetSuggestions] = useState([])
  const [showAssetSuggestions, setShowAssetSuggestions] = useState(false)
  
  // Date range for backtest (default: 2 years ago to today)
  const getDefaultDates = () => {
    const end = new Date()
    const start = new Date()
    start.setFullYear(start.getFullYear() - 2)
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    }
  }
  const defaultDates = getDefaultDates()
  const [startDate, setStartDate] = useState(defaultDates.start)
  const [endDate, setEndDate] = useState(defaultDates.end)
  
  const [interval, setIntervalState] = useState('4h')
  const [dateValidationError, setDateValidationError] = useState(null)
  
  // Check if interval is hourly (has data limit)
  const isHourlyInterval = useMemo(() => {
    return ['1h', '2h', '4h'].includes(interval)
  }, [interval])
  
  // Calculate max start date based on interval and end date
  const getMaxStartDate = useCallback((endDateStr, intervalType) => {
    if (!['1h', '2h', '4h'].includes(intervalType)) {
      return null // No limit for non-hourly intervals
    }
    const end = new Date(endDateStr)
    const maxStart = new Date(end)
    maxStart.setDate(maxStart.getDate() - MAX_DAYS_HOURLY)
    return maxStart.toISOString().split('T')[0]
  }, [])
  
  // Validate and auto-adjust date range for hourly intervals
  useEffect(() => {
    if (!isHourlyInterval) {
      setDateValidationError(null)
      return
    }
    
    const maxStartDateStr = getMaxStartDate(endDate, interval)
    if (!maxStartDateStr) {
      setDateValidationError(null)
      return
    }
    
    if (startDate < maxStartDateStr) {
      const maxDate = new Date(maxStartDateStr)
      setDateValidationError(
        `Hourly intervals are limited to ${MAX_DAYS_HOURLY} days. Maximum start date: ${maxDate.toLocaleDateString()}`
      )
    } else {
      setDateValidationError(null)
    }
  }, [startDate, endDate, interval, isHourlyInterval, getMaxStartDate])
  
  // Auto-adjust start date when interval changes to hourly
  useEffect(() => {
    if (isHourlyInterval) {
      const maxStartDateStr = getMaxStartDate(endDate, interval)
      if (maxStartDateStr && startDate < maxStartDateStr) {
        // Only adjust if significantly different (user probably selected before changing interval)
        setStartDate(maxStartDateStr)
      }
    } else {
      // Clear error when switching away from hourly
      setDateValidationError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval]) // Only run when interval changes
  const [initialCapital, setInitialCapital] = useState(10000)
  const [enableShort, setEnableShort] = useState(true)
  const [strategyMode, setStrategyMode] = useState('reversal')
  
  const [indicatorType, setIndicatorType] = useState('ema')
  const [emaFastInput, setEmaFastInput] = useState('12')
  const [emaSlowInput, setEmaSlowInput] = useState('26')
  const [maFastInput, setMaFastInput] = useState('12')
  const [maSlowInput, setMaSlowInput] = useState('26')
  const [showFastSuggestions, setShowFastSuggestions] = useState(false)
  const [showSlowSuggestions, setShowSlowSuggestions] = useState(false)
  const [showMaFastSuggestions, setShowMaFastSuggestions] = useState(false)
  const [showMaSlowSuggestions, setShowMaSlowSuggestions] = useState(false)
  
  // RSI parameters (using length, top, bottom)
  const [rsiLength, setRsiLength] = useState('14')
  const [rsiTop, setRsiTop] = useState('70')
  const [rsiBottom, setRsiBottom] = useState('30')
  
  // CCI parameters (using length, top, bottom)
  const [cciLength, setCciLength] = useState('20')
  const [cciTop, setCciTop] = useState('100')
  const [cciBottom, setCciBottom] = useState('-100')
  
  // Z-Score parameters (using length, top, bottom)
  const [zscoreLength, setZscoreLength] = useState('20')
  const [zscoreTop, setZscoreTop] = useState('2')
  const [zscoreBottom, setZscoreBottom] = useState('-2')
  
  const assetInputRef = useRef(null)
  const emaFastRef = useRef(null)
  const emaSlowRef = useRef(null)
  const maFastRef = useRef(null)
  const maSlowRef = useRef(null)

  // Load saved config on mount
  useEffect(() => {
    if (isLoaded && config) {
      setAsset(config.asset || 'BTC/USDT')
      setAssetSearch(config.asset || 'BTC/USDT')
      if (config.start_date) setStartDate(config.start_date)
      if (config.end_date) setEndDate(config.end_date)
      setIntervalState(config.interval || '4h')
      setInitialCapital(config.initial_capital || 10000)
      setEnableShort(config.enable_short !== false)
      setStrategyMode(config.strategy_mode || 'reversal')
      setIndicatorType(config.indicator_type || 'ema')
      setEmaFastInput(String(config.ema_fast || 12))
      setEmaSlowInput(String(config.ema_slow || 26))
      if (config.indicator_params) {
        if (config.indicator_type === 'ma') {
          setMaFastInput(String(config.indicator_params.fast || 12))
          setMaSlowInput(String(config.indicator_params.slow || 26))
        } else if (config.indicator_type === 'rsi') {
          setRsiLength(String(config.indicator_params.length || config.indicator_params.period || 14))
          setRsiTop(String(config.indicator_params.top || config.indicator_params.overbought || 70))
          setRsiBottom(String(config.indicator_params.bottom || config.indicator_params.oversold || 30))
        } else if (config.indicator_type === 'cci') {
          setCciLength(String(config.indicator_params.length || config.indicator_params.period || 20))
          setCciTop(String(config.indicator_params.top || config.indicator_params.overbought || 100))
          setCciBottom(String(config.indicator_params.bottom || config.indicator_params.oversold || -100))
        } else if (config.indicator_type === 'zscore') {
          setZscoreLength(String(config.indicator_params.length || config.indicator_params.period || 20))
          setZscoreTop(String(config.indicator_params.top || config.indicator_params.upper || 2))
          setZscoreBottom(String(config.indicator_params.bottom || config.indicator_params.lower || -2))
        }
      }
    }
  }, [isLoaded, config])
  

  // Fetch all available assets on mount
  useEffect(() => {
    const fetchAllAssets = async () => {
      try {
        const response = await fetch(`${API_URL}/api/search-assets?q=`)
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.results.length > 0) {
            setAssetSuggestions(data.results)
          }
        }
      } catch (error) {
        console.warn('Failed to fetch available assets:', error)
      }
    }
    fetchAllAssets()
  }, [])

  // Filter asset suggestions based on search
  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const response = await fetch(`${API_URL}/api/search-assets?q=${encodeURIComponent(assetSearch)}`)
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setAssetSuggestions(data.results)
          }
        }
      } catch (error) {
        console.warn('Failed to search assets:', error)
      }
    }

    const debounce = setTimeout(fetchSuggestions, 300)
    return () => clearTimeout(debounce)
  }, [assetSearch])

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (assetInputRef.current && !assetInputRef.current.contains(e.target)) {
        setShowAssetSuggestions(false)
      }
      if (emaFastRef.current && !emaFastRef.current.contains(e.target)) {
        setShowFastSuggestions(false)
      }
      if (emaSlowRef.current && !emaSlowRef.current.contains(e.target)) {
        setShowSlowSuggestions(false)
      }
      if (maFastRef.current && !maFastRef.current.contains(e.target)) {
        setShowMaFastSuggestions(false)
      }
      if (maSlowRef.current && !maSlowRef.current.contains(e.target)) {
        setShowMaSlowSuggestions(false)
      }
      if (maFastRef.current && !maFastRef.current.contains(e.target)) {
        setShowMaFastSuggestions(false)
      }
      if (maSlowRef.current && !maSlowRef.current.contains(e.target)) {
        setShowMaSlowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleAssetSelect = (selectedAsset) => {
    setAsset(selectedAsset.symbol)
    setAssetSearch(selectedAsset.symbol)
    setShowAssetSuggestions(false)
  }

  const handleEmaFastSelect = (period) => {
    setEmaFastInput(String(period))
    setShowFastSuggestions(false)
  }

  const handleEmaSlowSelect = (period) => {
    setEmaSlowInput(String(period))
    setShowSlowSuggestions(false)
  }

  const getEmaFast = () => {
    const val = parseInt(emaFastInput)
    return isNaN(val) || val < 1 ? 12 : val
  }

  const getEmaSlow = () => {
    const val = parseInt(emaSlowInput)
    return isNaN(val) || val < 1 ? 26 : val
  }

  const handleRun = () => {
    let emaFast = getEmaFast()
    let emaSlow = getEmaSlow()
    
    // Ensure fast < slow
    if (emaFast >= emaSlow) {
      const temp = emaFast
      emaFast = emaSlow
      emaSlow = temp
    }
    
    // Validate dates
    if (new Date(startDate) >= new Date(endDate)) {
      Swal.fire({
        icon: 'error',
        title: 'Invalid Date Range',
        text: 'Start date must be before end date',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#ff4444'
      })
      return
    }
    
    // Build indicator parameters based on selected indicator type
    let indicatorParams = null
    if (indicatorType === 'ema') {
      indicatorParams = { fast: emaFast, slow: emaSlow }
    } else if (indicatorType === 'ma') {
      let maFast = getMaFast()
      let maSlow = getMaSlow()
      if (maFast >= maSlow) {
        const temp = maFast
        maFast = maSlow
        maSlow = temp
      }
      indicatorParams = { fast: maFast, slow: maSlow }
    } else if (indicatorType === 'rsi') {
      indicatorParams = {
        length: parseInt(rsiLength) || 14,
        top: parseFloat(rsiTop) || 70,
        bottom: parseFloat(rsiBottom) || 30
      }
    } else if (indicatorType === 'cci') {
      indicatorParams = {
        length: parseInt(cciLength) || 20,
        top: parseFloat(cciTop) || 100,
        bottom: parseFloat(cciBottom) || -100
      }
    } else if (indicatorType === 'zscore') {
      indicatorParams = {
        length: parseInt(zscoreLength) || 20,
        top: parseFloat(zscoreTop) || 2,
        bottom: parseFloat(zscoreBottom) || -2
      }
    }
    
    const runConfig = {
      asset: asset || assetSearch,
      start_date: startDate,
      end_date: endDate,
      interval,
      initial_capital: initialCapital,
      enable_short: enableShort,
      strategy_mode: strategyMode,
      ema_fast: emaFast,
      ema_slow: emaSlow,
      indicator_type: indicatorType,
      indicator_params: indicatorParams,
    }
    
    // Save config to context (will be persisted to localStorage)
    updateConfig(runConfig)
    
    onRunBacktest(runConfig)
  }

  return (
    <div className={styles.config}>
      <h3>
        <span className="material-icons" style={{ marginRight: '0.5rem', fontSize: '1.2rem' }}>tune</span>
        Backtest Configuration
      </h3>
      {!apiConnected && (
        <div className={styles.statusBanner} style={{ background: '#ff4444' }}>
          <span className="material-icons">warning</span>
          API server not connected. Make sure Python API is running on port 5001
        </div>
      )}
      {apiConnected && (
        <div className={styles.statusBanner} style={{ background: '#00ff88', color: '#000' }}>
          <span className="material-icons">check_circle</span>
          API server connected
        </div>
      )}
      <div className={styles.form}>
        {/* Asset Input with Search */}
        <div className={styles.formGroup} ref={assetInputRef}>
          <label>
            <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>search</span>
            Asset / Symbol
          </label>
          <div className={styles.searchInputWrapper}>
            <input
              type="text"
              value={assetSearch}
              onChange={(e) => {
                setAssetSearch(e.target.value)
                setAsset(e.target.value)
              }}
              onFocus={() => setShowAssetSuggestions(true)}
              placeholder="Search BTC, ETH, NVDA..."
              className={styles.input}
            />
            <span className="material-icons" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#666' }}>
              {showAssetSuggestions ? 'expand_less' : 'expand_more'}
            </span>
          </div>
          {showAssetSuggestions && (
            <div className={styles.suggestions}>
              {assetSuggestions.map((a, idx) => (
                <div 
                  key={`${a.symbol}-${idx}`} 
                  className={styles.suggestionItem}
                  onClick={() => handleAssetSelect(a)}
                >
                  <span 
                    className="material-icons" 
                    style={{ color: getTypeColor(a.type), fontSize: '18px' }}
                  >
                    {getTypeIcon(a.type)}
                  </span>
                  <div className={styles.suggestionInfo}>
                    <span className={styles.suggestionSymbol}>{a.symbol}</span>
                    <span className={styles.suggestionName}>{a.name}</span>
                  </div>
                  <span className={styles.suggestionExchange}>{a.exchange}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.formGroup}>
          <label>
            <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>event</span>
            Start Date
            {isHourlyInterval && (
              <span style={{ fontSize: '0.7rem', color: '#888', marginLeft: '0.5rem', fontWeight: 'normal' }}>
                (Max {MAX_DAYS_HOURLY} days for hourly)
              </span>
            )}
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              const newStartDate = e.target.value
              // Validate if hourly interval
              if (isHourlyInterval) {
                const maxStart = getMaxStartDate(endDate, interval)
                if (maxStart && newStartDate < maxStart) {
                  // Don't allow setting date beyond limit - revert to max allowed
                  setStartDate(maxStart)
                  return
                }
              }
              setStartDate(newStartDate)
            }}
            max={endDate}
            min={isHourlyInterval ? getMaxStartDate(endDate, interval) : undefined}
            className={`${styles.input} ${dateValidationError ? styles.inputError : ''}`}
          />
          {dateValidationError && (
            <div className={styles.dateWarning}>
              <span className="material-icons" style={{ fontSize: '16px' }}>warning</span>
              <span>{dateValidationError}</span>
            </div>
          )}
        </div>

        <div className={styles.formGroup}>
          <label>
            <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>event</span>
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              const newEndDate = e.target.value
              setEndDate(newEndDate)
              // Re-validate start date when end date changes
              if (isHourlyInterval) {
                const maxStart = getMaxStartDate(newEndDate, interval)
                if (maxStart && startDate < maxStart) {
                  setStartDate(maxStart)
                }
              }
            }}
            min={startDate}
            max={new Date().toISOString().split('T')[0]}
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label>
            <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>schedule</span>
            Interval
          </label>
          <select
            value={interval}
            onChange={(e) => setIntervalState(e.target.value)}
            className={styles.select}
          >
            {INTERVALS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formGroup}>
          <label>
            <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>account_balance_wallet</span>
            Initial Capital ($)
          </label>
          <input
            type="number"
            value={initialCapital}
            onChange={(e) => setInitialCapital(parseFloat(e.target.value))}
            min="1000"
            step="1000"
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label>
            <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>psychology</span>
            Strategy Mode
          </label>
          <select
            value={strategyMode}
            onChange={(e) => setStrategyMode(e.target.value)}
            className={styles.select}
          >
            {STRATEGY_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
          <div className={styles.strategyDescription}>
            {STRATEGY_MODES.find(m => m.value === strategyMode)?.description}
          </div>
        </div>

        {/* Indicator Selection and Parameters */}
        <div className={styles.formGroup}>
          <label>
            <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>trending_up</span>
            Indicator Type
          </label>
          <select
            value={indicatorType}
            onChange={(e) => setIndicatorType(e.target.value)}
            className={styles.select}
          >
            {INDICATOR_TYPES.map((ind) => (
              <option key={ind.value} value={ind.value}>
                {ind.label}
              </option>
            ))}
          </select>
        </div>

        {/* EMA Parameters */}
        {indicatorType === 'ema' && (
          <div className={styles.formGroup}>
            <label>
              <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>show_chart</span>
              EMA Crossover Settings
            </label>
            <div className={styles.emaRow}>
            <div className={styles.emaSelect} ref={emaFastRef}>
              <span className={styles.emaLabel}>Fast</span>
              <div className={styles.searchInputWrapper}>
                <input
                  type="text"
                  value={emaFastInput}
                  onChange={(e) => setEmaFastInput(e.target.value.replace(/[^0-9]/g, ''))}
                  onFocus={() => setShowFastSuggestions(true)}
                  placeholder="12"
                  className={styles.input}
                />
              </div>
              {showFastSuggestions && (
                <div className={styles.emaSuggestions}>
                  {EMA_PERIOD_SUGGESTIONS
                    .filter(p => p < getEmaSlow())
                    .map((period) => (
                      <div 
                        key={period} 
                        className={styles.emaSuggestionItem}
                        onClick={() => handleEmaFastSelect(period)}
                      >
                        EMA {period}
                      </div>
                    ))}
                </div>
              )}
            </div>
            <div className={styles.emaCross}>
              <span className="material-icons">close</span>
            </div>
            <div className={styles.emaSelect} ref={emaSlowRef}>
              <span className={styles.emaLabel}>Slow</span>
              <div className={styles.searchInputWrapper}>
                <input
                  type="text"
                  value={emaSlowInput}
                  onChange={(e) => setEmaSlowInput(e.target.value.replace(/[^0-9]/g, ''))}
                  onFocus={() => setShowSlowSuggestions(true)}
                  placeholder="26"
                  className={styles.input}
                />
              </div>
              {showSlowSuggestions && (
                <div className={styles.emaSuggestions}>
                  {EMA_PERIOD_SUGGESTIONS
                    .filter(p => p > getEmaFast())
                    .map((period) => (
                      <div 
                        key={period} 
                        className={styles.emaSuggestionItem}
                        onClick={() => handleEmaSlowSelect(period)}
                      >
                        EMA {period}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
          <div className={styles.emaDescription}>
            <span className="material-icons" style={{ fontSize: '12px', color: '#00ff88' }}>north_east</span>
            Golden Cross: EMA{getEmaFast()} ↗ EMA{getEmaSlow()} 
            <span style={{ margin: '0 8px' }}>|</span>
            <span className="material-icons" style={{ fontSize: '12px', color: '#ff4444' }}>south_east</span>
            Death Cross: EMA{getEmaFast()} ↘ EMA{getEmaSlow()}
          </div>
          </div>
        )}

        {/* MA Parameters */}
        {indicatorType === 'ma' && (
          <div className={styles.formGroup}>
            <label>
              <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>show_chart</span>
              MA Crossover Settings
            </label>
            <div className={styles.emaRow}>
              <div className={styles.emaSelect} ref={maFastRef}>
                <span className={styles.emaLabel}>Fast</span>
                <div className={styles.searchInputWrapper}>
                  <input
                    type="text"
                    value={maFastInput}
                    onChange={(e) => setMaFastInput(e.target.value.replace(/[^0-9]/g, ''))}
                    onFocus={() => setShowMaFastSuggestions(true)}
                    placeholder="12"
                    className={styles.input}
                  />
                </div>
                {showMaFastSuggestions && (
                  <div className={styles.emaSuggestions}>
                    {EMA_PERIOD_SUGGESTIONS
                      .filter(p => p < getMaSlow())
                      .map((period) => (
                        <div 
                          key={period} 
                          className={styles.emaSuggestionItem}
                          onClick={() => handleMaFastSelect(period)}
                        >
                          MA {period}
                        </div>
                      ))}
                  </div>
                )}
              </div>
              <div className={styles.emaCross}>
                <span className="material-icons">close</span>
              </div>
              <div className={styles.emaSelect} ref={maSlowRef}>
                <span className={styles.emaLabel}>Slow</span>
                <div className={styles.searchInputWrapper}>
                  <input
                    type="text"
                    value={maSlowInput}
                    onChange={(e) => setMaSlowInput(e.target.value.replace(/[^0-9]/g, ''))}
                    onFocus={() => setShowMaSlowSuggestions(true)}
                    placeholder="26"
                    className={styles.input}
                  />
                </div>
                {showMaSlowSuggestions && (
                  <div className={styles.emaSuggestions}>
                    {EMA_PERIOD_SUGGESTIONS
                      .filter(p => p > getMaFast())
                      .map((period) => (
                        <div 
                          key={period} 
                          className={styles.emaSuggestionItem}
                          onClick={() => handleMaSlowSelect(period)}
                        >
                          MA {period}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.emaDescription}>
              <span className="material-icons" style={{ fontSize: '12px', color: '#00ff88' }}>north_east</span>
              Golden Cross: MA{getMaFast()} ↗ MA{getMaSlow()} 
              <span style={{ margin: '0 8px' }}>|</span>
              <span className="material-icons" style={{ fontSize: '12px', color: '#ff4444' }}>south_east</span>
              Death Cross: MA{getMaFast()} ↘ MA{getMaSlow()}
            </div>
          </div>
        )}

        {/* RSI Parameters */}
        {indicatorType === 'rsi' && (
          <>
            <div className={styles.formGroup}>
              <label>
                <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>timeline</span>
                Length
              </label>
              <input
                type="number"
                value={rsiLength}
                onChange={(e) => setRsiLength(e.target.value)}
                min="2"
                max="100"
                className={styles.input}
                placeholder="14"
              />
            </div>
            <div className={styles.formGroup}>
              <label>
                <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>trending_up</span>
                Top (Overbought)
              </label>
              <input
                type="number"
                value={rsiTop}
                onChange={(e) => setRsiTop(e.target.value)}
                min="50"
                max="100"
                step="1"
                className={styles.input}
                placeholder="70"
              />
            </div>
            <div className={styles.formGroup}>
              <label>
                <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>trending_down</span>
                Bottom (Oversold)
              </label>
              <input
                type="number"
                value={rsiBottom}
                onChange={(e) => setRsiBottom(e.target.value)}
                min="0"
                max="50"
                step="1"
                className={styles.input}
                placeholder="30"
              />
            </div>
          </>
        )}

        {/* CCI Parameters */}
        {indicatorType === 'cci' && (
          <>
            <div className={styles.formGroup}>
              <label>
                <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>timeline</span>
                Length
              </label>
              <input
                type="number"
                value={cciLength}
                onChange={(e) => setCciLength(e.target.value)}
                min="2"
                max="100"
                className={styles.input}
                placeholder="20"
              />
            </div>
            <div className={styles.formGroup}>
              <label>
                <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>trending_up</span>
                Top (Overbought)
              </label>
              <input
                type="number"
                value={cciTop}
                onChange={(e) => setCciTop(e.target.value)}
                min="0"
                max="500"
                step="10"
                className={styles.input}
                placeholder="100"
              />
            </div>
            <div className={styles.formGroup}>
              <label>
                <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>trending_down</span>
                Bottom (Oversold)
              </label>
              <input
                type="number"
                value={cciBottom}
                onChange={(e) => setCciBottom(e.target.value)}
                min="-500"
                max="0"
                step="10"
                className={styles.input}
                placeholder="-100"
              />
            </div>
          </>
        )}

        {/* Z-Score Parameters */}
        {indicatorType === 'zscore' && (
          <>
            <div className={styles.formGroup}>
              <label>
                <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>timeline</span>
                Length
              </label>
              <input
                type="number"
                value={zscoreLength}
                onChange={(e) => setZscoreLength(e.target.value)}
                min="2"
                max="100"
                className={styles.input}
                placeholder="20"
              />
            </div>
            <div className={styles.formGroup}>
              <label>
                <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>trending_up</span>
                Top (Upper Threshold)
              </label>
              <input
                type="number"
                value={zscoreTop}
                onChange={(e) => setZscoreTop(e.target.value)}
                min="0"
                max="5"
                step="0.5"
                className={styles.input}
                placeholder="2"
              />
            </div>
            <div className={styles.formGroup}>
              <label>
                <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>trending_down</span>
                Bottom (Lower Threshold)
              </label>
              <input
                type="number"
                value={zscoreBottom}
                onChange={(e) => setZscoreBottom(e.target.value)}
                min="-5"
                max="0"
                step="0.5"
                className={styles.input}
                placeholder="-2"
              />
            </div>
          </>
        )}

        <div className={styles.formGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={enableShort}
              onChange={(e) => setEnableShort(e.target.checked)}
              className={styles.checkbox}
            />
            <span className="material-icons" style={{ fontSize: '18px', marginRight: '4px' }}>
              {enableShort ? 'check_box' : 'check_box_outline_blank'}
            </span>
            Enable Short Positions
          </label>
        </div>

        <div className={styles.buttonRow}>
          <button
            onClick={handleRun}
            disabled={isLoading}
            className={styles.runButton}
          >
            <span className="material-icons" style={{ marginRight: '0.5rem' }}>
              {isLoading ? 'hourglass_empty' : 'play_arrow'}
            </span>
            {isLoading ? 'Running...' : 'Run Backtest'}
          </button>
          <button
            onClick={async () => {
              const { value: name } = await Swal.fire({
                title: 'Save Configuration',
                input: 'text',
                inputLabel: 'Configuration name',
                inputValue: `${asset} EMA${getEmaFast()}/${getEmaSlow()}`,
                showCancelButton: true,
                background: '#1a1a1a',
                color: '#fff',
                confirmButtonColor: '#4488ff',
                inputValidator: (value) => {
                  if (!value) return 'Please enter a name'
                }
              })
              if (!name) return
              
              setIsSaving(true)
              const result = await saveConfig({
                name,
                asset,
                interval,
                startDate,
                endDate,
                initialCapital,
                enableShort,
                strategyMode,
                emaFast: getEmaFast(),
                emaSlow: getEmaSlow()
              })
              setIsSaving(false)
              
              if (result.success) {
                Swal.fire({
                  icon: 'success',
                  title: 'Saved!',
                  text: 'Configuration saved successfully. View it in your Profile.',
                  background: '#1a1a1a',
                  color: '#fff',
                  confirmButtonColor: '#00ff88',
                  timer: 2000,
                  timerProgressBar: true
                })
              } else {
                Swal.fire({
                  icon: 'error',
                  title: 'Failed to save',
                  text: 'Make sure database is connected.',
                  background: '#1a1a1a',
                  color: '#fff',
                  confirmButtonColor: '#ff4444'
                })
              }
            }}
            disabled={isSaving}
            className={styles.saveButton}
            title="Save this configuration for later"
          >
            <span className="material-icons">
              {isSaving ? 'hourglass_empty' : 'bookmark_add'}
            </span>
          </button>
          <button
            onClick={async () => {
              setIsSettingDefault(true)
              const result = await setDefaultConfig({
                asset,
                interval,
                startDate,
                endDate,
                initialCapital,
                enableShort,
                strategyMode,
                emaFast: getEmaFast(),
                emaSlow: getEmaSlow()
              })
              setIsSettingDefault(false)
              
              if (result.success) {
                Swal.fire({
                  icon: 'success',
                  title: 'Default Set!',
                  html: `<strong>${asset}</strong> with EMA ${getEmaFast()}/${getEmaSlow()} will be used on Current Position page`,
                  background: '#1a1a1a',
                  color: '#fff',
                  confirmButtonColor: '#00ff88',
                  timer: 2500,
                  timerProgressBar: true
                })
              } else {
                Swal.fire({
                  icon: 'error',
                  title: 'Failed',
                  text: result.error || 'Could not set default. Make sure you are logged in.',
                  background: '#1a1a1a',
                  color: '#fff',
                  confirmButtonColor: '#ff4444'
                })
              }
            }}
            disabled={isSettingDefault}
            className={styles.defaultButton}
            title="Use this configuration for Current Position page"
          >
            <span className="material-icons">
              {isSettingDefault ? 'hourglass_empty' : 'push_pin'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(BacktestConfig)
