import type { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { getValidAccessToken } from '@/lib/google-token'
import { listUpcomingEventsWithLocation, deleteCalendarEvent } from '@/lib/google-calendar'
import { processEvent } from '@/lib/process-event'
import type { User } from '@/lib/supabase-types'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const channelId = request.headers.get('x-goog-channel-id')
  const resourceState = request.headers.get('x-goog-resource-state')

  // 'sync' fires immediately on registration; 'exists' fires on changes.
  // Both are valid — we handle them the same way.
  if (resourceState !== 'sync' && resourceState !== 'exists') {
    return new Response(null, { status: 200 })
  }

  if (!channelId) return new Response(null, { status: 400 })

  const { data: channel } = await supabase
    .from('watch_channels')
    .select('user_id')
    .eq('channel_id', channelId)
    .maybeSingle()

  if (!channel) return new Response(null, { status: 200 })

  const { user_id } = channel

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', user_id)
    .single<User>()

  if (!user) return new Response(null, { status: 200 })

  try {
    const accessToken = await getValidAccessToken(user_id)

    // ── Snapshot previous cache BEFORE overwriting ───────────────────────────
    // We compare location and start_at against this to decide whether to call
    // the Directions API. Only events where those fields changed get processed.
    const { data: previousCache } = await supabase
      .from('calendar_events')
      .select('gcal_event_id, location, start_at, end_at')
      .eq('user_id', user_id)

    const prevMap = new Map(
      (previousCache ?? []).map((e) => [e.gcal_event_id, e])
    )

    // ── Fetch current events from Google Calendar ────────────────────────────
    // Only returns events that have a location set. Travel blocks (no location)
    // are excluded — this naturally prevents the feedback loop where updating a
    // travel block would re-trigger processing of the original event.
    const events = await listUpcomingEventsWithLocation(accessToken)
    const currentIds = new Set(events.map((e) => e.id))

    // ── Update calendar_events cache ─────────────────────────────────────────
    if (events.length > 0) {
      await supabase.from('calendar_events').upsert(
        events.map((e) => ({
          user_id,
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

    // Delete cache entries for events no longer returned (deleted / location removed)
    const prevIds = [...prevMap.keys()]
    const staleIds = prevIds.filter((id) => !currentIds.has(id))
    if (staleIds.length > 0) {
      await supabase
        .from('calendar_events')
        .delete()
        .eq('user_id', user_id)
        .in('gcal_event_id', staleIds)
    }

    // ── Clean up travel blocks for deleted/changed events ────────────────────
    const { data: overrides } = await supabase
      .from('event_overrides')
      .select('gcal_event_id, travel_block_gcal_id, last_event_start')
      .eq('user_id', user_id)

    const overrideMap = new Map(
      (overrides ?? []).map((o) => [o.gcal_event_id, o])
    )

    const nowMs = Date.now()
    for (const id of staleIds) {
      const override = overrideMap.get(id)
      const cached = prevMap.get(id)
      const eventPassed = cached?.end_at ? new Date(cached.end_at).getTime() < nowMs : false

      // Only delete the travel block from GCal if the event was deleted or its
      // location was removed — not if it simply ended (let it stay on the calendar).
      if (!eventPassed && override?.travel_block_gcal_id) {
        await deleteCalendarEvent(accessToken, override.travel_block_gcal_id).catch(() => {})
      }
      await supabase
        .from('event_overrides')
        .delete()
        .eq('user_id', user_id)
        .eq('gcal_event_id', id)
    }

    // ── Process only events whose location or start time changed ─────────────
    // This is the key guard: we only call processEvent (which calls the
    // Directions API) when the destination or departure time actually changed.
    // Title/description changes alone do NOT trigger a Directions API call.
    let anythingChanged = staleIds.length > 0
    for (const event of events) {
      const prev = prevMap.get(event.id)

      const locationChanged = !prev || prev.location !== (event.location ?? null)
      const startDeltaMs = prev
        ? Math.abs(new Date(prev.start_at).getTime() - new Date(event.start.dateTime).getTime())
        : Infinity
      const startChanged = startDeltaMs > 60_000

      if (!locationChanged && !startChanged) continue // nothing that affects travel changed

      anythingChanged = true
      const existing = overrideMap.get(event.id)
      const isEventMoved =
        !!existing?.last_event_start &&
        Math.abs(
          new Date(existing.last_event_start).getTime() -
            new Date(event.start.dateTime).getTime()
        ) > 60_000

      await processEvent(event, user, accessToken, isEventMoved)
    }

    if (anythingChanged) revalidatePath('/dashboard')
  } catch (err) {
    console.error('Webhook processing error:', err)
  }

  return new Response(null, { status: 200 })
}
