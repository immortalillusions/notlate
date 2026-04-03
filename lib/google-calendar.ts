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
  timeZone?: string
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

function formatDateForCalendar(date: Date, timeZone?: string): string {
  if (!timeZone) return date.toISOString()

  // Build a YYYY-MM-DDTHH:mm:ss string in the target timezone (no offset/Z)
  const df = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = df.formatToParts(date)
  const lookup: Record<string, string> = {}
  for (const p of parts) lookup[p.type] = p.value
  // parts include year, month, day, hour, minute, second
  return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}:${lookup.second}`
}

export async function createCalendarEvent(
  accessToken: string,
  params: CreateEventParams
): Promise<string> {
  const startObj: Record<string, unknown> = { dateTime: formatDateForCalendar(params.start, params.timeZone) }
  const endObj: Record<string, unknown> = { dateTime: formatDateForCalendar(params.end, params.timeZone) }
  if (params.timeZone) {
    startObj.timeZone = params.timeZone
    endObj.timeZone = params.timeZone
  }

  const body = {
    summary: params.summary,
    description: params.description,
    start: startObj,
    end: endObj,
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
  if (params.start) {
    const startObj: Record<string, unknown> = { dateTime: formatDateForCalendar(params.start, params.timeZone) }
    if (params.timeZone) startObj.timeZone = params.timeZone
    body.start = startObj
  }
  if (params.end) {
    const endObj: Record<string, unknown> = { dateTime: formatDateForCalendar(params.end, params.timeZone) }
    if (params.timeZone) endObj.timeZone = params.timeZone
    body.end = endObj
  }
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
