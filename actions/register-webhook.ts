'use server'

import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { registerWebhook } from '@/lib/webhook'

export type RegisterWebhookState = { error?: string; success?: boolean } | null

export async function registerWebhookAction(
  _prev: RegisterWebhookState
): Promise<RegisterWebhookState> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Not authenticated' }

  const userId = session.user.id

  // Throttle: don't re-register if the current channel has >3 days remaining
  const { data: channel } = await supabase
    .from('watch_channels')
    .select('expiration')
    .eq('user_id', userId)
    .maybeSingle()

  if (channel) {
    const daysRemaining =
      (new Date(channel.expiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    if (daysRemaining > 3) {
      return {
        error: `Webhook is active with ${Math.floor(daysRemaining)} days remaining — no need to re-register yet`,
      }
    }
  }

  try {
    await registerWebhook(userId)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to register webhook' }
  }
}
