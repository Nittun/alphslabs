import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Fetch all manual strategies for the user
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const strategies = await prisma.manualBacktestStrategy.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ success: true, strategies })

  } catch (error) {
    console.error('Error fetching manual strategies:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch strategies' },
      { status: 500 }
    )
  }
}

// POST - Create a new manual strategy
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    const body = await request.json()
    const { name, asset, timeframe, startDate, endDate, indicators, trades, performance } = body

    if (!name || !asset || !timeframe) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const strategy = await prisma.manualBacktestStrategy.create({
      data: {
        userId: user.id,
        name,
        asset,
        timeframe,
        startDate,
        endDate,
        indicators: indicators || [],
        trades: trades || null,
        performance: performance || null
      }
    })

    return NextResponse.json({ success: true, strategy })

  } catch (error) {
    console.error('Error creating manual strategy:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create strategy' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a manual strategy
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'Strategy ID required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify ownership
    const strategy = await prisma.manualBacktestStrategy.findUnique({
      where: { id },
      select: { userId: true }
    })

    if (!strategy || strategy.userId !== user.id) {
      return NextResponse.json({ error: 'Strategy not found or access denied' }, { status: 404 })
    }

    await prisma.manualBacktestStrategy.delete({ where: { id } })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error deleting manual strategy:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete strategy' },
      { status: 500 }
    )
  }
}
