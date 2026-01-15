'use client'

import { useMemo, useState } from 'react'
import Swal from 'sweetalert2'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import styles from './page.module.css'
import Link from 'next/link'

function RatingRow({ label, value, onChange, helper }) {
  return (
    <div className={styles.ratingRow}>
      <div className={styles.ratingLeft}>
        <div className={styles.ratingLabel}>{label}</div>
        {helper && <div className={styles.ratingHelper}>{helper}</div>}
      </div>
      <div className={styles.ratingRight}>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={styles.slider}
        />
        <div className={styles.ratingValue}>{value}</div>
      </div>
    </div>
  )
}

export default function SurveyPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

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

              <div className={styles.supportActions}>
                <Link className={styles.supportBtn} href="/help">
                  <span className="material-icons">favorite</span>
                  Donate / Support
                </Link>
                <a className={styles.supportBtnSecondary} href="https://github.com" target="_blank" rel="noreferrer">
                  <span className="material-icons">code</span>
                  View Open Source
                </a>
              </div>

              <div className={styles.qrBox}>
                <img src="/promptpay-qr.png" alt="Donate QR" className={styles.qrImg} />
                <div className={styles.qrHint}>Scan to donate (PromptPay)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

