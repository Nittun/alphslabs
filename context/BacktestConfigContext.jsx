'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

const BacktestConfigContext = createContext(null)

const DEFAULT_CONFIG = {
  asset: 'BTC/USDT',
  days_back: 730,
  interval: '4h',
  initial_capital: 10000,
  enable_short: true,
  strategy_mode: 'reversal',
  ema_fast: 12,
  ema_slow: 26,
}

const STORAGE_KEY_PREFIX = 'backtest_config_'

// Generate user-specific storage key
const getStorageKey = (userEmail) => {
  if (!userEmail) return null
  // Create a simple hash of the email for the key
  const hash = userEmail.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0)
  }, 0)
  return `${STORAGE_KEY_PREFIX}${Math.abs(hash)}`
}

export function BacktestConfigProvider({ children }) {
  const { data: session, status } = useSession()
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [isLoaded, setIsLoaded] = useState(false)
  const [storageKey, setStorageKey] = useState(null)

  // Update storage key when user changes
  useEffect(() => {
    if (status === 'loading') return
    
    const userEmail = session?.user?.email
    const newKey = getStorageKey(userEmail)
    
    if (newKey !== storageKey) {
      setStorageKey(newKey)
      
      // Load config for new user
      if (newKey) {
        try {
          const saved = localStorage.getItem(newKey)
          if (saved) {
            const parsed = JSON.parse(saved)
            setConfig({ ...DEFAULT_CONFIG, ...parsed })
          } else {
            // Reset to default for new user with no saved config
            setConfig(DEFAULT_CONFIG)
          }
        } catch (error) {
          console.error('Error loading backtest config:', error)
          setConfig(DEFAULT_CONFIG)
        }
      } else {
        // No user logged in, reset to defaults
        setConfig(DEFAULT_CONFIG)
      }
    }
    
    setIsLoaded(true)
  }, [session?.user?.email, status, storageKey])

  // Save config to localStorage whenever it changes (only if we have a valid key)
  useEffect(() => {
    if (isLoaded && storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(config))
      } catch (error) {
        console.error('Error saving backtest config:', error)
      }
    }
  }, [config, isLoaded, storageKey])

  const updateConfig = (newConfig) => {
    setConfig((prev) => ({ ...prev, ...newConfig }))
  }

  const resetConfig = () => {
    setConfig(DEFAULT_CONFIG)
    if (storageKey) {
      localStorage.removeItem(storageKey)
    }
  }

  return (
    <BacktestConfigContext.Provider
      value={{
        config,
        updateConfig,
        resetConfig,
        isLoaded,
        userEmail: session?.user?.email || null,
      }}
    >
      {children}
    </BacktestConfigContext.Provider>
  )
}

export function useBacktestConfig() {
  const context = useContext(BacktestConfigContext)
  if (!context) {
    throw new Error('useBacktestConfig must be used within a BacktestConfigProvider')
  }
  return context
}

