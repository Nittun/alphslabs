import { NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'

/**
 * POST /api/indicators
 * 
 * Request body:
 * {
 *   symbol: string,
 *   timeframe: string,
 *   indicators: [
 *     {
 *       id: string,
 *       type: 'zscore' | 'dema' | 'roll_std' | 'roll_median' | 'roll_percentile',
 *       enabled: boolean,
 *       pane: 'overlay' | 'oscillator',
 *       source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4',
 *       params: { length?: number, percentile?: number, ... }
 *     }
 *   ]
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   candles: [{ time, open, high, low, close, volume }],
 *   indicators: {
 *     [indicatorId]: [{ time, value }]
 *   }
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const { symbol, timeframe, indicators } = body
    
    if (!symbol || !timeframe) {
      return NextResponse.json(
        { success: false, error: 'Symbol and timeframe are required' },
        { status: 400 }
      )
    }
    
    // Forward to backend API
    const response = await fetch(`${API_URL}/api/indicators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, timeframe, indicators })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json(
        { success: false, error: errorData.error || `Backend error: ${response.status}` },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    return NextResponse.json({ success: true, ...data })
    
  } catch (error) {
    console.error('Indicator API error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to calculate indicators' },
      { status: 500 }
    )
  }
}
