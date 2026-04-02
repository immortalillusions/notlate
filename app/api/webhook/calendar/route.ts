import type { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getValidAccessToken } from '@/lib/google-token'
import { listUpcomingEventsWithLocation, deleteCalendarEvent } from '@/lib/google-calendar'
import { processEvent } from '@/lib/process-event'
import type { User } from '@/lib/supabase-types'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const channelId = request.headers.get('x-goog-channel-id')
  const resourceState = request.headers.get('x-goog-resource-state')

  // 'sync' fires when channel is first registered — acknowledge and ignore
  if (resourceState === 'sync') {
    return new Response(null, { status: 200 })
  }

  if (!channelId) {
    return new Response(null, { status: 400 })
  }

  // Look up user by channel ID
  const { data: channel } = await supabase
    .from('watch_channels')
    .select('user_id')
    .eq('channel_id', channelId)
    .maybeSingle()

  if (!channel) {
    // Unknown channel — acknowledge to stop retries
    return new Response(null, { status: 200 })
  }

  const { user_id } = channel

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', user_id)
    .single<User>()

  if (!user) return new Response(null, { status: 200 })

  try {
    const accessToken = await getValidAccessToken(user_id)

    // Fetch current events with locations
    const events = await listUpcomingEventsWithLocation(accessToken)
    const currentEventIds = new Set(events.map((e) => e.id))

    // Load all overrides for this user
    const { data: overrides } = await supabase
      .from('event_overrides')
      .select('gcal_event_id, travel_block_gcal_id, last_event_start')
      .eq('user_id', user_id)

    // Delete travel blocks for events that no longer exist or no longer have a location
    for (const override of overrides ?? []) {
      if (!currentEventIds.has(override.gcal_event_id)) {
        if (override.travel_block_gcal_id) {
          await deleteCalendarEvent(accessToken, override.travel_block_gcal_id).catch(() => {})
        }
        await supabase
          .from('event_overrides')
          .delete()
          .eq('user_id', user_id)
          .eq('gcal_event_id', override.gcal_event_id)
      }
    }

    // Process each event
    const overrideMap = new Map(
      (overrides ?? []).map((o) => [o.gcal_event_id, o])
    )

    for (const event of events) {
      const existing = overrideMap.get(event.id)
      const prevStart = existing?.last_event_start
        ? new Date(existing.last_event_start)
        : null
      const currentStart = new Date(event.start.dateTime)

      const isEventMoved =
        !!prevStart &&
        Math.abs(prevStart.getTime() - currentStart.getTime()) > 60_000

      await processEvent(event, user, accessToken, isEventMoved)
    }
  } catch (err) {
    console.error('Webhook processing error:', err)
    // Still return 200 so Google doesn't retry infinitely
  }

  return new Response(null, { status: 200 })
}
