'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Custom hook for fetching data with client-side caching
 * Reduces unnecessary API calls and improves perceived performance
 */

// Client-side cache storage
const clientCache = new Map()
const cacheTimestamps = new Map()

/**
 * Get cached data if still valid
 * @param {string} key - Cache key
 * @param {number} maxAge - Max age in milliseconds
 * @returns {any|null} Cached data or null
 */
function getCachedData(key, maxAge) {
  const timestamp = cacheTimestamps.get(key)
  if (!timestamp) return null
  
  const age = Date.now() - timestamp
  if (age > maxAge) {
    clientCache.delete(key)
    cacheTimestamps.delete(key)
    return null
  }
  
  return clientCache.get(key)
}

/**
 * Set data in cache
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 */
function setCachedData(key, data) {
  clientCache.set(key, data)
  cacheTimestamps.set(key, Date.now())
}

/**
 * Hook for fetching data with caching
 * @param {string} url - API URL to fetch
 * @param {Object} options - Options
 * @param {number} options.cacheTime - Cache duration in ms (default: 5 minutes)
 * @param {boolean} options.enabled - Whether to fetch (default: true)
 * @param {Function} options.onSuccess - Success callback
 * @param {Function} options.onError - Error callback
 */
export function useCachedFetch(url, options = {}) {
  const {
    cacheTime = 5 * 60 * 1000, // 5 minutes default
    enabled = true,
    onSuccess,
    onError,
  } = options

  const [data, setData] = useState(() => getCachedData(url, cacheTime))
  const [isLoading, setIsLoading] = useState(!data && enabled)
  const [error, setError] = useState(null)
  const abortControllerRef = useRef(null)

  const fetchData = useCallback(async (force = false) => {
    if (!enabled) return

    // Check cache first (unless forced)
    if (!force) {
      const cached = getCachedData(url, cacheTime)
      if (cached) {
        setData(cached)
        setIsLoading(false)
        return cached
      }
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()
      
      // Cache the result
      setCachedData(url, result)
      setData(result)
      onSuccess?.(result)
      
      return result
    } catch (err) {
      if (err.name === 'AbortError') return
      
      setError(err)
      onError?.(err)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [url, cacheTime, enabled, onSuccess, onError])

  // Initial fetch
  useEffect(() => {
    if (enabled && !data) {
      fetchData()
    }
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  const refetch = useCallback(() => fetchData(true), [fetchData])

  return { data, isLoading, error, refetch }
}

/**
 * Hook for debounced values - reduces API calls during rapid changes
 * @param {any} value - Value to debounce
 * @param {number} delay - Debounce delay in ms
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

/**
 * Hook for throttled callbacks - limits execution frequency
 * @param {Function} callback - Callback to throttle
 * @param {number} delay - Minimum delay between calls in ms
 */
export function useThrottle(callback, delay = 300) {
  const lastRun = useRef(Date.now())
  const timeoutRef = useRef(null)

  return useCallback((...args) => {
    const now = Date.now()
    const timeSinceLastRun = now - lastRun.current

    if (timeSinceLastRun >= delay) {
      lastRun.current = now
      callback(...args)
    } else {
      // Schedule for later
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        lastRun.current = Date.now()
        callback(...args)
      }, delay - timeSinceLastRun)
    }
  }, [callback, delay])
}

/**
 * Clear all client-side cache
 */
export function clearCache() {
  clientCache.clear()
  cacheTimestamps.clear()
}

/**
 * Clear specific cache key
 * @param {string} key - Cache key to clear
 */
export function invalidateCache(key) {
  clientCache.delete(key)
  cacheTimestamps.delete(key)
}

export default useCachedFetch
