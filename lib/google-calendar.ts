export interface GCalEvent {
  id: string
  summary: string
  description?: string
  location?: string
  start: { dateTime: string; timeZone?: string }
  end: { dateTime: string; timeZone?: string }
  status?: string
}

interface CreateEventParams {
  summary: string
  description: string
  start: Date
  end: Date
  reminderMinutes: number
}

async function calendarFetch(
  accessToken: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const base = 'https://www.googleapis.com/calendar/v3'
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

export async function listUpcomingEventsWithLocation(
  accessToken: string
): Promise<GCalEvent[]> {
  const now = new Date().toISOString()
  const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const res = await calendarFetch(
    accessToken,
    `/calendars/primary/events?timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(thirtyDays)}&singleEvents=true&orderBy=startTime&maxResults=50`
  )

  if (!res.ok) throw new Error(`Calendar list error: ${res.status}`)

  const data = await res.json()
  const events: GCalEvent[] = data.items ?? []
  return events.filter((e) => e.location && e.start?.dateTime && e.status !== 'cancelled')
}

export async function getEvent(
  accessToken: string,
  eventId: string
): Promise<GCalEvent | null> {
  const res = await calendarFetch(accessToken, `/calendars/primary/events/${eventId}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Calendar get event error: ${res.status}`)
  return res.json()
}

export async function createCalendarEvent(
  accessToken: string,
  params: CreateEventParams
): Promise<string> {
  const body = {
    summary: params.summary,
    description: params.description,
    start: { dateTime: params.start.toISOString() },
    end: { dateTime: params.end.toISOString() },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: params.reminderMinutes }],
    },
  }

  const res = await calendarFetch(accessToken, '/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`Calendar create error: ${res.status}`)
  const data = await res.json()
  return data.id
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  params: Partial<CreateEventParams>
): Promise<void> {
  const body: Record<string, unknown> = {}

  if (params.summary) body.summary = params.summary
  if (params.description !== undefined) body.description = params.description
  if (params.start) body.start = { dateTime: params.start.toISOString() }
  if (params.end) body.end = { dateTime: params.end.toISOString() }
  if (params.reminderMinutes !== undefined) {
    body.reminders = {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: params.reminderMinutes }],
    }
  }

  const res = await calendarFetch(accessToken, `/calendars/primary/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`Calendar update error: ${res.status}`)
}

export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await calendarFetch(accessToken, `/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
  })
  if (res.status !== 204 && res.status !== 404) {
    throw new Error(`Calendar delete error: ${res.status}`)
  }
}
