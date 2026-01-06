import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// Force dynamic - prevent static generation
export const dynamic = 'force-dynamic'

const ADMIN_USER_ID = 'cmjzbir7y0000eybbir608elt'

// Helper function to check if user is admin
async function isAdminUser() {
  if (!prisma) return false
  
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return false

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  return user && (user.id === ADMIN_USER_ID || user.role === 'admin')
}

// GET - Get all users (admin only)
export async function GET(request) {
  try {
    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    // Check if user is admin
    const isAdmin = await isAdminUser()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // Fetch all users with their statistics
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        image: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            backtestRuns: true,
            backtestConfigs: true,
            loginHistory: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Get last login for each user
    const usersWithLastLogin = await Promise.all(
      users.map(async (user) => {
        const lastLogin = await prisma.loginHistory.findFirst({
          where: { userId: user.id },
          orderBy: { loginAt: 'desc' },
          select: {
            loginAt: true,
            ipAddress: true,
            userAgent: true
          }
        })

        return {
          ...user,
          lastLogin: lastLogin?.loginAt || null,
          lastLoginIp: lastLogin?.ipAddress || null,
          lastLoginUserAgent: lastLogin?.userAgent || null
        }
      })
    )

    return NextResponse.json({ success: true, users: usersWithLastLogin })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Database connection error' 
    }, { status: 500 })
  }
}

// PATCH - Update user role (admin only)
export async function PATCH(request) {
  try {
    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    // Check if user is admin
    const isAdmin = await isAdminUser()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    const { userId, role } = await request.json()

    if (!userId || !role) {
      return NextResponse.json({ error: 'userId and role are required' }, { status: 400 })
    }

    if (!['user', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role. Must be "user" or "admin"' }, { status: 400 })
    }

    // Prevent changing the primary admin user's role
    if (userId === ADMIN_USER_ID && role !== 'admin') {
      return NextResponse.json({ 
        error: 'Cannot change role of primary admin user' 
      }, { status: 403 })
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    })

    return NextResponse.json({ success: true, user: updatedUser })
  } catch (error) {
    console.error('Error updating user role:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Database connection error' 
    }, { status: 500 })
  }
}

