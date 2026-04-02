import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { getValidAccessToken } from '@/lib/google-token'
import { getEvent, updateCalendarEvent } from '@/lib/google-calendar'
import { estimatePrepMinutes } from '@/lib/gemini'
import type { User } from '@/lib/supabase-types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { eventId } = await params

  let body: { mode: 'fixed' | 'ai'; minutes?: number }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.mode !== 'fixed' && body.mode !== 'ai') {
    return Response.json({ error: 'mode must be "fixed" or "ai"' }, { status: 400 })
  }
  if (body.mode === 'fixed' && (body.minutes == null || isNaN(body.minutes))) {
    return Response.json({ error: 'minutes required for fixed mode' }, { status: 400 })
  }

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single<User>()

  if (!user) return Response.json({ error: 'User not found' }, { status: 404 })

  const { data: override } = await supabase
    .from('event_overrides')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('gcal_event_id', eventId)
    .maybeSingle()

  try {
    const accessToken = await getValidAccessToken(session.user.id)

    let reminderMinutes: number = override?.reminder_minutes ?? user.fixed_reminder_minutes

    if (body.mode === 'fixed') {
      reminderMinutes = body.minutes!
    } else {
      // AI mode — fetch event for change detection
      const event = await getEvent(accessToken, eventId)
      if (!event) return Response.json({ error: 'Event not found' }, { status: 404 })

      if (!user.onboarding_answers) {
        return Response.json(
          { error: 'No preparation time answers found — fill them in under Settings first.' },
          { status: 400 }
        )
      }

      // Always call Gemini fresh when the user explicitly requests it —
      // cached answers may be stale if onboarding answers were updated.
      const aiMinutes = await estimatePrepMinutes(
        event.summary,
        event.description ?? '',
        user.onboarding_answers
      )
      if (aiMinutes !== -1) reminderMinutes = aiMinutes

      // Persist Gemini result and cache keys
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

    if (body.mode === 'fixed') {
      // Persist fixed reminder
      await supabase.from('event_overrides').upsert(
        {
          user_id: session.user.id,
          gcal_event_id: eventId,
          reminder_minutes: reminderMinutes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,gcal_event_id' }
      )
    }

    // Update GCal travel block if one exists
    const travelBlockId = override?.travel_block_gcal_id
    if (travelBlockId) {
      await updateCalendarEvent(accessToken, travelBlockId, { reminderMinutes })
    }

    return Response.json({ reminderMinutes })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reminder update failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
