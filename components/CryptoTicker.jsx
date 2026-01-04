'use client'

import { useState, useEffect, useCallback, memo } from 'react'
import { API_URL } from '@/lib/api'
import styles from './CryptoTicker.module.css'

// Top 10 crypto coins with their symbols, icons, and colors
const TOP_COINS = [
  { symbol: 'BTC', name: 'Bitcoin', icon: 'currency_bitcoin', color: '#F7931A' },
  { symbol: 'ETH', name: 'Ethereum', icon: 'diamond', color: '#627EEA' },
  { symbol: 'BNB', name: 'BNB', icon: 'hexagon', color: '#F3BA2F' },
  { symbol: 'XRP', name: 'XRP', icon: 'water_drop', color: '#00AAE4' },
  { symbol: 'SOL', name: 'Solana', icon: 'bolt', color: '#9945FF' },
  { symbol: 'ADA', name: 'Cardano', icon: 'change_history', color: '#0033AD' },
  { symbol: 'DOGE', name: 'Dogecoin', icon: 'pets', color: '#C2A633' },
  { symbol: 'TRX', name: 'TRON', icon: 'play_arrow', color: '#FF0013' },
  { symbol: 'AVAX', name: 'Avalanche', icon: 'landscape', color: '#E84142' },
  { symbol: 'DOT', name: 'Polkadot', icon: 'blur_on', color: '#E6007A' },
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

  // Fetch prices from backend API
  const fetchPrices = async () => {
    setIsUpdating(true)
    try {
      const response = await fetch(`${API_URL}/api/crypto-prices`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setPrevPrices(prices)
          setPrices(data.prices)
          setError(null)
          setLastUpdate(new Date())
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
    const mockPrices = {
      BTC: { price: 97500 + Math.random() * 1000, change: (Math.random() - 0.5) * 5 },
      ETH: { price: 3400 + Math.random() * 100, change: (Math.random() - 0.5) * 5 },
      BNB: { price: 710 + Math.random() * 20, change: (Math.random() - 0.5) * 5 },
      XRP: { price: 2.35 + Math.random() * 0.1, change: (Math.random() - 0.5) * 5 },
      SOL: { price: 195 + Math.random() * 10, change: (Math.random() - 0.5) * 5 },
      ADA: { price: 1.05 + Math.random() * 0.05, change: (Math.random() - 0.5) * 5 },
      DOGE: { price: 0.38 + Math.random() * 0.02, change: (Math.random() - 0.5) * 5 },
      TRX: { price: 0.25 + Math.random() * 0.01, change: (Math.random() - 0.5) * 5 },
      AVAX: { price: 40 + Math.random() * 2, change: (Math.random() - 0.5) * 5 },
      DOT: { price: 7.5 + Math.random() * 0.5, change: (Math.random() - 0.5) * 5 },
    }
    setPrices(mockPrices)
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

  if (loading) {
    return (
      <div className={styles.tickerContainer}>
        <div className={styles.tickerInner}>
          {TOP_COINS.map((coin) => (
            <div key={coin.symbol} className={styles.coinBox} style={{ '--coin-color': coin.color }}>
              <span className={`material-icons ${styles.coinIcon}`}>{coin.icon}</span>
              <span className={styles.coinSymbol}>{coin.symbol}</span>
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
      <div className={styles.tickerInner}>
        {/* Update indicator */}
        <div className={styles.updateIndicator}>
          <span className={`material-icons ${isUpdating ? styles.spinning : ''}`} style={{ fontSize: '16px' }}>
            {isUpdating ? 'sync' : 'schedule'}
          </span>
          <span className={styles.countdown}>{countdown}s</span>
        </div>
        
        {TOP_COINS.map((coin) => {
          const priceData = prices[coin.symbol] || { price: 0, change: 0 }
          const isPositive = priceData.change >= 0
          const direction = getPriceDirection(coin.symbol)

          return (
            <div 
              key={coin.symbol} 
              className={`${styles.coinBox} ${isUpdating ? styles.updating : ''}`}
              style={{ '--coin-color': coin.color, cursor: onSelectAsset ? 'pointer' : 'default' }}
              onClick={() => onSelectAsset && onSelectAsset(`${coin.symbol}/USDT`)}
              title={`Click to select ${coin.symbol}/USDT`}
            >
              <span 
                className={`material-icons ${styles.coinIcon}`}
                style={{ color: coin.color }}
              >
                {coin.icon}
              </span>
              <div className={styles.coinInfo}>
                <span className={styles.coinSymbol}>{coin.symbol}</span>
                <span className={styles.coinName}>{coin.name}</span>
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
