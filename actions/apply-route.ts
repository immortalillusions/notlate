'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { getValidAccessToken } from '@/lib/google-token'
import {
  createCalendarEvent,
  updateCalendarEvent,
  getEvent as getCalendarEvent,
} from '@/lib/google-calendar'
import type { GCalEvent } from '@/lib/google-calendar'
import {
  buildTravelBlockTitle,
  buildTravelBlockDescription,
} from '@/lib/travel-block'
import { fetchWeather } from '@/lib/weather'
import type { RouteAlternative } from '@/lib/supabase-types'
import type { TravelMode } from '@/lib/directions'

const routeSchema = z.object({
  durationSeconds: z.number(),
  departureTime: z.string(),
  arrivalTime: z.string(),
  routeSummary: z.string(),
  steps: z.array(
    z.object({
      type: z.enum(['transit', 'walk', 'drive']),
      description: z.string(),
      durationSeconds: z.number(),
      departureTime: z.string().optional(),
      transitLine: z.string().optional(),
    })
  ),
  endLocation: z.object({ lat: z.number(), lng: z.number() }),
})

const schema = z.object({
  gcal_event_id: z.string().min(1),
  event_title: z.string(),
  event_start: z.string(),
  departure_location: z.string(),
  travel_mode: z.enum(['driving', 'transit', 'walking']),
  buffer_minutes: z.coerce.number().int(),
  reminder_minutes: z.coerce.number().int(),
  route: routeSchema,
})

export type ApplyRouteState = { error?: string; success?: boolean } | null

