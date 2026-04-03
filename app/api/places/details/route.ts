import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const placeId = request.nextUrl.searchParams.get('place_id') ?? ''
  const sessiontoken = request.nextUrl.searchParams.get('sessiontoken') ?? ''

  if (!placeId) return Response.json({ error: 'Missing place_id' }, { status: 400 })

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return Response.json({ error: 'Missing GOOGLE_MAPS_API_KEY' }, { status: 500 })

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('fields', 'formatted_address')
  url.searchParams.set('key', apiKey)
  // Sending the same sessiontoken as the autocomplete calls closes the billing session,
  // so all autocomplete + one details call = 1 session = 1 charge.
  if (sessiontoken) url.searchParams.set('sessiontoken', sessiontoken)

  const res = await fetch(url.toString())
  const data = await res.json()

  return Response.json({ address: data.result?.formatted_address ?? null })
}
