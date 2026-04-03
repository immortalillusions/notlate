'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { registerWebhook } from '@/lib/webhook'

const schema = z.object({
  default_departure: z.string().min(1, 'Departure location is required'),
  default_travel_mode: z.enum(['driving', 'transit', 'walking']),
  default_buffer_minutes: z.coerce.number().int().min(0).max(120),
  reminder_mode: z.enum(['fixed', 'ai']),
  fixed_reminder_minutes: z.coerce.number().int().min(1).max(120),
  onboarding_answers: z
    .object({
      meeting: z.coerce.number().int().min(0),
      hangout: z.coerce.number().int().min(0),
      date: z.coerce.number().int().min(0),
      rock_climbing: z.coerce.number().int().min(0),
      exercise: z.coerce.number().int().min(0),
      running: z.coerce.number().int().min(0),
      food: z.coerce.number().int().min(0),
    })
    .optional(),
})

export type OnboardingState = { error?: string } | null

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Not authenticated' }

  const raw = {
    default_departure: formData.get('default_departure'),
    default_travel_mode: formData.get('default_travel_mode'),
    default_buffer_minutes: formData.get('default_buffer_minutes'),
    reminder_mode: formData.get('reminder_mode'),
    // If AI mode chosen and no sensible fixed reminder provided, default to 15 minutes
    fixed_reminder_minutes: (() => {
      const provided = formData.get('fixed_reminder_minutes')
      const mode = formData.get('reminder_mode')
      const num = provided ? Number(String(provided)) : NaN
      if (mode === 'ai' && (Number.isNaN(num) || num <= 1)) return '15'
      return provided
    })(),
    onboarding_answers:
      formData.get('reminder_mode') === 'ai'
        ? {
            meeting: formData.get('ans_meeting'),
            hangout: formData.get('ans_hangout'),
            date: formData.get('ans_date'),
            rock_climbing: formData.get('ans_rock_climbing'),
            exercise: formData.get('ans_exercise'),
            running: formData.get('ans_running'),
            food: formData.get('ans_food'),
          }
        : undefined,
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { error: dbError } = await supabase
    .from('users')
    .update({
      ...parsed.data,
      onboarding_complete: true,
    })
    .eq('id', session.user.id)

  if (dbError) return { error: 'Failed to save settings' }

  // Register webhook — best-effort, don't block onboarding if it fails
  try {
    await registerWebhook(session.user.id)
  } catch (err) {
    console.warn('Webhook registration failed during onboarding:', err)
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}
