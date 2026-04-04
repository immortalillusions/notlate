'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { supabaseClient } from '@/lib/supabase-client'

// Subscribes to calendar_events changes for the current user via Supabase Realtime
// (WebSocket). Calls router.refresh() once per change so the dashboard picks up
// fresh data without polling.
export default function DashboardRefresher({ userId }: { userId: string }) {
  const router = useRouter()

  useEffect(() => {
    const channel = supabaseClient
      .channel('calendar-events')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calendar_events',
          filter: `user_id=eq.${userId}`,
        },
        () => router.refresh()
      )
      .subscribe()

    return () => {
      supabaseClient.removeChannel(channel)
    }
  }, [userId, router])

  return null
}
