import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { getValidAccessToken } from '@/lib/google-token'
import { getEvent } from '@/lib/google-calendar'
import { processEvent } from '@/lib/process-event'
import type { User } from '@/lib/supabase-types'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId } = await params

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single<User>()

  if (!user) return Response.json({ error: 'User not found' }, { status: 404 })

  try {
    const accessToken = await getValidAccessToken(session.user.id)
    const event = await getEvent(accessToken, eventId)

    if (!event || !event.location) {
      return Response.json({ error: 'Event not found or has no location' }, { status: 404 })
    }

    await processEvent(event, user, accessToken, false)

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refresh failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
