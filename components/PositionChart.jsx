'use client'

import { useEffect, useRef, useState } from 'react'

export default function PositionChart({ trades = [], symbol = 'BTC/USDT', interval = '1d', zoomToTradeId }) {
  const chartContainerRef = useRef(null)
  const markersContainerRef = useRef(null)
  const widgetRef = useRef(null)
  const [chartId] = useState(() => `positionchart_${Math.random().toString(36).substr(2, 9)}`)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const getTradingViewSymbol = (asset) => {
    const map = {
      'BTC/USDT': 'BINANCE:BTCUSDT',
      'ETH/USDT': 'BINANCE:ETHUSDT',
      'NVDA': 'NASDAQ:NVDA',
    }
    return map[asset] || 'BINANCE:BTCUSDT'
  }

  const getTradingViewInterval = (interval) => {
    const map = {
      '1h': '60',
      '2h': '120',
      '4h': '240',
      '1d': 'D',
      '1W': 'W',
      '1M': 'M',
    }
    return map[interval] || 'D'
  }

  useEffect(() => {
    if (!chartContainerRef.current) {
      console.log('PositionChart: Container ref not available')
      return
    }

    console.log('PositionChart: Initializing with trades:', trades?.length || 0, 'symbol:', symbol, 'interval:', interval)

    let isMounted = true
    let retryCount = 0
    const maxRetries = 15

    const initializeChart = () => {
      if (!isMounted) return

      const containerElement = document.getElementById(chartId)
      if (!containerElement) {
        retryCount++
        if (retryCount < maxRetries) {
          setTimeout(initializeChart, 300)
        }
        return
      }

      if (!window.TradingView || !window.TradingView.widget) {
        retryCount++
        if (retryCount < maxRetries) {
          setTimeout(initializeChart, 300)
        } else {
          setError('TradingView failed to load')
          setLoading(false)
        }
        return
      }

      try {
        // Remove existing widget if any
        if (widgetRef.current) {
          try {
            if (typeof widgetRef.current.remove === 'function') {
              widgetRef.current.remove()
            }
          } catch (e) {
            console.warn('PositionChart: Error removing existing widget:', e)
          }
          widgetRef.current = null
        }

        // Clear container
        containerElement.innerHTML = ''

        // Create TradingView widget
        const widget = new window.TradingView.widget({
          autosize: true,
          symbol: getTradingViewSymbol(symbol),
          interval: getTradingViewInterval(interval),
          timezone: 'Etc/UTC',
          theme: 'dark',
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
              inputs: { length: 12 },
            },
            {
              id: 'MASimple@tv-basicstudies',
              inputs: { length: 26 },
            },
            {
              id: 'MASimple@tv-basicstudies',
              inputs: { length: 99 },
            },
          ],
        })

        widgetRef.current = widget
        console.log('PositionChart: TradingView widget initialized')

        // Wait for chart to fully load, then add markers
        // Also set up resize observer to update markers when chart resizes
        const updateMarkers = () => {
          if (isMounted) {
            addPositionMarkers()
          }
        }

        setTimeout(() => {
          updateMarkers()
          setLoading(false)
        }, 2500)

        // Set up resize observer to update markers when container resizes
        const resizeObserver = new ResizeObserver(() => {
          if (isMounted && trades && trades.length > 0) {
            setTimeout(updateMarkers, 300) // Debounce resize updates
          }
        })

        if (chartContainerRef.current) {
          resizeObserver.observe(chartContainerRef.current)
        }

        // Store observer for cleanup
        widgetRef.current._resizeObserver = resizeObserver
        
        // Store zoom function for later use
        widgetRef.current._zoomToTrade = zoomToTrade

      } catch (error) {
        console.error('PositionChart: Error initializing widget:', error)
        setError(`Error loading chart: ${error.message}`)
        setLoading(false)
      }
    }

    const calculateXPosition = (timestamp) => {
      if (!trades || trades.length === 0) return 0
      
      const entryDates = trades.map(t => new Date(t.Entry_Date).getTime())
      const exitDates = trades.map(t => new Date(t.Exit_Date).getTime())
      const allDates = [...entryDates, ...exitDates]
      const minDate = Math.min(...allDates)
      const maxDate = Math.max(...allDates)
      const dateRange = maxDate - minDate || 1
      
      const container = chartContainerRef.current
      if (!container) return 0
      
      const chartPadding = 60
      const chartAreaWidth = container.offsetWidth - chartPadding * 2
      
      return chartPadding + ((timestamp - minDate) / dateRange) * chartAreaWidth
    }

    const zoomToTrade = (trade) => {
      if (!trade) {
        console.warn('PositionChart: Cannot zoom - trade not available')
        return
      }

      try {
        const entryDate = new Date(trade.entryDate || trade.Entry_Date)
        const exitDate = new Date(trade.exitDate || trade.Exit_Date)
        
        console.log('PositionChart: Zooming to trade:', {
          entry: entryDate.toISOString(),
          exit: exitDate.toISOString()
        })

        // Since markers are disabled, we'll scroll the chart container to center on the trade
        if (chartContainerRef.current) {
          try {
            const entryTime = entryDate.getTime()
            const entryX = calculateXPosition(entryTime)
            const container = chartContainerRef.current
            
            if (container) {
              // Calculate scroll position to center the entry point
              const containerWidth = container.offsetWidth || container.clientWidth || 0
              const scrollLeft = Math.max(0, entryX - containerWidth / 2)
              
              // Smooth scroll to the trade entry point
              if (container.scrollTo) {
                container.scrollTo({
                  left: scrollLeft,
                  behavior: 'smooth'
                })
              } else if (container.scrollLeft !== undefined) {
                // Fallback for browsers that don't support scrollTo
                container.scrollLeft = scrollLeft
              }
              
              // Also try to scroll the window if the chart is visible
              const chartElement = document.getElementById(chartId)
              if (chartElement) {
                const chartRect = chartElement.getBoundingClientRect()
                const isVisible = chartRect.top < window.innerHeight && chartRect.bottom > 0
                
                if (!isVisible) {
                  // Scroll the page to bring the chart into view
                  chartElement.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center',
                    inline: 'nearest'
                  })
                }
              }
              
              console.log('PositionChart: Scrolled to trade entry at X:', entryX, 'scrollLeft:', scrollLeft)
            }
          } catch (scrollError) {
            console.warn('PositionChart: Error scrolling container:', scrollError)
          }
        }
      } catch (error) {
        console.error('PositionChart: Error zooming to trade:', error)
      }
    }

    // Store zoom function reference on widget for later use
    // This will be called after widget is initialized

    const addPositionMarkers = () => {
      if (!trades || trades.length === 0 || !markersContainerRef.current) {
        console.log('PositionChart: No trades to display or markers container not available')
        return
      }

      // Clear existing markers
      markersContainerRef.current.innerHTML = ''
      
      // Markers are disabled - return early
      return

      const chartElement = document.getElementById(chartId)
      if (!chartElement) {
        console.warn('PositionChart: Chart element not found')
        return
      }

      // Get container dimensions
      const container = chartContainerRef.current
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const chartRect = chartElement.getBoundingClientRect()

      // Calculate positioning based on visible chart area
      // TradingView chart area typically has padding, so we estimate the chart area
      const chartPadding = 60 // Approximate padding for TradingView chart
      const chartAreaWidth = containerRect.width - chartPadding * 2
      const chartAreaHeight = containerRect.height - chartPadding * 2
      const chartAreaLeft = chartPadding
      const chartAreaTop = chartPadding

      // Calculate date and price ranges from trades
      if (trades.length > 0) {
        const entryDates = trades.map(t => new Date(t.Entry_Date).getTime())
        const exitDates = trades.map(t => new Date(t.Exit_Date).getTime())
        const allDates = [...entryDates, ...exitDates]
        const minDate = Math.min(...allDates)
        const maxDate = Math.max(...allDates)
        const dateRange = maxDate - minDate || 1

        const allPrices = [
          ...trades.map(t => t.Entry_Price),
          ...trades.map(t => t.Exit_Price),
          ...trades.map(t => t.Stop_Loss).filter(p => p)
        ]
        const minPrice = Math.min(...allPrices)
        const maxPrice = Math.max(...allPrices)
        const priceRange = maxPrice - minPrice || 1

        trades.forEach((trade, index) => {
          try {
            const entryTime = new Date(trade.Entry_Date).getTime()
            const exitTime = new Date(trade.Exit_Date).getTime()

            // Calculate positions within chart area
            const entryX = chartAreaLeft + ((entryTime - minDate) / dateRange) * chartAreaWidth
            const exitX = chartAreaLeft + ((exitTime - minDate) / dateRange) * chartAreaWidth

            // Y positions (inverted: top is high price, bottom is low price)
            const entryY = chartAreaTop + (1 - (trade.Entry_Price - minPrice) / priceRange) * chartAreaHeight
            const exitY = chartAreaTop + (1 - (trade.Exit_Price - minPrice) / priceRange) * chartAreaHeight
            const stopLossY = trade.Stop_Loss ? 
              chartAreaTop + (1 - (trade.Stop_Loss - minPrice) / priceRange) * chartAreaHeight : null

            // Entry marker - "B" for Buy/Long, "S" for Sell/Short
            const entryMarker = document.createElement('div')
            const entryText = trade.Position_Type === 'Long' ? 'B' : 'S'
            entryMarker.textContent = entryText
            entryMarker.className = 'position-marker entry-marker'
            entryMarker.setAttribute('data-trade-index', index)
            entryMarker.setAttribute('data-entry-date', trade.Entry_Date)
            entryMarker.style.cssText = `
              position: absolute;
              left: ${entryX}px;
              top: ${entryY}px;
              transform: translate(-50%, -50%);
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background: ${trade.Position_Type === 'Long' ? '#26a69a' : '#ef5350'};
              color: white;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 12px;
              font-weight: bold;
              z-index: 1000;
              pointer-events: none;
              border: 2px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            `
            markersContainerRef.current.appendChild(entryMarker)

            // Exit marker - "S" for Sell/Exit
            const exitMarker = document.createElement('div')
            exitMarker.textContent = 'S'
            exitMarker.className = 'position-marker exit-marker'
            exitMarker.setAttribute('data-trade-index', index)
            exitMarker.setAttribute('data-exit-date', trade.Exit_Date)
            exitMarker.style.cssText = `
              position: absolute;
              left: ${exitX}px;
              top: ${exitY}px;
              transform: translate(-50%, -50%);
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background: ${trade.PnL >= 0 ? '#26a69a' : '#ef5350'};
              color: white;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 12px;
              font-weight: bold;
              z-index: 1000;
              pointer-events: none;
              border: 2px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            `
            markersContainerRef.current.appendChild(exitMarker)

            // P&L label - positioned above exit marker
            const pnlLabel = document.createElement('div')
            pnlLabel.textContent = `${trade.PnL_Pct >= 0 ? '+' : ''}${trade.PnL_Pct.toFixed(1)}%`
            pnlLabel.className = 'position-label pnl-label'
            pnlLabel.setAttribute('data-trade-index', index)
            pnlLabel.style.cssText = `
              position: absolute;
              left: ${exitX}px;
              top: ${exitY - 20}px;
              transform: translateX(-50%);
              background: ${trade.PnL >= 0 ? '#26a69a' : '#ef5350'};
              color: white;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 10px;
              font-weight: bold;
              white-space: nowrap;
              z-index: 1001;
              pointer-events: none;
              border: 1px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            `
            markersContainerRef.current.appendChild(pnlLabel)

            // Stop loss horizontal dashed line
            if (trade.Stop_Loss && stopLossY !== null && entryX !== exitX) {
              const stopLossLine = document.createElement('div')
              stopLossLine.style.cssText = `
                position: absolute;
                left: ${Math.min(entryX, exitX)}px;
                width: ${Math.abs(exitX - entryX)}px;
                top: ${stopLossY}px;
                height: 2px;
                border-top: 2px dashed ${trade.Position_Type === 'Long' ? '#ef5350' : '#ff9800'};
                opacity: 0.8;
                z-index: 999;
                pointer-events: none;
              `
              markersContainerRef.current.appendChild(stopLossLine)

              // Stop loss price label
              const slLabel = document.createElement('div')
              slLabel.textContent = `SL: $${trade.Stop_Loss.toFixed(2)}${trade.Stop_Loss_Hit ? ' ⚡' : ''}`
              slLabel.style.cssText = `
                position: absolute;
                left: ${entryX}px;
                top: ${stopLossY + 4}px;
                background: ${trade.Position_Type === 'Long' ? '#ef5350' : '#ff9800'};
                color: white;
                padding: 2px 5px;
                border-radius: 3px;
                font-size: 9px;
                white-space: nowrap;
                z-index: 1001;
                pointer-events: none;
                border: 1px solid white;
              `
              markersContainerRef.current.appendChild(slLabel)
            }
          } catch (error) {
            console.error('PositionChart: Error adding marker for trade:', error)
          }
        })

        console.log('PositionChart: Added', trades.length, 'trade markers')
      }
    }

    // Load TradingView script
    const loadTradingViewScript = () => {
      let existingScript = document.getElementById('tradingview-widget-loading-script')
      
      if (existingScript) {
        if (window.TradingView && window.TradingView.widget) {
          setTimeout(initializeChart, 100)
        } else {
          existingScript.addEventListener('load', () => setTimeout(initializeChart, 500))
        }
        return
      }

      const script = document.createElement('script')
      script.src = 'https://s3.tradingview.com/tv.js'
      script.async = true
      script.id = 'tradingview-widget-loading-script'
      
      script.onload = () => {
        console.log('PositionChart: TradingView script loaded')
        setTimeout(initializeChart, 500)
      }

      script.onerror = () => {
        setError('Failed to load TradingView script')
        setLoading(false)
      }

      document.head.appendChild(script)
    }

    // Wait for DOM to be ready
    const timer = setTimeout(() => {
      loadTradingViewScript()
    }, 300)

    return () => {
      clearTimeout(timer)
      isMounted = false
      
      // Clean up resize observer
      if (widgetRef.current && widgetRef.current._resizeObserver) {
        widgetRef.current._resizeObserver.disconnect()
      }
      
      if (widgetRef.current) {
        try {
          const containerElement = document.getElementById(chartId)
          if (containerElement && typeof widgetRef.current.remove === 'function') {
            widgetRef.current.remove()
          }
        } catch (e) {
          console.warn('PositionChart: Error removing widget:', e)
        }
        widgetRef.current = null
      }
    }
  }, [trades, symbol, interval, chartId])

  // Handle zoom to trade when zoomToTradeId changes
  useEffect(() => {
    if (zoomToTradeId && trades && trades.length > 0) {
      // Wait for widget and chart container to be ready
      let retryCount = 0
      const maxRetries = 15
      
      const checkAndZoom = () => {
        try {
          // Check if chart container and widget are ready
          const containerReady = chartContainerRef.current && chartContainerRef.current.offsetWidth > 0
          const widgetReady = widgetRef.current && widgetRef.current._zoomToTrade
          
          if (containerReady && widgetReady) {
            // Find trade by matching the ID format: trade-${Entry_Date}-${Exit_Date}-${index}
            const trade = trades.find((t, index) => {
              const tradeId = `trade-${t.Entry_Date}-${t.Exit_Date}-${index}`
              return tradeId === zoomToTradeId
            })
            
            if (trade) {
              console.log('PositionChart: Found trade to zoom:', trade)
              widgetRef.current._zoomToTrade({
                entryDate: trade.Entry_Date,
                exitDate: trade.Exit_Date,
                Entry_Date: trade.Entry_Date,
                Exit_Date: trade.Exit_Date,
              })
            } else {
              console.warn('PositionChart: Trade not found for zoomToTradeId:', zoomToTradeId)
            }
          } else if (retryCount < maxRetries) {
            // Retry if not ready yet
            retryCount++
            setTimeout(checkAndZoom, 300)
          } else {
            console.warn('PositionChart: Max retries reached, zoom may not work properly')
            // Try anyway if we have the trade
            const trade = trades.find((t, index) => {
              const tradeId = `trade-${t.Entry_Date}-${t.Exit_Date}-${index}`
              return tradeId === zoomToTradeId
            })
            if (trade && widgetRef.current && widgetRef.current._zoomToTrade) {
              widgetRef.current._zoomToTrade({
                entryDate: trade.Entry_Date,
                exitDate: trade.Exit_Date,
                Entry_Date: trade.Entry_Date,
                Exit_Date: trade.Exit_Date,
              })
            }
          }
        } catch (error) {
          console.error('PositionChart: Error in checkAndZoom:', error)
        }
      }
      
      // Start checking after a short delay to allow chart to initialize
      setTimeout(checkAndZoom, 500)
    }
  }, [zoomToTradeId, trades])

  return (
    <div 
      ref={chartContainerRef}
      style={{ 
        width: '100%', 
        height: '500px', 
        background: '#1a1a1a', 
        borderRadius: '8px', 
        overflow: 'hidden', 
        position: 'relative', 
        minHeight: '500px' 
      }}
    >
      {loading && !error && (
        <div style={{ 
          position: 'absolute', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          color: '#888',
          textAlign: 'center',
          zIndex: 10,
          pointerEvents: 'none'
        }}>
          <p>Loading chart...</p>
        </div>
      )}
      {error && (
        <div style={{ 
          position: 'absolute', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          color: '#ff4444',
          textAlign: 'center',
          padding: '20px',
          zIndex: 10,
          pointerEvents: 'none',
          maxWidth: '90%'
        }}>
          <p>{error}</p>
        </div>
      )}
      <div
        id={chartId}
        style={{ 
          width: '100%', 
          height: '100%',
          position: 'relative',
          zIndex: 1
        }} 
      />
      <div
        ref={markersContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1000,
          overflow: 'visible'
        }}
      />
    </div>
  )
}
