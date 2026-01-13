/**
 * In-memory cache with TTL support for API responses
 * Used for caching expensive database queries and external API calls
 */

class MemoryCache {
  constructor() {
    this.cache = new Map()
    this.timers = new Map()
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {any} Cached value or undefined
   */
  get(key) {
    const item = this.cache.get(key)
    if (!item) return undefined
    
    // Check if expired
    if (item.expiry && Date.now() > item.expiry) {
      this.delete(key)
      return undefined
    }
    
    return item.value
  }

  /**
   * Set a value in cache with optional TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlSeconds - Time to live in seconds (default: 5 minutes)
   */
  set(key, value, ttlSeconds = 300) {
    // Clear existing timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key))
    }
    
    const expiry = Date.now() + (ttlSeconds * 1000)
    this.cache.set(key, { value, expiry })
    
    // Auto-cleanup after TTL
    const timer = setTimeout(() => {
      this.delete(key)
    }, ttlSeconds * 1000)
    
    this.timers.set(key, timer)
  }

  /**
   * Delete a value from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key)
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key))
      this.timers.delete(key)
    }
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.timers.forEach(timer => clearTimeout(timer))
    this.cache.clear()
    this.timers.clear()
  }

  /**
   * Get cache stats
   */
  stats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }
}

// Singleton instance
const globalCache = global.memoryCache || new MemoryCache()
if (process.env.NODE_ENV !== 'production') {
  global.memoryCache = globalCache
}

export const cache = globalCache

/**
 * Cache wrapper for async functions
 * @param {string} key - Cache key
 * @param {Function} fn - Async function to cache
 * @param {number} ttlSeconds - TTL in seconds
 * @returns {Promise<any>} Cached or fresh result
 */
export async function withCache(key, fn, ttlSeconds = 300) {
  const cached = cache.get(key)
  if (cached !== undefined) {
    return cached
  }
  
  const result = await fn()
  cache.set(key, result, ttlSeconds)
  return result
}

/**
 * Generate cache key from request parameters
 * @param {string} prefix - Key prefix
 * @param {Object} params - Parameters to include in key
 * @returns {string} Cache key
 */
export function cacheKey(prefix, params = {}) {
  const sortedParams = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&')
  return `${prefix}:${sortedParams}`
}

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  SHORT: 60,           // 1 minute - for frequently changing data
  MEDIUM: 300,         // 5 minutes - default
  LONG: 3600,          // 1 hour - for rarely changing data
  VERY_LONG: 86400,    // 1 day - for static data
}

export default cache
