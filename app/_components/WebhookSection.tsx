'use client'

import { useActionState, useMemo } from 'react'
import { registerWebhookAction } from '@/actions/register-webhook'
import { disableWebhookAction } from '@/actions/disable-webhook'

interface Props {
  expiration: string | null
}

export default function WebhookSection({ expiration }: Props) {
  const [registerState, registerAction, registerPending] = useActionState(
    registerWebhookAction,
    null
  )
  const [disableState, disableAction, disablePending] = useActionState(
    disableWebhookAction,
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

  const serverActive = daysRemaining !== null && daysRemaining > 0

  // Override server state with the outcome of client-side actions.
  // registerState.success beats disableState.success (user re-registered after disabling).
  const effectivelyActive = registerState?.success
    ? true
    : disableState?.success
      ? false
      : serverActive

  const wasJustDisabled = disableState?.success && !registerState?.success
  const canReRegister = !effectivelyActive || (daysRemaining !== null && daysRemaining <= 3)

  return (
    <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">Calendar webhook</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-300 mt-0.5">
          Keeps your travel blocks updated automatically when events change.
        </p>
      </div>

      <div className="text-sm">
        {effectivelyActive ? (
          <span className="text-green-700">
            Active
          </span>
        ) : !wasJustDisabled ? (
          <span className="text-red-600">Not registered or expired</span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <form action={registerAction}>
          <button
            type="submit"
            disabled={registerPending || disablePending || !canReRegister}
            className="rounded-lg bg-(--gcal-blue) px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {registerPending ? 'Registering…' : effectivelyActive ? 'Re-register' : 'Register webhook'}
          </button>
        </form>

        {effectivelyActive && (
          <form action={disableAction}>
            <button
              type="submit"
              disabled={disablePending || registerPending}
              className="rounded-lg border border-red-300 dark:border-red-700 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-40"
            >
              {disablePending ? 'Disabling…' : 'Disable webhook (stop auto-updates)'}
            </button>
          </form>
        )}

        {/* Sync now moved to dashboard when no events present */}
      </div>

      {!wasJustDisabled && (
        <p className="text-xs text-zinc-500 dark:text-zinc-300 mb-0.5">
          Vercel cron will auto renew webhooks every 6 days but you may also do it manually.
        </p>
      )}

      {registerState?.error && (
        <p className="text-xs text-red-600 dark:text-red-400">{registerState.error}</p>
      )}
      {registerState?.success && (
        <p className="text-xs text-green-700 dark:text-green-400">Webhook registered successfully.</p>
      )}
      {disableState?.error && (
        <p className="text-xs text-red-600 dark:text-red-400">{disableState.error}</p>
      )}
      {wasJustDisabled && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Webhook disabled. Calendar will no longer auto-update.</p>
      )}
    </div>
  )
}
