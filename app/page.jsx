'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import styles from './page.module.css'

export default function LandingPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  
  // If already logged in, redirect to backtest
  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/backtest')
    }
  }, [status, router])

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
        { icon: 'touch_app', label: 'Manual Mode', desc: 'Click candles to enter/exit positions' },
        { icon: 'smart_toy', label: 'Auto Mode', desc: 'Let indicators trigger positions automatically' },
        { icon: 'show_chart', label: 'Multiple Indicators', desc: 'EMA, RSI, CCI, Z-Score' },
        { icon: 'history', label: 'Trade Log', desc: 'Complete history with P&L tracking' },
      ],
      color: '#4488ff'
    },
    {
      id: 'algorithmic',
      icon: 'psychology',
      title: 'Algorithmic Optimization',
      subtitle: 'Quantitative Analysis',
      description: 'Professional-grade tools for systematic traders. Optimize parameters, stress test, and statistically validate your edge.',
      features: [
        { icon: 'tune', label: 'Parameter Optimization', desc: 'In-sample & out-of-sample testing' },
        { icon: 'shuffle', label: 'Bootstrap Resampling', desc: 'Shuffle volatility regimes' },
        { icon: 'analytics', label: 'Monte Carlo', desc: 'Project equity curves' },
        { icon: 'science', label: 'Hypothesis Testing', desc: 'Statistical validation' },
      ],
      color: '#9d4edd'
    }
  ]

  const additionalFeatures = [
    { icon: 'speed', title: 'Stress Testing', description: 'Test with entry/exit delays' },
    { icon: 'save', title: 'Save Strategies', description: 'Store configurations' },
    { icon: 'download', title: 'Export Data', description: 'Download as CSV' },
    { icon: 'security', title: 'Secure', description: 'Private & encrypted' },
  ]

  return (
    <div className={styles.landing}>
      {/* Navigation */}
      <nav className={styles.navbar}>
        <div className={styles.navContent}>
          <div className={styles.logo}>
            <img 
              src="/logo.png" 
              alt="Alphalabs" 
              className={styles.logoImage}
            />
            <span className={styles.logoText}>Alphalabs</span>
          </div>
          <div className={styles.navRight}>
            <span className={styles.betaTag}>BETA</span>
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
            Validate strategies with Monte Carlo simulations, stress tests, and statistical significance testing.
          </p>
          <div className={styles.heroCTA}>
            <button 
              className={styles.primaryButton}
              onClick={() => router.push('/login')}
            >
              Get Started Free
              <span className="material-icons">arrow_forward</span>
            </button>
            <span className={styles.ctaNote}>
              <span className="material-icons">check_circle</span>
              No credit card required
            </span>
          </div>
        </div>
      </section>

      {/* Two Main Products */}
      <section className={styles.products}>
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>TWO APPROACHES</span>
            <h2>Choose Your Testing Style</h2>
            <p>Whether you trade on intuition or algorithms, we've got you covered</p>
          </div>

          <div className={styles.productsGrid}>
            {mainProducts.map((product) => (
              <div key={product.id} className={styles.productCard}>
                <div className={styles.productHeader}>
                  <div className={styles.productIcon} style={{ background: `${product.color}20`, color: product.color }}>
                    <span className="material-icons">{product.icon}</span>
                  </div>
                  <span className={styles.productBadge}>
                    {product.id === 'price-action' ? 'Backtest' : 'Optimize'}
                  </span>
                </div>
                <h3>{product.title}</h3>
                <span className={styles.productSubtitle}>{product.subtitle}</span>
                <p>{product.description}</p>
                
                <div className={styles.productFeatures}>
                  {product.features.map((feature, idx) => (
                    <div key={idx} className={styles.productFeature}>
                      <span className="material-icons" style={{ color: product.color }}>{feature.icon}</span>
                      <div>
                        <strong>{feature.label}</strong>
                        <span>{feature.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>

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

      {/* Additional Features */}
      <section className={styles.features}>
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>PLUS MORE</span>
            <h2>Everything You Need</h2>
          </div>
          <div className={styles.featuresGrid}>
            {additionalFeatures.map((feature, index) => (
              <div key={index} className={styles.featureCard}>
                <span className="material-icons">{feature.icon}</span>
                <h4>{feature.title}</h4>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className={styles.howItWorks}>
        <div className={styles.sectionContainer}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTag}>WORKFLOW</span>
            <h2>From Idea to Validated Strategy</h2>
          </div>
          <div className={styles.steps}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <h4>Configure</h4>
              <p>Select indicator, timeframe, and parameters</p>
            </div>
            <div className={styles.stepArrow}>
              <span className="material-icons">arrow_forward</span>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h4>Execute</h4>
              <p>Run backtest on historical data</p>
            </div>
            <div className={styles.stepArrow}>
              <span className="material-icons">arrow_forward</span>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h4>Analyze</h4>
              <p>Review P&L, win rate, and metrics</p>
            </div>
            <div className={styles.stepArrow}>
              <span className="material-icons">arrow_forward</span>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>4</div>
              <h4>Validate</h4>
              <p>Run Monte Carlo and stress tests</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.ctaSection}>
        <div className={styles.sectionContainer}>
          <div className={styles.ctaBox}>
            <span className={styles.ctaBadge}>Limited Beta Access</span>
            <h2>Ready to Test Your Trading Edge?</h2>
            <p>Join traders using quantitative methods to validate their strategies. Free during beta.</p>
            <button 
              className={styles.primaryButton}
              onClick={() => router.push('/login')}
            >
              Get Started Now
              <span className="material-icons">rocket_launch</span>
            </button>
            <div className={styles.ctaFeatures}>
              <span><span className="material-icons">check</span> Price Action Backtest</span>
              <span><span className="material-icons">check</span> Algorithmic Optimization</span>
              <span><span className="material-icons">check</span> Monte Carlo & Stats</span>
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
