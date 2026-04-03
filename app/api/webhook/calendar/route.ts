import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(_request: NextRequest) {
  // Webhooks have been removed — respond Gone so senders stop retrying.
  return new Response('Webhook endpoint removed', { status: 410 })
}
