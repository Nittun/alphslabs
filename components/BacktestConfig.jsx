'use client'

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { useRouter } from 'next/navigation'
import Swal from 'sweetalert2'
import { useBacktestConfig } from '@/context/BacktestConfigContext'
import { useDatabase } from '@/hooks/useDatabase'
import StrategySelectorSection from '@/components/StrategySelectorSection'
import IndicatorConfigPanel, { INDICATOR_DEFINITIONS } from '@/components/IndicatorConfigPanel'
import { API_URL } from '@/lib/api'
import styles from './BacktestConfig.module.css'

// Constants moved outside component
const INTERVALS = ['1h', '2h', '4h', '1d', '1W', '1M']
const STRATEGY_MODES = [
  { value: 'reversal', label: 'A: Reversal (Always in market)', description: 'Exit and immediately enter opposite on crossover' },
  { value: 'wait_for_next', label: 'B: Wait for Next (Flat periods)', description: 'Exit on crossover, wait for NEXT crossover to re-enter' },
  { value: 'long_only', label: 'C: Long Only', description: 'Only Long trades - enter on Golden Cross, exit on Death Cross' },
  { value: 'short_only', label: 'D: Short Only', description: 'Only Short trades - enter on Death Cross, exit on Golden Cross' },
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
  const router = useRouter()
  const { config, updateConfig, isLoaded } = useBacktestConfig()
  const { saveConfig, setDefaultConfig } = useDatabase()
  const [isSaving, setIsSaving] = useState(false)
  const [isSettingDefault, setIsSettingDefault] = useState(false)
  
  // Strategy selector state
  const [useCustomConfig, setUseCustomConfig] = useState(true)
  const [savedStrategies, setSavedStrategies] = useState([])
  const [selectedStrategyId, setSelectedStrategyId] = useState(null)
  const [strategiesLoading, setStrategiesLoading] = useState(false)
  
  // Unified indicators configuration (merged signal + display)
  const [indicators, setIndicators] = useState([
    // Default signal indicator: EMA crossover
    {
      id: 'default_ema',
      type: 'ema',
      enabled: true,
      usage: 'signal',
      pane: 'overlay',
      source: 'close',
      params: { fast: 12, slow: 26 }
    }
  ])
  
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
  
  // Stop Loss mode: 'support_resistance' or 'none'
  const [stopLossMode, setStopLossMode] = useState('support_resistance')
  
  const assetInputRef = useRef(null)
  
  // Get signal indicator from the list
  const signalIndicator = useMemo(() => {
    return indicators.find(i => i.usage === 'signal' && i.enabled)
  }, [indicators])
  
  // Get display-only indicators
  const displayIndicators = useMemo(() => {
    return indicators.filter(i => i.usage === 'display' && i.enabled)
  }, [indicators])

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
      setStopLossMode(config.stop_loss_mode || 'support_resistance')
      
      // Load unified indicators from saved config
      if (config.indicators && Array.isArray(config.indicators)) {
        setIndicators(config.indicators)
      } else if (config.indicator_type) {
        // Backwards compatibility: convert old format to new unified format
        const params = config.indicator_params || {}
        let newIndicator = {
          id: 'migrated_signal',
          type: config.indicator_type,
          enabled: true,
          usage: 'signal',
          pane: ['rsi', 'cci', 'zscore'].includes(config.indicator_type) ? 'oscillator' : 'overlay',
          source: 'close',
          params: {}
        }
        
        if (config.indicator_type === 'ema') {
          newIndicator.params = { fast: config.ema_fast || 12, slow: config.ema_slow || 26 }
        } else if (config.indicator_type === 'ma') {
          newIndicator.params = { fast: params.fast || 12, slow: params.slow || 26 }
        } else if (config.indicator_type === 'rsi') {
          newIndicator.params = { 
            length: params.length || 14, 
            overbought: params.top || params.overbought || 70, 
            oversold: params.bottom || params.oversold || 30 
          }
        } else if (config.indicator_type === 'cci') {
          newIndicator.params = { 
            length: params.length || 20, 
            overbought: params.top || params.overbought || 100, 
            oversold: params.bottom || params.oversold || -100 
          }
        } else if (config.indicator_type === 'zscore') {
          newIndicator.params = { 
            length: params.length || 20, 
            overbought: params.top || params.upper || 2, 
            oversold: params.bottom || params.lower || -2 
          }
        }
        
        setIndicators([newIndicator])
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

  // Fetch saved strategies
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

  const handleSelectStrategy = useCallback((strategyId) => {
    setSelectedStrategyId(strategyId)
  }, [])

  const handleEditStrategy = useCallback((strategyId) => {
    router.push(`/strategy-maker?edit=${strategyId}`)
  }, [router])

  const handleCreateNewStrategy = useCallback(() => {
    router.push('/strategy-maker')
  }, [router])

  const handleToggleMode = useCallback((useCustom) => {
    setUseCustomConfig(useCustom)
    if (useCustom) {
      setSelectedStrategyId(null)
    }
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
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleAssetSelect = (selectedAsset) => {
    setAsset(selectedAsset.symbol)
    setAssetSearch(selectedAsset.symbol)
    setShowAssetSuggestions(false)
  }

  const handleRun = () => {
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
    
    // Validate signal indicator
    if (!signalIndicator) {
      Swal.fire({
        icon: 'warning',
        title: 'No Signal Indicator',
        text: 'Please add at least one indicator marked as "Signal" to generate trading signals.',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#ffc107'
      })
      return
    }
    
    // Include selected strategy if using saved strategy mode
    const selectedStrategy = !useCustomConfig && selectedStrategyId 
      ? savedStrategies.find(s => s.id === selectedStrategyId)
      : null
    
    // Build backwards-compatible config from unified indicators
    const indicatorType = signalIndicator.type
    let indicatorParams = { ...signalIndicator.params }
    let emaFast = 12, emaSlow = 26
    
    if (indicatorType === 'ema' || indicatorType === 'ma') {
      emaFast = signalIndicator.params.fast || 12
      emaSlow = signalIndicator.params.slow || 26
      indicatorParams = { fast: emaFast, slow: emaSlow }
    } else if (['rsi', 'cci', 'zscore'].includes(indicatorType)) {
      indicatorParams = {
        length: signalIndicator.params.length || 14,
        top: signalIndicator.params.overbought || signalIndicator.params.top || 70,
        bottom: signalIndicator.params.oversold || signalIndicator.params.bottom || 30
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
      stop_loss_mode: stopLossMode,
      use_stop_loss: stopLossMode !== 'none',
      // New unified format
      indicators: indicators,
      display_indicators: displayIndicators,
      // Include saved strategy snapshot for reproducibility
      ...(selectedStrategy && {
        saved_strategy: {
          id: selectedStrategy.id,
          name: selectedStrategy.name,
          dsl: selectedStrategy.dsl,
          version: selectedStrategy.updatedAt
        }
      })
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
        {/* Strategy Selector */}
        <StrategySelectorSection
          strategies={savedStrategies}
          selectedStrategyId={selectedStrategyId}
          onSelectStrategy={handleSelectStrategy}
          onEditStrategy={handleEditStrategy}
          onCreateNew={handleCreateNewStrategy}
          isLoading={strategiesLoading}
          useCustomConfig={useCustomConfig}
          onToggleMode={handleToggleMode}
        />

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

        {/* Stop Loss Mode */}
        <div className={styles.formGroup}>
          <label>
            <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>security</span>
            Stop Loss
          </label>
          <div className={styles.stopLossSelector}>
            <button
              type="button"
              className={`${styles.stopLossButton} ${stopLossMode === 'support_resistance' ? styles.active : ''}`}
              onClick={() => setStopLossMode('support_resistance')}
            >
              <span className="material-icons">trending_down</span>
              Support/Resistance
            </button>
            <button
              type="button"
              className={`${styles.stopLossButton} ${stopLossMode === 'none' ? styles.active : ''}`}
              onClick={() => setStopLossMode('none')}
            >
              <span className="material-icons">block</span>
              No Stop Loss
            </button>
          </div>
          <div className={styles.strategyDescription}>
            {stopLossMode === 'support_resistance' 
              ? 'Stop loss set at recent support (long) or resistance (short) levels' 
              : 'Position exits only on indicator signal, no stop loss protection'}
          </div>
        </div>

        {/* Unified Indicator Configuration - Only show when using custom config */}
        {useCustomConfig && (
          <div className={styles.indicatorSection}>
            <IndicatorConfigPanel
              indicators={indicators}
              onChange={setIndicators}
              title="Indicators"
              showUsage={true}
              defaultUsage="signal"
              maxSignalIndicators={1}
            />
            <div className={styles.indicatorLegend}>
              <div className={styles.legendItem}>
                <span className={styles.legendBadge} style={{ background: 'rgba(255, 193, 7, 0.15)', color: '#ffc107' }}>⚡ Signal</span>
                <span>Drives trading decisions (entry/exit)</span>
              </div>
              <div className={styles.legendItem}>
                <span className={styles.legendBadge} style={{ background: 'rgba(108, 117, 125, 0.2)', color: 'rgba(255,255,255,0.6)' }}>👁 Display</span>
                <span>Shown on chart for analysis only</span>
              </div>
            </div>
            {!signalIndicator && (
              <div className={styles.warningBanner}>
                <span className="material-icons">warning</span>
                <span>No signal indicator selected. Add an indicator and set it to "Signal" mode.</span>
              </div>
            )}
          </div>
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
              const signalName = signalIndicator 
                ? `${signalIndicator.type.toUpperCase()} ${Object.values(signalIndicator.params).slice(0, 2).join('/')}`
                : 'Custom'
              const { value: name } = await Swal.fire({
                title: 'Save Configuration',
                input: 'text',
                inputLabel: 'Configuration name',
                inputValue: `${asset} ${signalName}`,
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
                indicators: indicators,
                emaFast: signalIndicator?.params?.fast || 12,
                emaSlow: signalIndicator?.params?.slow || 26
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
                indicators: indicators,
                emaFast: signalIndicator?.params?.fast || 12,
                emaSlow: signalIndicator?.params?.slow || 26
              })
              setIsSettingDefault(false)
              
              if (result.success) {
                const signalName = signalIndicator 
                  ? `${signalIndicator.type.toUpperCase()} ${Object.values(signalIndicator.params).slice(0, 2).join('/')}`
                  : 'Custom'
                Swal.fire({
                  icon: 'success',
                  title: 'Default Set!',
                  html: `<strong>${asset}</strong> with ${signalName} will be used on Current Position page`,
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
