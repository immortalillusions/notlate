'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// Polls router.refresh() every 30 s so the dashboard picks up
// Next.js cache invalidations triggered by the webhook handler.
export default function DashboardRefresher() {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 5_000)
    return () => clearInterval(id)
  }, [router])
  return null
}
