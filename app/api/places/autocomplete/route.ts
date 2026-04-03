import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const input = request.nextUrl.searchParams.get('input') ?? ''
  const sessiontoken = request.nextUrl.searchParams.get('sessiontoken') ?? ''

  if (!input) return Response.json({ predictions: [] })

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return Response.json({ error: 'Missing GOOGLE_MAPS_API_KEY' }, { status: 500 })

  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
  url.searchParams.set('input', input)
  url.searchParams.set('key', apiKey)
  if (sessiontoken) url.searchParams.set('sessiontoken', sessiontoken)

  const res = await fetch(url.toString())
  const data = await res.json()

  return Response.json({ predictions: data.predictions ?? [] })
}
