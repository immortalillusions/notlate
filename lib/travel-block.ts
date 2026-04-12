import type { RouteAlternative, WeatherInfo } from '@/lib/supabase-types'
import type { TravelMode } from '@/lib/directions'

const MODE_EMOJI: Record<TravelMode, string> = { // used in buildTravelBlockTitle
  driving: '🚗',
  walking: '🚶',
  transit: '🚌',
}

export function formatTime(date: Date, timeZone?: string): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timeZone ?? 'UTC',
  })
}

export function buildTravelBlockTitle(
  leaveByTime: Date,
  eventName: string,
  mode: TravelMode,
  timeZone?: string
): string {
  return `${MODE_EMOJI[mode]} Leave by ${formatTime(leaveByTime, timeZone)} — ${eventName}`
}

export function computeLeaveByTime(
  eventStart: Date,
  travelSeconds: number,
  bufferMinutes: number
): Date {
  return new Date(eventStart.getTime() - (travelSeconds + bufferMinutes * 60) * 1000)
}

export function buildTravelBlockDescription(
  route: RouteAlternative,
  weather: WeatherInfo | null,
  leaveByTime: Date,
  isEventMoved = false,
  timeZone?: string,
  departure?: string
): string {
  const travelMinutes = Math.round(route.durationSeconds / 60)
  const leaveBy = formatTime(leaveByTime, timeZone)
  const arriveAt = formatTime(route.arrivalTime, timeZone)

  const lines: string[] = [
    `Leave by: ${leaveBy} | Arrive at: ${arriveAt}`,
    `Travel time: ${travelMinutes} min`,
  ]

  if (departure) {
    lines.push(`From: ${departure}`)
  }

  const stepEmoji = { transit: '🚌', walk: '🚶', drive: '🚗' }
  const stepLines = route.steps.map((s) => {
    const timePrefix = s.departureTime ? ` at ${formatTime(s.departureTime, timeZone)}:` : ''
    return `  ${stepEmoji[s.type]}${timePrefix} ${s.description}`
  })
  lines.push('', 'Route:', ...stepLines)

  lines.push('')
  if (weather) {
    const precipEmoji = weather.precipMm > 0 ? '🌧️' : '☀️'
    lines.push(`Weather at destination (${formatTime(route.arrivalTime, timeZone)}):`)
    lines.push(
      `${precipEmoji} Precipitation: ${weather.precipMm}mm | 🌡️ ${weather.tempC}°C (feels like ${weather.feelsLikeC}°C)`
    )
  } else {
    lines.push('Weather: open-meteo API failed')
  }

  if (isEventMoved) {
    lines.push('')
    lines.push('Event moved: travel block auto updated!')
  }

  return lines.join('\n')
}
