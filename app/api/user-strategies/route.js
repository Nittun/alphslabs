import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// GET - Fetch all strategies for the current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // Fetch user's saved strategies
    const strategies = await prisma.userStrategy.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' }
    })

    // Parse the DSL JSON for each strategy
    const parsedStrategies = strategies.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      dsl: s.dsl ? JSON.parse(s.dsl) : null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    }))

    return NextResponse.json({ success: true, strategies: parsedStrategies })
  } catch (error) {
    console.error('Error fetching strategies:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch strategies' }, { status: 500 })
  }
}

// POST - Create or duplicate a strategy
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const { action, strategyId, newName, name, description, dsl } = body

    if (action === 'duplicate') {
      // Duplicate an existing strategy
      const originalStrategy = await prisma.userStrategy.findUnique({
        where: { id: strategyId }
      })

      if (!originalStrategy || originalStrategy.userId !== user.id) {
        return NextResponse.json({ success: false, error: 'Strategy not found' }, { status: 404 })
      }

      const newStrategy = await prisma.userStrategy.create({
        data: {
          userId: user.id,
          name: newName || `${originalStrategy.name} (Copy)`,
          description: originalStrategy.description,
          dsl: originalStrategy.dsl
        }
      })

      return NextResponse.json({ 
        success: true, 
        strategy: {
          id: newStrategy.id,
          name: newStrategy.name,
          description: newStrategy.description,
          dsl: newStrategy.dsl ? JSON.parse(newStrategy.dsl) : null,
          createdAt: newStrategy.createdAt,
          updatedAt: newStrategy.updatedAt
        }
      })
    } else {
      // Create a new strategy
      const newStrategy = await prisma.userStrategy.create({
        data: {
          userId: user.id,
          name: name || 'Untitled Strategy',
          description: description || '',
          dsl: dsl ? JSON.stringify(dsl) : null
        }
      })

      return NextResponse.json({ 
        success: true, 
        strategy: {
          id: newStrategy.id,
          name: newStrategy.name,
          description: newStrategy.description,
          dsl: newStrategy.dsl ? JSON.parse(newStrategy.dsl) : null,
          createdAt: newStrategy.createdAt,
          updatedAt: newStrategy.updatedAt
        }
      })
    }
  } catch (error) {
    console.error('Error creating strategy:', error)
    return NextResponse.json({ success: false, error: 'Failed to create strategy' }, { status: 500 })
  }
}

// PUT - Update a strategy
export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const { id, name, description, dsl } = body

    const existingStrategy = await prisma.userStrategy.findUnique({
      where: { id }
    })

    if (!existingStrategy || existingStrategy.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Strategy not found' }, { status: 404 })
    }

    const updatedStrategy = await prisma.userStrategy.update({
      where: { id },
      data: {
        name: name !== undefined ? name : existingStrategy.name,
        description: description !== undefined ? description : existingStrategy.description,
        dsl: dsl !== undefined ? JSON.stringify(dsl) : existingStrategy.dsl,
        updatedAt: new Date()
      }
    })

    return NextResponse.json({ 
      success: true, 
      strategy: {
        id: updatedStrategy.id,
        name: updatedStrategy.name,
        description: updatedStrategy.description,
        dsl: updatedStrategy.dsl ? JSON.parse(updatedStrategy.dsl) : null,
        createdAt: updatedStrategy.createdAt,
        updatedAt: updatedStrategy.updatedAt
      }
    })
  } catch (error) {
    console.error('Error updating strategy:', error)
    return NextResponse.json({ success: false, error: 'Failed to update strategy' }, { status: 500 })
  }
}

// DELETE - Delete a strategy
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'Strategy ID required' }, { status: 400 })
    }

    const existingStrategy = await prisma.userStrategy.findUnique({
      where: { id }
    })

    if (!existingStrategy || existingStrategy.userId !== user.id) {
      return NextResponse.json({ success: false, error: 'Strategy not found' }, { status: 404 })
    }

    await prisma.userStrategy.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting strategy:', error)
    return NextResponse.json({ success: false, error: 'Failed to delete strategy' }, { status: 500 })
  }
}
