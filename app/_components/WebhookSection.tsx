'use client'

import { useActionState, useMemo } from 'react'
import { registerWebhookAction } from '@/actions/register-webhook'

interface Props {
  expiration: string | null
}

export default function WebhookSection({ expiration }: Props) {
  const [registerState, registerAction, registerPending] = useActionState(
    registerWebhookAction,
    null
  )

  // expiration is a server-provided ISO string or null.
  // Avoid calling Date.now() during render deterministically — compute
  // a client-side memo when running in the browser.
  const daysRemaining = useMemo(() => {
    if (!expiration) return null
    const diff = new Date(expiration).getTime() - Date.now()
    return Math.max(0, diff / (1000 * 60 * 60 * 24))
  }, [expiration])

  const isActive = daysRemaining !== null && daysRemaining > 0
  const canReRegister = !isActive || (daysRemaining !== null && daysRemaining <= 3)

  return (
    <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">Calendar webhook</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-300 mt-0.5">
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

      <div className="flex flex-wrap">
        <form action={registerAction}>
          <button
            type="submit"
            disabled={registerPending || !canReRegister}
            className="rounded-lg bg-(--gcal-blue) px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {registerPending ? 'Registering…' : isActive ? 'Re-register' : 'Register webhook'}
          </button>
        </form>

        {/* Sync now moved to dashboard when no events present */}
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-300 mb-0.5">
        Vercel cron will auto renew webhook every 6 days but you may also do it manually.
      </p>
      

      {registerState?.error && (
        <p className="text-xs text-red-600 dark:text-red-400">{registerState.error}</p>
      )}
      {registerState?.success && (
        <p className="text-xs text-green-700 dark:text-green-400">Webhook registered successfully.</p>
      )}
    </div>
  )
}