export async function applyRoute(
  _prev: ApplyRouteState,
  formData: FormData
): Promise<ApplyRouteState> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Not authenticated' }

  let routeJson: unknown
  try {
    routeJson = JSON.parse(formData.get('route') as string)
  } catch {
    return { error: 'Invalid route data' }
  }

  const parsed = schema.safeParse({
    gcal_event_id: formData.get('gcal_event_id'),
    event_title: formData.get('event_title'),
    event_start: formData.get('event_start'),
    departure_location: formData.get('departure_location'),
    travel_mode: formData.get('travel_mode'),
    buffer_minutes: formData.get('buffer_minutes'),
    reminder_minutes: formData.get('reminder_minutes'),
    route: routeJson,
  })

  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const {
    gcal_event_id,
    event_title,
    event_start,
    departure_location,
    travel_mode,
    buffer_minutes,
    // reminder_minutes intentionally unused — apply-route must not change reminders
    route: routeData,
  } = parsed.data

  const arrivalTime = new Date(routeData.arrivalTime)
  const route: RouteAlternative = {
    ...routeData,
    departureTime: new Date(routeData.departureTime),
    arrivalTime,
    steps: routeData.steps.map((s) => ({
      ...s,
      departureTime: s.departureTime ? new Date(s.departureTime) : undefined,
    })),
  }

  // Prefer the authoritative event data fetched from Google so Apply Route
  // uses the same start.dateTime and start.timeZone as Refresh/process-event.
  const accessToken = await getValidAccessToken(session.user.id)
  const gcalEvent = await getCalendarEvent(accessToken, gcal_event_id).catch(() => null)
  const eventStartStr = gcalEvent?.start?.dateTime ?? event_start
  const eventStart = new Date(eventStartStr)
  const leaveByTime = new Date(route.arrivalTime.getTime() - route.durationSeconds * 1000)

  // Fetch weather
  const weather = await fetchWeather(
    route.endLocation.lat,
    route.endLocation.lng,
    eventStart
  )

  // Determine final timezone: prefer explicit timezone from the calendar
  // event (when fetched), then client-provided IANA timezone, then derive
  // an Etc/GMT fallback from the ISO offset so formatting matches Refresh.
  const clientTz = (formData.get('event_time_zone') as string) || undefined
  const calendarTz = (gcalEvent as GCalEvent | null)?.start?.timeZone
  const tzMatch = eventStartStr.match(/([+-])(\d{2}):\d{2}$/)
  const derivedEtc = tzMatch
    ? tzMatch[2] === '00'
      ? 'UTC'
      : `Etc/GMT${tzMatch[1] === '+' ? '-' : '+'}${parseInt(tzMatch[2], 10)}`
    : undefined
  const finalTimeZone = calendarTz || clientTz || derivedEtc

  // Use the actual leaveByTime that we'll send to Google Calendar and format
  // it with the same timezone. This ensures the "Leave by" shown in the
  // travel block title matches the calendar event time.
  // If the chosen route contains transit steps, prefer showing the transit
  // emoji in the title even if the override's travel_mode differs. This fixes
  // cases where the UI sent a mismatched travel_mode but the route itself is transit.
  const displayMode: TravelMode = route.steps.some((s) => s.type === 'transit') ? 'transit' : travel_mode
  const title = buildTravelBlockTitle(leaveByTime, event_title, displayMode, finalTimeZone)
  const description = buildTravelBlockDescription(
    route,
    weather ?? null,
    leaveByTime,
    false,
    finalTimeZone,
    departure_location || undefined
  )

  // Load existing override to find travel block ID
  const { data: override } = await supabase
    .from('event_overrides')
    .select('travel_block_gcal_id, reminder_minutes')
    .eq('user_id', session.user.id)
    .eq('gcal_event_id', gcal_event_id)
    .maybeSingle()

  let travelBlockId = override?.travel_block_gcal_id

  // If a travel block ID exists in our DB, verify the event still exists in
  // the user's calendar. If it was manually deleted, clear the stored id so
  // we create a fresh travel block (prevents silent no-op when user deleted it).
  if (travelBlockId) {
    const existingTravel = await getCalendarEvent(accessToken, travelBlockId).catch(() => null)
    // Treat cancelled events as effectively deleted so we regenerate them
    const travelExists = !!existingTravel && existingTravel.status !== 'cancelled'
    if (!travelExists) {
      travelBlockId = undefined
      // Clear stored id immediately to avoid races if user clicks again.
      const { error: updateError } = await supabase
        .from('event_overrides')
        .update({ travel_block_gcal_id: null, updated_at: new Date().toISOString() })
        .match({ user_id: session.user.id, gcal_event_id })

      if (updateError) {
        // If update failed for any reason, remove the row to guarantee a
        // clean state — we'll recreate the override after creating the travel block.
        await supabase.from('event_overrides').delete().match({ user_id: session.user.id, gcal_event_id })
      }
    }
  }

  // Preserve reminder behavior: apply-route must NOT modify reminders.
  // If an override already specified reminder_minutes, leave the travel
  // block's reminders untouched. When creating a new travel block via
  // apply-route, do not set reminderMinutes so we don't change a reminder
  // unintentionally (reminders are only set on initial auto-creation or
  // via the explicit "Update reminder" action).
  if (travelBlockId) {
    await updateCalendarEvent(accessToken, travelBlockId, {
      summary: title,
      description,
      start: leaveByTime,
      end: route.arrivalTime,
      // do not include reminderMinutes here
      timeZone: finalTimeZone,
    })
  } else {
    travelBlockId = await createCalendarEvent(accessToken, {
      summary: title,
      description,
      start: leaveByTime,
      end: route.arrivalTime,
      // do not include reminderMinutes here
      timeZone: finalTimeZone,
    })
  }

  // Upsert overrides but DO NOT overwrite reminder_minutes here — reminders
  // are only changed via explicit user action or initial auto-creation.
  const upsertPayload: Record<string, unknown> = {
    user_id: session.user.id,
    gcal_event_id,
    departure_location,
    travel_mode,
    buffer_minutes,
    travel_block_gcal_id: travelBlockId,
    last_event_start: eventStart.toISOString(),
    updated_at: new Date().toISOString(),
  }
  const { data: upsertData, error: upsertError } = await supabase.from('event_overrides').upsert(
    upsertPayload,
    { onConflict: 'user_id,gcal_event_id' }
  )
  console.log('applyRoute: supabase upsert result:', { upsertData, upsertError })

  revalidatePath('/dashboard')
  return { success: true }
}
