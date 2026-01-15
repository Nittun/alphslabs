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

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <SessionProvider>
          <BacktestConfigProvider>
            <div className="page-transition">
              {children}
            </div>
          </BacktestConfigProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
