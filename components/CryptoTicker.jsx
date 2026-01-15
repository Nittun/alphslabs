'use client'

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { API_URL } from '@/lib/api'
import styles from './CryptoTicker.module.css'

// Top assets: Crypto, Stocks, and Commodities
const TOP_ASSETS = [
  // Top Cryptocurrencies
  { symbol: 'BTC', name: 'Bitcoin', icon: 'currency_bitcoin', color: '#F7931A', type: 'crypto', assetId: 'BTC/USDT' },
  { symbol: 'ETH', name: 'Ethereum', icon: 'diamond', color: '#627EEA', type: 'crypto', assetId: 'ETH/USDT' },
  { symbol: 'SOL', name: 'Solana', icon: 'bolt', color: '#9945FF', type: 'crypto', assetId: 'SOL/USDT' },
  { symbol: 'BNB', name: 'BNB', icon: 'hexagon', color: '#F3BA2F', type: 'crypto', assetId: 'BNB/USDT' },
  { symbol: 'XRP', name: 'XRP', icon: 'water_drop', color: '#00AAE4', type: 'crypto', assetId: 'XRP/USDT' },
  // Top 5 US Stocks
  { symbol: 'AAPL', name: 'Apple', icon: 'phone_iphone', color: '#A2AAAD', type: 'stock', assetId: 'AAPL' },
  { symbol: 'MSFT', name: 'Microsoft', icon: 'window', color: '#00A4EF', type: 'stock', assetId: 'MSFT' },
  { symbol: 'GOOGL', name: 'Alphabet', icon: 'search', color: '#4285F4', type: 'stock', assetId: 'GOOGL' },
  { symbol: 'AMZN', name: 'Amazon', icon: 'local_shipping', color: '#FF9900', type: 'stock', assetId: 'AMZN' },
  { symbol: 'NVDA', name: 'NVIDIA', icon: 'memory', color: '#76B900', type: 'stock', assetId: 'NVDA' },
  // Commodities - Gold & Silver
  { symbol: 'GOLD', name: 'Gold', icon: 'toll', color: '#FFD700', type: 'commodity', assetId: 'GC=F' },
  { symbol: 'SILVER', name: 'Silver', icon: 'circle', color: '#C0C0C0', type: 'commodity', assetId: 'SI=F' },
]

const UPDATE_INTERVAL = 15 // seconds

// Pure utility functions moved outside component
const formatPrice = (price) => {
  if (price >= 1000) {
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  } else if (price >= 1) {
    return `$${price.toFixed(2)}`
  } else {
    return `$${price.toFixed(4)}`
  }
}

const formatChange = (change) => {
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
}

