'use client'

import { useActionState } from 'react'
import { syncCalendarEvents } from '@/actions/sync-events'

export default function SyncNowButton() {
  const [syncState, syncAction, syncPending] = useActionState(syncCalendarEvents, null)

  return (
    <div className="mt-4">
      <form action={syncAction}>
        <button
          type="submit"
          disabled={syncPending}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 disabled:opacity-40"
        >
          {syncPending ? 'Syncing…' : 'Sync now'}
        </button>
      </form>

      {syncState?.error && (
        <p className="text-xs text-red-600 mt-2">{syncState.error}</p>
      )}
      {syncState?.success && (
        <p className="text-xs text-green-700 mt-2">Events synced.</p>
      )}
    </div>
  )
}
