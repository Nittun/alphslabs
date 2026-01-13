import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// Force dynamic - prevent static generation
export const dynamic = 'force-dynamic'

// GET - Get or create user from session
export async function GET(request) {
  try {
    if (!prisma) {
      console.log('[API/user] Prisma not initialized - DATABASE_URL missing')
      return NextResponse.json({ success: false, error: 'Database not configured', user: null })
    }

    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find or create user
    let user = null
    try {
      user = await prisma.user.findUnique({
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
    } catch (findError) {
      console.error('[API/user] Error finding user:', findError.message)
      // If the query fails (e.g., missing columns), try a simpler query
      user = await prisma.user.findUnique({
        where: { email: session.user.email }
      })
    }

    if (!user) {
      try {
        user = await prisma.user.create({
          data: {
            email: session.user.email,
            name: session.user.name,
            image: session.user.image,
            role: 'user' // Default role for new users
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
      } catch (createError) {
        console.error('[API/user] Error creating user with role:', createError.message)
        // Fallback: create user without new fields (for schema compatibility)
        user = await prisma.user.create({
          data: {
            email: session.user.email,
            name: session.user.name,
            image: session.user.image
          }
        })
      }
    }

    // Ensure role is returned (default to 'user' if not in DB)
    const userWithDefaults = {
      ...user,
      role: user.role || 'user'
    }

    return NextResponse.json({ success: true, user: userWithDefaults })
  } catch (error) {
    console.error('[API/user] Error:', error.message, error.code)
    return NextResponse.json({ 
      success: false, 
      error: `Database error: ${error.message}`,
      code: error.code || 'UNKNOWN'
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

