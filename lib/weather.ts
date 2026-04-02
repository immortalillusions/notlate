import type { WeatherInfo } from '@/lib/supabase-types'

export async function fetchWeather(
  lat: number,
  lng: number,
  eventTime: Date
): Promise<WeatherInfo | null> {
  try {
    const date = eventTime.toISOString().split('T')[0]

    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lng))
    url.searchParams.set(
      'hourly',
      'temperature_2m,apparent_temperature,precipitation'
    )
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set('start_date', date)
    url.searchParams.set('end_date', date)

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null

    const data = await res.json()
    const hours: string[] = data.hourly?.time ?? []
    const temps: number[] = data.hourly?.temperature_2m ?? []
    const feelsLike: number[] = data.hourly?.apparent_temperature ?? []
    const precip: number[] = data.hourly?.precipitation ?? []

    // Find the hour closest to the event time
    const targetHour = eventTime.getUTCHours()
    let bestIdx = 0
    let bestDiff = Infinity

    for (let i = 0; i < hours.length; i++) {
      const h = new Date(hours[i]).getUTCHours()
      const diff = Math.abs(h - targetHour)
      if (diff < bestDiff) {
        bestDiff = diff
        bestIdx = i
      }
    }

    return {
      tempC: Math.round(temps[bestIdx] ?? 0),
      feelsLikeC: Math.round(feelsLike[bestIdx] ?? 0),
      precipMm: precip[bestIdx] ?? 0,
    }
  } catch {
    return null
  }
}
