import { google } from 'googleapis'
import { supabase } from '@/lib/supabase'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
)

export async function getValidAccessToken(userId: string): Promise<string> {
  const { data: user, error } = await supabase
    .from('users')
    .select('access_token, refresh_token')
    .eq('id', userId)
    .single()

  if (error || !user) throw new Error('User not found')
  if (!user.access_token) throw new Error('No access token for user')

  // Try to make a lightweight Calendar request to check if token is valid
  try {
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary',
      { headers: { Authorization: `Bearer ${user.access_token}` } }
    )

    if (res.ok) return user.access_token

    if (res.status !== 401) {
      // Non-expiry error (e.g. scope 403) — don't attempt refresh, surface it
      throw new Error(`Calendar API error: ${res.status}`)
    }
    // 401 falls through to refresh below
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Calendar API error:')) throw err
    // Network error — try to refresh anyway
  }

  // Token expired — refresh it
  if (!user.refresh_token) throw new Error('No refresh token — user must re-authorize')

  oauth2Client.setCredentials({ refresh_token: user.refresh_token })
  const { credentials } = await oauth2Client.refreshAccessToken()
  const newToken = credentials.access_token

  if (!newToken) throw new Error('Failed to refresh access token')

  await supabase
    .from('users')
    .update({ access_token: newToken })
    .eq('id', userId)

  return newToken
}
