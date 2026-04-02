import type { RouteAlternative, RouteStep } from '@/lib/supabase-types'

export type TravelMode = 'driving' | 'transit' | 'walking'

interface DirectionsParams {
  origin: string
  destination: string
  arrivalTime: Date
  mode: TravelMode
}

export async function fetchDirections(
  params: DirectionsParams
): Promise<RouteAlternative[]> {
  const { origin, destination, arrivalTime, mode } = params
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) throw new Error('Missing GOOGLE_MAPS_API_KEY')

  const arrivalEpoch = Math.floor(arrivalTime.getTime() / 1000)

  const url = new URL('https://maps.googleapis.com/maps/api/directions/json')
  url.searchParams.set('origin', origin)
  url.searchParams.set('destination', destination)
  url.searchParams.set('arrival_time', String(arrivalEpoch))
  url.searchParams.set('mode', mode)
  url.searchParams.set('alternatives', 'true')
  url.searchParams.set('key', apiKey)

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Directions API HTTP error: ${res.status}`)

  const data = await res.json()

  if (data.status !== 'OK') {
    throw new Error(`Directions API error: ${data.status} — ${data.error_message ?? ''}`)
  }

  return (data.routes as GoogleRoute[]).map((route) => parseRoute(route, mode))
}

interface GoogleRoute {
  summary: string
  legs: GoogleLeg[]
}

interface GoogleLeg {
  duration: { value: number }
  departure_time?: { value: number }
  arrival_time?: { value: number }
  end_location: { lat: number; lng: number }
  steps: GoogleStep[]
}

interface GoogleStep {
  travel_mode: string
  duration: { value: number }
  html_instructions: string
  transit_details?: {
    line: { short_name?: string; name?: string }
    num_stops?: number
  }
}

function parseRoute(route: GoogleRoute, mode: TravelMode): RouteAlternative {
  const leg = route.legs[0]
  const durationSeconds = leg.duration.value

  // arrival_time is present for transit; for driving/walking use the param
  const arrivalEpoch = leg.arrival_time?.value
  const departureEpoch = leg.departure_time?.value

  const arrivalTime = arrivalEpoch ? new Date(arrivalEpoch * 1000) : new Date()
  const departureTime = departureEpoch
    ? new Date(departureEpoch * 1000)
    : new Date(arrivalTime.getTime() - durationSeconds * 1000)

  const steps: RouteStep[] = leg.steps.map((step) => {
    if (step.travel_mode === 'TRANSIT' && step.transit_details) {
      const line =
        step.transit_details.line.short_name ?? step.transit_details.line.name ?? 'Transit'
      return {
        type: 'transit',
        description: `${line} (${step.transit_details.num_stops ?? '?'} stops)`,
        durationSeconds: step.duration.value,
      }
    }
    if (step.travel_mode === 'WALKING') {
      return {
        type: 'walk',
        description: `walk ${Math.round(step.duration.value / 60)} min`,
        durationSeconds: step.duration.value,
      }
    }
    return {
      type: 'drive',
      description: stripHtml(step.html_instructions),
      durationSeconds: step.duration.value,
    }
  })

  // Build human-readable summary
  const routeSummary =
    mode === 'transit'
      ? steps.map((s) => s.description).join(' → ')
      : route.summary || steps.map((s) => s.description).slice(0, 3).join(' → ')

  return {
    durationSeconds,
    departureTime,
    arrivalTime,
    routeSummary,
    steps,
    endLocation: leg.end_location,
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}
