import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { getValidAccessToken } from '@/lib/google-token'
import { getEvent, updateCalendarEvent } from '@/lib/google-calendar'
import { estimatePrepMinutes } from '@/lib/gemini'
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

  if (user.reminder_mode !== 'ai') {
    return Response.json({ error: 'AI reminder mode not enabled' }, { status: 400 })
  }

  const { data: override } = await supabase
    .from('event_overrides')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('gcal_event_id', eventId)
    .maybeSingle()

  try {
    const accessToken = await getValidAccessToken(session.user.id)
    const event = await getEvent(accessToken, eventId)

    if (!event) return Response.json({ error: 'Event not found' }, { status: 404 })

    // Check if title/description changed since last Gemini call
    const titleChanged = event.summary !== override?.last_gemini_title
    const descChanged = (event.description ?? '') !== (override?.last_gemini_description ?? '')

    let reminderMinutes = override?.reminder_minutes ?? user.fixed_reminder_minutes

    if (!override || titleChanged || descChanged) {
      if (!user.onboarding_answers) {
        return Response.json({ error: 'No onboarding answers found' }, { status: 400 })
      }
      reminderMinutes = await estimatePrepMinutes(
        event.summary,
        event.description ?? '',
        user.onboarding_answers
      )

      // Update the travel block reminder if one exists
      if (override?.travel_block_gcal_id) {
        await updateCalendarEvent(accessToken, override.travel_block_gcal_id, {
          reminderMinutes,
        })
      }

      // Persist to DB
      await supabase.from('event_overrides').upsert(
        {
          user_id: session.user.id,
          gcal_event_id: eventId,
          reminder_minutes: reminderMinutes,
          last_gemini_title: event.summary,
          last_gemini_description: event.description ?? '',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,gcal_event_id' }
      )
    }

    return Response.json({ reminderMinutes, cached: !titleChanged && !descChanged })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reminder update failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
