'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import EventSidePanel from './EventSidePanel'
import type { GCalEvent } from '@/lib/google-calendar'
import type { EventOverride } from '@/lib/supabase-types'

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
}

function formatDateTime(dateTime: string): string {
  const d = new Date(dateTime)
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function EventCard({ event, override, userDefaults }: Props) {
  const router = useRouter()
  const [panelOpen, setPanelOpen] = useState(false)
  const [isRefreshing, startRefresh] = useTransition()
  const [refreshError, setRefreshError] = useState<string | null>(null)

  function handleRefresh(e: React.MouseEvent) {
    e.stopPropagation()
    setRefreshError(null)
    startRefresh(async () => {
      try {
        const res = await fetch(`/api/events/${event.id}/refresh`, { method: 'POST' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? 'Refresh failed')
        }
        router.refresh()
      } catch (err) {
        setRefreshError(err instanceof Error ? err.message : 'Error refreshing')
      }
    })
  }

  const hasTravelBlock = !!override?.travel_block_gcal_id && !override?.directions_error

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setPanelOpen(true)}
        onKeyDown={(e) => e.key === 'Enter' && setPanelOpen(true)}
        className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 hover:border-zinc-300 hover:shadow-sm transition-all cursor-pointer group"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base truncate">{event.summary}</h3>
              {hasTravelBlock && (
                <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 font-medium">
                  Block set
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-500 mt-0.5">{formatDateTime(event.start.dateTime)}</p>
            {event.location && (
              <p className="text-xs text-zinc-400 mt-1 truncate">{event.location}</p>
            )}
            {override?.travel_block_gcal_id && !override.directions_error && (
              <div className="text-xs text-zinc-500 mt-1.5 space-y-0.5">
                {(() => {
                  const mode = override.travel_mode ?? userDefaults.default_travel_mode
                  const modeEmoji = mode === 'transit' ? '🚌' : mode === 'walking' ? '🚶' : '🚗'
                  const departure = override.departure_location ?? userDefaults.default_departure
                  const buffer = override.buffer_minutes ?? userDefaults.default_buffer_minutes
                  const reminder = override.reminder_minutes ?? userDefaults.fixed_reminder_minutes
                  return (
                    <>
                      <p>{modeEmoji} {mode} · {buffer} min buffer · {reminder} min reminder</p>
                      {departure && <p className="text-zinc-400">From: {departure}</p>}
                    </>
                  )
                })()}
              </div>
            )}
            {override?.directions_error && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1.5">
                ⚠️ {override.directions_error}
              </p>
            )}
            {refreshError && (
              <p className="text-xs text-red-600 mt-1">{refreshError}</p>
            )}
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
          >
            {isRefreshing ? '…' : 'Refresh'}
          </button>
        </div>
      </div>

      {panelOpen && (
        <EventSidePanel
          event={event}
          override={override}
          userDefaults={userDefaults}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </>
  )
}
