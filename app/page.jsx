'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion'
import styles from './page.module.css'

// Define data outside component to avoid hoisting issues
const FEATURES = [
  {
    id: 'backtest',
    title: 'Auto Price Action Backtest',
    description: 'Test your trading strategies on real historical data with automatic signal detection and comprehensive performance metrics.',
    image: '/autopriceactionbacktest.png',
    icon: 'candlestick_chart',
    stats: ['Multiple indicator support', 'Long & Short positions', 'Detailed trade annotations']
  },
  {
    id: 'performance',
    title: 'Performance Analytics',
    description: 'Deep dive into your strategy performance with win rate analysis, drawdown tracking, and risk-adjusted metrics.',
    image: '/performancesummary.png',
    icon: 'analytics',
    stats: ['Win rate & profit factor', 'Maximum drawdown analysis', 'Risk-adjusted returns']
  },
  {
    id: 'strategybuilder',
    title: 'Open-End Strategy Builder',
    description: 'Build complex trading strategies with our flexible, visual strategy builder. Combine indicators and conditions with ease.',
    image: '/strategybuilder.png',
    icon: 'construction',
    stats: ['Drag-and-drop interface', 'Custom condition logic', 'Save & reuse strategies']
  },
  {
    id: 'indicator',
    title: 'Custom Indicator Sandbox',
    description: 'Create and test custom indicator configurations. Experiment with EMA, RSI, CCI, Z-Score, DEMA, and more.',
    image: '/customindicator.png',
    icon: 'show_chart',
    stats: ['9+ built-in indicators', 'Custom parameters', 'Real-time preview']
  },
  {
    id: 'optimize',
    title: 'Parameter Optimization',
    description: 'Find optimal indicator settings with grid search analysis, performance heatmaps, and Sharpe ratio rankings.',
    image: '/strategyrobust.png',
    icon: 'tune',
    stats: ['Grid search optimization', 'Visual heatmaps', 'Statistical validation']
  },
  {
    id: 'montecarlo',
    title: 'Monte Carlo Simulation',
    description: 'Project future performance with thousands of randomized simulations. Understand risk with confidence bands.',
    image: '/montecarlo.png',
    icon: 'casino',
    stats: ['Randomized path simulation', 'Percentile confidence bands', 'Risk quantification']
  },
  {
    id: 'stresstest',
    title: 'Stress Testing',
    description: 'Validate your strategy under adverse conditions with entry/exit delays, slippage simulation, and worst-case scenarios.',
    image: '/stresstest.png',
    icon: 'speed',
    stats: ['Entry/exit delay testing', 'Performance stress analysis', 'Robustness validation']
  },
]

const ROADMAP = [
  {
    phase: 'Beta',
    status: 'current',
    label: 'NOW',
    icon: 'science',
    color: '#22c55e',
    features: [
      'Price action backtesting (Auto & Manual modes)',
      'Algorithmic strategy optimization',
      'Open-end strategy builder with visual interface',
      'Custom indicator sandbox with 9+ indicators',
      'Monte Carlo simulation & stress testing',
      'Performance analytics & risk metrics',
      'Bootstrap resampling analysis',
      'Statistical significance testing',
    ]
  },
  {
    phase: 'Beta 2',
    status: 'upcoming',
    label: 'Q2 2026',
    icon: 'rocket',
    color: '#4488ff',
    features: [
      'Real-time chart streaming & live data',
      'Playback mode for manual backtest review',
      'Social media API integration for signal alerts',
      'Telegram & Discord bot notifications',
      'Advanced portfolio analytics',
      'Multi-timeframe comparison tools',
      'Additional backtest components & metrics',
    ]
  },
  {
    phase: 'Public Launch',
    status: 'future',
    label: '2026',
    icon: 'public',
    color: '#9d4edd',
    features: [
      'Direct exchange connection for live trading',
      'Automated bot execution engine',
      'Custom bot strategy configuration',
      'Strategy marketplace & community sharing',
      'Paper trading simulation mode',
      'Advanced risk management tools',
    ]
  }
]

