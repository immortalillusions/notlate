'use client'

import { useActionState, startTransition, useState } from 'react'
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
  eventTimeZone?: string
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
  eventTimeZone,
  onApplied,
}: Props) {
  const [state, action, pending] = useActionState(applyRoute, null)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  function handleChoose(route: RouteAlternative) {
    const formData = new FormData()
    formData.set('gcal_event_id', gcalEventId)
    formData.set('event_title', eventTitle)
    formData.set('event_start', eventStart)
    formData.set('departure_location', departureLocation)
    formData.set('travel_mode', travelMode)
    formData.set('buffer_minutes', String(bufferMinutes))
    formData.set('reminder_minutes', String(reminderMinutes))
formData.set('event_time_zone', eventTimeZone ?? '')
    formData.set(
      'route',
      JSON.stringify({
        ...route,
        departureTime:
          route.departureTime instanceof Date
            ? route.departureTime.toISOString()
            : route.departureTime,
        arrivalTime:
          route.arrivalTime instanceof Date
            ? route.arrivalTime.toISOString()
            : route.arrivalTime,
      })
    )
    startTransition(async () => {
      try {
        const result = await action(formData)
        // If server action succeeded, then trigger UI refresh/close
        if ((result as any)?.success) {
          onApplied()
        }
      } catch (err) {
        console.error('applyRoute failed', err)
      }
    })
  }

  if (!routes.length) {
    return <p className="text-sm text-zinc-400 py-2">No routes available for this mode.</p>
  }

  return (
    <div className="space-y-2">
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      {routes.map((route, idx) => {
        const minutes = Math.round(route.durationSeconds / 60)
        const leaveBy = formatTime(route.departureTime)
        const isExpanded = expandedIdx === idx

        return (
          <div
            key={idx}
            className="rounded-lg border border-zinc-200 bg-zinc-50 overflow-hidden"
          >
            {/* Header row — always visible, tap to expand */}
            <button
              type="button"
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-zinc-100 active:bg-zinc-100 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium whitespace-nowrap">
                    Route {idx + 1} — {minutes} min
                  </span>
                  <span className="text-xs text-zinc-500 whitespace-nowrap">
                    Leave by {leaveBy}
                  </span>
                </div>
                {!isExpanded && (
                  <p className="text-xs text-zinc-400 mt-0.5 truncate">
                    {route.routeSummary}
                  </p>
                )}
              </div>
              <span className="text-zinc-400 text-xs shrink-0 select-none">
                {isExpanded ? '▲' : '▼'}
              </span>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-zinc-200 bg-white">
                <div className="pt-3 space-y-1.5">
                  {route.steps.map((step, si) => (
                    <div key={si} className="flex items-start gap-2 text-xs text-zinc-600">
                      <span className="mt-0.5 shrink-0">
                        {step.type === 'transit' ? '🚌' : step.type === 'walk' ? '🚶' : '🚗'}
                      </span>
                      <span>{step.description}</span>
                    </div>
                  ))}
                  {route.steps.length === 0 && (
                    <p className="text-xs text-zinc-500">{route.routeSummary}</p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleChoose(route)}
                  className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 active:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {pending ? 'Applying…' : 'Choose this route'}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
