import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  return new Response('Webhook cron removed', { status: 410 })
}
