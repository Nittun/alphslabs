import './globals.css'
import SessionProvider from '@/components/SessionProvider'
import { BacktestConfigProvider } from '@/context/BacktestConfigContext'

export const metadata = {
  title: 'Alphalabs - Trading Strategy Backtesting',
  description: 'Advanced backtesting platform for crypto traders. Test EMA crossovers, RSI signals, and custom strategies on historical data.',
  icons: {
    icon: '/logo_plain.png',
    apple: '/logo_plain.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/logo_plain.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo_plain.png" />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" rel="stylesheet" />
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

