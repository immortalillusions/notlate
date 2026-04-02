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
})

export type SettingsState = { error?: string; success?: boolean } | null

export async function saveSettings(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Not authenticated' }

  const parsed = schema.safeParse({
    default_departure: formData.get('default_departure'),
    default_travel_mode: formData.get('default_travel_mode'),
    default_buffer_minutes: formData.get('default_buffer_minutes'),
    reminder_mode: formData.get('reminder_mode'),
    fixed_reminder_minutes: formData.get('fixed_reminder_minutes'),
  })

  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from('users')
    .update(parsed.data)
    .eq('id', session.user.id)

  if (error) return { error: 'Failed to save settings' }

  revalidatePath('/dashboard')
  return { success: true }
}
