'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import styles from './page.module.css'

// Define data outside component to avoid hoisting issues
const FEATURES = [
  {
    id: 'backtest',
    title: 'Visual Backtesting',
    description: 'Test strategies on interactive candlestick charts with EMA crossover signals and trade annotations.',
    image: '/backtest.png',
    icon: 'candlestick_chart',
    stats: ['Long & Short positions', 'EMA 12/26 crossover', 'Trade annotations']
  },
  {
    id: 'portfolio',
    title: 'Portfolio Tracking',
    description: 'Monitor your strategy performance with real-time portfolio value, returns, and active positions.',
    image: '/portfolio.png',
    icon: 'account_balance_wallet',
    stats: ['Live P&L tracking', 'Win rate analysis', 'Current holdings']
  },
  {
    id: 'optimize',
    title: 'Parameter Optimization',
    description: 'Find optimal indicator settings with in-sample analysis, heatmaps, and Sharpe ratio rankings.',
    image: '/strategyrobust.png',
    icon: 'tune',
    stats: ['672 combinations tested', 'Heatmap visualization', 'Best Sharpe: 1.429']
  },
  {
    id: 'montecarlo',
    title: 'Monte Carlo Simulation',
    description: 'Run 1,000+ simulations to project future performance and understand risk with confidence bands.',
    image: '/montecarlo.png',
    icon: 'analytics',
    stats: ['1,000 simulation paths', 'Percentile analysis', 'Risk quantification']
  },
  {
    id: 'stresstest',
    title: 'Stress Testing',
    description: 'Validate your strategy with historical stress tests, entry/exit delays, and detailed trade logs.',
    image: '/stresstest.png',
    icon: 'speed',
    stats: ['31 trades executed', '1690% total return', 'Profit factor: 2.45']
  },
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
  
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["12deg", "-12deg"])
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-12deg", "12deg"])

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
      <div style={{ transform: "translateZ(75px)", transformStyle: "preserve-3d" }}>
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
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className={styles.particle}
          initial={{
            x: Math.random() * 100 + '%',
            y: Math.random() * 100 + '%',
            scale: Math.random() * 0.5 + 0.5,
            opacity: Math.random() * 0.5 + 0.2
          }}
          animate={{
            y: [null, Math.random() * -200 - 100],
            opacity: [null, 0]
          }}
          transition={{
            duration: Math.random() * 10 + 10,
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
            <h2>Choose Your Testing Style</h2>
          </motion.div>

          <div className={styles.productsGrid}>
            {MAIN_PRODUCTS.map((product, index) => (
              <motion.div 
                key={product.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.15 }}
              >
                <TiltCard className={styles.productCardWrapper}>
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
                      onClick={() => router.push('/login')}
                      style={{ background: product.color }}
                      whileHover={{ scale: 1.05, boxShadow: `0 10px 40px ${product.color}50` }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Try {product.id === 'price-action' ? 'Backtest' : 'Optimize'}
                      <span className="material-icons">arrow_forward</span>
                    </motion.button>
                    <div className={styles.productGlow} style={{ background: product.color }} />
                  </div>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshot Gallery */}
      <section className={styles.gallery}>
        <div className={styles.sectionContainer}>
          <motion.div 
            className={styles.sectionHeader}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className={styles.sectionTag}>GALLERY</span>
            <h2>See It In Action</h2>
          </motion.div>
          <div className={styles.galleryGrid}>
            {[
              { src: '/backtest.png', label: 'Backtesting', icon: 'candlestick_chart', idx: 0 },
              { src: '/strategyrobust.png', label: 'Optimization', icon: 'tune', idx: 2 },
              { src: '/montecarlo.png', label: 'Monte Carlo', icon: 'analytics', idx: 3 },
              { src: '/stresstest.png', label: 'Stress Test', icon: 'speed', idx: 4 },
            ].map((item, index) => (
              <motion.div 
                key={item.label}
                className={styles.galleryItem} 
                onClick={() => setActiveFeature(item.idx)}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ scale: 1.03, y: -5 }}
              >
                <img src={item.src} alt={item.label} />
                <div className={styles.galleryOverlay}>
                  <span className="material-icons">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
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
