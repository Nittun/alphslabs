'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import styles from './page.module.css'

export default function LandingPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [activeFeature, setActiveFeature] = useState(0)
  const [animatedStats, setAnimatedStats] = useState({ trades: 0, return: 0, winRate: 0 })
  const statsRef = useRef(null)
  const [statsAnimated, setStatsAnimated] = useState(false)
  
  // If already logged in, redirect to backtest
  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/backtest')
    }
  }, [status, router])

  // Animate stats on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !statsAnimated) {
          setStatsAnimated(true)
          animateValue('trades', 0, 153, 1500)
          animateValue('return', 0, 22.77, 1500)
          animateValue('winRate', 0, 31.4, 1500)
        }
      },
      { threshold: 0.5 }
    )
    
    if (statsRef.current) {
      observer.observe(statsRef.current)
    }
    
    return () => observer.disconnect()
  }, [statsAnimated])

  const animateValue = (key, start, end, duration) => {
    const startTime = Date.now()
    const animate = () => {
      const now = Date.now()
      const progress = Math.min((now - startTime) / duration, 1)
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const value = start + (end - start) * easeOut
      setAnimatedStats(prev => ({ ...prev, [key]: value }))
      if (progress < 1) requestAnimationFrame(animate)
    }
    animate()
  }

  // Auto-rotate features
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature(prev => (prev + 1) % features.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  if (status === 'loading') {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner}></div>
      </div>
    )
  }

  const features = [
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

  const mainProducts = [
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

  return (
    <div className={styles.landing}>
      {/* Navigation */}
      <nav className={styles.navbar}>
        <div className={styles.navContent}>
          <div className={styles.logo}>
            <img src="/logo.png" alt="Alphalabs" className={styles.logoImage} />
            <span className={styles.logoText}>Alphalabs</span>
          </div>
          <div className={styles.navRight}>
            <span className={styles.betaTag}>BETA</span>
            <button className={styles.loginButton} onClick={() => router.push('/login')}>
              <span className="material-icons">login</span>
              Launch App
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <span className="material-icons">science</span>
            Open Beta — Free Access
          </div>
          <h1 className={styles.heroTitle}>
            Quantitative <span className={styles.gradient}>Trading Lab</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Professional backtesting and optimization for crypto traders.
            Validate strategies with Monte Carlo simulations, stress tests, and statistical analysis.
          </p>
          <div className={styles.heroCTA}>
            <button className={styles.primaryButton} onClick={() => router.push('/login')}>
              Get Started Free
              <span className="material-icons">arrow_forward</span>
            </button>
            <span className={styles.ctaNote}>
              <span className="material-icons">check_circle</span>
              No credit card required
            </span>
          </div>
        </div>
        
        {/* Hero Screenshot */}
        <div className={styles.heroScreenshot}>
          <div className={styles.screenshotFrame}>
            <div className={styles.screenshotHeader}>
              <div className={styles.windowDots}>
                <span></span><span></span><span></span>
              </div>
              <span>Alphalabs Dashboard</span>
            </div>
            <img src="/portfolio.png" alt="Dashboard Preview" className={styles.screenshotImage} />
          </div>
        </div>
      </section>

      {/* Live Stats Section */}
      <section className={styles.statsSection} ref={statsRef}>
        <div className={styles.sectionContainer}>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className={styles.statNumber}>{Math.round(animatedStats.trades)}</span>
              <span className={styles.statLabel}>Total Trades</span>
              <span className={styles.statDesc}>Executed in sample backtest</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statNumber} style={{ color: '#22c55e' }}>
                +{animatedStats.return.toFixed(2)}%
              </span>
              <span className={styles.statLabel}>Total Return</span>
              <span className={styles.statDesc}>Portfolio performance</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statNumber}>{animatedStats.winRate.toFixed(1)}%</span>
              <span className={styles.statLabel}>Win Rate</span>
              <span className={styles.statDesc}>Strategy accuracy</span>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Feature Showcase */}
      <section className={styles.showcase}>
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>PLATFORM FEATURES</span>
            <h2>Everything You Need to <span className={styles.gradient}>Validate</span> Your Edge</h2>
          </div>
          
          <div className={styles.showcaseContent}>
            {/* Feature Tabs */}
            <div className={styles.featureTabs}>
              {features.map((feature, index) => (
                <button
                  key={feature.id}
                  className={`${styles.featureTab} ${activeFeature === index ? styles.active : ''}`}
                  onClick={() => setActiveFeature(index)}
                >
                  <span className="material-icons">{feature.icon}</span>
                  <span className={styles.tabTitle}>{feature.title}</span>
                  {activeFeature === index && <div className={styles.tabProgress}></div>}
                </button>
              ))}
            </div>

            {/* Feature Display */}
            <div className={styles.featureDisplay}>
              <div className={styles.featureInfo}>
                <h3>{features[activeFeature].title}</h3>
                <p>{features[activeFeature].description}</p>
                <ul className={styles.featureStats}>
                  {features[activeFeature].stats.map((stat, i) => (
                    <li key={i}>
                      <span className="material-icons">check_circle</span>
                      {stat}
                    </li>
                  ))}
                </ul>
                <button className={styles.tryButton} onClick={() => router.push('/login')}>
                  Try it Now
                  <span className="material-icons">arrow_forward</span>
                </button>
              </div>
              <div className={styles.featureImage}>
                <div className={styles.imageFrame}>
                  <img 
                    src={features[activeFeature].image} 
                    alt={features[activeFeature].title}
                    key={features[activeFeature].id}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Two Products Section */}
      <section className={styles.products}>
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>TWO APPROACHES</span>
            <h2>Choose Your Testing Style</h2>
          </div>

          <div className={styles.productsGrid}>
            {mainProducts.map((product) => (
              <div key={product.id} className={styles.productCard}>
                <div className={styles.productIcon} style={{ background: `${product.color}20`, color: product.color }}>
                  <span className="material-icons">{product.icon}</span>
                </div>
                <h3>{product.title}</h3>
                <span className={styles.productSubtitle}>{product.subtitle}</span>
                <p>{product.description}</p>
                <button 
                  className={styles.productCTA}
                  onClick={() => router.push('/login')}
                  style={{ background: product.color }}
                >
                  Try {product.id === 'price-action' ? 'Backtest' : 'Optimize'}
                  <span className="material-icons">arrow_forward</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshot Gallery */}
      <section className={styles.gallery}>
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>GALLERY</span>
            <h2>See It In Action</h2>
          </div>
          <div className={styles.galleryGrid}>
            <div className={styles.galleryItem} onClick={() => setActiveFeature(0)}>
              <img src="/backtest.png" alt="Backtesting" />
              <div className={styles.galleryOverlay}>
                <span className="material-icons">candlestick_chart</span>
                <span>Backtesting</span>
              </div>
            </div>
            <div className={styles.galleryItem} onClick={() => setActiveFeature(2)}>
              <img src="/strategyrobust.png" alt="Optimization" />
              <div className={styles.galleryOverlay}>
                <span className="material-icons">tune</span>
                <span>Optimization</span>
              </div>
            </div>
            <div className={styles.galleryItem} onClick={() => setActiveFeature(3)}>
              <img src="/montecarlo.png" alt="Monte Carlo" />
              <div className={styles.galleryOverlay}>
                <span className="material-icons">analytics</span>
                <span>Monte Carlo</span>
              </div>
            </div>
            <div className={styles.galleryItem} onClick={() => setActiveFeature(4)}>
              <img src="/stresstest.png" alt="Stress Test" />
              <div className={styles.galleryOverlay}>
                <span className="material-icons">speed</span>
                <span>Stress Test</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.ctaSection}>
        <div className={styles.sectionContainer}>
          <div className={styles.ctaBox}>
            <span className={styles.ctaBadge}>Limited Beta Access</span>
            <h2>Ready to Validate Your Trading Edge?</h2>
            <p>Join traders using quantitative methods to test their strategies. Free during beta.</p>
            <button className={styles.primaryButton} onClick={() => router.push('/login')}>
              Get Started Now
              <span className="material-icons">rocket_launch</span>
            </button>
            <div className={styles.ctaFeatures}>
              <span><span className="material-icons">check</span> Price Action Backtest</span>
              <span><span className="material-icons">check</span> Monte Carlo Simulation</span>
              <span><span className="material-icons">check</span> Statistical Validation</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerLogo}>
            <img src="/logo.png" alt="Alphalabs" className={styles.footerLogoImage} />
            <span>Alphalabs</span>
            <span className={styles.footerBeta}>BETA</span>
          </div>
          <p>© 2025 Alphalabs. Quantitative tools for crypto traders.</p>
        </div>
      </footer>
    </div>
  )
}
