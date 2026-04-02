import type { NextRequest } from 'next/server'
import { renewWebhooksForAllUsers } from '@/lib/webhook'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await renewWebhooksForAllUsers()
    return Response.json({ success: true, renewedAt: new Date().toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Renewal failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
