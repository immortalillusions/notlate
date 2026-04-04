import { supabase } from '@/lib/supabase'
import { getValidAccessToken } from '@/lib/google-token'

function getAppUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null)
  if (!url) throw new Error('Missing NEXT_PUBLIC_APP_URL — set it to your Vercel deployment URL')
  if (url.includes('localhost'))
    throw new Error('NEXT_PUBLIC_APP_URL is localhost — webhooks require a public HTTPS URL')
  return url
}

export async function stopWebhook(userId: string): Promise<void> {
  const { data: channel } = await supabase
    .from('watch_channels')
    .select('channel_id, resource_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (channel) {
    const accessToken = await getValidAccessToken(userId)
    // Best-effort: Google returns 404 for already-expired channels — ignore
    await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: channel.channel_id, resourceId: channel.resource_id }),
    }).catch(() => {})

    await supabase.from('watch_channels').delete().eq('user_id', userId)
  }
}

export async function registerWebhook(userId: string): Promise<void> {
  const appUrl = getAppUrl()
  const channelId = crypto.randomUUID()

  const accessToken = await getValidAccessToken(userId)
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
    const err = await res.json().catch(() => ({}))
    throw new Error(`Webhook registration failed: ${res.status} — ${JSON.stringify(err)}`)
  }

  const data = await res.json()
  const expiration = new Date(Number(data.expiration)).toISOString()

  // Replace any existing channel for this user
  await supabase.from('watch_channels').delete().eq('user_id', userId)
  await supabase.from('watch_channels').insert({
    user_id: userId,
    channel_id: channelId,
    resource_id: data.resourceId,
    expiration,
  })
}
