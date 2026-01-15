'use client'

import { useMemo, useState } from 'react'
import Swal from 'sweetalert2'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import styles from './page.module.css'
import Link from 'next/link'

// Crypto wallet addresses (same as Help page)
const CRYPTO_WALLETS = {
  BTC: {
    name: 'Bitcoin',
    symbol: 'BTC',
    address: 'bc1qpr8qg9fqjrnueq97c0rw3azfz5uela3l34v634',
    icon: '₿',
    color: '#f7931a'
  },
  ETH: {
    name: 'Ethereum',
    symbol: 'ETH',
    address: '0xEC58523db5269CFC88226327716e93F904078aa0',
    icon: 'Ξ',
    color: '#627eea'
  },
  SOL: {
    name: 'Solana',
    symbol: 'SOL',
    address: 'HFho2znGPnkHprpqudLxxHv13HFKzxdmWqAudZPY6iwi',
    icon: '◎',
    color: '#9945ff'
  },
  USDT: {
    name: 'USDT (ERC-20)',
    symbol: 'USDT',
    address: '0xEC58523db5269CFC88226327716e93F904078aa0',
    icon: '₮',
    color: '#26a17b'
  }
}

function RatingRow({ label, value, onChange, helper }) {
  return (
    <div className={styles.ratingRow}>
      <div className={styles.ratingLeft}>
        <div className={styles.ratingLabel}>{label}</div>
        {helper && <div className={styles.ratingHelper}>{helper}</div>}
      </div>
      <div className={styles.ratingRight}>
        <div className={styles.scale}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`${styles.scaleBtn} ${value === n ? styles.scaleBtnActive : ''}`}
              onClick={() => onChange(n)}
              aria-pressed={value === n}
              title={`${n}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className={styles.scaleHint}>
          <span>1</span>
          <span>10</span>
        </div>
      </div>
    </div>
  )
}

export default function SurveyPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeCrypto, setActiveCrypto] = useState('BTC')

  const [usefulRating, setUsefulRating] = useState(8)
  const [uiRating, setUiRating] = useState(8)
  const [functionRating, setFunctionRating] = useState(8)
  const [featuresRating, setFeaturesRating] = useState(8)
  const [performanceRating, setPerformanceRating] = useState(8)
  const [overallRating, setOverallRating] = useState(8)

  const [requestedFeatures, setRequestedFeatures] = useState('')
  const [additionalComments, setAdditionalComments] = useState('')
  const [willingToPayAmount, setWillingToPayAmount] = useState('')
  const [willingToPayCurrency, setWillingToPayCurrency] = useState('USD')

  const canSubmit = useMemo(() => {
    return (
      usefulRating >= 1 &&
      uiRating >= 1 &&
      functionRating >= 1 &&
      featuresRating >= 1 &&
      performanceRating >= 1 &&
      overallRating >= 1
    )
  }, [usefulRating, uiRating, functionRating, featuresRating, performanceRating, overallRating])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usefulRating,
          uiRating,
          functionRating,
          featuresRating,
          performanceRating,
          overallRating,
          requestedFeatures,
          additionalComments,
          willingToPayAmount,
          willingToPayCurrency,
        }),
      })

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to submit survey')
      }

      Swal.fire({
        title: 'Thank you!',
        text: 'Your survey response has been submitted.',
        icon: 'success',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#00ff88'
      })

      // Reset to friendly defaults
      setRequestedFeatures('')
      setAdditionalComments('')
      setWillingToPayAmount('')
      setWillingToPayCurrency('USD')
    } catch (error) {
      console.error('Survey submit error:', error)
      Swal.fire({
        title: 'Error',
        text: 'Failed to submit the survey. Please try again later.',
        icon: 'error',
        background: '#1a1a1a',
        color: '#fff',
        confirmButtonColor: '#ff4444'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const copyCryptoAddress = async () => {
    const wallet = CRYPTO_WALLETS[activeCrypto]
    if (!wallet?.address) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title: 'Address not configured yet',
        showConfirmButton: false,
        timer: 2000,
        background: '#1a1a1a',
        color: '#fff'
      })
      return
    }

    try {
      await navigator.clipboard.writeText(wallet.address)
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `${wallet.symbol} address copied`,
        showConfirmButton: false,
        timer: 1500,
        background: '#1a1a1a',
        color: '#fff'
      })
    } catch (e) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'error',
        title: 'Copy failed',
        showConfirmButton: false,
        timer: 2000,
        background: '#1a1a1a',
        color: '#fff'
      })
    }
  }

  return (
    <div className={styles.dashboard}>
      <Sidebar onCollapseChange={setSidebarCollapsed} />
      <div className={`${styles.mainContent} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
        <TopBar sidebarCollapsed={sidebarCollapsed} />

        <div className={styles.content}>
          <div className={styles.hero}>
            <div className={styles.heroIcon}>
              <span className="material-icons">assignment</span>
            </div>
            <h1>Product Survey</h1>
            <p className={styles.subtitle}>
              Help us improve Alphalabs. This takes ~1 minute.
            </p>
          </div>

          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className="material-icons">rate_review</span>
                <div>
                  <h2>Your Experience</h2>
                  <p className={styles.cardSubtitle}>Rate each item from 1 (worst) to 10 (best)</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className={styles.form}>
                <RatingRow
                  label="How useful is Alphalabs for you?"
                  helper="Overall usefulness for backtesting/optimization workflow"
                  value={usefulRating}
                  onChange={setUsefulRating}
                />
                <RatingRow
                  label="How do you like the UI design?"
                  helper="Layout, readability, spacing, and clarity"
                  value={uiRating}
                  onChange={setUiRating}
                />
                <RatingRow
                  label="How do you like the functions?"
                  helper="Backtest, optimize, strategy builder, chart tools"
                  value={functionRating}
                  onChange={setFunctionRating}
                />
                <RatingRow
                  label="How do you like the features?"
                  helper="Feature completeness and what’s currently available"
                  value={featuresRating}
                  onChange={setFeaturesRating}
                />
                <RatingRow
                  label="How’s the performance?"
                  helper="Speed, smoothness, and responsiveness"
                  value={performanceRating}
                  onChange={setPerformanceRating}
                />
                <RatingRow
                  label="Overall satisfaction"
                  helper="Your overall rating of the product"
                  value={overallRating}
                  onChange={setOverallRating}
                />

                <div className={styles.field}>
                  <label>What features should we add next?</label>
                  <textarea
                    className={styles.textarea}
                    rows={4}
                    value={requestedFeatures}
                    onChange={(e) => setRequestedFeatures(e.target.value)}
                    placeholder="Example: Walk-forward analysis, portfolio engine, more indicators, better export..."
                  />
                </div>

                <div className={styles.field}>
                  <label>Any other comments?</label>
                  <textarea
                    className={styles.textarea}
                    rows={3}
                    value={additionalComments}
                    onChange={(e) => setAdditionalComments(e.target.value)}
                    placeholder="Anything else you'd like to share?"
                  />
                </div>

                <div className={styles.field}>
                  <label>How much are you willing to pay per month?</label>
                  <div className={styles.payRow}>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      inputMode="numeric"
                      className={styles.payInput}
                      value={willingToPayAmount}
                      onChange={(e) => setWillingToPayAmount(e.target.value)}
                      placeholder="0"
                    />
                    <select
                      className={styles.paySelect}
                      value={willingToPayCurrency}
                      onChange={(e) => setWillingToPayCurrency(e.target.value)}
                    >
                      <option value="USD">USD</option>
                      <option value="THB">THB</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                  <div className={styles.payHint}>
                    Tip: put 0 if you prefer a free plan.
                  </div>
                </div>

                <button className={styles.submitBtn} type="submit" disabled={!canSubmit || isSubmitting}>
                  <span className="material-icons">send</span>
                  {isSubmitting ? 'Submitting...' : 'Submit Survey'}
                </button>
              </form>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className="material-icons">volunteer_activism</span>
                <div>
                  <h2>Support the Project</h2>
                  <p className={styles.cardSubtitle}>Open source, community-driven</p>
                </div>
              </div>

              <div className={styles.supportText}>
                This is currently an <strong>open source</strong> project. If you find it useful and want to help the project go further,
                please consider donating.
              </div>

              <div className={styles.cryptoBox}>
                <div className={styles.cryptoTabs}>
                  {Object.keys(CRYPTO_WALLETS).map((sym) => {
                    const w = CRYPTO_WALLETS[sym]
                    const active = activeCrypto === sym
                    return (
                      <button
                        key={sym}
                        type="button"
                        className={`${styles.cryptoTab} ${active ? styles.cryptoTabActive : ''}`}
                        onClick={() => setActiveCrypto(sym)}
                        style={{ borderColor: active ? w.color : undefined }}
                      >
                        <span className={styles.cryptoIcon} style={{ color: w.color }}>{w.icon}</span>
                        {w.symbol}
                      </button>
                    )
                  })}
                </div>

                <div className={styles.cryptoAddressCard}>
                  <div className={styles.cryptoMeta}>
                    <div className={styles.cryptoName}>
                      <span className={styles.cryptoIconBig} style={{ color: CRYPTO_WALLETS[activeCrypto]?.color }}>
                        {CRYPTO_WALLETS[activeCrypto]?.icon}
                      </span>
                      <div>
                        <div className={styles.cryptoTitle}>{CRYPTO_WALLETS[activeCrypto]?.name}</div>
                        <div className={styles.cryptoSubtitle}>{CRYPTO_WALLETS[activeCrypto]?.symbol}</div>
                      </div>
                    </div>
                    <button type="button" className={styles.copyBtn} onClick={copyCryptoAddress}>
                      <span className="material-icons">content_copy</span>
                      Copy Address
                    </button>
                  </div>
                  <div className={styles.cryptoAddress}>
                    {CRYPTO_WALLETS[activeCrypto]?.address || 'Not configured'}
                  </div>
                  <div className={styles.cryptoHint}>
                    Please double-check network before sending.
                  </div>
                </div>

                <div className={styles.supportActions}>
                  <Link className={styles.supportBtn} href="/help">
                    <span className="material-icons">support_agent</span>
                    Contact / Feedback
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

