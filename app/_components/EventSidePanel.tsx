'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import RoutePicker from './RoutePicker'
import AddressAutocomplete from './AddressAutocomplete'
import type { GCalEvent } from '@/lib/google-calendar'
import type { EventOverride, RouteAlternative } from '@/lib/supabase-types'

interface UserDefaults {
  default_departure: string | null
  default_travel_mode: string
  default_buffer_minutes: number
  fixed_reminder_minutes: number
  reminder_mode: string
}

interface Props {
  event: GCalEvent
  override: EventOverride | null
  userDefaults: UserDefaults
  onClose: () => void
}

export default function EventSidePanel({ event, override, userDefaults, onClose }: Props) {
  const router = useRouter()

  const [travelMode, setTravelMode] = useState(
    override?.travel_mode ?? userDefaults.default_travel_mode
  )
  const [departure, setDeparture] = useState(
    override?.departure_location ?? userDefaults.default_departure ?? ''
  )
  const [bufferMinutes, setBufferMinutes] = useState(
    override?.buffer_minutes ?? userDefaults.default_buffer_minutes
  )

  const [routes, setRoutes] = useState<RouteAlternative[] | null>(null)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Reminder — independent from the route flow
  const [reminderMode, setReminderMode] = useState<'fixed' | 'ai'>(
    override?.reminder_minutes != null ? 'fixed' : (userDefaults.reminder_mode as 'fixed' | 'ai')
  )
  const [reminderMinutes, setReminderMinutes] = useState(
    override?.reminder_minutes ?? userDefaults.fixed_reminder_minutes
  )
  const [isUpdatingReminder, startReminderUpdate] = useTransition()
  const [reminderStatus, setReminderStatus] = useState<string | null>(null)

  const eventStart = new Date(event.start.dateTime)

  // Overrides are NOT saved here — they are saved by applyRoute when the user
  // actually picks a route. This means exiting the panel without choosing a
  // route leaves the existing overrides untouched.
  function handleGetRoutes() {
    setRoutes(null)
    setRouteError(null)

    startTransition(async () => {
      const arrivalTime = new Date(eventStart.getTime() - bufferMinutes * 60 * 1000)
      try {
        const res = await fetch('/api/directions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin: departure,
            destination: event.location,
            arrivalTime: arrivalTime.toISOString(),
            mode: travelMode,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to fetch routes')
        setRoutes(data.routes)
      } catch (err) {
        setRouteError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  function handleRouteApplied() {
    setRoutes(null)
    router.refresh()
    onClose()
  }

  function handleReminderUpdate() {
    setReminderStatus(null)
    startReminderUpdate(async () => {
      try {
        const body =
          reminderMode === 'fixed'
            ? { mode: 'fixed' as const, minutes: reminderMinutes }
            : { mode: 'ai' as const }

        const res = await fetch(`/api/events/${event.id}/reminder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed')
        setReminderMinutes(data.reminderMinutes)
        setReminderStatus(`Updated to ${data.reminderMinutes} min`)
        router.refresh()
      } catch (err) {
        setReminderStatus(err instanceof Error ? err.message : 'Error')
      }
    })
  }

  const eventDateStr = eventStart.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const eventTimeStr = eventStart.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className="fixed inset-0 z-30 flex" role="dialog" aria-modal>
      {/* Backdrop */}
      <button
        className="flex-1 bg-black/30 cursor-default"
        onClick={onClose}
        aria-label="Close panel"
      />

      {/* Panel */}
      <div className="w-full max-w-sm bg-white h-full overflow-y-auto shadow-xl flex flex-col">
        <div className="sticky top-0 bg-white border-b border-zinc-100 px-5 py-4 flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-base">{event.summary}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {eventDateStr} at {eventTimeStr}
            </p>
            {event.location && (
              <p className="text-xs text-zinc-400 mt-0.5 truncate">{event.location}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-2 shrink-0 rounded-md p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 px-5 py-5 space-y-5">
          {/* Travel settings + Get routes (combined) */}
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                Departure location
              </label>
              <AddressAutocomplete
                name="departure_location"
                value={departure}
                onChange={setDeparture}
                placeholder={userDefaults.default_departure ?? 'Enter address'}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                Travel mode
              </label>
              <select
                value={travelMode}
                onChange={(e) => {
                  setTravelMode(e.target.value)
                  setRoutes(null)
                }}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400"
              >
                <option value="driving">Driving</option>
                <option value="transit">Transit</option>
                <option value="walking">Walking</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                Buffer time (arrive early by)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={bufferMinutes}
                  onChange={(e) => setBufferMinutes(Number(e.target.value))}
                  min={0}
                  max={120}
                  className="w-20 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                />
                <span className="text-sm text-zinc-500">min</span>
              </div>
            </div>

            {routeError && (
              <p className="text-sm text-red-600">{routeError}</p>
            )}

            <button
              type="button"
              disabled={isPending || !departure || !event.location}
              onClick={handleGetRoutes}
              className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Saving & fetching routes…' : 'Get routes'}
            </button>

            {routes !== null && (
              <RoutePicker
                routes={routes}
                gcalEventId={event.id}
                eventTitle={event.summary}
                eventStart={event.start.dateTime}
                eventTimeZone={event.start.timeZone}
                departureLocation={departure}
                travelMode={travelMode}
                bufferMinutes={bufferMinutes}
                reminderMinutes={reminderMinutes}
                onApplied={handleRouteApplied}
              />
            )}
          </div>

          <hr className="border-zinc-100" />

          {/* Reminder section */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
              Reminder
            </p>

            <div className="flex rounded-lg border border-zinc-200 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setReminderMode('fixed')}
                className={`flex-1 py-2 transition-colors ${
                  reminderMode === 'fixed'
                    ? 'bg-zinc-900 text-white font-medium'
                    : 'bg-white text-zinc-500 hover:bg-zinc-50'
                }`}
              >
                Fixed
              </button>
              <button
                type="button"
                onClick={() => setReminderMode('ai')}
                className={`flex-1 py-2 transition-colors ${
                  reminderMode === 'ai'
                    ? 'bg-zinc-900 text-white font-medium'
                    : 'bg-white text-zinc-500 hover:bg-zinc-50'
                }`}
              >
                AI estimate
              </button>
            </div>

            {reminderMode === 'fixed' && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={reminderMinutes}
                  onChange={(e) => setReminderMinutes(Number(e.target.value))}
                  min={0}
                  max={240}
                  className="w-20 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                />
                <span className="text-sm text-zinc-500">min before leaving</span>
              </div>
            )}

            {reminderMode === 'ai' && (
              <p className="text-xs text-zinc-400">
                Gemini will estimate based on the event type and your prep times.
              </p>
            )}

            <button
              type="button"
              disabled={isUpdatingReminder}
              onClick={handleReminderUpdate}
              className="w-full rounded-lg border border-zinc-300 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              {isUpdatingReminder ? 'Updating…' : 'Update reminder on calendar'}
            </button>

            {reminderStatus && (
              <p className="text-sm text-zinc-600">{reminderStatus}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
