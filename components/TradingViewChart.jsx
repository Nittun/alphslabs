'use client'

import { useEffect, useRef, useState } from 'react'

export default function TradingViewChart({
  symbol = 'BINANCE:BTCUSDT',
  interval = 'D',
  theme = 'dark',
  indicators = ['RSI', 'MACD', 'MA'],
}) {
  const containerRef = useRef(null)
  const [chartId] = useState(() => `tradingview_${Math.random().toString(36).substr(2, 9)}`)
  const widgetRef = useRef(null)
  const scriptLoadedRef = useRef(false)

  useEffect(() => {
    let isMounted = true
    let containerRetryCount = 0
    let tvRetryCount = 0
    const maxRetries = 25

    // Function to initialize the chart
    const initializeChart = () => {
      if (!isMounted) {
        console.log('TradingViewChart: Component unmounted')
        return
      }

      // Verify container exists - try ref first, then by ID
      let containerElement = containerRef.current
      if (!containerElement) {
        containerElement = document.getElementById(chartId)
      }
      
      if (!containerElement) {
        containerRetryCount++
        if (containerRetryCount < maxRetries) {
          console.log(`TradingViewChart: Container not found yet, retrying... (${containerRetryCount}/${maxRetries})`)
          setTimeout(initializeChart, 200)
        } else {
          console.error('TradingViewChart: Container element not found after max retries, chartId:', chartId)
        }
        return
      }

      // Ensure container has the correct ID
      if (containerElement.id !== chartId) {
        containerElement.id = chartId
      }

      // Check if TradingView is available
      if (!window.TradingView || !window.TradingView.widget) {
        tvRetryCount++
        if (tvRetryCount < maxRetries) {
          console.log(`TradingViewChart: TradingView not loaded yet, retrying... (${tvRetryCount}/${maxRetries})`)
          setTimeout(initializeChart, 300)
        } else {
          console.error('TradingViewChart: TradingView failed to load after max retries')
          if (containerElement) {
            containerElement.innerHTML = `
              <div style="padding: 20px; color: #888; text-align: center; background: #1a1a1a; border-radius: 8px;">
                <p>TradingView failed to load. Please refresh the page.</p>
              </div>
            `
          }
        }
        return
      }

      try {
        console.log('TradingViewChart: Initializing widget with:', { symbol, interval, chartId })
        
        // Remove existing widget reference (don't call remove() as it causes DOM errors)
        if (widgetRef.current) {
          widgetRef.current = null
        }
        
        // Clear container safely - check if it still has a parent
        if (containerElement.parentNode) {
          // Use a safer approach - remove all children one by one
          while (containerElement.firstChild) {
            try {
              containerElement.removeChild(containerElement.firstChild)
            } catch (e) {
              // If removal fails, break out and try innerHTML approach
              break
            }
          }
          // Fallback to innerHTML if there are still children
          if (containerElement.children.length > 0) {
            try {
              containerElement.innerHTML = ''
            } catch (e) {
              // Ignore
            }
          }
        }
        
        // Create widget
        const widget = new window.TradingView.widget({
          autosize: true,
          symbol: symbol,
          interval: interval,
          timezone: 'Etc/UTC',
          theme: theme,
          style: '1',
          locale: 'en',
          toolbar_bg: '#1a1a1a',
          enable_publishing: false,
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: false,
          container_id: chartId,
          width: '100%',
          height: '500',
          studies_overrides: {
            'volume.volume.color.0': '#00FFFF',
            'volume.volume.color.1': '#0000FF',
          },
          studies: [
            {
              id: 'MASimple@tv-basicstudies',
              inputs: { length: 50 },
            },
            {
              id: 'MASimple@tv-basicstudies',
              inputs: { length: 200 },
            },
            {
              id: 'RSI@tv-basicstudies',
              inputs: { length: 14 },
            },
            {
              id: 'MACD@tv-basicstudies',
            },
          ],
        })

        widgetRef.current = widget
        console.log('TradingViewChart: ✅ Widget initialized successfully')
      } catch (error) {
        console.error('TradingViewChart: ❌ Error initializing widget:', error)
        if (isMounted && containerElement) {
          containerElement.innerHTML = `
            <div style="padding: 20px; color: #888; text-align: center; background: #1a1a1a; border-radius: 8px;">
              <p>Error loading chart: ${error.message || 'Unknown error'}</p>
              <p style="font-size: 0.9rem; margin-top: 10px;">Please check the browser console for details.</p>
            </div>
          `
        }
      }
    }

    // Load TradingView script if not already loaded
    const loadTradingViewScript = () => {
      // Check if script already exists
      let existingScript = document.getElementById('tradingview-widget-loading-script')
      
      if (existingScript) {
        console.log('TradingViewChart: Script already exists')
        // Script exists, check if it's loaded
        if (window.TradingView && window.TradingView.widget) {
          console.log('TradingViewChart: TradingView already available, initializing...')
          setTimeout(initializeChart, 100)
        } else {
          // Wait for script to load
          const onScriptLoad = () => {
            console.log('TradingViewChart: Existing script loaded')
            setTimeout(initializeChart, 500)
          }
          existingScript.addEventListener('load', onScriptLoad)
          // Also try immediately in case it's already loaded
          if (existingScript.complete || existingScript.readyState === 'complete') {
            setTimeout(initializeChart, 500)
          }
        }
        return
      }

      // Create new script element
      const script = document.createElement('script')
      script.src = 'https://s3.tradingview.com/tv.js'
      script.async = true
      script.id = 'tradingview-widget-loading-script'
      
      script.onload = () => {
        console.log('TradingViewChart: ✅ Script loaded successfully')
        scriptLoadedRef.current = true
        setTimeout(initializeChart, 500)
      }

      script.onerror = (error) => {
        console.error('TradingViewChart: ❌ Failed to load script:', error)
        scriptLoadedRef.current = false
        const containerElement = document.getElementById(chartId) || containerRef.current
        if (isMounted && containerElement) {
          containerElement.innerHTML = `
            <div style="padding: 20px; color: #888; text-align: center; background: #1a1a1a; border-radius: 8px;">
              <p>Failed to load TradingView script.</p>
              <p style="font-size: 0.9rem; margin-top: 10px;">Please check your internet connection and refresh the page.</p>
            </div>
          `
        }
      }

      // Add script to document
      try {
        if (document.head) {
          document.head.appendChild(script)
          console.log('TradingViewChart: Script added to document head')
        } else if (document.body) {
          document.body.appendChild(script)
          console.log('TradingViewChart: Script added to document body')
        } else {
          console.error('TradingViewChart: Neither document.head nor document.body is available')
        }
      } catch (e) {
        console.error('TradingViewChart: Error appending script:', e)
      }
    }

    // Wait for DOM to be ready, then start loading
    // Use a longer delay to ensure the container is rendered
    const timer = setTimeout(() => {
      loadTradingViewScript()
    }, 300)

    // Cleanup function
    return () => {
      clearTimeout(timer)
      isMounted = false
      
      // Just null the ref - don't try to remove the widget as it causes DOM errors
      // The widget will be cleaned up when the container is removed from DOM
      widgetRef.current = null
      
      // Don't try to manipulate DOM during cleanup - React handles this
      // Attempting to clear innerHTML can cause "removeChild" errors
    }
  }, [symbol, interval, theme, chartId])

  return (
    <div className="tradingview-chart-container" style={{ borderRadius: '8px', overflow: 'hidden', height: '500px', width: '100%', background: '#1a1a1a', position: 'relative' }}>
      <div
        id={chartId}
        ref={containerRef}
        style={{ height: '100%', width: '100%', minHeight: '500px' }}
      />
    </div>
  )
}
