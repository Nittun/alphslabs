import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Fetch all feedback (admin only)
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (prisma) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { role: true }
      })
      
      if (user?.role !== 'admin') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
      }
    }

    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // 'unread', 'read', 'replied', 'archived', or null for all
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where = status ? { status } : {}

    const [feedback, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.feedback.count({ where })
    ])

    // Count by status
    const statusCounts = await prisma.feedback.groupBy({
      by: ['status'],
      _count: { status: true }
    })

    const counts = {
      unread: 0,
      read: 0,
      replied: 0,
      archived: 0,
      total: 0
    }

    statusCounts.forEach(s => {
      counts[s.status] = s._count.status
      counts.total += s._count.status
    })

    return NextResponse.json({
      success: true,
      feedback,
      total,
      counts
    })

  } catch (error) {
    console.error('Error fetching feedback:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch feedback' },
      { status: 500 }
    )
  }
}

// PATCH - Update feedback status (admin only)
export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (prisma) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { role: true }
      })
      
      if (user?.role !== 'admin') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
      }
    }

    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    const body = await request.json()
    const { id, status, adminNotes, priority } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'Feedback ID required' }, { status: 400 })
    }

    const updateData = {}
    if (status) updateData.status = status
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes
    if (priority) updateData.priority = priority
    if (status === 'replied') {
      updateData.repliedAt = new Date()
      updateData.repliedBy = session.user.email
    }

    const updated = await prisma.feedback.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json({ success: true, feedback: updated })

  } catch (error) {
    console.error('Error updating feedback:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update feedback' },
      { status: 500 }
    )
  }
}

// DELETE - Delete feedback (admin only)
export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (prisma) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { role: true }
      })
      
      if (user?.role !== 'admin') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
      }
    }

    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: 'Feedback ID required' }, { status: 400 })
    }

    await prisma.feedback.delete({ where: { id } })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error deleting feedback:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete feedback' },
      { status: 500 }
    )
  }
}
