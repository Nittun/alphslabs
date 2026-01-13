import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Fetch all optimization configs for the user
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

    const configs = await prisma.optimizationConfig.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ success: true, configs })

  } catch (error) {
    console.error('Error fetching optimization configs:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch configs' },
      { status: 500 }
    )
  }
}

// POST - Create a new optimization config
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
    const { name, config } = body

    if (!name || !config) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const optimizationConfig = await prisma.optimizationConfig.create({
      data: {
        userId: user.id,
        name,
        config
      }
    })

    return NextResponse.json({ success: true, config: optimizationConfig })

  } catch (error) {
    console.error('Error creating optimization config:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create config' },
      { status: 500 }
    )
  }
}

// PATCH - Update an optimization config
export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    const body = await request.json()
    const { id, name, config } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'Config ID required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify ownership
    const existing = await prisma.optimizationConfig.findUnique({
      where: { id },
      select: { userId: true }
    })

    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Config not found or access denied' }, { status: 404 })
    }

    const updateData = {}
    if (name) updateData.name = name
    if (config) updateData.config = config

    const updated = await prisma.optimizationConfig.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json({ success: true, config: updated })

  } catch (error) {
    console.error('Error updating optimization config:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update config' },
      { status: 500 }
    )
  }
}

// DELETE - Delete an optimization config
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
      return NextResponse.json({ success: false, error: 'Config ID required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify ownership
    const config = await prisma.optimizationConfig.findUnique({
      where: { id },
      select: { userId: true }
    })

    if (!config || config.userId !== user.id) {
      return NextResponse.json({ error: 'Config not found or access denied' }, { status: 404 })
    }

    await prisma.optimizationConfig.delete({ where: { id } })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error deleting optimization config:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete config' },
      { status: 500 }
    )
  }
}
