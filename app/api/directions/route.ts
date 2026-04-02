import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { fetchDirections, type TravelMode } from '@/lib/directions'
import { z } from 'zod'

const schema = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  arrivalTime: z.string(),
  mode: z.enum(['driving', 'transit', 'walking']),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { origin, destination, arrivalTime, mode } = parsed.data

  try {
    const routes = await fetchDirections({
      origin,
      destination,
      arrivalTime: new Date(arrivalTime),
      mode: mode as TravelMode,
    })

    return Response.json({ routes })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Directions API error'
    return Response.json({ error: message }, { status: 502 })
  }
}
