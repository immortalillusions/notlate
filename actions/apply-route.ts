'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { getValidAccessToken } from '@/lib/google-token'
import {
  createCalendarEvent,
  updateCalendarEvent,
} from '@/lib/google-calendar'
import {
  buildTravelBlockTitle,
  buildTravelBlockDescription,
  computeLeaveByTime,
} from '@/lib/travel-block'
import { fetchWeather } from '@/lib/weather'
import type { RouteAlternative } from '@/lib/supabase-types'

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
    reminder_minutes,
    route: routeData,
  } = parsed.data

  const route: RouteAlternative = {
    ...routeData,
    departureTime: new Date(routeData.departureTime),
    arrivalTime: new Date(routeData.arrivalTime),
  }

  const eventStart = new Date(event_start)
  const leaveByTime = computeLeaveByTime(eventStart, route.durationSeconds, buffer_minutes)

  // Fetch weather
  const weather = await fetchWeather(
    route.endLocation.lat,
    route.endLocation.lng,
    eventStart
  )

  const title = buildTravelBlockTitle(leaveByTime, event_title)
  const description = buildTravelBlockDescription(route, weather)

  // Load existing override to find travel block ID
  const { data: override } = await supabase
    .from('event_overrides')
    .select('travel_block_gcal_id')
    .eq('user_id', session.user.id)
    .eq('gcal_event_id', gcal_event_id)
    .maybeSingle()

  const accessToken = await getValidAccessToken(session.user.id)
  let travelBlockId = override?.travel_block_gcal_id

  if (travelBlockId) {
    await updateCalendarEvent(accessToken, travelBlockId, {
      summary: title,
      description,
      start: leaveByTime,
      end: eventStart,
      reminderMinutes: reminder_minutes,
    })
  } else {
    travelBlockId = await createCalendarEvent(accessToken, {
      summary: title,
      description,
      start: leaveByTime,
      end: eventStart,
      reminderMinutes: reminder_minutes,
    })
  }

  await supabase.from('event_overrides').upsert(
    {
      user_id: session.user.id,
      gcal_event_id,
      departure_location,
      travel_mode,
      buffer_minutes,
      reminder_minutes,
      travel_block_gcal_id: travelBlockId,
      last_event_start: eventStart.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,gcal_event_id' }
  )

  revalidatePath('/dashboard')
  return { success: true }
}
