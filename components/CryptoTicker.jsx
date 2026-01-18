'use client'

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { API_URL } from '@/lib/api'
import styles from './CryptoTicker.module.css'

// Top assets: Crypto, Stocks, and Commodities
const TOP_ASSETS = [
  // Top 20 Cryptocurrencies
  { symbol: 'BTC', name: 'Bitcoin', icon: 'currency_bitcoin', color: '#F7931A', type: 'crypto', assetId: 'BTC/USDT' },
  { symbol: 'ETH', name: 'Ethereum', icon: 'diamond', color: '#627EEA', type: 'crypto', assetId: 'ETH/USDT' },
  { symbol: 'SOL', name: 'Solana', icon: 'bolt', color: '#9945FF', type: 'crypto', assetId: 'SOL/USDT' },
  { symbol: 'BNB', name: 'BNB', icon: 'hexagon', color: '#F3BA2F', type: 'crypto', assetId: 'BNB/USDT' },
  { symbol: 'XRP', name: 'XRP', icon: 'water_drop', color: '#00AAE4', type: 'crypto', assetId: 'XRP/USDT' },
  { symbol: 'ADA', name: 'Cardano', icon: 'eco', color: '#0033AD', type: 'crypto', assetId: 'ADA/USDT' },
  { symbol: 'DOGE', name: 'Dogecoin', icon: 'pets', color: '#C2A633', type: 'crypto', assetId: 'DOGE/USDT' },
  { symbol: 'AVAX', name: 'Avalanche', icon: 'ac_unit', color: '#E84142', type: 'crypto', assetId: 'AVAX/USDT' },
  { symbol: 'DOT', name: 'Polkadot', icon: 'blur_on', color: '#E6007A', type: 'crypto', assetId: 'DOT/USDT' },
  { symbol: 'LINK', name: 'Chainlink', icon: 'link', color: '#2A5ADA', type: 'crypto', assetId: 'LINK/USDT' },
  { symbol: 'MATIC', name: 'Polygon', icon: 'change_history', color: '#8247E5', type: 'crypto', assetId: 'MATIC/USDT' },
  { symbol: 'UNI', name: 'Uniswap', icon: 'swap_horiz', color: '#FF007A', type: 'crypto', assetId: 'UNI/USDT' },
  { symbol: 'ATOM', name: 'Cosmos', icon: 'public', color: '#2E3148', type: 'crypto', assetId: 'ATOM/USDT' },
  { symbol: 'LTC', name: 'Litecoin', icon: 'paid', color: '#BFBBBB', type: 'crypto', assetId: 'LTC/USDT' },
  { symbol: 'TRX', name: 'Tron', icon: 'hub', color: '#FF0013', type: 'crypto', assetId: 'TRX/USDT' },
  { symbol: 'SHIB', name: 'Shiba Inu', icon: 'pets', color: '#FFA409', type: 'crypto', assetId: 'SHIB/USDT' },
  { symbol: 'NEAR', name: 'Near', icon: 'near_me', color: '#00C08B', type: 'crypto', assetId: 'NEAR/USDT' },
  { symbol: 'SUI', name: 'Sui', icon: 'waves', color: '#6FBCF0', type: 'crypto', assetId: 'SUI/USDT' },
  { symbol: 'APT', name: 'Aptos', icon: 'token', color: '#2DD8A3', type: 'crypto', assetId: 'APT/USDT' },
  { symbol: 'PEPE', name: 'Pepe', icon: 'sentiment_satisfied', color: '#009933', type: 'crypto', assetId: 'PEPE/USDT' },
  // Top 20 US Stocks
  { symbol: 'AAPL', name: 'Apple', icon: 'phone_iphone', color: '#A2AAAD', type: 'stock', assetId: 'AAPL' },
  { symbol: 'MSFT', name: 'Microsoft', icon: 'window', color: '#00A4EF', type: 'stock', assetId: 'MSFT' },
  { symbol: 'GOOGL', name: 'Alphabet', icon: 'search', color: '#4285F4', type: 'stock', assetId: 'GOOGL' },
  { symbol: 'AMZN', name: 'Amazon', icon: 'local_shipping', color: '#FF9900', type: 'stock', assetId: 'AMZN' },
  { symbol: 'NVDA', name: 'NVIDIA', icon: 'memory', color: '#76B900', type: 'stock', assetId: 'NVDA' },
  { symbol: 'META', name: 'Meta', icon: 'groups', color: '#0081FB', type: 'stock', assetId: 'META' },
  { symbol: 'TSLA', name: 'Tesla', icon: 'electric_car', color: '#CC0000', type: 'stock', assetId: 'TSLA' },
  { symbol: 'BRK.B', name: 'Berkshire', icon: 'account_balance', color: '#002D62', type: 'stock', assetId: 'BRK-B' },
  { symbol: 'JPM', name: 'JPMorgan', icon: 'account_balance', color: '#0A2540', type: 'stock', assetId: 'JPM' },
  { symbol: 'V', name: 'Visa', icon: 'credit_card', color: '#1A1F71', type: 'stock', assetId: 'V' },
  { symbol: 'JNJ', name: 'J&J', icon: 'medical_services', color: '#D51900', type: 'stock', assetId: 'JNJ' },
  { symbol: 'WMT', name: 'Walmart', icon: 'storefront', color: '#0071CE', type: 'stock', assetId: 'WMT' },
  { symbol: 'MA', name: 'Mastercard', icon: 'credit_card', color: '#EB001B', type: 'stock', assetId: 'MA' },
  { symbol: 'PG', name: 'P&G', icon: 'cleaning_services', color: '#003DA5', type: 'stock', assetId: 'PG' },
  { symbol: 'HD', name: 'Home Depot', icon: 'hardware', color: '#F96302', type: 'stock', assetId: 'HD' },
  { symbol: 'CVX', name: 'Chevron', icon: 'local_gas_station', color: '#0066CC', type: 'stock', assetId: 'CVX' },
  { symbol: 'XOM', name: 'Exxon', icon: 'local_gas_station', color: '#ED1C24', type: 'stock', assetId: 'XOM' },
  { symbol: 'BAC', name: 'Bank of America', icon: 'account_balance', color: '#012169', type: 'stock', assetId: 'BAC' },
  { symbol: 'KO', name: 'Coca-Cola', icon: 'local_drink', color: '#F40009', type: 'stock', assetId: 'KO' },
  { symbol: 'PFE', name: 'Pfizer', icon: 'vaccines', color: '#0093D0', type: 'stock', assetId: 'PFE' },
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

const STORAGE_KEY = 'ticker_asset_order'

function CryptoTicker({ onSelectAsset, fullWidth = false }) {
  const [prices, setPrices] = useState({})
  const [prevPrices, setPrevPrices] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [countdown, setCountdown] = useState(UPDATE_INTERVAL)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [orderedAssets, setOrderedAssets] = useState(TOP_ASSETS)
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const tickerRef = useRef(null)

  // Load saved order from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const savedOrder = JSON.parse(saved)
        // Reorder assets based on saved symbol order
        const reordered = savedOrder
          .map(symbol => TOP_ASSETS.find(a => a.symbol === symbol))
          .filter(Boolean)
        // Add any new assets not in saved order
        const newAssets = TOP_ASSETS.filter(a => !savedOrder.includes(a.symbol))
        setOrderedAssets([...reordered, ...newAssets])
      }
    } catch (e) {
      // Use default order if localStorage fails
    }
  }, [])

  // Save order to localStorage
  const saveOrder = useCallback((assets) => {
    try {
      const order = assets.map(a => a.symbol)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
    } catch (e) {
      // Ignore localStorage errors
    }
  }, [])

  // Drag handlers
  const handleDragStart = useCallback((e, index) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
    // Add some delay to allow the drag image to be set
    setTimeout(() => {
      e.target.style.opacity = '0.5'
    }, 0)
  }, [])

  const handleDragEnd = useCallback((e) => {
    e.target.style.opacity = '1'
    setDraggedIndex(null)
    setDragOverIndex(null)
  }, [])

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index)
    }
  }, [draggedIndex])

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  const handleDrop = useCallback((e, dropIndex) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDragOverIndex(null)
      return
    }

    const newAssets = [...orderedAssets]
    const [draggedItem] = newAssets.splice(draggedIndex, 1)
    newAssets.splice(dropIndex, 0, draggedItem)
    
    setOrderedAssets(newAssets)
    saveOrder(newAssets)
    setDraggedIndex(null)
    setDragOverIndex(null)
  }, [draggedIndex, orderedAssets, saveOrder])

  const displayAssets = orderedAssets

  // Base mock prices with realistic values for fallback
  const getMockPrices = () => ({
    // Top 20 Crypto
    BTC: { price: 97500 + Math.random() * 1000, change: (Math.random() - 0.5) * 5 },
    ETH: { price: 3400 + Math.random() * 100, change: (Math.random() - 0.5) * 5 },
    SOL: { price: 195 + Math.random() * 10, change: (Math.random() - 0.5) * 5 },
    BNB: { price: 710 + Math.random() * 20, change: (Math.random() - 0.5) * 5 },
    XRP: { price: 2.35 + Math.random() * 0.1, change: (Math.random() - 0.5) * 5 },
    ADA: { price: 0.95 + Math.random() * 0.1, change: (Math.random() - 0.5) * 6 },
    DOGE: { price: 0.32 + Math.random() * 0.02, change: (Math.random() - 0.5) * 7 },
    AVAX: { price: 38 + Math.random() * 3, change: (Math.random() - 0.5) * 5 },
    DOT: { price: 7.2 + Math.random() * 0.5, change: (Math.random() - 0.5) * 5 },
    LINK: { price: 22 + Math.random() * 2, change: (Math.random() - 0.5) * 5 },
    MATIC: { price: 0.58 + Math.random() * 0.05, change: (Math.random() - 0.5) * 6 },
    UNI: { price: 13.5 + Math.random() * 1, change: (Math.random() - 0.5) * 5 },
    ATOM: { price: 9.2 + Math.random() * 0.5, change: (Math.random() - 0.5) * 5 },
    LTC: { price: 108 + Math.random() * 5, change: (Math.random() - 0.5) * 4 },
    TRX: { price: 0.24 + Math.random() * 0.02, change: (Math.random() - 0.5) * 5 },
    SHIB: { price: 0.0000225 + Math.random() * 0.000002, change: (Math.random() - 0.5) * 8 },
    NEAR: { price: 5.4 + Math.random() * 0.5, change: (Math.random() - 0.5) * 6 },
    SUI: { price: 4.2 + Math.random() * 0.3, change: (Math.random() - 0.5) * 7 },
    APT: { price: 9.5 + Math.random() * 0.8, change: (Math.random() - 0.5) * 6 },
    PEPE: { price: 0.0000185 + Math.random() * 0.000002, change: (Math.random() - 0.5) * 10 },
    // Top 20 Stocks
    AAPL: { price: 185 + Math.random() * 5, change: (Math.random() - 0.5) * 3 },
    MSFT: { price: 420 + Math.random() * 10, change: (Math.random() - 0.5) * 3 },
    GOOGL: { price: 175 + Math.random() * 5, change: (Math.random() - 0.5) * 3 },
    AMZN: { price: 195 + Math.random() * 5, change: (Math.random() - 0.5) * 3 },
    NVDA: { price: 140 + Math.random() * 5, change: (Math.random() - 0.5) * 4 },
    META: { price: 590 + Math.random() * 15, change: (Math.random() - 0.5) * 3 },
    TSLA: { price: 245 + Math.random() * 10, change: (Math.random() - 0.5) * 5 },
    'BRK.B': { price: 455 + Math.random() * 10, change: (Math.random() - 0.5) * 2 },
    JPM: { price: 205 + Math.random() * 5, change: (Math.random() - 0.5) * 2 },
    V: { price: 285 + Math.random() * 5, change: (Math.random() - 0.5) * 2 },
    JNJ: { price: 155 + Math.random() * 3, change: (Math.random() - 0.5) * 2 },
    WMT: { price: 175 + Math.random() * 3, change: (Math.random() - 0.5) * 2 },
    MA: { price: 475 + Math.random() * 10, change: (Math.random() - 0.5) * 2 },
    PG: { price: 165 + Math.random() * 3, change: (Math.random() - 0.5) * 2 },
    HD: { price: 385 + Math.random() * 8, change: (Math.random() - 0.5) * 2 },
    CVX: { price: 155 + Math.random() * 4, change: (Math.random() - 0.5) * 2 },
    XOM: { price: 112 + Math.random() * 3, change: (Math.random() - 0.5) * 2 },
    BAC: { price: 42 + Math.random() * 1, change: (Math.random() - 0.5) * 2 },
    KO: { price: 62 + Math.random() * 1, change: (Math.random() - 0.5) * 2 },
    PFE: { price: 28 + Math.random() * 1, change: (Math.random() - 0.5) * 3 },
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

    let rafId
    const speed = 0.5
    const step = () => {
      if (!ticker) return
      if (!isHovered) {
        ticker.scrollLeft += speed
        // Reset to start when reaching end for seamless loop
        const maxScroll = ticker.scrollWidth - ticker.clientWidth
        if (ticker.scrollLeft >= maxScroll) {
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
      <div className={`${styles.tickerContainer} ${fullWidth ? styles.fullWidth : ''}`}>
        <div
          className={styles.tickerInner}
          ref={tickerRef}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {orderedAssets.map((asset) => (
            <div key={`${asset.symbol}-loading`} className={styles.coinBox} style={{ '--coin-color': asset.color }}>
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
    <div className={`${styles.tickerContainer} ${fullWidth ? styles.fullWidth : ''}`}>
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
        
        {displayAssets.map((asset, index) => {
          const priceData = prices[asset.symbol] || { price: 0, change: 0 }
          const isPositive = priceData.change >= 0
          const direction = getPriceDirection(asset.symbol)
          const isDragging = draggedIndex === index
          const isDragOver = dragOverIndex === index

          return (
            <div 
              key={asset.symbol}
              className={`${styles.coinBox} ${isUpdating ? styles.updating : ''} ${styles[asset.type] || ''} ${isDragging ? styles.dragging : ''} ${isDragOver ? styles.dragOver : ''}`}
              style={{ '--coin-color': asset.color, cursor: 'grab' }}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onClick={() => onSelectAsset && onSelectAsset(asset.assetId)}
              title={`Drag to reorder • Click to select ${asset.assetId}`}
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
