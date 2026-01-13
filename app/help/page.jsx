'use client'

import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import Swal from 'sweetalert2'
import styles from './page.module.css'

// Crypto wallet addresses - Replace with your actual addresses
const CRYPTO_WALLETS = {
  BTC: {
    name: 'Bitcoin',
    symbol: 'BTC',
    address: 'bc1qpr8qg9fqjrnueq97c0rw3azfz5uela3l34v634', // Add your BTC address here
    icon: '₿',
    color: '#f7931a'
  },
  ETH: {
    name: 'Ethereum',
    symbol: 'ETH',
    address: '0xEC58523db5269CFC88226327716e93F904078aa0', // Add your ETH address here
    icon: 'Ξ',
    color: '#627eea'
  },
  SOL: {
    name: 'Solana',
    symbol: 'SOL',
    address: 'HFho2znGPnkHprpqudLxxHv13HFKzxdmWqAudZPY6iwi', // Add your SOL address here
    icon: '◎',
    color: '#9945ff'
  },
  USDT: {
    name: 'USDT (ERC-20)',
    symbol: 'USDT',
    address: '0xEC58523db5269CFC88226327716e93F904078aa0', // Add your USDT address here
    icon: '₮',
    color: '#26a17b'
  }
}

export default function HelpPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: 'general',
    message: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeCrypto, setActiveCrypto] = useState('BTC')

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.name || !formData.email || !formData.message) {
      Swal.fire({
        title: 'Missing Fields',
        text: 'Please fill in all required fields',
        icon: 'warning',
        background: '#1a1a2e',
        color: '#fff',
        confirmButtonColor: '#4488ff'
      })
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/send-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (data.success) {
        Swal.fire({
          title: 'Message Sent!',
          text: 'Thank you for your feedback. We\'ll get back to you soon!',
          icon: 'success',
          background: '#1a1a2e',
          color: '#fff',
          confirmButtonColor: '#00ff88'
        })
        setFormData({ name: '', email: '', subject: 'general', message: '' })
      } else {
        throw new Error(data.error || 'Failed to send message')
      }
    } catch (error) {
      console.error('Error sending feedback:', error)
      Swal.fire({
        title: 'Error',
        text: 'Failed to send message. Please try again later.',
        icon: 'error',
        background: '#1a1a2e',
        color: '#fff',
        confirmButtonColor: '#ff4444'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const copyAddress = (symbol, address) => {
    if (!address) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title: 'Address not configured yet',
        showConfirmButton: false,
        timer: 2000,
        background: '#1a1a2e',
        color: '#fff'
      })
      return
    }
    navigator.clipboard.writeText(address)
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `${symbol} address copied!`,
      showConfirmButton: false,
      timer: 1500,
      background: '#1a1a2e',
      color: '#fff'
    })
  }

  return (
    <div className={styles.dashboard}>
      <Sidebar onCollapseChange={setSidebarCollapsed} />
      <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <TopBar sidebarCollapsed={sidebarCollapsed} />
        <div className={styles.content}>
          {/* Hero Section */}
          <div className={styles.heroSection}>
            <div className={styles.heroIcon}>
              <span className="material-icons">support_agent</span>
            </div>
            <h1>How Can We Help?</h1>
            <p className={styles.heroSubtitle}>
              Have questions, found a bug, or want to suggest a feature? We're here to help!
            </p>
          </div>

          <div className={styles.gridLayout}>
            {/* Contact Form */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIcon}>
                  <span className="material-icons">mail</span>
                </div>
                <div>
                  <h2>Send Us a Message</h2>
                  <p className={styles.cardSubtitle}>We typically respond within 24 hours</p>
                </div>
              </div>
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label htmlFor="name">Your Name *</label>
                    <div className={styles.inputWrapper}>
                      <span className="material-icons">person</span>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        placeholder="John Doe"
                        className={styles.input}
                      />
                    </div>
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="email">Email Address *</label>
                    <div className={styles.inputWrapper}>
                      <span className="material-icons">email</span>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="john@example.com"
                        className={styles.input}
                      />
                    </div>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="subject">Topic</label>
                  <div className={styles.subjectButtons}>
                    {[
                      { value: 'general', label: 'General', icon: 'help' },
                      { value: 'bug', label: 'Bug Report', icon: 'bug_report' },
                      { value: 'feature', label: 'Feature Request', icon: 'lightbulb' },
                      { value: 'feedback', label: 'Feedback', icon: 'rate_review' },
                      { value: 'other', label: 'Other', icon: 'more_horiz' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`${styles.subjectButton} ${formData.subject === opt.value ? styles.active : ''}`}
                        onClick={() => setFormData(prev => ({ ...prev, subject: opt.value }))}
                      >
                        <span className="material-icons">{opt.icon}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="message">Message *</label>
                  <textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    placeholder="Tell us what's on your mind..."
                    rows={5}
                    className={styles.textarea}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={styles.submitButton}
                >
                  {isSubmitting ? (
                    <>
                      <span className="material-icons" style={{ animation: 'spin 1s linear infinite' }}>hourglass_empty</span>
                      Sending...
                    </>
                  ) : (
                    <>
                      <span className="material-icons">send</span>
                      Send Message
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Support Section */}
            <div className={styles.rightColumn}>
              {/* Crypto Donations */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardIcon} style={{ background: 'linear-gradient(135deg, #f7931a 0%, #9945ff 100%)' }}>
                    <span className="material-icons">favorite</span>
                  </div>
                  <div>
                    <h2>Support Our Work</h2>
                    <p className={styles.cardSubtitle}>Help us keep Alphalabs running</p>
                  </div>
                </div>
                
                <p className={styles.donationText}>
                  If you find Alphalabs useful, consider supporting our development. 
                  Every contribution helps us add new features and keep the platform free!
                </p>

                <div className={styles.cryptoSection}>
                  <div className={styles.cryptoTabs}>
                    {Object.entries(CRYPTO_WALLETS).map(([key, wallet]) => (
                      <button
                        key={key}
                        className={`${styles.cryptoTab} ${activeCrypto === key ? styles.active : ''}`}
                        onClick={() => setActiveCrypto(key)}
                        style={{ '--crypto-color': wallet.color }}
                      >
                        <span className={styles.cryptoIcon}>{wallet.icon}</span>
                        <span>{wallet.symbol}</span>
                      </button>
                    ))}
                  </div>

                  <div className={styles.cryptoContent}>
                    <div 
                      className={styles.cryptoCard}
                      style={{ '--crypto-color': CRYPTO_WALLETS[activeCrypto].color }}
                    >
                      <div className={styles.cryptoHeader}>
                        <span className={styles.cryptoBigIcon}>{CRYPTO_WALLETS[activeCrypto].icon}</span>
                        <div>
                          <h3>{CRYPTO_WALLETS[activeCrypto].name}</h3>
                          <span className={styles.networkBadge}>{CRYPTO_WALLETS[activeCrypto].symbol}</span>
                        </div>
                      </div>
                      
                      <div className={styles.addressBox}>
                        {CRYPTO_WALLETS[activeCrypto].address ? (
                          <>
                            <code className={styles.addressText}>
                              {CRYPTO_WALLETS[activeCrypto].address}
                            </code>
                            <button
                              className={styles.copyButton}
                              onClick={() => copyAddress(
                                CRYPTO_WALLETS[activeCrypto].symbol,
                                CRYPTO_WALLETS[activeCrypto].address
                              )}
                            >
                              <span className="material-icons">content_copy</span>
                              Copy
                            </button>
                          </>
                        ) : (
                          <div className={styles.noAddress}>
                            <span className="material-icons">hourglass_empty</span>
                            <span>Address coming soon</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.thankYou}>
                  <span className="material-icons">volunteer_activism</span>
                  <span>Thank you for your support!</span>
                </div>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className={styles.faqSection}>
            <div className={styles.faqHeader}>
              <span className="material-icons">quiz</span>
              <h2>Frequently Asked Questions</h2>
            </div>
            <div className={styles.faqGrid}>
              <div className={styles.faqItem}>
                <div className={styles.faqIcon}>
                  <span className="material-icons">play_arrow</span>
                </div>
                <div>
                  <h3>How do I run a backtest?</h3>
                  <p>Go to the Backtest page, configure your settings (asset, interval, EMA settings, strategy), and click "Run Backtest".</p>
                </div>
              </div>
              <div className={styles.faqItem}>
                <div className={styles.faqIcon}>
                  <span className="material-icons">tune</span>
                </div>
                <div>
                  <h3>What are the strategy modes?</h3>
                  <p>We offer 4 modes: Reversal (always in market), Wait for Next (flat periods), Long Only, and Short Only.</p>
                </div>
              </div>
              <div className={styles.faqItem}>
                <div className={styles.faqIcon}>
                  <span className="material-icons">security</span>
                </div>
                <div>
                  <h3>How are stop losses calculated?</h3>
                  <p>Stop losses are based on support/resistance levels calculated from recent price action.</p>
                </div>
              </div>
              <div className={styles.faqItem}>
                <div className={styles.faqIcon}>
                  <span className="material-icons">speed</span>
                </div>
                <div>
                  <h3>Can I use real-time trading?</h3>
                  <p>Currently, we only support backtesting. Real-time trading features are planned for future releases.</p>
                </div>
              </div>
              <div className={styles.faqItem}>
                <div className={styles.faqIcon}>
                  <span className="material-icons">save</span>
                </div>
                <div>
                  <h3>How do I save my configurations?</h3>
                  <p>Your configurations are automatically saved when you run a backtest. You can also save presets in the Optimize page.</p>
                </div>
              </div>
              <div className={styles.faqItem}>
                <div className={styles.faqIcon}>
                  <span className="material-icons">download</span>
                </div>
                <div>
                  <h3>Can I export my results?</h3>
                  <p>Yes! You can export trade logs as CSV files from both the Backtest and Optimize pages.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
