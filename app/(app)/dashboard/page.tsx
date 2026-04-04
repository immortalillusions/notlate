import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { CalendarEvent, EventOverride, User } from '@/lib/supabase-types'
import type { GCalEvent } from '@/lib/google-calendar'
import EventCard from '@/app/_components/EventCard'
import DashboardRefresher from '@/app/_components/DashboardRefresher'
import SyncNowButton from '@/app/_components/SyncNowButton'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single<User>()

  if (!user) redirect('/login')
  if (!user.onboarding_complete) redirect('/onboarding')

  // Read from the calendar_events cache populated by the webhook.
  // The webhook calls revalidatePath('/dashboard') after processing changes,
  // so this page is re-rendered automatically when events change.
  const now = new Date().toISOString()
  const { data: cachedEvents } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId)
    .gte('start_at', now)
    .order('start_at', { ascending: true })

  const events: GCalEvent[] = (cachedEvents ?? []).map((e: CalendarEvent) => ({
    id: e.gcal_event_id,
    summary: e.summary,
    location: e.location ?? undefined,
    description: e.description ?? undefined,
    start: { dateTime: e.start_at },
    end: { dateTime: e.end_at },
  }))

  const { data: overrides } = await supabase
    .from('event_overrides')
    .select('*')
    .eq('user_id', userId)

  const overrideMap = new Map<string, EventOverride>(
    (overrides ?? []).map((o) => [o.gcal_event_id, o])
  )

  const { data: channel } = await supabase
    .from('watch_channels')
    .select('channel_id')
    .eq('user_id', userId)
    .maybeSingle()

  return (
    <div className="space-y-6">
      <DashboardRefresher userId={userId} />
      <div>
        <h1 className="text-2xl font-bold">Upcoming events</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-300 mt-0.5">
          Auto-managed travel. AI-timed notifications.
        </p>
      </div>

      {!channel && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          No webhook registered — go to Settings to register one so events are tracked automatically.
        </div>
      )}

      {channel && events.length === 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center text-zinc-400 text-sm">
          <p>No upcoming events with a location found. Add an event with a location in Google Calendar — it will appear here automatically.</p>
          <p>Only events in the next 7 days are shown to prevent excessive API calls</p>
          <SyncNowButton />
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
