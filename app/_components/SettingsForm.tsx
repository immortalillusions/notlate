'use client'

import { useActionState, useState } from 'react'
import { saveSettings } from '@/actions/save-settings'
import type { User, OnboardingAnswers } from '@/lib/supabase-types'

interface Props {
  user: Pick<
    User,
    | 'default_departure'
    | 'default_travel_mode'
    | 'default_buffer_minutes'
    | 'reminder_mode'
    | 'fixed_reminder_minutes'
    | 'onboarding_answers'
  >
}

const ACTIVITY_LABELS: { key: keyof OnboardingAnswers; label: string }[] = [
  { key: 'meeting', label: 'A work meeting' },
  { key: 'hangout', label: 'Casual hangout with friends' },
  { key: 'date', label: 'A date' },
  { key: 'rock_climbing', label: 'Rock climbing' },
  { key: 'exercise', label: 'Gym / exercise' },
  { key: 'running', label: 'Running' },
  { key: 'food', label: 'Going out to eat' },
]

export default function SettingsForm({ user }: Props) {
  const [state, action, pending] = useActionState(saveSettings, null)
  const [reminderMode, setReminderMode] = useState<'fixed' | 'ai'>(user.reminder_mode)

  return (
    <form action={action} className="space-y-6">
      {state?.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Settings saved!
        </div>
      )}

      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-5">
        <h2 className="font-semibold">Defaults</h2>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700" htmlFor="default_departure">
            Departure location
          </label>
          <input
            id="default_departure"
            type="text"
            name="default_departure"
            defaultValue={user.default_departure ?? ''}
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">Default travel mode</label>
          <div className="flex gap-4">
            {(['driving', 'transit', 'walking'] as const).map((mode) => (
              <label key={mode} className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="default_travel_mode"
                  value={mode}
                  defaultChecked={user.default_travel_mode === mode}
                  className="accent-zinc-800"
                />
                <span className="capitalize">{mode}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700" htmlFor="default_buffer_minutes">
            Buffer time (arrive early by)
          </label>
          <div className="flex items-center gap-2">
            <input
              id="default_buffer_minutes"
              type="number"
              name="default_buffer_minutes"
              defaultValue={user.default_buffer_minutes}
              min={0}
              max={120}
              className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
            <span className="text-sm text-zinc-500">minutes</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
        <h2 className="font-semibold">Reminder</h2>

        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="reminder_mode"
              value="fixed"
              checked={reminderMode === 'fixed'}
              onChange={() => setReminderMode('fixed')}
              className="mt-0.5 accent-zinc-800"
            />
            <div>
              <div className="text-sm font-medium">Fixed</div>
              <div className="text-xs text-zinc-500">Always X minutes before leaving</div>
            </div>
          </label>

          <div className="ml-6 flex items-center gap-2">
            <input
              type="number"
              name="fixed_reminder_minutes"
              defaultValue={user.fixed_reminder_minutes}
              min={1}
              max={120}
              className="w-20 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
            <span className="text-sm text-zinc-500">minutes</span>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="reminder_mode"
              value="ai"
              checked={reminderMode === 'ai'}
              onChange={() => setReminderMode('ai')}
              className="mt-0.5 accent-zinc-800"
            />
            <div>
              <div className="text-sm font-medium">AI / Predictive</div>
              <div className="text-xs text-zinc-500">
                Gemini estimates prep time per event type
              </div>
            </div>
          </label>
        </div>
      </div>

      {reminderMode === 'ai' && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-5">
          <div>
            <h2 className="font-semibold">Preparation times</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              How long does it take you to get ready for each activity?
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {ACTIVITY_LABELS.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <label htmlFor={`ans_${key}`} className="text-sm text-zinc-700">
                  {label}
                </label>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    id={`ans_${key}`}
                    type="number"
                    name={`ans_${key}`}
                    defaultValue={user.onboarding_answers?.[key] ?? 15}
                    min={0}
                    max={120}
                    className="w-16 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  />
                  <span className="text-xs text-zinc-500">min</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  )
}
