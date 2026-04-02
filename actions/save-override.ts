'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

const schema = z.object({
  gcal_event_id: z.string().min(1),
  departure_location: z.string().optional(),
  travel_mode: z.enum(['driving', 'transit', 'walking']).optional(),
  buffer_minutes: z.coerce.number().int().min(0).max(120).optional(),
  reminder_minutes: z.coerce.number().int().min(0).max(240).optional(),
})

export type OverrideState = { error?: string; success?: boolean } | null

export async function saveOverride(
  _prev: OverrideState,
  formData: FormData
): Promise<OverrideState> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Not authenticated' }

  const parsed = schema.safeParse({
    gcal_event_id: formData.get('gcal_event_id'),
    departure_location: formData.get('departure_location') || undefined,
    travel_mode: formData.get('travel_mode') || undefined,
    buffer_minutes: formData.get('buffer_minutes') || undefined,
    reminder_minutes: formData.get('reminder_minutes') || undefined,
  })

  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { gcal_event_id, ...overrides } = parsed.data

  const { error } = await supabase.from('event_overrides').upsert(
    {
      user_id: session.user.id,
      gcal_event_id,
      ...overrides,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,gcal_event_id' }
  )

  if (error) return { error: 'Failed to save override' }

  revalidatePath('/dashboard')
  return { success: true }
}
