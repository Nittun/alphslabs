'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import styles from './page.module.css'

export default function LandingPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  
  // If already logged in, redirect to backtest
  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/backtest')
    }
  }, [status, router])

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY })
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  if (status === 'loading') {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner}></div>
      </div>
    )
  }

  const mainProducts = [
    {
      id: 'price-action',
      icon: 'candlestick_chart',
      title: 'Price Action Backtest',
      subtitle: 'Visual Strategy Testing',
      description: 'Test your trading ideas directly on price charts. Perfect for discretionary traders who want to validate their chart-reading skills.',
      features: [
        { icon: 'touch_app', label: 'Manual Mode', desc: 'Click candles to enter/exit positions manually' },
        { icon: 'smart_toy', label: 'Auto Mode', desc: 'Let indicators trigger positions automatically' },
        { icon: 'show_chart', label: 'Multiple Indicators', desc: 'EMA, RSI, CCI, Z-Score with customizable params' },
        { icon: 'history', label: 'Trade Log', desc: 'Complete history with P&L, stop loss, take profit' },
      ],
      color: '#4488ff',
      gradient: 'linear-gradient(135deg, #4488ff 0%, #2266dd 100%)'
    },
    {
      id: 'algorithmic',
      icon: 'psychology',
      title: 'Algorithmic Optimization',
      subtitle: 'Quantitative Analysis Suite',
      description: 'Professional-grade tools for systematic traders. Optimize parameters, stress test, and statistically validate your edge.',
      features: [
        { icon: 'tune', label: 'Parameter Optimization', desc: 'In-sample & out-of-sample testing' },
        { icon: 'shuffle', label: 'Bootstrap Resampling', desc: 'Shuffle volatility regimes for robustness' },
        { icon: 'analytics', label: 'Monte Carlo Simulation', desc: 'Project equity curves with confidence bands' },
        { icon: 'science', label: 'Hypothesis Testing', desc: 'Statistical significance validation' },
      ],
      color: '#00ff88',
      gradient: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)'
    }
  ]

  const additionalFeatures = [
    { icon: 'speed', title: 'Stress Testing', description: 'Test with entry/exit delays to simulate real conditions' },
    { icon: 'save', title: 'Save Strategies', description: 'Store and load your configurations anytime' },
    { icon: 'download', title: 'Export Data', description: 'Download trade logs as CSV for further analysis' },
    { icon: 'security', title: 'Secure & Private', description: 'Your strategies stay private and encrypted' },
  ]

  return (
    <div className={styles.landing}>
      {/* Cursor glow effect */}
      <div 
        className={styles.cursorGlow}
        style={{ left: mousePos.x, top: mousePos.y }}
      />

      {/* Navigation */}
      <nav className={styles.navbar}>
        <div className={styles.navContent}>
          <div className={styles.logo}>
            <img 
              src="/logo.png" 
              alt="Alphalabs" 
              className={styles.logoImage}
            />
          </div>
          <div className={styles.navRight}>
            <span className={styles.betaTag}>
              <span className={styles.betaPulse}></span>
              BETA
            </span>
            <button 
              className={styles.loginButton}
              onClick={() => router.push('/login')}
            >
              <span className="material-icons">login</span>
              Launch App
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroBackground}>
          <div className={styles.gridPattern}></div>
          <div className={styles.scanLine}></div>
          <div className={styles.glowOrb1}></div>
          <div className={styles.glowOrb2}></div>
          <div className={styles.glowOrb3}></div>
          <div className={styles.particlesContainer}>
            {[...Array(20)].map((_, i) => (
              <div key={i} className={styles.particle} style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${3 + Math.random() * 4}s`
              }}></div>
            ))}
          </div>
        </div>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <div className={styles.badgePulse}></div>
            <span className="material-icons">science</span>
            Open Beta — Free Access
          </div>
          <h1 className={styles.heroTitle}>
            <span className={styles.titleLine}>Quantitative</span>
            <span className={styles.gradient}>Trading Lab</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Two powerful approaches to backtest your crypto strategies.
            From manual chart analysis to algorithmic optimization — 
            validate your edge with professional-grade tools.
          </p>
          <div className={styles.heroCTA}>
            <button 
              className={styles.primaryButton}
              onClick={() => router.push('/login')}
            >
              <span className={styles.btnGlow}></span>
              Start Testing Free
              <span className="material-icons">arrow_forward</span>
            </button>
            <div className={styles.ctaNote}>
              <span className="material-icons">check_circle</span>
              No credit card required
            </div>
          </div>
        </div>
      </section>

      {/* Two Main Products Section */}
      <section className={styles.products}>
        <div className={styles.productsContent}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>TWO POWERFUL APPROACHES</span>
            <h2>Choose Your <span className={styles.gradient}>Testing Style</span></h2>
            <p>Whether you trade on intuition or algorithms, we've got you covered</p>
          </div>

          <div className={styles.productsGrid}>
            {mainProducts.map((product) => (
              <div key={product.id} className={styles.productCard}>
                <div className={styles.productHeader}>
                  <div 
                    className={styles.productIcon}
                    style={{ background: `${product.color}15`, borderColor: `${product.color}30` }}
                  >
                    <span className="material-icons" style={{ color: product.color }}>{product.icon}</span>
                  </div>
                  <div className={styles.productBadge} style={{ color: product.color }}>
                    {product.id === 'price-action' ? 'Backtest Page' : 'Optimize Page'}
                  </div>
                </div>
                <h3 className={styles.productTitle}>{product.title}</h3>
                <span className={styles.productSubtitle}>{product.subtitle}</span>
                <p className={styles.productDescription}>{product.description}</p>
                
                <div className={styles.productFeatures}>
                  {product.features.map((feature, idx) => (
                    <div key={idx} className={styles.productFeature}>
                      <div 
                        className={styles.featureIconSmall}
                        style={{ background: `${product.color}10`, color: product.color }}
                      >
                        <span className="material-icons">{feature.icon}</span>
                      </div>
                      <div className={styles.featureText}>
                        <span className={styles.featureLabel}>{feature.label}</span>
                        <span className={styles.featureDesc}>{feature.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div 
                  className={styles.productCTA}
                  style={{ background: product.gradient }}
                  onClick={() => router.push('/login')}
                >
                  Try {product.id === 'price-action' ? 'Backtest' : 'Optimize'}
                  <span className="material-icons">arrow_forward</span>
                </div>
                <div className={styles.productGlow} style={{ background: product.color }}></div>
              </div>
            ))}
          </div>

          {/* Comparison */}
          <div className={styles.comparisonBox}>
            <div className={styles.comparisonItem}>
              <span className="material-icons" style={{ color: '#4488ff' }}>candlestick_chart</span>
              <div>
                <strong>Price Action</strong>
                <span>Best for discretionary traders</span>
              </div>
            </div>
            <div className={styles.comparisonDivider}>
              <span>+</span>
            </div>
            <div className={styles.comparisonItem}>
              <span className="material-icons" style={{ color: '#00ff88' }}>psychology</span>
              <div>
                <strong>Algorithmic</strong>
                <span>Best for systematic traders</span>
              </div>
            </div>
            <div className={styles.comparisonEquals}>
              <span>=</span>
            </div>
            <div className={styles.comparisonResult}>
              <span className="material-icons">verified</span>
              <span>Complete validation toolkit</span>
            </div>
          </div>
        </div>
      </section>

      {/* Additional Features */}
      <section className={styles.features}>
        <div className={styles.featuresContent}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>PLUS MORE</span>
            <h2>Everything Else You <span className={styles.gradient}>Need</span></h2>
          </div>
          <div className={styles.featuresGrid}>
            {additionalFeatures.map((feature, index) => (
              <div key={index} className={styles.featureCard}>
                <div className={styles.featureIcon}>
                  <span className="material-icons">{feature.icon}</span>
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <div className={styles.featureHoverLine}></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className={styles.howItWorks}>
        <div className={styles.howItWorksContent}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>WORKFLOW</span>
            <h2>From Idea to <span className={styles.gradient}>Validated Strategy</span></h2>
          </div>
          <div className={styles.stepsContainer}>
            <div className={styles.stepsLine}></div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>01</div>
              <div className={styles.stepContent}>
                <h3>Choose Your Approach</h3>
                <p>Price Action for manual testing, or Algorithmic for systematic optimization.</p>
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>02</div>
              <div className={styles.stepContent}>
                <h3>Configure & Execute</h3>
                <p>Set your indicators, parameters, and run backtests on historical data.</p>
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>03</div>
              <div className={styles.stepContent}>
                <h3>Analyze Results</h3>
                <p>Review trade logs, P&L, win rates, Sharpe ratio, and drawdowns.</p>
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>04</div>
              <div className={styles.stepContent}>
                <h3>Validate Statistically</h3>
                <p>Run Monte Carlo, stress tests, and hypothesis testing to confirm your edge.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaBackground}>
          <div className={styles.ctaGrid}></div>
        </div>
        <div className={styles.ctaContent}>
          <div className={styles.ctaBadge}>
            <span className={styles.ctaPulse}></span>
            Limited Beta Access
          </div>
          <h2>Ready to Validate Your <span className={styles.gradient}>Trading Edge</span>?</h2>
          <p>Join traders using quantitative methods to test their strategies. Free during beta.</p>
          <button 
            className={styles.primaryButton}
            onClick={() => router.push('/login')}
          >
            <span className={styles.btnGlow}></span>
            Get Started Now
            <span className="material-icons">rocket_launch</span>
          </button>
          <div className={styles.ctaFeatures}>
            <span><span className="material-icons">check</span> Price Action Backtest</span>
            <span><span className="material-icons">check</span> Algorithmic Optimization</span>
            <span><span className="material-icons">check</span> Monte Carlo & Stats</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerLogo}>
            <img 
              src="/logo.png" 
              alt="Alphalabs" 
              className={styles.footerLogoImage}
            />
            <span>Alphalabs</span>
            <span className={styles.footerBeta}>BETA</span>
          </div>
          <p className={styles.footerText}>
            © 2025 Alphalabs. Quantitative tools for crypto traders.
          </p>
        </div>
      </footer>
    </div>
  )
}
