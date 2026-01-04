import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// GET - Get user's default trading configuration
export async function GET(request) {
  try {
    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured', defaultConfig: null })
    }

    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { defaultConfig: true }
    })

    if (!user) {
      return NextResponse.json({ success: true, defaultConfig: null })
    }

    return NextResponse.json({ 
      success: true, 
      defaultConfig: user.defaultConfig 
    })
  } catch (error) {
    console.error('Error fetching default config:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Database connection error' 
    }, { status: 500 })
  }
}

// POST - Set user's default trading configuration
export async function POST(request) {
  try {
    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ 
        success: false, 
        error: 'Not logged in' 
      }, { status: 401 })
    }

    const config = await request.json()

    // Validate required fields
    if (!config.asset || !config.interval) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields: asset and interval' 
      }, { status: 400 })
    }

    // Get existing config to preserve open position data if not provided
    const existingUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { defaultConfig: true }
    })
    const existingConfig = existingUser?.defaultConfig || {}

    // Normalize the config object
    const defaultConfig = {
      asset: String(config.asset),
      interval: String(config.interval),
      daysBack: parseInt(config.daysBack) || 730,
      initialCapital: parseFloat(config.initialCapital) || 10000,
      enableShort: config.enableShort ?? true,
      strategyMode: String(config.strategyMode || 'reversal'),
      emaFast: parseInt(config.emaFast) || 12,
      emaSlow: parseInt(config.emaSlow) || 26,
      // Portfolio settings
      portfolioStartDate: config.portfolioStartDate || existingConfig.portfolioStartDate || null,
      // Open position from last backtest
      openPosition: config.openPosition !== undefined ? config.openPosition : existingConfig.openPosition || null,
      // Performance summary
      performance: config.performance !== undefined ? config.performance : existingConfig.performance || null,
      // Last backtest date
      lastBacktestDate: config.lastBacktestDate || existingConfig.lastBacktestDate || null,
      setAt: new Date().toISOString()
    }

    // Use upsert to create user if they don't exist, or update if they do
    const user = await prisma.user.upsert({
      where: { email: session.user.email },
      update: { defaultConfig },
      create: { 
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
        defaultConfig 
      }
    })

    return NextResponse.json({ 
      success: true, 
      defaultConfig: user.defaultConfig 
    })
  } catch (error) {
    console.error('Error setting default config:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}

// PATCH - Update only specific fields (open position, performance, etc.)
export async function PATCH(request) {
  try {
    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ 
        success: false, 
        error: 'Not logged in' 
      }, { status: 401 })
    }

    const updates = await request.json()

    // Get existing config
    const existingUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { defaultConfig: true }
    })

    if (!existingUser?.defaultConfig) {
      return NextResponse.json({ 
        success: false, 
        error: 'No default config found. Set a default config first.' 
      }, { status: 400 })
    }

    // Merge updates with existing config
    const updatedConfig = {
      ...existingUser.defaultConfig,
      ...updates,
      updatedAt: new Date().toISOString()
    }

    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: { defaultConfig: updatedConfig }
    })

    return NextResponse.json({ 
      success: true, 
      defaultConfig: user.defaultConfig 
    })
  } catch (error) {
    console.error('Error updating default config:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}

// DELETE - Clear user's default trading configuration
export async function DELETE(request) {
  try {
    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.user.update({
      where: { email: session.user.email },
      data: { defaultConfig: null }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error clearing default config:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}

