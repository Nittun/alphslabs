import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ALLOWED_EVENTS = new Set(['landing_visit', 'landing_launch_click'])

export async function POST(request) {
  try {
    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const event = body?.event
    const metadata = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {}

    if (!event || !ALLOWED_EVENTS.has(event)) {
      return NextResponse.json({ success: false, error: 'Invalid event' }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    const userId = session?.user?.id || null
    const forwardedFor = request.headers.get('x-forwarded-for')
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0] : null
    const userAgent = request.headers.get('user-agent')
    const referrer = request.headers.get('referer')

    await prisma.featureUsage.create({
      data: {
        feature: event,
        userId,
        metadata: {
          ...metadata,
          referrer,
          userAgent,
          ipAddress
        }
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API/track] POST error:', error)
    return NextResponse.json({ success: false, error: 'Failed to track event' }, { status: 500 })
  }
}
