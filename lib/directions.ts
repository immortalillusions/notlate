import type { RouteAlternative, RouteStep } from '@/lib/supabase-types'

export class DirectionsNoRouteError extends Error {
  constructor(message = 'No route found between these locations') {
    super(message)
    this.name = 'DirectionsNoRouteError'
  }
}

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

  if (data.status === 'ZERO_RESULTS' || data.status === 'NOT_FOUND') {
    throw new DirectionsNoRouteError()
  }
  if (data.status !== 'OK') {
    throw new Error(`Directions API error: ${data.status} — ${data.error_message ?? ''}`)
  }

  return (data.routes as GoogleRoute[]).map((route) =>
    parseRoute(route, mode, arrivalTime)
  )
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
  distance?: { text: string; value: number }
  html_instructions: string
  transit_details?: {
    line: { short_name?: string; name?: string }
    num_stops?: number
    departure_stop?: { name: string }
    arrival_stop?: { name: string }
    departure_time?: { value: number }
  }
}

function parseRoute(
  route: GoogleRoute,
  mode: TravelMode,
  requestedArrivalTime: Date
): RouteAlternative {
  const leg = route.legs[0]
  const durationSeconds = leg.duration.value

  // Transit provides actual departure/arrival times from the API.
  // Driving and walking do not — use the requested arrival time instead.
  const arrivalTime = leg.arrival_time
    ? new Date(leg.arrival_time.value * 1000)
    : requestedArrivalTime
  const departureTime = leg.departure_time
    ? new Date(leg.departure_time.value * 1000)
    : new Date(arrivalTime.getTime() - durationSeconds * 1000)

  // Compute step departure times: start from route departure (arrivalTime - totalDuration)
  // and accumulate forward. For transit steps, prefer the exact scheduled departure_time.
  const routeStartTime = new Date(arrivalTime.getTime() - durationSeconds * 1000)
  let stepCursor = routeStartTime.getTime()

  const steps: RouteStep[] = leg.steps.map((step) => {
    const computedDeparture = new Date(stepCursor)
    stepCursor += step.duration.value * 1000

    if (step.travel_mode === 'TRANSIT' && step.transit_details) {
      const td = step.transit_details
      const line = td.line.short_name ?? td.line.name ?? 'Transit'
      const numStops = td.num_stops ?? 0
      const stopLabel = numStops === 1 ? '1 stop' : `${numStops} stops`
      const departureTime = td.departure_time
        ? new Date(td.departure_time.value * 1000)
        : computedDeparture
      return {
        type: 'transit',
        description: `${line}: board ${td.departure_stop?.name ?? '?'} → arrive ${td.arrival_stop?.name ?? '?'} (${stopLabel})`,
        durationSeconds: step.duration.value,
        departureTime,
        departureStop: td.departure_stop?.name,
        arrivalStop: td.arrival_stop?.name,
        numStops: td.num_stops,
      }
    }
    // Walking and driving: clean HTML instruction and append distance
    const instruction = cleanDriveInstruction(step.html_instructions)
    const description = step.distance?.text
      ? `${instruction} (${step.distance.text})`
      : instruction
    return {
      type: step.travel_mode === 'WALKING' ? 'walk' : 'drive',
      description,
      durationSeconds: step.duration.value,
      departureTime: computedDeparture,
    }
  })

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

/** Strip HTML from a driving instruction, removing sub-instruction divs. */
function cleanDriveInstruction(html: string): string {
  return html
    .replace(/<div[^>]*>[\s\S]*?<\/div>/gi, '') // drop "Toward X" sub-lines
    .replace(/<[^>]*>/g, '')                     // strip remaining tags
    .trim()
}
