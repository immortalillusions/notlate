@AGENTS.md

# Travel Time Calendar App — Project Spec

## Overview

A web app that automatically adds travel time blocks to Google Calendar events that have a location. Users manage settings and routes via a web dashboard; all output reflects natively in Google Calendar on all devices (PC, phone, etc.).

---

## Tech Stack (TBD)

- **Frontend:** React (or Next.js)
- **Backend:** Node.js / Next.js API routes
- **Database:** SQL (e.g. PostgreSQL via Supabase or PlanetScale)
- **Hosting:** Vercel
- **Scheduler:** Vercel Cron Jobs

---

## APIs Used

### Google OAuth 2.0
- User authentication and authorization
- Scopes needed: `calendar.readonly`, `calendar.events`

### Google Calendar API
- Read upcoming events (filter for events with a location)
- Create, update, delete travel block events
- Register and renew webhook push notifications (watch channels)

### Google Maps Directions API *(Legacy — keeping for now)*
- Called when user clicks "Travel Update / Change Route" in the side panel
- **1 API call per button click** — only for the travel mode selected in the dropdown
- Parameters passed: `origin`, `destination`, `arrival_time` (= event start − buffer), `mode` (driving | transit | walking), `alternatives=true`
- Returns all alternative routes for that mode: duration, steps (including transit lines/bus numbers), departure time
- To compare a different mode, user changes the dropdown and clicks the button again (1 call per click)
- Also called during auto-creation (background) using the user's default travel mode
- **Note:** Requires a Google Cloud billing account. Set a daily quota cap (e.g. 50 req/day) and a $1/month budget alert in Google Cloud Console to prevent accidental charges.

### Open-Meteo API *(Free, no key required)*
- Called when a travel block is created or refreshed
- Parameters: latitude/longitude of destination, date/time of event
- Returns: precipitation (rain/snow), feels-like temp, actual temp
- Included in travel block event description

### Gemini API
- Called to estimate preparation/reminder time based on event title + description
- Only called if: (a) user chose "AI/predictive" reminder mode, AND (b) event title or description has changed since last call
- Uses answers from onboarding questionnaire as context (stored in SQL)

---

## One-Time Setup Flow

1. User logs in via Google OAuth
2. User sets defaults (saved to SQL):
   - Default departure location
   - Default travel mode (driving / transit / walking)
   - Default buffer time (e.g. 10 min before arrival)
   - Default reminder mode:
     - **Fixed:** X minutes before the travel block starts
     - **AI/Predictive:** Gemini estimates prep time based on event type
       - If chosen: user completes onboarding questionnaire
         - "How long does it take you to get ready for: a meeting / normal hangout / date / rock climbing / exercise / running / food?"
         - Answers stored in SQL and used as Gemini context

---

## Auto-Creation Flow (Background, No User Action Required)

### Webhook Setup
- On login, app registers a Google Calendar push notification (webhook) via the Calendar API
- **Webhooks expire after ~7 days** if no calendar activity occurs
- Vercel Cron Job runs every 6 days to renew the webhook proactively

### On New Event Added (with a location)
1. Webhook fires → backend receives notification
2. Fetch event details (title, description, location, start time)
3. Call Directions API with default departure location, arrive by = event start − default buffer
4. Call Open-Meteo for weather at destination + event time
5. If reminder mode = AI: call Gemini with event title/description + onboarding answers
6. Create a new travel block event in Google Calendar:
   - Title: e.g. "🚗 Leave by 2:27 PM — Dentist"
   - Start: calculated departure time
   - End: event start time
   - Description includes:
     - Route summary (e.g. "72 → 2 → walk 5 min" for transit)
     - Weather: precipitation, feels-like temp, actual temp
   - Reminder set based on reminder mode (fixed or AI-estimated)
7. Save event override record to SQL (with defaults used, linked to Google Calendar event ID)

