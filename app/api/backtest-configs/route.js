import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// GET - Get all saved backtest configurations for user
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ success: true, configs: [] })
    }

    const configs = await prisma.backtestConfig.findMany({
      where: { userId: user.id },
      orderBy: [
        { isFavorite: 'desc' },
        { updatedAt: 'desc' }
      ],
      include: {
        _count: {
          select: { backtestRuns: true }
        }
      }
    })

    return NextResponse.json({ success: true, configs })
  } catch (error) {
    console.error('Error fetching configs:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Database connection error' 
    }, { status: 500 })
  }
}

// POST - Save a new backtest configuration
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

    const config = await prisma.backtestConfig.create({
      data: {
        userId: user.id,
        name: data.name || `${data.asset} ${data.emaFast || 12}/${data.emaSlow || 26}`,
        asset: String(data.asset),
        interval: String(data.interval),
        daysBack: parseInt(data.daysBack) || 730,
        initialCapital: parseFloat(data.initialCapital) || 10000,
        enableShort: data.enableShort ?? true,
        strategyMode: String(data.strategyMode || 'reversal'),
        emaFast: parseInt(data.emaFast) || 12,
        emaSlow: parseInt(data.emaSlow) || 26,
        isFavorite: data.isFavorite || false
      }
    })

    return NextResponse.json({ success: true, config })
  } catch (error) {
    console.error('Error saving config:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// PUT - Update a backtest configuration
export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, ...data } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Config ID required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    // Verify ownership
    const existingConfig = await prisma.backtestConfig.findFirst({
      where: { id, userId: user.id }
    })

    if (!existingConfig) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 })
    }

    const config = await prisma.backtestConfig.update({
      where: { id },
      data
    })

    return NextResponse.json({ success: true, config })
  } catch (error) {
    console.error('Error updating config:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// DELETE - Delete a backtest configuration
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Config ID required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    // Verify ownership
    const existingConfig = await prisma.backtestConfig.findFirst({
      where: { id, userId: user.id }
    })

    if (!existingConfig) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 })
    }

    await prisma.backtestConfig.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting config:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

