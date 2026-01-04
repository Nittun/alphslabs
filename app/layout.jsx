import './globals.css'
import SessionProvider from '@/components/SessionProvider'
import { BacktestConfigProvider } from '@/context/BacktestConfigContext'

export const metadata = {
  title: 'BTC TradingView Backtest',
  description: 'Bitcoin chart with TradingView integration and log collection',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
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

