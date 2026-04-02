'use client'

import { useActionState, useState } from 'react'
import { completeOnboarding } from '@/actions/complete-onboarding'

const ACTIVITY_LABELS: Record<string, string> = {
  meeting: 'A work meeting',
  hangout: 'Casual hangout with friends',
  date: 'A date',
  rock_climbing: 'Rock climbing',
  exercise: 'Gym / exercise',
  running: 'Running',
  food: 'Going out to eat',
}

export default function OnboardingForm() {
  const [state, action, pending] = useActionState(completeOnboarding, null)
  const [step, setStep] = useState(1)
  const [reminderMode, setReminderMode] = useState<'fixed' | 'ai'>('fixed')

  return (
    <form action={action} className="space-y-8">
      {state?.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Step 1: Departure */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
        <h2 className="font-semibold text-lg">1. Where do you usually leave from?</h2>
        <input
          type="text"
          name="default_departure"
          placeholder="e.g. 123 Main St, New York, NY"
          required
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
      </div>

      {/* Step 2: Travel mode */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
        <h2 className="font-semibold text-lg">2. How do you usually get around?</h2>
        <div className="flex gap-4">
          {(['driving', 'transit', 'walking'] as const).map((mode) => (
            <label key={mode} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="default_travel_mode"
                value={mode}
                defaultChecked={mode === 'driving'}
                className="accent-zinc-800"
              />
              <span className="text-sm capitalize">{mode}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Step 3: Buffer */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
        <h2 className="font-semibold text-lg">3. How many minutes early do you like to arrive?</h2>
        <div className="flex items-center gap-3">
          <input
            type="number"
            name="default_buffer_minutes"
            defaultValue={10}
            min={0}
            max={120}
            className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <span className="text-sm text-zinc-500">minutes</span>
        </div>
      </div>

      {/* Step 4: Reminder mode */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4">
        <h2 className="font-semibold text-lg">4. How should we remind you to leave?</h2>
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
              <div className="text-sm font-medium">Fixed reminder</div>
              <div className="text-xs text-zinc-500">Always remind me X minutes before I need to leave</div>
            </div>
          </label>

          {reminderMode === 'fixed' && (
            <div className="ml-6 flex items-center gap-2">
              <input
                type="number"
                name="fixed_reminder_minutes"
                defaultValue={15}
                min={1}
                max={120}
                className="w-20 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
              <span className="text-sm text-zinc-500">minutes before leaving</span>
            </div>
          )}

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
                AI estimates how long you need to prepare based on the event type
              </div>
            </div>
          </label>
        </div>

        {reminderMode === 'fixed' && (
          <input type="hidden" name="fixed_reminder_minutes" value="15" />
        )}
      </div>

      {/* AI questionnaire */}
      {reminderMode === 'ai' && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-5">
          <h2 className="font-semibold text-lg">
            How long does it take you to get ready for each activity?
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(ACTIVITY_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <label htmlFor={`ans_${key}`} className="text-sm text-zinc-700">
                  {label}
                </label>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    id={`ans_${key}`}
                    type="number"
                    name={`ans_${key}`}
                    defaultValue={15}
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
        className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
      >
        {pending ? 'Setting up…' : 'Get started'}
      </button>
    </form>
  )
}
