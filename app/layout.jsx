import './globals.css'
import SessionProvider from '@/components/SessionProvider'
import { BacktestConfigProvider } from '@/context/BacktestConfigContext'

export const metadata = {
  title: 'Alphalabs - Trading Strategy Backtesting',
  description: 'Advanced backtesting platform for crypto traders. Test EMA crossovers, RSI signals, and custom strategies on historical data.',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

// Optimize viewport for mobile
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        
        {/* Preconnect to external domains for faster loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* DNS prefetch for API domain */}
        <link rel="dns-prefetch" href="https://api.binance.com" />
        
        {/* Material Icons - load asynchronously */}
        <link 
          href="https://fonts.googleapis.com/icon?family=Material+Icons" 
          rel="stylesheet"
          media="print"
          onLoad="this.media='all'"
        />
        <link 
          href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" 
          rel="stylesheet"
          media="print"
          onLoad="this.media='all'"
        />
        
        {/* Fallback for Material Icons while loading */}
        <noscript>
          <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
          <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" rel="stylesheet" />
        </noscript>
      </head>
      <body>
        <SessionProvider>
          <BacktestConfigProvider>
            {children}
          </BacktestConfigProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
