import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// GET - Get or create user from session
export async function GET(request) {
  try {
    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured', user: null })
    }

    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        backtestConfigs: {
          orderBy: { updatedAt: 'desc' },
          take: 10
        },
        _count: {
          select: {
            backtestRuns: true,
            loginHistory: true
          }
        }
      }
    })

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: session.user.email,
          name: session.user.name,
          image: session.user.image
        },
        include: {
          backtestConfigs: true,
          _count: {
            select: {
              backtestRuns: true,
              loginHistory: true
            }
          }
        }
      })
    }

    return NextResponse.json({ success: true, user })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Database connection error. Make sure DATABASE_URL is configured.' 
    }, { status: 500 })
  }
}

// PUT - Update user profile
export async function PUT(request) {
  try {
    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await request.json()
    
    // Build update object with only provided fields
    const updateData = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.firstName !== undefined) updateData.firstName = data.firstName
    if (data.lastName !== undefined) updateData.lastName = data.lastName
    if (data.bio !== undefined) updateData.bio = data.bio
    if (data.image !== undefined) updateData.image = data.image

    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: updateData
    })

    return NextResponse.json({ success: true, user })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

