'use client'

import dynamic from 'next/dynamic'

// Loading placeholder for charts
const ChartLoadingPlaceholder = () => (
  <div style={{
    width: '100%',
    height: '400px',
    background: 'linear-gradient(90deg, #1a1a1a 25%, #252525 50%, #1a1a1a 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#666'
  }}>
    <span>Loading chart...</span>
    <style jsx>{`
      @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `}</style>
  </div>
)

// Loading placeholder for modals
const ModalLoadingPlaceholder = () => null

// Loading placeholder for results
const ResultsLoadingPlaceholder = () => (
  <div style={{
    width: '100%',
    padding: '2rem',
    background: '#131313',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#666'
  }}>
    <span>Loading results...</span>
  </div>
)

// Dynamically import heavy chart components
export const LazyBacktestLightweightChart = dynamic(
  () => import('./BacktestLightweightChart'),
  { 
    loading: ChartLoadingPlaceholder,
    ssr: false // Charts don't render on server
  }
)

export const LazyMonteCarloChart = dynamic(
  () => import('./MonteCarloChart'),
  { 
    loading: ChartLoadingPlaceholder,
    ssr: false
  }
)

export const LazyPortfolioPnLChart = dynamic(
  () => import('./PortfolioPnLChart'),
  { 
    loading: ChartLoadingPlaceholder,
    ssr: false
  }
)

export const LazyBacktestResults = dynamic(
  () => import('./BacktestResults'),
  { loading: ResultsLoadingPlaceholder }
)

export const LazyEntryPositionModal = dynamic(
  () => import('./EntryPositionModal'),
  { loading: ModalLoadingPlaceholder }
)

export const LazyExitPositionModal = dynamic(
  () => import('./ExitPositionModal'),
  { loading: ModalLoadingPlaceholder }
)

export const LazyTradeDetailModal = dynamic(
  () => import('./TradeDetailModal'),
  { loading: ModalLoadingPlaceholder }
)

// Lazy load ApexCharts components
export const LazyApexChart = dynamic(
  () => import('react-apexcharts'),
  { 
    loading: ChartLoadingPlaceholder,
    ssr: false
  }
)
