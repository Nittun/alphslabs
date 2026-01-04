'use client'

import { useState, useCallback } from 'react'

export function useDatabase() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Record login when user signs in
  const recordLogin = useCallback(async (provider = 'google') => {
    try {
      const response = await fetch('/api/login-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          userAgent: navigator.userAgent,
          ipAddress: null // Server will handle this if needed
        })
      })
      return await response.json()
    } catch (err) {
      console.error('Failed to record login:', err)
      return { success: false, error: err.message }
    }
  }, [])

  // Get user profile with stats
  const getUser = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/user')
      const data = await response.json()
      setError(null)
      return data
    } catch (err) {
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }, [])

  // Save backtest configuration
  const saveConfig = useCallback(async (config) => {
    setLoading(true)
    try {
      const response = await fetch('/api/backtest-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      const data = await response.json()
      setError(null)
      return data
    } catch (err) {
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }, [])

  // Get saved configurations
  const getConfigs = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/backtest-configs')
      const data = await response.json()
      setError(null)
      return data
    } catch (err) {
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }, [])

  // Update configuration (e.g., toggle favorite)
  const updateConfig = useCallback(async (id, updates) => {
    try {
      const response = await fetch('/api/backtest-configs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates })
      })
      return await response.json()
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  // Delete configuration
  const deleteConfig = useCallback(async (id) => {
    try {
      const response = await fetch(`/api/backtest-configs?id=${id}`, {
        method: 'DELETE'
      })
      return await response.json()
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  // Save backtest run with results
  const saveBacktestRun = useCallback(async (runData) => {
    try {
      const response = await fetch('/api/backtest-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(runData)
      })
      return await response.json()
    } catch (err) {
      console.error('Failed to save backtest run:', err)
      return { success: false, error: err.message }
    }
  }, [])

  // Get backtest run history
  const getBacktestRuns = useCallback(async (limit = 20, offset = 0, configId = null) => {
    setLoading(true)
    try {
      let url = `/api/backtest-runs?limit=${limit}&offset=${offset}`
      if (configId) url += `&configId=${configId}`
      
      const response = await fetch(url)
      const data = await response.json()
      setError(null)
      return data
    } catch (err) {
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }, [])

  // Delete backtest run
  const deleteBacktestRun = useCallback(async (id) => {
    try {
      const response = await fetch(`/api/backtest-runs?id=${id}`, {
        method: 'DELETE'
      })
      return await response.json()
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  // Get login history
  const getLoginHistory = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/login-history')
      const data = await response.json()
      setError(null)
      return data
    } catch (err) {
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }, [])

  // Get default trading config
  const getDefaultConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/default-config')
      const data = await response.json()
      return data
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  // Set default trading config
  const setDefaultConfig = useCallback(async (config) => {
    try {
      const response = await fetch('/api/default-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      return await response.json()
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  // Clear default trading config
  const clearDefaultConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/default-config', {
        method: 'DELETE'
      })
      return await response.json()
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  // Update open position in default config (after backtest)
  const updateDefaultPosition = useCallback(async (updates) => {
    try {
      const response = await fetch('/api/default-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      return await response.json()
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  return {
    loading,
    error,
    recordLogin,
    getUser,
    saveConfig,
    getConfigs,
    updateConfig,
    deleteConfig,
    saveBacktestRun,
    getBacktestRuns,
    deleteBacktestRun,
    getLoginHistory,
    getDefaultConfig,
    setDefaultConfig,
    clearDefaultConfig,
    updateDefaultPosition
  }
}

