import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function clampRating(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const i = Math.round(n)
  if (i < 1 || i > 10) return null
  return i
}

export async function POST(request) {
  try {
    if (!prisma) {
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 503 })
    }

    const body = await request.json()

    const payload = {
      usefulRating: clampRating(body.usefulRating),
      uiRating: clampRating(body.uiRating),
      functionRating: clampRating(body.functionRating),
      featuresRating: clampRating(body.featuresRating),
      performanceRating: clampRating(body.performanceRating),
      overallRating: clampRating(body.overallRating),
      requestedFeatures: typeof body.requestedFeatures === 'string' ? body.requestedFeatures.slice(0, 5000) : null,
      additionalComments: typeof body.additionalComments === 'string' ? body.additionalComments.slice(0, 5000) : null,
      willingToPayAmount:
        body.willingToPayAmount === '' || body.willingToPayAmount === null || body.willingToPayAmount === undefined
          ? null
          : Number.isFinite(Number(body.willingToPayAmount))
            ? Math.max(0, Number(body.willingToPayAmount))
            : null,
      willingToPayCurrency: typeof body.willingToPayCurrency === 'string' ? body.willingToPayCurrency.slice(0, 8).toUpperCase() : 'USD',
    }

    const requiredKeys = [
      'usefulRating',
      'uiRating',
      'functionRating',
      'featuresRating',
      'performanceRating',
      'overallRating',
    ]
    for (const k of requiredKeys) {
      if (payload[k] === null) {
        return NextResponse.json({ success: false, error: `Invalid or missing rating: ${k}` }, { status: 400 })
      }
    }

    const session = await getServerSession(authOptions)
    const userEmail = session?.user?.email || null

    let userId = null
    if (userEmail) {
      try {
        const dbUser = await prisma.user.findUnique({
          where: { email: userEmail },
          select: { id: true }
        })
        userId = dbUser?.id || null
      } catch (e) {
        // Non-blocking
      }
    }

    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')?.[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null
    const userAgent = request.headers.get('user-agent') || null

    const created = await prisma.surveyResponse.create({
      data: {
        userId,
        userEmail,
        ...payload,
        ipAddress,
        userAgent,
      },
    })

    return NextResponse.json({ success: true, id: created.id })
  } catch (error) {
    console.error('Error saving survey response:', error)
    return NextResponse.json({ success: false, error: 'Failed to save survey response' }, { status: 500 })
  }
}

