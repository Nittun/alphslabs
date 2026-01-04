import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// GET - Get backtest run history for user
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')
    const configId = searchParams.get('configId')

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ success: true, runs: [], total: 0 })
    }

    const where = { userId: user.id }
    if (configId) {
      where.configId = configId
    }

    const [runs, total] = await Promise.all([
      prisma.backtestRun.findMany({
        where,
        orderBy: { runAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          config: {
            select: { name: true }
          }
        }
      }),
      prisma.backtestRun.count({ where })
    ])

    return NextResponse.json({ success: true, runs, total })
  } catch (error) {
    console.error('Error fetching backtest runs:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Database connection error' 
    }, { status: 500 })
  }
}

// POST - Save a new backtest run with results
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()

    // Get or create user
    let user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: session.user.email,
          name: session.user.name,
          image: session.user.image
        }
      })
    }

    // Validate required fields
    if (!data.asset || !data.interval) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required fields: asset and interval' 
      }, { status: 400 })
    }

    const run = await prisma.backtestRun.create({
      data: {
        userId: user.id,
        configId: data.configId || null,
        
        // Configuration snapshot
        asset: String(data.asset),
        interval: String(data.interval),
        daysBack: parseInt(data.daysBack) || 730,
        initialCapital: parseFloat(data.initialCapital) || 10000,
        enableShort: data.enableShort ?? true,
        strategyMode: String(data.strategyMode || 'reversal'),
        emaFast: parseInt(data.emaFast) || 12,
        emaSlow: parseInt(data.emaSlow) || 26,
        
        // Results (all nullable)
        totalReturn: data.totalReturn != null ? parseFloat(data.totalReturn) : null,
        totalReturnPct: data.totalReturnPct != null ? parseFloat(data.totalReturnPct) : null,
        winRate: data.winRate != null ? parseFloat(data.winRate) : null,
        totalTrades: data.totalTrades != null ? parseInt(data.totalTrades) : null,
        winningTrades: data.winningTrades != null ? parseInt(data.winningTrades) : null,
        losingTrades: data.losingTrades != null ? parseInt(data.losingTrades) : null,
        maxDrawdown: data.maxDrawdown != null ? parseFloat(data.maxDrawdown) : null,
        sharpeRatio: data.sharpeRatio != null ? parseFloat(data.sharpeRatio) : null,
        
        // Trade logs as JSON
        tradeLogs: data.tradeLogs || null
      }
    })

    return NextResponse.json({ success: true, run })
  } catch (error) {
    console.error('Error saving backtest run:', error)
    console.error('Error details:', JSON.stringify(error, null, 2))
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Unknown database error',
      code: error.code || 'UNKNOWN'
    }, { status: 500 })
  }
}

// DELETE - Delete a backtest run
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Run ID required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    // Verify ownership
    const existingRun = await prisma.backtestRun.findFirst({
      where: { id, userId: user.id }
    })

    if (!existingRun) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    await prisma.backtestRun.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting run:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

