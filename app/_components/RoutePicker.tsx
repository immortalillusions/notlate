'use client'

import { useActionState, startTransition } from 'react'
import { applyRoute } from '@/actions/apply-route'
import type { RouteAlternative } from '@/lib/supabase-types'

interface Props {
  routes: RouteAlternative[]
  gcalEventId: string
  eventTitle: string
  eventStart: string
  departureLocation: string
  travelMode: string
  bufferMinutes: number
  reminderMinutes: number
  onApplied: () => void
}

function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export default function RoutePicker({
  routes,
  gcalEventId,
  eventTitle,
  eventStart,
  departureLocation,
  travelMode,
  bufferMinutes,
  reminderMinutes,
  onApplied,
}: Props) {
  const [state, action, pending] = useActionState(applyRoute, null)

  function handleSelect(route: RouteAlternative) {
    const formData = new FormData()
    formData.set('gcal_event_id', gcalEventId)
    formData.set('event_title', eventTitle)
    formData.set('event_start', eventStart)
    formData.set('departure_location', departureLocation)
    formData.set('travel_mode', travelMode)
    formData.set('buffer_minutes', String(bufferMinutes))
    formData.set('reminder_minutes', String(reminderMinutes))
    formData.set(
      'route',
      JSON.stringify({
        ...route,
        departureTime: route.departureTime instanceof Date
          ? route.departureTime.toISOString()
          : route.departureTime,
        arrivalTime: route.arrivalTime instanceof Date
          ? route.arrivalTime.toISOString()
          : route.arrivalTime,
      })
    )
    startTransition(() => {
      action(formData)
      onApplied()
    })
  }

  if (!routes.length) {
    return (
      <p className="text-sm text-zinc-400 py-2">No routes available for this mode.</p>
    )
  }

  return (
    <div className="space-y-2">
      {state?.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      {routes.map((route, idx) => {
        const minutes = Math.round(route.durationSeconds / 60)
        const leaveBy = formatTime(route.departureTime)
        return (
          <button
            key={idx}
            type="button"
            disabled={pending}
            onClick={() => handleSelect(route)}
            className="w-full text-left rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 hover:border-zinc-400 hover:bg-white transition-colors disabled:opacity-50 space-y-0.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Route {idx + 1} — {minutes} min
              </span>
              <span className="text-xs text-zinc-500">Leave by {leaveBy}</span>
            </div>
            <p className="text-xs text-zinc-500 truncate">{route.routeSummary}</p>
          </button>
        )
      })}
    </div>
  )
}
