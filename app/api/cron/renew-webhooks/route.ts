import type { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { registerWebhook } from '@/lib/webhook'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: channels } = await supabase
    .from('watch_channels')
    .select('*')

  const results: { userId: string; status: string }[] = []

  for (const channel of channels ?? []) {
    const expiresAt = new Date(channel.expiration).getTime()
    const daysRemaining = (expiresAt - Date.now()) / (1000 * 60 * 60 * 24)

    // Renew if expiring within 3 days
    if (daysRemaining > 3) {
      results.push({ userId: channel.user_id, status: 'skipped (not expiring soon)' })
      continue
    }

    try {
      await registerWebhook(channel.user_id)
      results.push({ userId: channel.user_id, status: 'renewed' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ userId: channel.user_id, status: `error: ${message}` })
    }
  }

  return Response.json({ results })
}