function CryptoTicker({ onSelectAsset }) {
  const [prices, setPrices] = useState({})
  const [prevPrices, setPrevPrices] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [countdown, setCountdown] = useState(UPDATE_INTERVAL)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const tickerRef = useRef(null)

  // Base mock prices with realistic values for fallback
  const getMockPrices = () => ({
    // Crypto
    BTC: { price: 97500 + Math.random() * 1000, change: (Math.random() - 0.5) * 5 },
    ETH: { price: 3400 + Math.random() * 100, change: (Math.random() - 0.5) * 5 },
    SOL: { price: 195 + Math.random() * 10, change: (Math.random() - 0.5) * 5 },
    BNB: { price: 710 + Math.random() * 20, change: (Math.random() - 0.5) * 5 },
    XRP: { price: 2.35 + Math.random() * 0.1, change: (Math.random() - 0.5) * 5 },
    // Stocks
    AAPL: { price: 185 + Math.random() * 5, change: (Math.random() - 0.5) * 3 },
    MSFT: { price: 420 + Math.random() * 10, change: (Math.random() - 0.5) * 3 },
    GOOGL: { price: 175 + Math.random() * 5, change: (Math.random() - 0.5) * 3 },
    AMZN: { price: 195 + Math.random() * 5, change: (Math.random() - 0.5) * 3 },
    NVDA: { price: 140 + Math.random() * 5, change: (Math.random() - 0.5) * 4 },
    // Commodities
    GOLD: { price: 2650 + Math.random() * 20, change: (Math.random() - 0.5) * 2 },
    SILVER: { price: 31.5 + Math.random() * 0.5, change: (Math.random() - 0.5) * 3 },
  })

  // Fetch prices from backend API
  const fetchPrices = async () => {
    setIsUpdating(true)
    try {
      const response = await fetch(`${API_URL}/api/crypto-prices`)
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.prices) {
          setPrevPrices(prices)
          
          // Merge API data with mock fallbacks for missing/zero prices
          const mockFallback = getMockPrices()
          const mergedPrices = { ...mockFallback }
          
          Object.keys(data.prices).forEach(symbol => {
            const apiPrice = data.prices[symbol]
            // Only use API price if it's valid (not 0 or missing)
            if (apiPrice && apiPrice.price > 0) {
              mergedPrices[symbol] = apiPrice
            }
          })
          
          setPrices(mergedPrices)
          setError(null)
          setLastUpdate(new Date())
        } else {
          // API returned error, use mock prices
          generateMockPrices()
        }
      } else {
        // Fallback: generate mock prices for demo
        generateMockPrices()
      }
    } catch (err) {
      // Fallback: generate mock prices for demo
      generateMockPrices()
    } finally {
      setLoading(false)
      setIsUpdating(false)
      setCountdown(UPDATE_INTERVAL)
    }
  }

  // Mock prices for when API is not available
  const generateMockPrices = () => {
    setPrevPrices(prices)
    setPrices(getMockPrices())
    setLastUpdate(new Date())
  }

  // Initial fetch and 30-second interval
  useEffect(() => {
    fetchPrices()
    const interval = setInterval(fetchPrices, UPDATE_INTERVAL * 1000)
    return () => clearInterval(interval)
  }, [])

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : UPDATE_INTERVAL))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (loading) return
    const ticker = tickerRef.current
    if (!ticker) return
    if (ticker.scrollWidth <= ticker.clientWidth) return

    let rafId
    const speed = 0.5
    const step = () => {
      if (!ticker) return
      if (!isHovered) {
        ticker.scrollLeft += speed
        if (ticker.scrollLeft >= ticker.scrollWidth - ticker.clientWidth - 1) {
          ticker.scrollLeft = 0
        }
      }
      rafId = requestAnimationFrame(step)
    }

    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [loading, isHovered])

  if (loading) {
    return (
      <div className={styles.tickerContainer}>
        <div
          className={styles.tickerInner}
          ref={tickerRef}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {TOP_ASSETS.map((asset) => (
            <div key={asset.symbol} className={styles.coinBox} style={{ '--coin-color': asset.color }}>
              <span className={`material-icons ${styles.coinIcon}`}>{asset.icon}</span>
              <span className={styles.coinSymbol}>{asset.symbol}</span>
              <span className={styles.coinPrice}>Loading...</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Check if price changed from previous update
  const getPriceDirection = (symbol) => {
    const current = prices[symbol]?.price || 0
    const prev = prevPrices[symbol]?.price || current
    if (current > prev) return 'up'
    if (current < prev) return 'down'
    return 'same'
  }

  return (
    <div className={styles.tickerContainer}>
      <div
        className={styles.tickerInner}
        ref={tickerRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Update indicator */}
        <div className={styles.updateIndicator}>
          <span className={`material-icons ${isUpdating ? styles.spinning : ''}`} style={{ fontSize: '16px' }}>
            {isUpdating ? 'sync' : 'schedule'}
          </span>
          <span className={styles.countdown}>{countdown}s</span>
        </div>
        
        {TOP_ASSETS.map((asset) => {
          const priceData = prices[asset.symbol] || { price: 0, change: 0 }
          const isPositive = priceData.change >= 0
          const direction = getPriceDirection(asset.symbol)

          return (
            <div 
              key={asset.symbol} 
              className={`${styles.coinBox} ${isUpdating ? styles.updating : ''} ${styles[asset.type] || ''}`}
              style={{ '--coin-color': asset.color, cursor: onSelectAsset ? 'pointer' : 'default' }}
              onClick={() => onSelectAsset && onSelectAsset(asset.assetId)}
              title={`Click to select ${asset.assetId}`}
            >
              <span 
                className={`material-icons ${styles.coinIcon}`}
                style={{ color: asset.color }}
              >
                {asset.icon}
              </span>
              <div className={styles.coinInfo}>
                <span className={styles.coinSymbol}>{asset.symbol}</span>
                <span className={styles.coinName}>{asset.name}</span>
              </div>
              <div className={styles.priceInfo}>
                <span className={`${styles.coinPrice} ${direction !== 'same' ? styles.priceFlash : ''}`}>
                  {formatPrice(priceData.price)}
                </span>
                <span className={`${styles.coinChange} ${isPositive ? styles.positive : styles.negative}`}>
                  <span className="material-icons" style={{ fontSize: '14px' }}>
                    {isPositive ? 'arrow_upward' : 'arrow_downward'}
                  </span>
                  {formatChange(priceData.change)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default memo(CryptoTicker)
