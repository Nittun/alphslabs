'use client'

import { useState, useEffect, useRef } from 'react'
import Swal from 'sweetalert2'
import { useBacktestConfig } from '@/context/BacktestConfigContext'
import { useDatabase } from '@/hooks/useDatabase'
import { API_URL } from '@/lib/api'
import styles from './BacktestConfig.module.css'

export default function BacktestConfig({ onRunBacktest, isLoading, apiConnected }) {
  const { config, updateConfig, isLoaded } = useBacktestConfig()
  const { saveConfig, setDefaultConfig } = useDatabase()
  const [isSaving, setIsSaving] = useState(false)
  const [isSettingDefault, setIsSettingDefault] = useState(false)
  
  const [asset, setAsset] = useState('BTC/USDT')
  const [assetSearch, setAssetSearch] = useState('BTC/USDT')
  const [assetSuggestions, setAssetSuggestions] = useState([])
  const [showAssetSuggestions, setShowAssetSuggestions] = useState(false)
  
  const [daysBack, setDaysBack] = useState(730)
  const [interval, setIntervalState] = useState('4h')
  const [initialCapital, setInitialCapital] = useState(10000)
  const [enableShort, setEnableShort] = useState(true)
  const [strategyMode, setStrategyMode] = useState('reversal')
  
  const [emaFastInput, setEmaFastInput] = useState('12')
  const [emaSlowInput, setEmaSlowInput] = useState('26')
  const [showFastSuggestions, setShowFastSuggestions] = useState(false)
  const [showSlowSuggestions, setShowSlowSuggestions] = useState(false)
  
  const assetInputRef = useRef(null)
  const emaFastRef = useRef(null)
  const emaSlowRef = useRef(null)

  const intervals = ['1h', '2h', '4h', '1d', '1W', '1M']
  const emaPeriodSuggestions = [5, 8, 9, 10, 12, 13, 20, 21, 26, 34, 50, 55, 89, 100, 144, 200, 233]
  
  // Load saved config on mount
  useEffect(() => {
    if (isLoaded && config) {
      setAsset(config.asset || 'BTC/USDT')
      setAssetSearch(config.asset || 'BTC/USDT')
      setDaysBack(config.days_back || 730)
      setIntervalState(config.interval || '4h')
      setInitialCapital(config.initial_capital || 10000)
      setEnableShort(config.enable_short !== false)
      setStrategyMode(config.strategy_mode || 'reversal')
      setEmaFastInput(String(config.ema_fast || 12))
      setEmaSlowInput(String(config.ema_slow || 26))
    }
  }, [isLoaded, config])
  
  const strategyModes = [
    { value: 'reversal', label: 'A: Reversal (Always in market)', description: 'Exit and immediately enter opposite on crossover' },
    { value: 'wait_for_next', label: 'B: Wait for Next (Flat periods)', description: 'Exit on crossover, wait for NEXT crossover to re-enter' },
    { value: 'long_only', label: 'C: Long Only', description: 'Only Long trades - enter on Golden Cross, exit on Death Cross' },
    { value: 'short_only', label: 'D: Short Only', description: 'Only Short trades - enter on Death Cross, exit on Golden Cross' },
  ]

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
    
    const runConfig = {
      asset: asset || assetSearch,
      days_back: daysBack,
      interval,
      initial_capital: initialCapital,
      enable_short: enableShort,
      strategy_mode: strategyMode,
      ema_fast: emaFast,
      ema_slow: emaSlow,
    }
    
    // Save config to context (will be persisted to localStorage)
    updateConfig(runConfig)
    
    onRunBacktest(runConfig)
  }

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
            <span className="material-icons" style={{ fontSize: '14px', marginRight: '4px' }}>date_range</span>
            Days Back
          </label>
          <input
            type="number"
            value={daysBack}
            onChange={(e) => setDaysBack(parseInt(e.target.value))}
            min="30"
            max="3650"
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
            {intervals.map((i) => (
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
            {strategyModes.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
          <div className={styles.strategyDescription}>
            {strategyModes.find(m => m.value === strategyMode)?.description}
          </div>
        </div>

        {/* EMA Input with Suggestions */}
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
                  {emaPeriodSuggestions
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
                  {emaPeriodSuggestions
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
                daysBack,
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
                daysBack,
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
