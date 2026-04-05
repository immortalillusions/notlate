import type { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getValidAccessToken } from '@/lib/google-token'
import { getEvent, deleteCalendarEvent } from '@/lib/google-calendar'
import { processEvent } from '@/lib/process-event'
import type { User } from '@/lib/supabase-types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // Only process users with active webhook subscriptions who have opted in to daily refresh
  const { data: channels } = await supabase
    .from('watch_channels')
    .select('user_id')

  const subscribedUserIds = [...new Set((channels ?? []).map((c) => c.user_id as string))]

  const { data: optedInUsers } = await supabase
    .from('users')
    .select('id')
    .in('id', subscribedUserIds)
    .eq('daily_refresh_enabled', true)

  const userIds = (optedInUsers ?? []).map((u) => u.id as string)

  const results: { userId: string; eventId: string; status: string }[] = []

  for (const userId of userIds) {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single<User>()

    if (!user) continue

    // Use the calendar_events cache to find events in the next 24h with a location
    const { data: cachedEvents } = await supabase
      .from('calendar_events')
      .select('gcal_event_id')
      .eq('user_id', userId)
      .not('location', 'is', null)
      .gte('start_at', now.toISOString())
      .lte('start_at', in24h.toISOString())

    if (!cachedEvents?.length) continue

    let accessToken: string
    try {
      accessToken = await getValidAccessToken(userId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      for (const ev of cachedEvents) {
        results.push({ userId, eventId: ev.gcal_event_id, status: `token error: ${message}` })
      }
      continue
    }

    for (const { gcal_event_id } of cachedEvents) {
      try {
        const event = await getEvent(accessToken, gcal_event_id)

        if (!event) {
          const { data: ov } = await supabase
            .from('event_overrides')
            .select('travel_block_gcal_id')
            .eq('user_id', userId)
            .eq('gcal_event_id', gcal_event_id)
            .maybeSingle()

          if (ov?.travel_block_gcal_id) {
            await deleteCalendarEvent(accessToken, ov.travel_block_gcal_id).catch(() => {})
          }

          await supabase
            .from('event_overrides')
            .delete()
            .eq('user_id', userId)
            .eq('gcal_event_id', gcal_event_id)

          results.push({ userId, eventId: gcal_event_id, status: 'skipped (event deleted)' })
          continue
        }

        if (!event.location) {
          results.push({ userId, eventId: gcal_event_id, status: 'skipped (no location)' })
          continue
        }

        // If travel block was manually deleted, clear its id so processEvent recreates it
        const { data: ovBefore } = await supabase
          .from('event_overrides')
          .select('travel_block_gcal_id')
          .eq('user_id', userId)
          .eq('gcal_event_id', gcal_event_id)
          .maybeSingle()

        if (ovBefore?.travel_block_gcal_id) {
          try {
            const tbEvent = await getEvent(accessToken, ovBefore.travel_block_gcal_id)
            const tbExists = !!tbEvent && (tbEvent.status ?? '') !== 'cancelled'
            if (!tbExists) {
              const { error } = await supabase
                .from('event_overrides')
                .update({ travel_block_gcal_id: null, updated_at: new Date().toISOString() })
                .match({ user_id: userId, gcal_event_id })
              if (error) {
                await supabase
                  .from('event_overrides')
                  .delete()
                  .match({ user_id: userId, gcal_event_id })
              }
            }
          } catch {
            // ignore travel block check errors
          }
        }

        await processEvent(event, user, accessToken, false)
        results.push({ userId, eventId: gcal_event_id, status: 'refreshed' })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        results.push({ userId, eventId: gcal_event_id, status: `error: ${message}` })
      }
    }
  }

  return Response.json({ results })
}
