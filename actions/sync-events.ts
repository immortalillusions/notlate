'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { getValidAccessToken } from '@/lib/google-token'
import { listUpcomingEventsWithLocation } from '@/lib/google-calendar'

export type SyncState = { error?: string; success?: boolean } | null

export async function syncCalendarEvents(_prev: SyncState): Promise<SyncState> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { error: 'Not authenticated' }

  try {
    const accessToken = await getValidAccessToken(userId)
    const events = await listUpcomingEventsWithLocation(accessToken)

    if (events.length > 0) {
      await supabase.from('calendar_events').upsert(
        events.map((e) => ({
          user_id: userId,
          gcal_event_id: e.id,
          summary: e.summary ?? '',
          location: e.location ?? null,
          description: e.description ?? null,
          start_at: e.start.dateTime,
          end_at: e.end.dateTime,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'user_id,gcal_event_id' }
      )
    }

    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sync failed' }
  }
}
