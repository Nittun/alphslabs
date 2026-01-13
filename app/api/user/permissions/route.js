import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// Force dynamic - prevent static generation
export const dynamic = 'force-dynamic'

const ADMIN_USER_ID = 'cmjzbir7y0000eybbir608elt'

// Default permissions if none are configured
const DEFAULT_PERMISSIONS = {
  user: {
    'backtest': true,
    'optimize': true,
    'optimize-new': true,
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
    'optimize-new': true,
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
    'optimize-new': true,
    'current-position': true,
    'profile': true,
    'connections': true,
    'settings': true,
    'help': true,
    'admin': true
  }
}

// GET - Get page permissions for current user based on their role
export async function GET(request) {
  try {
    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, role: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Determine user's role (default to 'user' if not set)
    const userRole = (user.role || 'user').toLowerCase()
    const isAdmin = user.id === ADMIN_USER_ID || userRole === 'admin'

    // Get system-wide permissions from primary admin's config
    let systemPermissions = null
    try {
      const adminUser = await prisma.user.findUnique({
        where: { id: ADMIN_USER_ID },
        select: { defaultConfig: true }
      })
      
      if (adminUser?.defaultConfig?.pagePermissions) {
        systemPermissions = adminUser.defaultConfig.pagePermissions
      }
    } catch (e) {
      console.error('Error fetching admin permissions:', e)
    }

    // Get permissions for this user's role
    let rolePermissions
    if (systemPermissions && systemPermissions[userRole]) {
      rolePermissions = systemPermissions[userRole]
    } else if (systemPermissions && systemPermissions['user']) {
      // Fallback to user permissions if role not found
      rolePermissions = systemPermissions['user']
    } else {
      // Use defaults
      rolePermissions = DEFAULT_PERMISSIONS[userRole] || DEFAULT_PERMISSIONS['user']
    }

    // Admins always have access to everything
    if (isAdmin) {
      rolePermissions = { ...rolePermissions, admin: true }
    }

    return NextResponse.json({ 
      success: true, 
      permissions: rolePermissions,
      role: userRole,
      isAdmin
    })
  } catch (error) {
    console.error('Error fetching user permissions:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch permissions' 
    }, { status: 500 })
  }
}
