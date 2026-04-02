import { supabase } from '@/lib/supabase'
import { getValidAccessToken } from '@/lib/google-token'

const WEBHOOK_TTL_DAYS = 7

export async function registerWebhook(
  userId: string,
  accessToken: string
): Promise<void> {
  const channelId = crypto.randomUUID()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) throw new Error('Missing NEXT_PUBLIC_APP_URL')

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events/watch',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: channelId,
        type: 'web_hook',
        address: `${appUrl}/api/webhook/calendar`,
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to register webhook: ${res.status} ${err}`)
  }

  const data = await res.json()
  const expirationMs = parseInt(data.expiration, 10)
  const expiration = new Date(expirationMs).toISOString()

  // Stop any existing channel for this user first
  await stopExistingChannels(userId)

  await supabase.from('watch_channels').insert({
    user_id: userId,
    channel_id: channelId,
    resource_id: data.resourceId,
    expiration,
  })
}

async function stopExistingChannels(userId: string): Promise<void> {
  const { data: channels } = await supabase
    .from('watch_channels')
    .select('channel_id, resource_id')
    .eq('user_id', userId)

  if (!channels?.length) return

  const accessToken = await getValidAccessToken(userId)

  for (const ch of channels) {
    await fetch(
      'https://www.googleapis.com/calendar/v3/channels/stop',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: ch.channel_id, resourceId: ch.resource_id }),
      }
    ).catch(() => {}) // Best effort
  }

  await supabase.from('watch_channels').delete().eq('user_id', userId)
}

export async function renewWebhooksForAllUsers(): Promise<void> {
  const threshold = new Date(
    Date.now() + 2 * 24 * 60 * 60 * 1000 // renew if expiring within 2 days
  ).toISOString()

  const { data: channels } = await supabase
    .from('watch_channels')
    .select('user_id, channel_id, resource_id')
    .lt('expiration', threshold)

  if (!channels?.length) return

  for (const ch of channels) {
    try {
      const accessToken = await getValidAccessToken(ch.user_id)
      await registerWebhook(ch.user_id, accessToken)
    } catch (err) {
      console.error(`Failed to renew webhook for user ${ch.user_id}:`, err)
    }
  }
}

export { WEBHOOK_TTL_DAYS }
