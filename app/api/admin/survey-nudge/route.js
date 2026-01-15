import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ADMIN_USER_ID = 'cmjzbir7y0000eybbir608elt'

async function requireAdmin() {
  if (!prisma) return { ok: false, status: 503, error: 'Database not configured' }
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return { ok: false, status: 401, error: 'Unauthorized' }

  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true, role: true } })
  const isAdmin = user && (user.id === ADMIN_USER_ID || user.role === 'admin')
  if (!isAdmin) return { ok: false, status: 403, error: 'Admin access required' }
  return { ok: true }
}

const DEFAULT_NUDGE = {
  enabled: true,
  message: 'After exploring the site please share your thought on the project',
  version: 1
}

export async function GET() {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })

    const adminUser = await prisma.user.findUnique({
      where: { id: ADMIN_USER_ID },
      select: { defaultConfig: true }
    })
    const cfg = adminUser?.defaultConfig || {}
    const surveyNudge = cfg.surveyNudge || DEFAULT_NUDGE

    return NextResponse.json({ success: true, surveyNudge })
  } catch (e) {
    console.error('Error fetching survey nudge settings:', e)
    return NextResponse.json({ success: false, error: 'Failed to fetch survey nudge settings' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })

    const body = await request.json()
    const incoming = body?.surveyNudge || {}
    const bumpVersion = !!body?.bumpVersion

    const adminUser = await prisma.user.findUnique({
      where: { id: ADMIN_USER_ID },
      select: { defaultConfig: true }
    })
    const existingConfig = adminUser?.defaultConfig || {}
    const current = existingConfig.surveyNudge || DEFAULT_NUDGE

    const next = {
      enabled: incoming.enabled !== undefined ? !!incoming.enabled : !!current.enabled,
      message: typeof incoming.message === 'string' ? incoming.message.slice(0, 240) : (current.message || DEFAULT_NUDGE.message),
      version: Number.isFinite(Number(current.version)) ? Number(current.version) : DEFAULT_NUDGE.version
    }

    // Bump version either explicitly or whenever message/enabled changes (so new config shows once)
    const changed = next.enabled !== current.enabled || next.message !== current.message
    if (bumpVersion || changed) {
      next.version = (Number.isFinite(Number(next.version)) ? Number(next.version) : 1) + 1
    }

    const updatedConfig = {
      ...existingConfig,
      surveyNudge: next,
      surveyNudgeUpdatedAt: new Date().toISOString()
    }

    await prisma.user.update({
      where: { id: ADMIN_USER_ID },
      data: { defaultConfig: updatedConfig }
    })

    return NextResponse.json({ success: true, surveyNudge: next })
  } catch (e) {
    console.error('Error saving survey nudge settings:', e)
    return NextResponse.json({ success: false, error: 'Failed to save survey nudge settings' }, { status: 500 })
  }
}

