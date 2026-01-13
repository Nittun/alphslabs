'use client'

import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import styles from './page.module.css'

// Error messages mapping
const ERROR_MESSAGES = {
  'OAuthSignin': 'Error starting sign in process',
  'OAuthCallback': 'Error during authentication callback',
  'OAuthCreateAccount': 'Could not create account',
  'EmailCreateAccount': 'Could not create account',
  'Callback': 'Authentication callback error',
  'OAuthAccountNotLinked': 'This email is already linked to another account',
  'EmailSignin': 'Error sending sign in email',
  'CredentialsSignin': 'Invalid email or password',
  'SessionRequired': 'Please sign in to access this page',
  'Default': 'Unable to sign in',
  'AccessDenied': 'Access denied. You do not have permission to sign in.',
  'Configuration': 'Server configuration error. Please try again later.',
}

function LoginForm() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [errorType, setErrorType] = useState('')
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
    
    // Handle NextAuth error from URL
    const urlError = searchParams.get('error')
    if (urlError) {
      setErrorType(urlError)
      setError(ERROR_MESSAGES[urlError] || ERROR_MESSAGES['Default'])
    }
  }, [searchParams])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setError('')
    setErrorType('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setErrorType('')
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
        setErrorType('credentials')
        setIsLoading(false)
      } else {
        router.push('/backtest')
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setErrorType('network')
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      await signIn('google', { callbackUrl: '/backtest' })
    } catch (err) {
      setError('Failed to initiate Google sign in')
      setErrorType('oauth')
    }
  }

  const handleRetry = () => {
    setError('')
    setErrorType('')
    setFormData({ email: '', password: '' })
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

  // Show special error card for access denied / permission errors
  const isAccessError = errorType === 'AccessDenied' || errorType === 'Configuration' || errorType === 'OAuthCallback'

  if (isAccessError) {
    return (
      <div className={styles.card}>
        <div className={styles.errorCard}>
          <div className={styles.errorIconWrapper}>
            <span className="material-icons">block</span>
          </div>
          <h2>Access Denied</h2>
          <p className={styles.errorDescription}>
            {errorType === 'Configuration' 
              ? 'The server is not configured properly. Please contact the administrator or try again later.'
              : errorType === 'OAuthCallback'
              ? 'There was an error during authentication. This may be due to server configuration issues.'
              : 'You do not have permission to access this application. Please contact the administrator if you believe this is an error.'
            }
          </p>
          
          <div className={styles.errorDetails}>
            <div className={styles.errorDetailItem}>
              <span className="material-icons">info</span>
              <span>Error Code: {errorType}</span>
            </div>
            <div className={styles.errorDetailItem}>
              <span className="material-icons">schedule</span>
              <span>{new Date().toLocaleString()}</span>
            </div>
          </div>

          <div className={styles.errorActions}>
            <button onClick={handleRetry} className={styles.retryBtn}>
              <span className="material-icons">refresh</span>
              Try Again
            </button>
            <Link href="/" className={styles.homeLink}>
              <span className="material-icons">home</span>
              Back to Home
            </Link>
          </div>

          <div className={styles.helpBox}>
            <span className="material-icons">help_outline</span>
            <div>
              <strong>Need help?</strong>
              <p>If this problem persists, please check that your account has the correct permissions or contact support.</p>
            </div>
          </div>
        </div>
      </div>
    )
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
        
        {error && !isAccessError && (
          <div className={styles.errorMessage}>
            <span className="material-icons">error_outline</span>
            <div className={styles.errorContent}>
              <span>{error}</span>
              {errorType === 'network' && (
                <button onClick={handleRetry} className={styles.inlineRetry}>
                  Try again
                </button>
              )}
            </div>
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
