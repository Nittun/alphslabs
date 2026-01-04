'use client'

import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import Swal from 'sweetalert2'
import styles from './page.module.css'

export default function HelpPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: 'general',
    message: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  return (
    <div className={styles.dashboard}>
      <Sidebar onCollapseChange={setSidebarCollapsed} />
      <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <TopBar sidebarCollapsed={sidebarCollapsed} />
        <div className={styles.content}>
          <div className={styles.headerSection}>
            <h1>Help & Support</h1>
            <p className={styles.subtitle}>
              Have questions, feedback, or suggestions? We'd love to hear from you!
            </p>
          </div>

          <div className={styles.gridLayout}>
            {/* Feedback Form */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className="material-icons">mail</span>
                <h2>Send Us a Message</h2>
              </div>
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formGroup}>
                  <label htmlFor="name">
                    <span className="material-icons">person</span>
                    Your Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Enter your name"
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="email">
                    <span className="material-icons">email</span>
                    Your Email *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Enter your email"
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="subject">
                    <span className="material-icons">category</span>
                    Subject
                  </label>
                  <select
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleInputChange}
                    className={styles.select}
                  >
                    <option value="general">General Inquiry</option>
                    <option value="bug">Bug Report</option>
                    <option value="feature">Feature Request</option>
                    <option value="feedback">Feedback</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="message">
                    <span className="material-icons">message</span>
                    Message *
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    placeholder="Write your message here..."
                    rows={6}
                    className={styles.textarea}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={styles.submitButton}
                >
                  <span className="material-icons">
                    {isSubmitting ? 'hourglass_empty' : 'send'}
                  </span>
                  {isSubmitting ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            </div>

            {/* Donation Section */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className="material-icons">favorite</span>
                <h2>Support Our Work</h2>
              </div>
              <div className={styles.donationContent}>
                <p className={styles.donationText}>
                  If you find Alphalabs useful and would like to support its development, 
                  consider making a donation. Your contribution helps us keep the platform 
                  running and add new features!
                </p>

                {/* PromptPay QR Code */}
                <div className={styles.promptPaySection}>
                  <div className={styles.promptPayHeader}>
                    <span className={styles.promptPayTitle}>PromptPay</span>
                  </div>
                  <div className={styles.qrCodeContainer}>
                    <img 
                      src="/promptpay-qr.png" 
                      alt="Scan to donate via PromptPay" 
                      className={styles.qrCode}
                    />
                  </div>
                  <p className={styles.qrInstructions}>
                    Scan QR code with any Thai banking app to donate
                  </p>
                </div>

                <div className={styles.cryptoDonation}>
                  <h3>
                    <span className="material-icons">currency_bitcoin</span>
                    Crypto Donations
                  </h3>
                  <div className={styles.cryptoAddresses}>
                    <div className={styles.cryptoAddress}>
                      <span className={styles.cryptoLabel}>BTC:</span>
                      <code className={styles.address}>bc1qfy3k99sj096kswslesz9u4ur8adt2v0m9uf8k9cy8f25dnpq8ncq5y4jfr</code>
                      <button 
                        className={styles.copyButton}
                        onClick={() => {
                          navigator.clipboard.writeText('bc1qfy3k99sj096kswslesz9u4ur8adt2v0m9uf8k9cy8f25dnpq8ncq5y4jfr')
                          Swal.fire({
                            toast: true,
                            position: 'top-end',
                            icon: 'success',
                            title: 'Address copied!',
                            showConfirmButton: false,
                            timer: 1500,
                            background: '#1a1a2e',
                            color: '#fff'
                          })
                        }}
                      >
                        <span className="material-icons">content_copy</span>
                      </button>
                    </div>
                    <div className={styles.cryptoAddress}>
                      <span className={styles.cryptoLabel}>ETH:</span>
                      <code className={styles.address}>0x048bac6b511212c155911f46387705c94ab0447c</code>
                      <button 
                        className={styles.copyButton}
                        onClick={() => {
                          navigator.clipboard.writeText('0x048bac6b511212c155911f46387705c94ab0447c')
                          Swal.fire({
                            toast: true,
                            position: 'top-end',
                            icon: 'success',
                            title: 'Address copied!',
                            showConfirmButton: false,
                            timer: 1500,
                            background: '#1a1a2e',
                            color: '#fff'
                          })
                        }}
                      >
                        <span className="material-icons">content_copy</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className={styles.thankYou}>
                  <span className="material-icons">volunteer_activism</span>
                  <p>Thank you for your support!</p>
                </div>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className={styles.faqSection}>
            <h2>
              <span className="material-icons">help_outline</span>
              Frequently Asked Questions
            </h2>
            <div className={styles.faqGrid}>
              <div className={styles.faqItem}>
                <h3>How do I run a backtest?</h3>
                <p>Go to the Backtest page, configure your settings (asset, interval, EMA settings, strategy), and click "Run Backtest".</p>
              </div>
              <div className={styles.faqItem}>
                <h3>What are the strategy modes?</h3>
                <p>We offer 4 modes: Reversal (always in market), Wait for Next (flat periods), Long Only, and Short Only.</p>
              </div>
              <div className={styles.faqItem}>
                <h3>How are stop losses calculated?</h3>
                <p>Stop losses are based on support/resistance levels calculated from recent price action.</p>
              </div>
              <div className={styles.faqItem}>
                <h3>Can I use real-time trading?</h3>
                <p>Currently, we only support backtesting. Real-time trading features are planned for future releases.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

