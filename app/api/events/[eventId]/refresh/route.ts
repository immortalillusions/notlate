import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { getValidAccessToken } from '@/lib/google-token'
import { getEvent, deleteCalendarEvent } from '@/lib/google-calendar'
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

    // If the original event no longer exists, delete any travel block and override
    if (!event) {
      // Find any override for this event and delete associated travel block
      const { data: ov } = await supabase
        .from('event_overrides')
        .select('travel_block_gcal_id')
        .eq('user_id', session.user.id)
        .eq('gcal_event_id', eventId)
        .maybeSingle()

      if (ov?.travel_block_gcal_id) {
        try {
          await deleteCalendarEvent(accessToken, ov.travel_block_gcal_id)
        } catch (err) {
          console.error('Failed to delete travel block for removed event:', err)
        }
      }

      await supabase
        .from('event_overrides')
        .delete()
        .eq('user_id', session.user.id)
        .eq('gcal_event_id', eventId)

      return Response.json({ success: true })
    }

    // If the travel block was deleted manually, ensure we recreate it.
    const { data: ovBefore } = await supabase
      .from('event_overrides')
      .select('travel_block_gcal_id')
      .eq('user_id', session.user.id)
      .eq('gcal_event_id', eventId)
      .maybeSingle()

    if (ovBefore?.travel_block_gcal_id) {
      // Check the travel block exists in the user's calendar
      try {
        const tbEvent = await getEvent(accessToken, ovBefore.travel_block_gcal_id)
        // Treat cancelled calendar events as effectively deleted so refresh
        // will recreate them.
        const tbExists = !!tbEvent && (tbEvent.status ?? '') !== 'cancelled'
        if (!tbExists) {
          // Travel block was deleted or cancelled — clear stored id so processEvent will create a new one
          const { error } = await supabase
            .from('event_overrides')
            .update({ travel_block_gcal_id: null, updated_at: new Date().toISOString() })
            .match({ user_id: session.user.id, gcal_event_id: eventId })
          if (error) {
            // fallback to deleting the override row if update fails
            await supabase.from('event_overrides').delete().match({ user_id: session.user.id, gcal_event_id: eventId })
          }
        }
      } catch (err) {
        console.error('Failed to verify travel block existence:', err)
      }
    }

    if (!event.location) {
      // If event has no location, remove any existing travel block as well
      const { data: ov } = await supabase
        .from('event_overrides')
        .select('travel_block_gcal_id')
        .eq('user_id', session.user.id)
        .eq('gcal_event_id', eventId)
        .maybeSingle()

      if (ov?.travel_block_gcal_id) {
        await deleteCalendarEvent(accessToken, ov.travel_block_gcal_id).catch(() => {})
      }

      await supabase
        .from('event_overrides')
        .delete()
        .eq('user_id', session.user.id)
        .eq('gcal_event_id', eventId)

      return Response.json({ error: 'Event has no location' }, { status: 404 })
    }

    await processEvent(event, user, accessToken, false)

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refresh failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