const MAIN_PRODUCTS = [
  {
    id: 'price-action',
    icon: 'candlestick_chart',
    title: 'Price Action Backtest',
    subtitle: 'Visual Strategy Testing',
    description: 'Test your trading ideas directly on price charts. Perfect for discretionary traders.',
    color: '#4488ff'
  },
  {
    id: 'algorithmic',
    icon: 'psychology',
    title: 'Algorithmic Optimization',
    subtitle: 'Quantitative Analysis',
    description: 'Professional-grade tools for systematic traders. Optimize and validate your edge.',
    color: '#9d4edd'
  }
]

const TRADING_PAIRS = {
  'Cryptocurrencies': {
    icon: 'currency_bitcoin',
    color: '#f7931a',
    pairs: ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'LINK', 'MATIC', 'UNI', 'ATOM', 'LTC', 'TRX', 'SHIB', 'PEPE', 'NEAR', 'SUI']
  },
  'Top US Stocks': {
    icon: 'trending_up',
    color: '#22c55e',
    pairs: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'BRK-B', 'JPM', 'V', 'JNJ', 'WMT', 'PG', 'UNH', 'HD', 'MA', 'BAC', 'XOM', 'CVX', 'KO', 'PEP', 'DIS', 'NFLX', 'AMD', 'INTC', 'CRM', 'ORCL', 'CSCO', 'ADBE']
  },
  'ETFs & Indices': {
    icon: 'pie_chart',
    color: '#4488ff',
    pairs: ['SPY', 'QQQ', 'DIA', 'IWM', 'VTI']
  },
  'Commodities': {
    icon: 'diamond',
    color: '#ffd700',
    pairs: ['Gold Futures', 'Gold ETF', 'Silver Futures', 'Silver ETF', 'Crude Oil', 'Oil ETF']
  }
}

const INDICATORS = [
  { name: 'EMA', description: 'Exponential Moving Average', icon: 'show_chart', color: '#4488ff' },
  { name: 'MA / SMA', description: 'Simple Moving Average', icon: 'timeline', color: '#22c55e' },
  { name: 'RSI', description: 'Relative Strength Index', icon: 'speed', color: '#9d4edd' },
  { name: 'CCI', description: 'Commodity Channel Index', icon: 'waves', color: '#f97316' },
  { name: 'Z-Score', description: 'Statistical Deviation', icon: 'analytics', color: '#06b6d4' },
  { name: 'DEMA', description: 'Double EMA', icon: 'stacked_line_chart', color: '#ec4899' },
  { name: 'Roll Std', description: 'Rolling Standard Deviation', icon: 'insert_chart', color: '#eab308' },
  { name: 'Roll Median', description: 'Rolling Median', icon: 'trending_flat', color: '#14b8a6' },
  { name: 'Roll Percentile', description: 'Rolling Percentile', icon: 'percent', color: '#8b5cf6' }
]

// Generate fake candle data for demo
function generateCandleData(count = 30) {
  const data = []
  let price = 100 + Math.random() * 50
  const now = Date.now()
  
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 8
    const open = price
    const close = price + change
    const high = Math.max(open, close) + Math.random() * 3
    const low = Math.min(open, close) - Math.random() * 3
    
    data.push({
      time: now - (count - i) * 86400000,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
    })
    price = close
  }
  return data
}

