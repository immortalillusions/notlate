'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

const schema = z.object({
  default_departure: z.string().min(1),
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

export type SettingsState = { error?: string; success?: boolean } | null

export async function saveSettings(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Not authenticated' }

  const reminderMode = formData.get('reminder_mode')

  const parsed = schema.safeParse({
    default_departure: formData.get('default_departure'),
    default_travel_mode: formData.get('default_travel_mode'),
    default_buffer_minutes: formData.get('default_buffer_minutes'),
    reminder_mode: reminderMode,
    fixed_reminder_minutes: formData.get('fixed_reminder_minutes'),
    onboarding_answers:
      reminderMode === 'ai'
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
  })

  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from('users')
    .update(parsed.data)
    .eq('id', session.user.id)

  if (error) return { error: 'Failed to save settings' }

  revalidatePath('/dashboard')
  revalidatePath('/settings')
  return { success: true }
}
