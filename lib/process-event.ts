/**
 * Shared logic for auto-creating/updating travel blocks.
 * Called by the webhook receiver and the manual Refresh endpoint.
 */
import { supabase } from '@/lib/supabase'
import { fetchDirections, DirectionsNoRouteError, type TravelMode } from '@/lib/directions'
import { fetchWeather } from '@/lib/weather'
import { estimatePrepMinutes } from '@/lib/gemini'
import {
  buildTravelBlockTitle,
  buildTravelBlockDescription,
  computeLeaveByTime,
} from '@/lib/travel-block'
import {
  createCalendarEvent,
  updateCalendarEvent,
} from '@/lib/google-calendar'
import type { GCalEvent } from '@/lib/google-calendar'
import type { User } from '@/lib/supabase-types'

/**
 * Derives an Etc/GMT±X timezone from the UTC offset in an ISO 8601 string.
 * Used as a fallback when event.start.timeZone is absent (calendar default tz).
 * Note: Etc/GMT signs are inverted vs ISO offsets (Etc/GMT+4 = UTC-4).
 */
function isoOffsetToEtcTimezone(dateTimeStr: string): string | undefined {
  const match = dateTimeStr.match(/([+-])(\d{2}):\d{2}$/)
  if (!match) return undefined
  const hours = parseInt(match[2])
  if (hours === 0) return 'UTC'
  const etcSign = match[1] === '+' ? '-' : '+'
  return `Etc/GMT${etcSign}${hours}`
}

export async function processEvent(
  event: GCalEvent,
  user: User,
  accessToken: string,
  isEventMoved = false
): Promise<{ created?: boolean; updated?: boolean; travelBlockId?: string } | void> {
  if (!event.location) return

  const eventStart = new Date(event.start.dateTime)
  // Prefer the explicit IANA timezone from the event; fall back to deriving a
  // display timezone from the UTC offset in the dateTime string so times are
  // shown in the event's local time even on a UTC server (e.g. Vercel).
  const eventTimeZone = event.start.timeZone ?? isoOffsetToEtcTimezone(event.start.dateTime)

  // Load existing override (if any)
  const { data: override } = await supabase
    .from('event_overrides')
    .select('*')
    .eq('user_id', user.id)
    .eq('gcal_event_id', event.id)
    .maybeSingle()

  const departure = override?.departure_location ?? user.default_departure
  const mode = (override?.travel_mode ?? user.default_travel_mode) as TravelMode
  const buffer = override?.buffer_minutes ?? user.default_buffer_minutes

  if (!departure) {
    console.warn(`No departure location for user ${user.id} — skipping event ${event.id}`)
    return
  }

  // Arrival time = event start minus buffer
  const arrivalTime = new Date(eventStart.getTime() - buffer * 60 * 1000)

  // Fetch directions — handle "no route" case gracefully
  let routes: Awaited<ReturnType<typeof fetchDirections>>
  try {
    routes = await fetchDirections({
      origin: departure,
      destination: event.location,
      arrivalTime,
      mode,
    })
  } catch (err) {
    if (err instanceof DirectionsNoRouteError) {
      // Store error so the dashboard can show it; don't touch any GCal travel block
      await supabase.from('event_overrides').upsert(
        {
          user_id: user.id,
          gcal_event_id: event.id,
          directions_error: 'Route too far or not found — no travel block created.',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,gcal_event_id' }
      )
      return
    }
    throw err
  }

  if (!routes.length) return
  const route = routes[0]

  // Fetch weather using lat/lng from the directions response
  const weather = await fetchWeather(
    route.endLocation.lat,
    route.endLocation.lng,
    eventStart
  )

  // Estimate reminder time
  let reminderMinutes = override?.reminder_minutes ?? user.fixed_reminder_minutes

  if (user.reminder_mode === 'ai' && user.onboarding_answers) {
    const titleChanged = event.summary !== override?.last_gemini_title
    const descChanged = (event.description ?? '') !== (override?.last_gemini_description ?? '')

    if (!override || titleChanged || descChanged) {
      const aiMinutes = await estimatePrepMinutes(
        event.summary,
        event.description ?? '',
        user.onboarding_answers
      )
      if (aiMinutes !== -1) reminderMinutes = aiMinutes
    }
  }

  const leaveByTime = computeLeaveByTime(eventStart, route.durationSeconds, buffer)
  const title = buildTravelBlockTitle(leaveByTime, event.summary, mode, eventTimeZone)
  const description = buildTravelBlockDescription(route, weather, leaveByTime, isEventMoved, eventTimeZone, departure)

  const existingBlockId = override?.travel_block_gcal_id

  let travelBlockId = existingBlockId

  if (existingBlockId) {
    await updateCalendarEvent(accessToken, existingBlockId, {
      summary: title,
      description,
      start: leaveByTime,
      end: eventStart,
      ...(isEventMoved ? {} : { reminderMinutes }),
      timeZone: eventTimeZone,
    })
    console.log(`Updated travel block ${existingBlockId} for event ${event.id}`)
    // Upsert event_override later as usual
  } else {
    travelBlockId = await createCalendarEvent(accessToken, {
      summary: title,
      description,
      start: leaveByTime,
      end: eventStart,
      reminderMinutes,
      timeZone: eventTimeZone,
    })
    console.log(`Created travel block ${travelBlockId} for event ${event.id}`)
  }

  // Upsert event_override — clear any previous directions_error on success
  const upsertData: Record<string, unknown> = {
    user_id: user.id,
    gcal_event_id: event.id,
    travel_block_gcal_id: travelBlockId,
    last_event_start: eventStart.toISOString(),
    directions_error: null,
    updated_at: new Date().toISOString(),
  }

  if (user.reminder_mode === 'ai' && user.onboarding_answers) {
    upsertData.last_gemini_title = event.summary
    upsertData.last_gemini_description = event.description ?? ''
    upsertData.reminder_minutes = reminderMinutes
  }

  await supabase
    .from('event_overrides')
    .upsert(upsertData, { onConflict: 'user_id,gcal_event_id' })
  // Return a small result for callers to know what happened
  if (existingBlockId) return { updated: true, travelBlockId }
  return { created: true, travelBlockId }
}
