import type { RouteAlternative, WeatherInfo } from '@/lib/supabase-types'

export function formatTime(date: Date, timeZone?: string): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(timeZone ? { timeZone } : {}),
  })
}

export function buildTravelBlockTitle(leaveByTime: Date, eventName: string, timeZone?: string): string {
  return `🚗 Leave by ${formatTime(leaveByTime, timeZone)} — ${eventName}`
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
  isEventMoved = false,
  timeZone?: string
): string {
  const travelMinutes = Math.round(route.durationSeconds / 60)
  const leaveBy = formatTime(route.departureTime, timeZone)

  const stepEmoji = { transit: '🚌', walk: '🚶', drive: '🚗' }
  const stepLines = route.steps.map(
    (s) => `  ${stepEmoji[s.type]} ${s.description}`
  )

  const lines: string[] = [
    `Travel time: ${travelMinutes} min  |  Leave by: ${leaveBy}`,
    '',
    'Route:',
    ...stepLines,
  ]

  if (weather) {
    const precipEmoji = weather.precipMm > 0 ? '🌧️' : '☀️'
    lines.push('')
    lines.push(`Weather at destination (${formatTime(route.arrivalTime, timeZone)}):`)
    lines.push(
      `${precipEmoji} Precipitation: ${weather.precipMm}mm | 🌡️ ${weather.tempC}°C (feels like ${weather.feelsLikeC}°C)`
    )
  }

  if (isEventMoved) {
    lines.push('')
    lines.push('⚠️ Reminder time not updated — open app to refresh')
  }

  return lines.join('\n')
}
