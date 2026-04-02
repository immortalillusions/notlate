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

export async function processEvent(
  event: GCalEvent,
  user: User,
  accessToken: string,
  isEventMoved = false
): Promise<void> {
  if (!event.location) return

  const eventStart = new Date(event.start.dateTime)

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
  const title = buildTravelBlockTitle(leaveByTime, event.summary)
  const description = buildTravelBlockDescription(route, weather, isEventMoved)

  const existingBlockId = override?.travel_block_gcal_id

  let travelBlockId = existingBlockId

  if (existingBlockId) {
    await updateCalendarEvent(accessToken, existingBlockId, {
      summary: title,
      description,
      start: leaveByTime,
      end: eventStart,
      ...(isEventMoved ? {} : { reminderMinutes }),
    })
  } else {
    travelBlockId = await createCalendarEvent(accessToken, {
      summary: title,
      description,
      start: leaveByTime,
      end: eventStart,
      reminderMinutes,
    })
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
}