// Interactive Backtest Demo Component
function BacktestDemo({ onClose }) {
  const [candles] = useState(() => generateCandleData(15))
  const [trades, setTrades] = useState([])
  const [pnl, setPnl] = useState(0)
  const [openTrade, setOpenTrade] = useState(null)
  
  const handleCandleClick = (e, candle, index) => {
    e.stopPropagation()
    
    if (openTrade === null) {
      // Open new trade
      const type = Math.random() > 0.5 ? 'long' : 'short'
      setOpenTrade({ 
        entry: index, 
        entryPrice: candle.close, 
        type
      })
    } else {
      // Close trade
      if (index <= openTrade.entry) return // Can't exit before entry
      
      const exitPrice = candle.close
      const profit = openTrade.type === 'long' 
        ? exitPrice - openTrade.entryPrice 
        : openTrade.entryPrice - exitPrice
      
      setTrades(prev => [...prev, { ...openTrade, exit: index, exitPrice, profit }])
      setPnl(prev => prev + profit)
      setOpenTrade(null)
    }
  }

  const minPrice = Math.min(...candles.map(c => c.low))
  const maxPrice = Math.max(...candles.map(c => c.high))
  const priceRange = maxPrice - minPrice || 1
  
  const getY = (price) => ((maxPrice - price) / priceRange) * 140 + 20
  
  const handleReset = () => {
    setTrades([])
    setPnl(0)
    setOpenTrade(null)
  }
  
  return (
    <motion.div 
      className={styles.demoOverlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={onClose}
    >
      <motion.div 
        className={styles.demoModal}
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className={styles.demoHeader}>
          <div>
            <h3>Interactive Backtest Demo</h3>
            <p>{openTrade ? '👆 Click another candle to EXIT' : '👆 Click any candle to ENTER a trade'}</p>
          </div>
          <button onClick={onClose} className={styles.demoClose}>
            <span className="material-icons">close</span>
          </button>
        </div>
        
        <div className={styles.demoChart}>
          <svg viewBox="0 0 380 180" className={styles.candleChart}>
            {/* Grid lines */}
            {[0, 1, 2, 3].map(i => (
              <line key={i} x1="0" y1={20 + i * 45} x2="380" y2={20 + i * 45} stroke="rgba(255,255,255,0.05)" />
            ))}
            
            {/* Candles */}
            {candles.map((candle, i) => {
              const x = 12 + i * 24
              const isUp = candle.close >= candle.open
              const color = isUp ? '#22c55e' : '#ef4444'
              const bodyTop = getY(Math.max(candle.open, candle.close))
              const bodyBottom = getY(Math.min(candle.open, candle.close))
              const bodyHeight = Math.max(bodyBottom - bodyTop, 2)
              
              // Check if this candle has a trade
              const entryTrade = trades.find(t => t.entry === i)
              const exitTrade = trades.find(t => t.exit === i)
              const isOpenEntry = openTrade?.entry === i
              
              return (
                <g
                  key={i}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => handleCandleClick(e, candle, i)}
                  onPointerDown={(e) => handleCandleClick(e, candle, i)}
                >
                  {/* Invisible clickable area */}
                  <rect x={x - 4} y="0" width="24" height="180" fill="transparent" pointerEvents="all" />
                  {/* Wick */}
                  <line x1={x + 7} y1={getY(candle.high)} x2={x + 7} y2={getY(candle.low)} stroke={color} strokeWidth="2" />
                  {/* Body */}
                  <rect 
                    x={x} 
                    y={bodyTop} 
                    width="14" 
                    height={bodyHeight} 
                    fill={color}
                    rx="2"
                  />
                  {/* Entry marker (completed trades) */}
                  {entryTrade && (
                    <circle cx={x + 7} cy={getY(entryTrade.entryPrice) - 12} r="8" fill={entryTrade.type === 'long' ? '#22c55e' : '#ef4444'} stroke="#fff" strokeWidth="2" />
                  )}
                  {/* Open trade marker */}
                  {isOpenEntry && (
                    <>
                      <circle cx={x + 7} cy={getY(openTrade.entryPrice) - 12} r="8" fill={openTrade.type === 'long' ? '#22c55e' : '#ef4444'} stroke="#fff" strokeWidth="2" />
                      <text x={x + 7} y={getY(openTrade.entryPrice) - 8} textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">
                        {openTrade.type === 'long' ? 'L' : 'S'}
                      </text>
                    </>
                  )}
                  {/* Exit marker */}
                  {exitTrade && (
                    <polygon points={`${x + 7},${getY(exitTrade.exitPrice) + 20} ${x + 2},${getY(exitTrade.exitPrice) + 12} ${x + 12},${getY(exitTrade.exitPrice) + 12}`} fill="#fff" />
                  )}
                </g>
              )
            })}
            
            {/* Trade lines (completed) */}
            {trades.map((trade, i) => (
              <line 
                key={i}
                x1={12 + trade.entry * 24 + 7}
                y1={getY(trade.entryPrice)}
                x2={12 + trade.exit * 24 + 7}
                y2={getY(trade.exitPrice)}
                stroke={trade.profit > 0 ? '#22c55e' : '#ef4444'}
                strokeWidth="2"
                strokeDasharray="4"
                opacity="0.7"
              />
            ))}
          </svg>
        </div>
        
        <div className={styles.demoStats}>
          <div className={styles.demoStat}>
            <span>Trades</span>
            <strong>{trades.length}</strong>
          </div>
          <div className={styles.demoStat}>
            <span>Wins</span>
            <strong style={{ color: '#22c55e' }}>{trades.filter(t => t.profit > 0).length}</strong>
          </div>
          <div className={styles.demoStat}>
            <span>P&L</span>
            <strong style={{ color: pnl >= 0 ? '#22c55e' : '#ef4444' }}>
              {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
            </strong>
          </div>
          <button onClick={handleReset} className={styles.demoResetBtn}>
            <span className="material-icons">refresh</span>
            Reset
          </button>
        </div>
        
        <div className={styles.demoFooter}>
          <p>The full app has real market data, indicators, and detailed analytics!</p>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Interactive Optimization Demo Component
function OptimizeDemo({ onClose }) {
  const [fastEMA, setFastEMA] = useState(12)
  const [slowEMA, setSlowEMA] = useState(26)
  const [heatmapData, setHeatmapData] = useState([])
  const [bestParams, setBestParams] = useState({ fast: 12, slow: 26, sharpe: 0 })
  
  // Generate smaller heatmap data (5x5 grid)
  useEffect(() => {
    const data = []
    let best = { fast: 0, slow: 0, sharpe: -999 }
    
    for (let f = 8; f <= 16; f += 2) {
      for (let s = 22; s <= 34; s += 3) {
        // Fake but deterministic sharpe ratio
        const base = Math.sin(f * 0.5) * Math.cos(s * 0.1) + 0.5
        const bonus = (Math.abs(f - fastEMA) < 3 && Math.abs(s - slowEMA) < 4) ? 0.4 : 0
        const sharpe = +(base + bonus + Math.random() * 0.2).toFixed(3)
        data.push({ fast: f, slow: s, sharpe })
        
        if (sharpe > best.sharpe) {
          best = { fast: f, slow: s, sharpe }
        }
      }
    }
    setHeatmapData(data)
    setBestParams(best)
  }, [fastEMA, slowEMA])
  
  const getColor = (sharpe) => {
    if (sharpe < 0.4) return '#ef4444'
    if (sharpe < 0.6) return '#f97316'
    if (sharpe < 0.8) return '#eab308'
    if (sharpe < 1.0) return '#22c55e'
    return '#10b981'
  }
  
  return (
    <motion.div 
      className={styles.demoOverlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div 
        className={styles.demoModalCompact}
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.demoHeader}>
          <div>
            <h3>Parameter Optimization</h3>
            <p>Drag sliders to see how parameters affect performance</p>
          </div>
          <button onClick={onClose} className={styles.demoClose}>
            <span className="material-icons">close</span>
          </button>
        </div>
        
        <div className={styles.optimizeControls}>
          <div className={styles.sliderRow}>
            <div className={styles.sliderGroup}>
              <label>Fast EMA: <strong>{fastEMA}</strong></label>
              <input 
                type="range" 
                min="5" 
                max="20" 
                value={fastEMA} 
                onChange={(e) => setFastEMA(+e.target.value)}
                className={styles.slider}
              />
            </div>
            <div className={styles.sliderGroup}>
              <label>Slow EMA: <strong>{slowEMA}</strong></label>
              <input 
                type="range" 
                min="20" 
                max="50" 
                value={slowEMA} 
                onChange={(e) => setSlowEMA(+e.target.value)}
                className={styles.slider}
              />
            </div>
          </div>
        </div>
        
        <div className={styles.heatmapContainer}>
          <div className={styles.heatmap}>
            {heatmapData.map((cell, i) => (
              <motion.div 
                key={i}
                className={styles.heatmapCell}
                style={{ background: getColor(cell.sharpe) }}
                whileHover={{ scale: 1.15 }}
                title={`Fast: ${cell.fast}, Slow: ${cell.slow}\nSharpe: ${cell.sharpe}`}
              >
                <span className={styles.cellValue}>{cell.sharpe.toFixed(2)}</span>
              </motion.div>
            ))}
          </div>
          <div className={styles.heatmapLegend}>
            <span style={{ background: '#ef4444' }}>Low</span>
            <span style={{ background: '#eab308' }}>Med</span>
            <span style={{ background: '#10b981' }}>High</span>
          </div>
        </div>
        
        <div className={styles.demoStats}>
          <div className={styles.demoStat}>
            <span>Best Sharpe</span>
            <strong style={{ color: '#22c55e' }}>{bestParams.sharpe.toFixed(2)}</strong>
          </div>
          <div className={styles.demoStat}>
            <span>Optimal</span>
            <strong>{bestParams.fast}/{bestParams.slow}</strong>
          </div>
          <div className={styles.demoStat}>
            <span>Tests</span>
            <strong>{heatmapData.length}</strong>
          </div>
        </div>
        
        <div className={styles.demoFooter}>
          <p>Full version tests 1000+ combinations with real data!</p>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Spotlight component for cursor follow effect
function Spotlight({ children, className }) {
  const divRef = useRef(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [opacity, setOpacity] = useState(0)

  const handleMouseMove = (e) => {
    if (!divRef.current) return
    const rect = divRef.current.getBoundingClientRect()
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div
      ref={divRef}
      className={`${styles.spotlightContainer} ${className || ''}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
    >
      <div
        className={styles.spotlight}
        style={{
          opacity,
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(68, 136, 255, 0.15), transparent 40%)`,
        }}
      />
      {children}
    </div>
  )
}

// 3D Tilt Card component
function TiltCard({ children, className }) {
  const ref = useRef(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  
  const mouseXSpring = useSpring(x)
  const mouseYSpring = useSpring(y)
  
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["8deg", "-8deg"])
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-8deg", "8deg"])

  const handleMouseMove = (e) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const xPct = mouseX / width - 0.5
    const yPct = mouseY / height - 0.5
    x.set(xPct)
    y.set(yPct)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateY,
        rotateX,
        transformStyle: "preserve-3d",
      }}
      className={className}
    >
      <div style={{ transform: "translateZ(50px)", transformStyle: "preserve-3d" }}>
        {children}
      </div>
    </motion.div>
  )
}

// Text reveal animation
const textRevealVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.5,
      ease: [0.25, 0.4, 0.25, 1]
    }
  })
}

