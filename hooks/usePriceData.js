'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { API_URL } from '@/lib/api'

/**
 * Cache for price data with IndexedDB fallback for persistence
 * This significantly reduces API calls for the same symbol/interval combinations
 */

// In-memory cache for quick access
const priceDataCache = new Map()
const cacheTimestamps = new Map()

// Cache duration in milliseconds
const CACHE_DURATION = {
  '1m': 60 * 1000,           // 1 minute for 1m interval
  '5m': 5 * 60 * 1000,       // 5 minutes for 5m interval  
  '15m': 15 * 60 * 1000,     // 15 minutes for 15m interval
  '1h': 30 * 60 * 1000,      // 30 minutes for 1h interval
  '4h': 60 * 60 * 1000,      // 1 hour for 4h interval
  '1d': 4 * 60 * 60 * 1000,  // 4 hours for daily interval
  'D': 4 * 60 * 60 * 1000,   // 4 hours for daily interval
  '1w': 24 * 60 * 60 * 1000, // 1 day for weekly interval
}

/**
 * Generate cache key from parameters
 */
function getCacheKey(symbol, interval, startDate, endDate) {
  return `${symbol}|${interval}|${startDate}|${endDate}`
}

/**
 * Check if cache is still valid
 */
function isCacheValid(key, interval) {
  const timestamp = cacheTimestamps.get(key)
  if (!timestamp) return false
  
  const maxAge = CACHE_DURATION[interval] || CACHE_DURATION['1d']
  return Date.now() - timestamp < maxAge
}

/**
 * Hook for fetching and caching price data
 * @param {Object} options - Configuration options
 * @param {string} options.symbol - Trading pair symbol (e.g., 'BTC/USDT')
 * @param {string} options.interval - Time interval (e.g., '1d', '1h')
 * @param {string} options.startDate - Start date (YYYY-MM-DD)
 * @param {string} options.endDate - End date (YYYY-MM-DD)
 * @param {Array} options.indicators - Array of indicator configs
 * @param {boolean} options.enabled - Whether to fetch data
 */
export function usePriceData({
  symbol = 'BTC/USDT',
  interval = '1d',
  startDate,
  endDate,
  indicators = [],
  enabled = true
}) {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const abortControllerRef = useRef(null)
  const fetchIdRef = useRef(0)

  // Memoize cache key
  const cacheKey = useMemo(() => {
    const indicatorKey = indicators.map(i => `${i.type}-${JSON.stringify(i.params)}`).join('|')
    return getCacheKey(symbol, interval, startDate, endDate) + '|' + indicatorKey
  }, [symbol, interval, startDate, endDate, indicators])

  const fetchData = useCallback(async (force = false) => {
    if (!enabled || !startDate || !endDate) return

    // Check cache first (unless forced)
    if (!force && isCacheValid(cacheKey, interval)) {
      const cached = priceDataCache.get(cacheKey)
      if (cached) {
        setData(cached)
        setIsLoading(false)
        return cached
      }
    }

    // Increment fetch ID to track latest request
    const currentFetchId = ++fetchIdRef.current

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setIsLoading(true)
    setError(null)

    try {
      // Build URL with parameters
      const params = new URLSearchParams({
        symbol: symbol.replace('/', ''),
        interval: interval === 'D' ? '1d' : interval,
        start_date: startDate,
        end_date: endDate
      })

      // Add indicator parameters if needed
      indicators.forEach((indicator, idx) => {
        if (indicator.type === 'ema') {
          params.set('ema_fast', indicator.params?.fast || 12)
          params.set('ema_slow', indicator.params?.slow || 26)
        }
        // Add other indicator params as needed
      })

      const response = await fetch(`${API_URL}/api/price-data?${params}`, {
        signal: abortControllerRef.current.signal,
      })

      // Check if this is still the latest request
      if (currentFetchId !== fetchIdRef.current) return

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      
      // Cache the result
      priceDataCache.set(cacheKey, result)
      cacheTimestamps.set(cacheKey, Date.now())
      
      setData(result)
      return result
    } catch (err) {
      if (err.name === 'AbortError') return
      
      // Check if this is still the latest request
      if (currentFetchId !== fetchIdRef.current) return
      
      setError(err)
      return null
    } finally {
      // Only update loading state if this is the latest request
      if (currentFetchId === fetchIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [cacheKey, enabled, startDate, endDate, symbol, interval, indicators])

  // Fetch on mount or when dependencies change
  useEffect(() => {
    if (enabled) {
      fetchData()
    }
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [cacheKey, enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  const refetch = useCallback(() => fetchData(true), [fetchData])

  return { data, isLoading, error, refetch }
}

/**
 * Prefetch price data in the background
 * Call this to warm the cache for data the user is likely to need
 */
export function prefetchPriceData(symbol, interval, startDate, endDate) {
  const cacheKey = getCacheKey(symbol, interval, startDate, endDate)
  
  // Don't prefetch if already cached
  if (isCacheValid(cacheKey, interval)) return

  const params = new URLSearchParams({
    symbol: symbol.replace('/', ''),
    interval: interval === 'D' ? '1d' : interval,
    start_date: startDate,
    end_date: endDate
  })

  // Use low priority fetch
  fetch(`${API_URL}/api/price-data?${params}`, {
    priority: 'low'
  })
    .then(res => res.json())
    .then(data => {
      priceDataCache.set(cacheKey, data)
      cacheTimestamps.set(cacheKey, Date.now())
    })
    .catch(() => {}) // Silently fail for prefetch
}

/**
 * Clear the price data cache
 */
export function clearPriceDataCache() {
  priceDataCache.clear()
  cacheTimestamps.clear()
}

/**
 * Get cache statistics
 */
export function getPriceDataCacheStats() {
  return {
    size: priceDataCache.size,
    keys: Array.from(priceDataCache.keys())
  }
}

export default usePriceData