### On Event Moved or Time Changed
1. Webhook fires → backend detects time/location change
2. Recalculate travel time using saved params (from SQL override or defaults)
3. Update weather for new event time
4. Update travel block in Google Calendar
5. **Reminder time:** NOT recalculated automatically on event move — only recalculated if user clicks Refresh in the app
   - A note in the travel block description: "⚠️ Reminder time not updated — open app to refresh"

### On Event Deleted
- Automatically delete the associated travel block from Google Calendar

---

## Web App (Manual Control Dashboard)

### Main View
- Lists all upcoming Google Calendar events that have a location
- Each event card shows:
  - Event title, date/time, location
  - Current travel block summary (leave by time, route, travel mode)
  - "Refresh" button

### Refresh Button (per event)
- Re-calls Directions API using saved params to get updated traffic/transit times
- Updates weather in travel block description
- Re-estimates reminder time via Gemini **only if** event title/description has changed since last Gemini call AND reminder mode = AI
- Updates travel block in Google Calendar

### Event Side Panel (click an event to open)
Editable fields:
- **Departure location** — pre-filled with default or saved override
- **Buffer time** — pre-filled with default or saved override
- **Travel mode** — dropdown (driving / transit / walking), pre-filled with default or saved override
- **Reminder / preparation time** — pre-filled with default or saved override

#### "Travel Update / Change Route" Button
- Label/description: *"Update travel info or choose a different route"*
- User sets travel mode in the dropdown **before** clicking — only 1 Directions API call is made for that specific mode, with `alternatives=true`
- Parameters passed: `origin`, `destination`, `arrival_time` (= event start − buffer), `mode` (selected mode), `alternatives=true`
- Displays a route picker panel showing alternatives for the selected mode only:

```
🚌 Transit  —  Arrive by: 2:50 PM  (3:00 PM event − 10 min buffer)

  Route 1 — 45 min → Leave by 2:05 PM — 72 → 2 → walk 5 min
  Route 2 — 52 min → Leave by 1:58 PM — 27 → walk 8 min
```

- User selects a route → travel block is updated in Google Calendar with chosen route info
- Chosen route + params (including travel mode) saved to SQL as override for this event
- To see routes for a different mode, user changes the dropdown and clicks "Travel Update" again (1 API call per click)

#### "Reminder Update" Button
- Re-calls Gemini only if event title/description has changed since last call
- Otherwise uses cached result from SQL
- Updates reminder on the travel block event in Google Calendar

---

## SQL Schema (High Level)

### `users`
| Field | Description |
|---|---|
| id | Primary key |
| google_id | Google OAuth user ID |
| default_departure | Default departure address |
| default_travel_mode | driving / transit / walking |
| default_buffer_minutes | e.g. 10 |
| reminder_mode | fixed / ai |
| fixed_reminder_minutes | used if reminder_mode = fixed |
| onboarding_answers | JSON — answers to prep time questions |

### `event_overrides`
| Field | Description |
|---|---|
| id | Primary key |
| user_id | FK to users |
| gcal_event_id | Google Calendar event ID |
| departure_location | Override or null (use default) |
| travel_mode | Override or null |
| buffer_minutes | Override or null |
| reminder_minutes | Override or null (AI-estimated or user-set) |
| last_gemini_title | Title used in last Gemini call (for change detection) |
| last_gemini_description | Description used in last Gemini call |
| travel_block_gcal_id | Google Calendar ID of the associated travel block event |

---

## Open Questions / Notes

- [ ] Reminder time is **not** auto-updated when an event moves — only on manual Refresh. Consider adding a note in travel block description to inform user.
- [ ] Rate limiting: Gemini is only called if title/description changed — avoids unnecessary API calls
- [ ] Webhook renewal: Vercel Cron fires every 6 days (webhook TTL is ~7 days)
- [ ] Google Cloud setup required: billing account + API key for Directions API. Set daily quota cap (e.g. 50 req/day) + $1/month budget alert to avoid charges.
- [ ] Open-Meteo is completely free, no key or billing needed