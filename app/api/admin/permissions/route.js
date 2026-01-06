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

// GET - Get current page permissions
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

    // Get permissions from defaultConfig or return defaults
    const session = await getServerSession(authOptions)
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { defaultConfig: true }
    })

    const config = user?.defaultConfig || {}
    const permissions = config.pagePermissions || {
      user: {
        'backtest': true,
        'optimize': true,
        'current-position': true,
        'profile': true,
        'connections': true,
        'settings': true,
        'help': true,
        'admin': false
      },
      moderator: {
        'backtest': true,
        'optimize': true,
        'current-position': true,
        'profile': true,
        'connections': true,
        'settings': true,
        'help': true,
        'admin': false
      },
      admin: {
        'backtest': true,
        'optimize': true,
        'current-position': true,
        'profile': true,
        'connections': true,
        'settings': true,
        'help': true,
        'admin': true
      }
    }

    return NextResponse.json({ success: true, permissions })
  } catch (error) {
    console.error('Error fetching permissions:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Database connection error' 
    }, { status: 500 })
  }
}

// POST - Update page permissions
export async function POST(request) {
  try {
    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    // Check if user is admin
    const isAdmin = await isAdminUser()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    const { permissions } = await request.json()

    if (!permissions) {
      return NextResponse.json({ error: 'Permissions data is required' }, { status: 400 })
    }

    // Store permissions in a system config (using the primary admin's defaultConfig)
    const session = await getServerSession(authOptions)
    const adminUser = await prisma.user.findUnique({
      where: { id: ADMIN_USER_ID },
      select: { defaultConfig: true }
    })

    const existingConfig = adminUser?.defaultConfig || {}
    const updatedConfig = {
      ...existingConfig,
      pagePermissions: permissions,
      permissionsUpdatedAt: new Date().toISOString()
    }

    // Update primary admin's config to store system-wide permissions
    await prisma.user.update({
      where: { id: ADMIN_USER_ID },
      data: { defaultConfig: updatedConfig }
    })

    return NextResponse.json({ success: true, permissions })
  } catch (error) {
    console.error('Error saving permissions:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Database connection error' 
    }, { status: 500 })
  }
}

