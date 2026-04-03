export interface User {
  id: string
  google_id: string
  email: string
  access_token: string | null
  refresh_token: string | null
  default_departure: string | null
  default_travel_mode: 'driving' | 'transit' | 'walking'
  default_buffer_minutes: number
  reminder_mode: 'fixed' | 'ai'
  fixed_reminder_minutes: number
  onboarding_answers: OnboardingAnswers | null
  onboarding_complete: boolean
  created_at: string
}

export interface OnboardingAnswers {
  meeting: number
  hangout: number
  date: number
  rock_climbing: number
  exercise: number
  running: number
  food: number
}

export interface EventOverride {
  id: string
  user_id: string
  gcal_event_id: string
  departure_location: string | null
  travel_mode: 'driving' | 'transit' | 'walking' | null
  buffer_minutes: number | null
  reminder_minutes: number | null
  last_gemini_title: string | null
  last_gemini_description: string | null
  travel_block_gcal_id: string | null
  last_event_start: string | null
  directions_error: string | null
  updated_at: string
}

export interface WatchChannel {
  id: string
  user_id: string
  channel_id: string
  resource_id: string
  expiration: string
  last_synced_at: string | null
  created_at: string
}

export interface CalendarEvent {
  user_id: string
  gcal_event_id: string
  summary: string
  location: string | null
  description: string | null
  start_at: string
  end_at: string
  updated_at: string
}

export interface RouteAlternative {
  durationSeconds: number
  departureTime: Date
  arrivalTime: Date
  routeSummary: string
  steps: RouteStep[]
  endLocation: { lat: number; lng: number }
}

export interface RouteStep {
  type: 'transit' | 'walk' | 'drive'
  description: string
  durationSeconds: number
  // Transit-only fields
  departureStop?: string
  arrivalStop?: string
  numStops?: number
}

export interface WeatherInfo {
  tempC: number
  feelsLikeC: number
  precipMm: number
}

export interface TravelBlockParams {
  userId: string
  gcalEventId: string
  eventTitle: string
  eventDescription: string
  eventStart: Date
  eventLocation: string
  route: RouteAlternative
  weather: WeatherInfo | null
  reminderMinutes: number
  existingTravelBlockId: string | null
  isEventMoved?: boolean
}
