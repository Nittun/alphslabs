import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Fetch survey responses (admin only)
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
      select: { role: true }
    })

    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100')))
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0'))

    const [responses, total] = await Promise.all([
      prisma.surveyResponse.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.surveyResponse.count(),
    ])

    // Basic aggregates
    const avg = (rows, key) => {
      if (!rows.length) return null
      const sum = rows.reduce((acc, r) => acc + (r[key] || 0), 0)
      return sum / rows.length
    }

    const stats = {
      sampleSize: responses.length,
      overallAvg: avg(responses, 'overallRating'),
      usefulAvg: avg(responses, 'usefulRating'),
      uiAvg: avg(responses, 'uiRating'),
      functionAvg: avg(responses, 'functionRating'),
      featuresAvg: avg(responses, 'featuresRating'),
      performanceAvg: avg(responses, 'performanceRating'),
    }

    return NextResponse.json({ success: true, responses, total, stats })
  } catch (error) {
    console.error('Error fetching survey responses:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch survey responses' }, { status: 500 })
  }
}

