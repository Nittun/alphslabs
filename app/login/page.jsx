'use client'

import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import styles from './page.module.css'

function LoginForm() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showRegisteredMessage, setShowRegisteredMessage] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/backtest')
    }
  }, [status, router])

  useEffect(() => {
    if (searchParams.get('registered') === 'true') {
      setShowRegisteredMessage(true)
    }
  }, [searchParams])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    if (!formData.email || !formData.password) {
      setError('Please enter your email and password')
      setIsLoading(false)
      return
    }

    try {
      const result = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      })

      if (result?.error) {
        setError(result.error)
        setIsLoading(false)
      } else {
        router.push('/backtest')
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl: '/backtest' })
  }

  if (status === 'loading') {
    return (
      <div className={styles.card}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
        </div>
      </div>
    )
  }

  if (status === 'authenticated') {
    return null
  }

  return (
    <div className={styles.card}>
      <div className={styles.logo}>
        <img src="/logo.png" alt="Alphalabs" className={styles.logoImage} />
        <h1>Alphalabs</h1>
        <span className={styles.betaTag}>BETA</span>
      </div>
      
      <div className={styles.content}>
        <h2>Welcome back</h2>
        <p className={styles.subtitle}>Sign in to continue to your dashboard</p>
        
        {showRegisteredMessage && (
          <div className={styles.successMessage}>
            <span className="material-icons">check_circle</span>
            Account created! Please sign in.
          </div>
        )}
        
        {error && (
          <div className={styles.errorMessage}>
            <span className="material-icons">error_outline</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="you@example.com"
              className={styles.input}
            />
          </div>

          <div className={styles.inputGroup}>
            <label>Password</label>
            <div className={styles.passwordWrapper}>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your password"
                className={styles.input}
              />
              <button
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                <span className="material-icons">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            className={styles.submitBtn}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className={styles.btnSpinner}></div>
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className={styles.divider}>
          <span>or</span>
        </div>
        
        <button onClick={handleGoogleSignIn} className={styles.googleBtn}>
          <svg className={styles.googleIcon} viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <p className={styles.registerLink}>
          Don't have an account? <Link href="/register">Create one</Link>
        </p>
      </div>
    </div>
  )
}

function LoginLoading() {
  return (
    <div className={styles.card}>
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className={styles.container}>
      <Suspense fallback={<LoginLoading />}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
