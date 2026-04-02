import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getValidAccessToken } from '@/lib/google-token'
import { listUpcomingEventsWithLocation } from '@/lib/google-calendar'
import type { EventOverride, User } from '@/lib/supabase-types'
import EventCard from '@/app/_components/EventCard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  // Fetch user defaults
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single<User>()

  if (!user) redirect('/login')

  // Fetch Google Calendar events
  let events: Awaited<ReturnType<typeof listUpcomingEventsWithLocation>> = []
  let calendarError: string | null = null

  try {
    const accessToken = await getValidAccessToken(userId)
    events = await listUpcomingEventsWithLocation(accessToken)
  } catch (err) {
    calendarError = err instanceof Error ? err.message : 'Failed to load calendar events'
  }

  // Fetch all event overrides for this user in one query
  const { data: overrides } = await supabase
    .from('event_overrides')
    .select('*')
    .eq('user_id', userId)

  const overrideMap = new Map<string, EventOverride>(
    (overrides ?? []).map((o) => [o.gcal_event_id, o])
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Upcoming events</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Events with a location — travel blocks managed automatically
          </p>
        </div>
      </div>

      {calendarError && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          {calendarError}
        </div>
      )}

      {!calendarError && events.length === 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-zinc-400 text-sm">
          No upcoming events with a location found in the next 30 days.
        </div>
      )}

      <div className="space-y-3">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            override={overrideMap.get(event.id) ?? null}
            userDefaults={{
              default_departure: user.default_departure,
              default_travel_mode: user.default_travel_mode,
              default_buffer_minutes: user.default_buffer_minutes,
              fixed_reminder_minutes: user.fixed_reminder_minutes,
              reminder_mode: user.reminder_mode,
            }}
          />
        ))}
      </div>
    </div>
  )
}
