'use client'

import { useActionState } from 'react'
import { registerWebhookAction } from '@/actions/register-webhook'
import { syncCalendarEvents } from '@/actions/sync-events'

interface Props {
  expiration: string | null
}

export default function WebhookSection({ expiration }: Props) {
  const [registerState, registerAction, registerPending] = useActionState(
    registerWebhookAction,
    null
  )
  const [syncState, syncAction, syncPending] = useActionState(syncCalendarEvents, null)

  const daysRemaining = expiration
    ? (new Date(expiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    : null

  const isActive = daysRemaining !== null && daysRemaining > 0
  const canReRegister = !isActive || daysRemaining! <= 3

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-sm">Calendar webhook</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Keeps your travel blocks updated automatically when events change.
        </p>
      </div>

      <div className="text-sm">
        {isActive ? (
          <span className="text-green-700">
            Active &mdash; {Math.floor(daysRemaining!)} day{Math.floor(daysRemaining!) !== 1 ? 's' : ''} remaining
          </span>
        ) : (
          <span className="text-red-600">Not registered or expired</span>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <form action={registerAction}>
          <button
            type="submit"
            disabled={registerPending || !canReRegister}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {registerPending ? 'Registering…' : isActive ? 'Re-register' : 'Register webhook'}
          </button>
        </form>

        <form action={syncAction}>
          <button
            type="submit"
            disabled={syncPending}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 disabled:opacity-40"
          >
            {syncPending ? 'Syncing…' : 'Sync now'}
          </button>
        </form>
      </div>

      {registerState?.error && (
        <p className="text-xs text-red-600">{registerState.error}</p>
      )}
      {registerState?.success && (
        <p className="text-xs text-green-700">Webhook registered successfully.</p>
      )}
      {syncState?.error && (
        <p className="text-xs text-red-600">{syncState.error}</p>
      )}
      {syncState?.success && (
        <p className="text-xs text-green-700">Events synced.</p>
      )}
    </div>
  )
}
