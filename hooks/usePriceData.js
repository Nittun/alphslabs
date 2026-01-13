'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { API_URL } from '@/lib/api'

/**
 * Simple client-side cache for price data
 * Reduces API calls for the same symbol/interval combinations
 */

// Simple in-memory cache
const priceCache = new Map()
const cacheTime = new Map()

// Cache duration based on interval (in milliseconds)
const getCacheDuration = (interval) => {
  const durations = {
    '1m': 60 * 1000,        // 1 minute
    '5m': 5 * 60 * 1000,    // 5 minutes
    '15m': 15 * 60 * 1000,  // 15 minutes
    '1h': 30 * 60 * 1000,   // 30 minutes
    '4h': 60 * 60 * 1000,   // 1 hour
    '1d': 4 * 60 * 60 * 1000, // 4 hours
    'D': 4 * 60 * 60 * 1000,  // 4 hours
    '1w': 24 * 60 * 60 * 1000, // 1 day
  }
  return durations[interval] || 60 * 60 * 1000 // Default 1 hour
}

function getCacheKey(symbol, interval, startDate, endDate) {
  return `${symbol}|${interval}|${startDate}|${endDate}`
}

/**
 * Hook for fetching price data with caching
 */
export function usePriceData({
  symbol = 'BTC/USDT',
  interval = '1d',
  startDate,
  endDate,
  enabled = true
}) {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const fetchData = useCallback(async () => {
    if (!enabled || !startDate || !endDate) return

    const cacheKey = getCacheKey(symbol, interval, startDate, endDate)
    const cached = priceCache.get(cacheKey)
    const cachedTime = cacheTime.get(cacheKey)
    const cacheDuration = getCacheDuration(interval)

    // Return cached data if still valid
    if (cached && cachedTime && Date.now() - cachedTime < cacheDuration) {
      setData(cached)
      return cached
    }

    // Abort previous request
    if (abortRef.current) {
      abortRef.current.abort()
    }
    abortRef.current = new AbortController()

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        symbol: symbol.replace('/', ''),
        interval: interval === 'D' ? '1d' : interval,
        start_date: startDate,
        end_date: endDate
      })

      const response = await fetch(`${API_URL}/api/price-data?${params}`, {
        signal: abortRef.current.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      
      // Cache the result
      priceCache.set(cacheKey, result)
      cacheTime.set(cacheKey, Date.now())
      
      setData(result)
      return result
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err)
      }
      return null
    } finally {
      setIsLoading(false)
    }
  }, [symbol, interval, startDate, endDate, enabled])

  useEffect(() => {
    if (enabled) {
      fetchData()
    }
    
    return () => {
      if (abortRef.current) {
        abortRef.current.abort()
      }
    }
  }, [fetchData, enabled])

  return { data, isLoading, error, refetch: fetchData }
}

export default usePriceData
