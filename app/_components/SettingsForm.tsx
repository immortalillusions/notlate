'use client'

import { useActionState, useState, useEffect } from 'react'
import { saveSettings } from '@/actions/save-settings'
import AddressAutocomplete from './AddressAutocomplete'
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

const ACTIVITY_LABELS: { key: keyof OnboardingAnswers; label: string; sublabel: string }[] = [
  {
    key: 'professional_low',
    label: 'Work meeting or class',
    sublabel: 'On average, how long do you take to get ready for a typical work meeting or class?',
  },
  {
    key: 'professional_high',
    label: 'Interview, exam, or networking',
    sublabel:
      'How long do you typically spend preparing for important events like interviews, exams, or networking?',
  },
  {
    key: 'social',
    label: 'Social plans',
    sublabel:
      'How long do you usually take to get ready for social plans (e.g., hanging out, dinner, parties)?',
  },
  {
    key: 'fitness',
    label: 'Workout or physical activity',
    sublabel: 'How long does it take you to get ready for workouts or physical activities?',
  },
  {
    key: 'errands',
    label: 'Errands or appointments',
    sublabel:
      'How long does it usually take you to get ready for errands or appointments (e.g., groceries, therapy, quick tasks)?',
  },
  {
    key: 'special_event',
    label: 'Special events',
    sublabel:
      'How long do you typically spend getting ready for special events (e.g., weddings, conferences, concerts, formal events)?',
  },
]

const inputClass =
  'rounded-xl border border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--gcal-blue) dark:placeholder-zinc-500'

export default function SettingsForm({ user }: Props) {
  const [state, action, pending] = useActionState(saveSettings, null)
  const [departure, setDeparture] = useState(user.default_departure ?? '')
  const [reminderMode, setReminderMode] = useState<'fixed' | 'ai'>(user.reminder_mode)
  useEffect(() => { setReminderMode(user.reminder_mode) }, [user.reminder_mode])
  useEffect(() => { setDeparture(user.default_departure ?? '') }, [user.default_departure])

  return (
    <form action={action} className="space-y-6">
      {state?.error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          Settings saved!
        </div>
      )}

      <div className="bg-white dark:bg-zinc-800 rounded-2xl border border-slate-200 dark:border-zinc-700 p-6 space-y-5">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Defaults</h2>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor="default_departure">
            Departure location
          </label>
          <AddressAutocomplete
            name="default_departure"
            value={departure}
            onChange={setDeparture}
            required
            className={`w-full ${inputClass}`}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Default travel mode</label>
          <div className="flex gap-4">
            {(['driving', 'transit', 'walking'] as const).map((mode) => (
              <label key={mode} className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="default_travel_mode"
                  value={mode}
                  defaultChecked={user.default_travel_mode === mode}
                  className="accent-(--gcal-blue)"
                />
                <span className="capitalize text-zinc-700 dark:text-zinc-200">{mode}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor="default_buffer_minutes">
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
              className={`w-24 ${inputClass}`}
            />
            <span className="text-sm text-zinc-500 dark:text-zinc-300">minutes</span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-800 rounded-2xl border border-slate-200 dark:border-zinc-700 p-6 space-y-4">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Reminder</h2>

        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="reminder_mode"
              value="fixed"
              checked={reminderMode === 'fixed'}
              onChange={() => setReminderMode('fixed')}
              className="mt-0.5 accent-(--gcal-blue)"
            />
            <div>
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Fixed</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-300">Always X minutes before leaving</div>
            </div>
          </label>

          <div className="ml-6 flex items-center gap-2">
            <input
              type="number"
              name="fixed_reminder_minutes"
              defaultValue={user.fixed_reminder_minutes}
              min={1}
              max={120}
              className={`w-20 ${inputClass}`}
            />
            <span className="text-sm text-zinc-500 dark:text-zinc-300">minutes</span>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="reminder_mode"
              value="ai"
              checked={reminderMode === 'ai'}
              onChange={() => setReminderMode('ai')}
              className="mt-0.5 accent-(--gcal-blue)"
            />
            <div>
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">AI / Predictive</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-300">
                Gemini estimates prep time per event type
              </div>
            </div>
          </label>
        </div>
      </div>

      {reminderMode === 'ai' && (
        <div className="bg-white dark:bg-zinc-800 rounded-2xl border border-slate-200 dark:border-zinc-700 p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Preparation times</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-300 mt-0.5">
              How long does it take you to get ready for each activity?
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {ACTIVITY_LABELS.map(({ key, label, sublabel }) => (
              <div key={key} className="space-y-2">
                <div>
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{label}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-400">{sublabel}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    id={`ans_${key}`}
                    type="number"
                    name={`ans_${key}`}
                    defaultValue={user.onboarding_answers?.[key] ?? 15}
                    min={0}
                    max={120}
                    className={`w-16 text-right ${inputClass}`}
                  />
                  <span className="text-xs text-zinc-500 dark:text-zinc-300">min</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-(--gcal-blue) px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  )
}
