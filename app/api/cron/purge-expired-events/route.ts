import type { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const nowIso = new Date().toISOString()

  // Delete expired events and return their IDs to clean up event_overrides.
  // Travel blocks are intentionally left on Google Calendar.
  const { data: expired, error } = await supabase
    .from('calendar_events')
    .delete()
    .lt('end_at', nowIso)
    .select('user_id, gcal_event_id')

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (expired && expired.length > 0) {
    // Group by user_id for efficient bulk deletes
    const byUser = new Map<string, string[]>()
    for (const row of expired) {
      const ids = byUser.get(row.user_id) ?? []
      ids.push(row.gcal_event_id)
      byUser.set(row.user_id, ids)
    }
    for (const [userId, ids] of byUser) {
      await supabase
        .from('event_overrides')
        .delete()
        .eq('user_id', userId)
        .in('gcal_event_id', ids)
    }
  }

  return Response.json({ purged: expired?.length ?? 0 })
}
