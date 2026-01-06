import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// Force dynamic - prevent static generation
export const dynamic = 'force-dynamic'

// POST - Record a new login
export async function POST(request) {
  try {
    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { ipAddress, userAgent, provider } = await request.json()

    // Get or create user
    let user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: session.user.email,
          name: session.user.name,
          image: session.user.image,
          role: 'user' // Default role for new users
        }
      })
    }

    // Record login
    const loginRecord = await prisma.loginHistory.create({
      data: {
        userId: user.id,
        ipAddress,
        userAgent,
        provider: provider || 'google'
      }
    })

    return NextResponse.json({ success: true, loginRecord })
  } catch (error) {
    console.error('Error recording login:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Database connection error' 
    }, { status: 500 })
  }
}

// GET - Get login history for current user
export async function GET(request) {
  try {
    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured', loginHistory: [] })
    }

    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ success: true, loginHistory: [] })
    }

    const loginHistory = await prisma.loginHistory.findMany({
      where: { userId: user.id },
      orderBy: { loginAt: 'desc' },
      take: 50
    })

    return NextResponse.json({ success: true, loginHistory })
  } catch (error) {
    console.error('Error fetching login history:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Database connection error' 
    }, { status: 500 })
  }
}

