'use server'

import { auth } from '@/lib/auth'
import { stopWebhook } from '@/lib/webhook'
import { revalidatePath } from 'next/cache'

export type DisableWebhookState = { error?: string; success?: boolean } | null

export async function disableWebhookAction(
  _prev: DisableWebhookState
): Promise<DisableWebhookState> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Not authenticated' }

  try {
    await stopWebhook(session.user.id)
    revalidatePath('/settings')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to disable webhook' }
  }
}