// Floating particles background
function FloatingParticles() {
  return (
    <div className={styles.particlesContainer}>
      {[...Array(15)].map((_, i) => (
        <motion.div
          key={i}
          className={styles.particle}
          initial={{
            x: Math.random() * 100 + '%',
            y: Math.random() * 100 + '%',
            scale: Math.random() * 0.5 + 0.5,
            opacity: Math.random() * 0.3 + 0.1
          }}
          animate={{
            y: [null, Math.random() * -200 - 100],
            opacity: [null, 0]
          }}
          transition={{
            duration: Math.random() * 15 + 10,
            repeat: Infinity,
            ease: "linear"
          }}
        />
      ))}
    </div>
  )
}

// Animated grid background
function GridBackground() {
  return (
    <div className={styles.gridBackground}>
      <div className={styles.gridOverlay} />
    </div>
  )
}

export default function LandingPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [activeFeature, setActiveFeature] = useState(0)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [showBacktestDemo, setShowBacktestDemo] = useState(false)
  const [showOptimizeDemo, setShowOptimizeDemo] = useState(false)
  
  // Track mouse position for global effects
  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // If already logged in, redirect to backtest
  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/backtest')
    }
  }, [status, router])

  // Auto-rotate features
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature(prev => (prev + 1) % FEATURES.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  if (status === 'loading') {
    return (
      <div className={styles.loadingScreen}>
        <motion.div 
          className={styles.loadingSpinner}
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    )
  }

  return (
    <div className={styles.landing}>
      <GridBackground />
      <FloatingParticles />
      
      {/* Demo Modals */}
      <AnimatePresence>
        {showBacktestDemo && <BacktestDemo onClose={() => setShowBacktestDemo(false)} />}
        {showOptimizeDemo && <OptimizeDemo onClose={() => setShowOptimizeDemo(false)} />}
      </AnimatePresence>
      
      {/* Cursor glow effect */}
      <motion.div 
        className={styles.cursorGlow}
        animate={{
          x: mousePosition.x - 200,
          y: mousePosition.y - 200,
        }}
        transition={{ type: "spring", damping: 30, stiffness: 200 }}
      />

      {/* Navigation */}
      <motion.nav 
        className={styles.navbar}
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1] }}
      >
        <div className={styles.navContent}>
          <div className={styles.logo}>
            <motion.img 
              src="/logo.png" 
              alt="Alphalabs" 
              className={styles.logoImage}
              whileHover={{ scale: 1.1, rotate: 5 }}
            />
            <span className={styles.logoText}>Alphalabs</span>
          </div>
          <div className={styles.navRight}>
            <span className={styles.betaTag}>BETA</span>
            <motion.button 
              className={styles.loginButton} 
              onClick={() => router.push('/login')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="material-icons">login</span>
              Launch App
            </motion.button>
          </div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <Spotlight>
        <section className={styles.hero}>
          <motion.div 
            className={styles.heroContent}
            initial="hidden"
            animate="visible"
          >
            <motion.div 
              className={styles.badge}
              custom={0}
              variants={textRevealVariants}
              whileHover={{ scale: 1.05 }}
            >
              <span className="material-icons">science</span>
              Open Beta — Free Access
            </motion.div>
            
            <motion.h1 
              className={styles.heroTitle}
              custom={1}
              variants={textRevealVariants}
            >
              Quantitative{' '}
              <span className={styles.gradient}>Trading Lab</span>
            </motion.h1>
            
            <motion.p 
              className={styles.heroSubtitle}
              custom={2}
              variants={textRevealVariants}
            >
              Professional backtesting and optimization for crypto traders.
              Validate strategies with Monte Carlo simulations, stress tests, and statistical analysis.
            </motion.p>
            
            <motion.div 
              className={styles.heroCTA}
              custom={3}
              variants={textRevealVariants}
            >
              <motion.button 
                className={styles.primaryButton} 
                onClick={() => router.push('/login')}
                whileHover={{ scale: 1.05, boxShadow: "0 0 40px rgba(68, 136, 255, 0.5)" }}
                whileTap={{ scale: 0.95 }}
              >
                Get Started Free
                <span className="material-icons">arrow_forward</span>
              </motion.button>
              <span className={styles.ctaNote}>
                <span className="material-icons">check_circle</span>
                No credit card required
              </span>
            </motion.div>
          </motion.div>
          
          {/* Hero Screenshot with 3D effect */}
          <motion.div 
            className={styles.heroScreenshot}
            initial={{ opacity: 0, y: 50, rotateX: -10 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
          >
            <TiltCard className={styles.screenshotFrame}>
              <div className={styles.screenshotInner}>
                <div className={styles.screenshotHeader}>
                  <div className={styles.windowDots}>
                    <span></span><span></span><span></span>
                  </div>
                  <span>Alphalabs Dashboard</span>
                </div>
                <img src="/portfolio.png" alt="Dashboard Preview" className={styles.screenshotImage} />
                <div className={styles.screenshotGlow} />
              </div>
            </TiltCard>
          </motion.div>
        </section>
      </Spotlight>

      {/* Two Products Section */}
      <section className={styles.products}>
        <div className={styles.sectionContainer}>
          <motion.div 
            className={styles.sectionHeader}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className={styles.sectionTag}>TWO APPROACHES</span>
            <h2 className={styles.sectionTitleWithBadge}>
              <span>Try our features</span>
              <span className={styles.demoBadge}>demo</span>
            </h2>
          </motion.div>

          <div className={styles.productsGrid}>
            {MAIN_PRODUCTS.map((product, index) => (
              <motion.div 
                key={product.id}
                className={styles.productCardWrapper}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
              >
                <div className={styles.productCard}>
                  <motion.div 
                    className={styles.productIcon} 
                    style={{ background: `${product.color}20`, color: product.color }}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <span className="material-icons">{product.icon}</span>
                  </motion.div>
                  <h3>{product.title}</h3>
                  <span className={styles.productSubtitle}>{product.subtitle}</span>
                  <p>{product.description}</p>
                  <motion.button 
                    className={styles.productCTA}
                    onClick={() => product.id === 'price-action' ? setShowBacktestDemo(true) : setShowOptimizeDemo(true)}
                    style={{ background: product.color }}
                    whileHover={{ scale: 1.02, boxShadow: `0 8px 30px ${product.color}40` }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Try {product.id === 'price-action' ? 'Backtest' : 'Optimize'}
                    <span className="material-icons">arrow_forward</span>
                  </motion.button>
                  <div className={styles.productGlow} style={{ background: product.color }} />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trading Pairs & Indicators Section */}
      <section className={styles.assetsSection}>
        <div className={styles.sectionContainer}>
          <motion.div 
            className={styles.sectionHeader}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className={styles.sectionTag}>COMPREHENSIVE COVERAGE</span>
            <h2>Trade What <span className={styles.gradient}>Matters</span> To You</h2>
            <p className={styles.assetsSubtitle}>Access 60+ trading pairs across crypto, stocks, ETFs, and commodities</p>
          </motion.div>

          {/* Trading Pairs Grid */}
          <div className={styles.assetsGrid}>
            {Object.entries(TRADING_PAIRS).map(([category, data], index) => (
              <motion.div 
                key={category}
                className={styles.assetCategory}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <div className={styles.categoryHeader}>
                  <motion.div 
                    className={styles.categoryIcon}
                    style={{ background: `${data.color}15`, color: data.color }}
                    whileHover={{ scale: 1.1, rotate: 10 }}
                  >
                    <span className="material-icons">{data.icon}</span>
                  </motion.div>
                  <div>
                    <h3>{category}</h3>
                    <span className={styles.pairCount}>{data.pairs.length} pairs</span>
                  </div>
                </div>
                <div className={styles.pairTags}>
                  {data.pairs.slice(0, 12).map((pair, i) => (
                    <motion.span 
                      key={pair}
                      className={styles.pairTag}
                      initial={{ opacity: 0, scale: 0.8 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 + i * 0.02 }}
                      whileHover={{ scale: 1.05, background: `${data.color}20` }}
                    >
                      {pair}
                    </motion.span>
                  ))}
                  {data.pairs.length > 12 && (
                    <span className={styles.morePairs}>+{data.pairs.length - 12} more</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Indicators Section */}
          <motion.div 
            className={styles.indicatorsSection}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className={styles.indicatorsHeader}>
              <span className="material-icons">insights</span>
              <h3>Built-in Technical Indicators</h3>
              <p>Professional-grade indicators with customizable parameters</p>
            </div>
            <div className={styles.indicatorsGrid}>
              {INDICATORS.map((indicator, index) => (
                <motion.div 
                  key={indicator.name}
                  className={styles.indicatorCard}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  whileHover={{ 
                    scale: 1.03, 
                    boxShadow: `0 8px 30px ${indicator.color}20`,
                    borderColor: indicator.color 
                  }}
                >
                  <motion.div 
                    className={styles.indicatorIcon}
                    style={{ background: `${indicator.color}15`, color: indicator.color }}
                  >
                    <span className="material-icons">{indicator.icon}</span>
                  </motion.div>
                  <div className={styles.indicatorInfo}>
                    <strong>{indicator.name}</strong>
                    <span>{indicator.description}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Stats Row */}
          <motion.div 
            className={styles.assetsStats}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className={styles.assetStat}>
              <span className="material-icons">currency_bitcoin</span>
              <strong>19</strong>
              <span>Crypto Pairs</span>
            </div>
            <div className={styles.assetStat}>
              <span className="material-icons">trending_up</span>
              <strong>29</strong>
              <span>US Stocks</span>
            </div>
            <div className={styles.assetStat}>
              <span className="material-icons">pie_chart</span>
              <strong>5</strong>
              <span>ETFs</span>
            </div>
            <div className={styles.assetStat}>
              <span className="material-icons">diamond</span>
              <strong>6</strong>
              <span>Commodities</span>
            </div>
            <div className={styles.assetStat}>
              <span className="material-icons">insights</span>
              <strong>9</strong>
              <span>Indicators</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Interactive Feature Showcase */}
      <section className={styles.showcase}>
        <div className={styles.sectionContainer}>
          <motion.div 
            className={styles.sectionHeader}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className={styles.sectionTag}>PLATFORM FEATURES</span>
            <h2>Everything You Need to <span className={styles.gradient}>Validate</span> Your Edge</h2>
          </motion.div>
          
          <div className={styles.showcaseContent}>
            {/* Feature Tabs */}
            <motion.div 
              className={styles.featureTabs}
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {FEATURES.map((feature, index) => (
                <motion.button
                  key={feature.id}
                  className={`${styles.featureTab} ${activeFeature === index ? styles.active : ''}`}
                  onClick={() => setActiveFeature(index)}
                  whileHover={{ x: 5 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="material-icons">{feature.icon}</span>
                  <span className={styles.tabTitle}>{feature.title}</span>
                  {activeFeature === index && (
                    <motion.div 
                      className={styles.tabProgress}
                      layoutId="tabProgress"
                    />
                  )}
                </motion.button>
              ))}
            </motion.div>

            {/* Feature Display */}
            <motion.div 
              className={styles.featureDisplay}
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <motion.div 
                className={styles.featureInfo}
                key={activeFeature}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <h3>{FEATURES[activeFeature].title}</h3>
                <p>{FEATURES[activeFeature].description}</p>
                <ul className={styles.featureStats}>
                  {FEATURES[activeFeature].stats.map((stat, i) => (
                    <motion.li 
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 + 0.2 }}
                    >
                      <span className="material-icons">check_circle</span>
                      {stat}
                    </motion.li>
                  ))}
                </ul>
                <motion.button 
                  className={styles.tryButton} 
                  onClick={() => router.push('/login')}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Try it Now
                  <span className="material-icons">arrow_forward</span>
                </motion.button>
              </motion.div>
              <div className={styles.featureImage}>
                <motion.div 
                  className={styles.imageFrame}
                  key={FEATURES[activeFeature].id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  <img 
                    src={FEATURES[activeFeature].image} 
                    alt={FEATURES[activeFeature].title}
                  />
                  <div className={styles.imageGlow} />
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Roadmap Section */}
      <section className={styles.roadmap}>
        <div className={styles.sectionContainer}>
          <motion.div 
            className={styles.sectionHeader}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className={styles.sectionTag}>DEVELOPMENT ROADMAP</span>
            <h2>Building the Future of <span className={styles.gradient}>Quantitative Trading</span></h2>
            <p className={styles.roadmapSubtitle}>Our vision for empowering traders with professional-grade tools</p>
          </motion.div>

          <div className={styles.roadmapTimeline}>
            {ROADMAP.map((phase, index) => (
              <motion.div 
                key={phase.phase}
                className={`${styles.roadmapPhase} ${phase.status === 'current' ? styles.currentPhase : ''}`}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
              >
                <div className={styles.phaseHeader}>
                  <motion.div 
                    className={styles.phaseIcon}
                    style={{ background: `${phase.color}20`, color: phase.color, borderColor: phase.color }}
                    whileHover={{ scale: 1.1 }}
                  >
                    <span className="material-icons">{phase.icon}</span>
                  </motion.div>
                  <div className={styles.phaseInfo}>
                    <span className={styles.phaseLabel} style={{ background: phase.color }}>{phase.label}</span>
                    <h3>{phase.phase}</h3>
                  </div>
                </div>
                <ul className={styles.phaseFeatures}>
                  {phase.features.map((feature, i) => (
                    <motion.li 
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 + i * 0.05 }}
                    >
                      <span className="material-icons" style={{ color: phase.color }}>
                        {phase.status === 'current' ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                      {feature}
                    </motion.li>
                  ))}
                </ul>
                {index < ROADMAP.length - 1 && <div className={styles.phaseConnector} />}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.ctaSection}>
        <div className={styles.sectionContainer}>
          <motion.div 
            className={styles.ctaBox}
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className={styles.ctaBadge}>Limited Beta Access</span>
            <h2>Ready to Validate Your Trading Edge?</h2>
            <p>Join traders using quantitative methods to test their strategies. Free during beta.</p>
            <motion.button 
              className={styles.primaryButton} 
              onClick={() => router.push('/login')}
              whileHover={{ scale: 1.05, boxShadow: "0 0 60px rgba(68, 136, 255, 0.4)" }}
              whileTap={{ scale: 0.95 }}
            >
              Get Started Now
              <span className="material-icons">rocket_launch</span>
            </motion.button>
            <div className={styles.ctaFeatures}>
              <span><span className="material-icons">check</span> Price Action Backtest</span>
              <span><span className="material-icons">check</span> Monte Carlo Simulation</span>
              <span><span className="material-icons">check</span> Statistical Validation</span>
            </div>
            <div className={styles.ctaGlow} />
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <motion.footer 
        className={styles.footer}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className={styles.footerContent}>
          <div className={styles.footerLogo}>
            <img src="/logo.png" alt="Alphalabs" className={styles.footerLogoImage} />
            <span>Alphalabs</span>
            <span className={styles.footerBeta}>BETA</span>
          </div>
          <p>© 2025 Alphalabs. Quantitative tools for crypto traders.</p>
        </div>
      </motion.footer>
    </div>
  )
}
