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

  const features = [
    {
      icon: 'analytics',
      title: 'Advanced Backtesting',
      description: 'Test your trading strategies against historical data with EMA crossover signals and RSI indicators.'
    },
    {
      icon: 'trending_up',
      title: 'Real-Time Tracking',
      description: 'Monitor your positions in real-time with live price updates and P&L calculations.'
    },
    {
      icon: 'psychology',
      title: 'Smart Analysis',
      description: 'Get intelligent insights with technical analysis including divergence detection and trend analysis.'
    },
    {
      icon: 'speed',
      title: 'Lightning Fast',
      description: 'Blazing fast backtests with optimized algorithms for quick strategy validation.'
    },
    {
      icon: 'security',
      title: 'Secure & Private',
      description: 'Your data is encrypted and stored securely. We never share your trading strategies.'
    },
    {
      icon: 'devices',
      title: 'Cross-Platform',
      description: 'Access your backtests from any device - desktop, tablet, or mobile.'
    }
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
          </div>
          <button 
            className={styles.loginButton}
            onClick={() => router.push('/login')}
          >
            <span className="material-icons">login</span>
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroBackground}>
          <div className={styles.gridPattern}></div>
          <div className={styles.glowOrb1}></div>
          <div className={styles.glowOrb2}></div>
        </div>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <span className="material-icons">rocket_launch</span>
            Now in Beta
          </div>
          <h1 className={styles.heroTitle}>
            Backtest Your <span className={styles.gradient}>Trading Strategies</span> with Confidence
          </h1>
          <p className={styles.heroSubtitle}>
            Powerful backtesting platform for crypto traders. Test EMA crossovers, RSI signals, 
            and custom strategies on historical data. Make data-driven decisions.
          </p>
          <div className={styles.heroCTA}>
            <button 
              className={styles.primaryButton}
              onClick={() => router.push('/login')}
            >
              Get Started Free
              <span className="material-icons">arrow_forward</span>
            </button>
            <button className={styles.secondaryButton}>
              <span className="material-icons">play_circle</span>
              Watch Demo
            </button>
          </div>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>10K+</span>
              <span className={styles.statLabel}>Backtests Run</span>
            </div>
            <div className={styles.statDivider}></div>
            <div className={styles.stat}>
              <span className={styles.statValue}>50+</span>
              <span className={styles.statLabel}>Crypto Pairs</span>
            </div>
            <div className={styles.statDivider}></div>
            <div className={styles.stat}>
              <span className={styles.statValue}>99.9%</span>
              <span className={styles.statLabel}>Uptime</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className={styles.features}>
        <div className={styles.featuresContent}>
          <div className={styles.sectionHeader}>
            <h2>Everything You Need to Backtest</h2>
            <p>Professional-grade tools for serious traders</p>
          </div>
          <div className={styles.featuresGrid}>
            {features.map((feature, index) => (
              <div key={index} className={styles.featureCard}>
                <div className={styles.featureIcon}>
                  <span className="material-icons">{feature.icon}</span>
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaContent}>
          <h2>Ready to Test Your Strategy?</h2>
          <p>Join traders who trust Alphalabs for their backtesting needs.</p>
          <button 
            className={styles.primaryButton}
            onClick={() => router.push('/login')}
          >
            Start Backtesting Now
            <span className="material-icons">arrow_forward</span>
          </button>
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
          </div>
          <p className={styles.footerText}>
            © 2024 Alphalabs. Built for traders, by traders.
          </p>
        </div>
      </footer>
    </div>
  )
}
