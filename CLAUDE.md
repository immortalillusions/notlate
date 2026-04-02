@AGENTS.md

# Travel Time Calendar App — Project Spec

## Overview

A web app that automatically adds travel time blocks to Google Calendar events that have a location. Users manage settings and routes via a web dashboard; all output reflects natively in Google Calendar on all devices (PC, phone, etc.).

---

## Tech Stack

- **Frontend/Backend:** Next.js 16 App Router (TypeScript, Tailwind v4)
- **Auth:** Auth.js v5 (`next-auth@beta`) — Google OAuth with `calendar.readonly` + `calendar.events` scopes
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel
- **Scheduler:** Vercel Cron Jobs (`vercel.json`)

---

## APIs Used

### Google OAuth 2.0
- Scopes: `calendar.readonly`, `calendar.events`
- `access_type: 'offline'`, `prompt: 'consent'` to force refresh token on first login

### Google Calendar API
- Read upcoming events (filter for `event.location != null`)
- Create, update, delete travel block events
- Register and renew webhook push notifications (watch channels)
- **Webhook requires a public HTTPS URL** — won't fire on `localhost`. Works automatically on Vercel.

### Google Maps Directions API *(Legacy)*
- Called when user clicks "Get routes" in the side panel — **1 API call per click**
- Also called during auto-creation (background) and manual Refresh
- `alternatives=true` — returns all route options for the selected mode
- If `ZERO_RESULTS` or `NOT_FOUND`: throws `DirectionsNoRouteError`, no travel block is created, error stored in DB and shown on dashboard card
- Set a daily quota cap (e.g. 50 req/day) + $1/month budget alert in Google Cloud Console

### Open-Meteo API *(Free, no key)*
- Called on travel block create/refresh
- Lat/lng taken from the Directions API `end_location` — no extra geocoding call needed
- Returns: precipitation, feels-like temp, actual temp for the event hour

### Gemini API
- Called when user clicks "Update reminder on calendar" with AI mode selected
- Also called in background (`processEvent`) if event title/description has changed since last call
- Explicit user button always calls Gemini fresh (no change-detection cache) — avoids stale results after onboarding answers are updated
- Background auto-creation uses change detection to avoid unnecessary API calls
- If Gemini fails or returns non-integer, returns `-1` sentinel and caller falls back to `fixed_reminder_minutes`

---

## One-Time Setup Flow

1. User logs in via Google OAuth → upserted into `users` table
2. Redirected to `/onboarding` if `onboarding_complete = false`
3. Onboarding collects:
   - Default departure address
   - Default travel mode (driving / transit / walking)
   - Default buffer time
   - Reminder mode: **Fixed** (X min) or **AI/Predictive**
   - If AI: preparation time questionnaire per activity type (stored in `onboarding_answers` JSON)
4. On submit: saves to DB, registers Google Calendar webhook, redirects to `/dashboard`

---

## Auto-Creation Flow (Background)

### Webhook Setup
- Registered on onboarding completion via `POST /calendars/primary/events/watch`
- Webhook TTL ≈ 7 days — Vercel Cron renews every 6 days (`vercel.json`)
- On `localhost`: Google cannot POST to localhost, so webhooks never fire in dev

### On New/Updated Event (via webhook or manual Refresh)
`lib/process-event.ts` handles both paths:

1. Fetch directions using departure + mode + buffer (override or user defaults)
2. If `DirectionsNoRouteError`: store error in `event_overrides.directions_error`, return without touching GCal
3. Fetch weather (Open-Meteo) using lat/lng from directions response
4. If `reminder_mode = ai` AND title/description changed: call Gemini
5. Create or update travel block in Google Calendar
6. Upsert `event_overrides` — clears `directions_error` on success

### On Event Deleted
- Delete associated travel block from Google Calendar
- Remove `event_overrides` row

### On Event Moved
- Update travel block start/end times
- Do NOT update reminder — append `⚠️ Reminder time not updated — open app to refresh` to description

---

## Web App Structure

```
app/
  page.tsx                        → redirects to /dashboard or /login
  (auth)/login/page.tsx           → Google sign-in button
  (app)/
    layout.tsx                    → auth check (redirects to /login if no session)
    dashboard/page.tsx            → Server Component, lists events + overrides
    settings/page.tsx             → edit defaults
  onboarding/page.tsx             → first-run setup (outside (app) group to avoid redirect loop)
  api/
    auth/[...nextauth]/route.ts   → Auth.js handler
    webhook/calendar/route.ts     → Google Calendar push notifications
    directions/route.ts           → server proxy for Directions API
    events/[eventId]/
      refresh/route.ts            → manual refresh (calls processEvent)
      reminder/route.ts           → update reminder on GCal travel block
    cron/renew-webhooks/route.ts  → called by Vercel Cron (requires Authorization: Bearer <CRON_SECRET>)
  _components/
    EventCard.tsx                 → shows event + travel block summary + directions_error if set
    EventSidePanel.tsx            → override form + AI/Fixed reminder toggle + route picker
    RoutePicker.tsx               → expandable route cards → "Choose this route" button
    OnboardingForm.tsx            → multi-step onboarding
    SettingsForm.tsx              → settings with AI questionnaire shown when AI mode selected
    SessionProvider.tsx           → wraps next-auth SessionProvider

lib/
  auth.ts                         → Auth.js v5 config
  supabase.ts                     → lazy-init Supabase proxy (avoids build-time errors)
  supabase-types.ts               → TypeScript interfaces
  google-token.ts                 → access token refresh
  google-calendar.ts              → Calendar API wrappers
  directions.ts                   → Directions API + DirectionsNoRouteError class
  weather.ts                      → Open-Meteo
  gemini.ts                       → Gemini prep time estimation (returns -1 on failure)
  travel-block.ts                 → title/description builders
  webhook.ts                      → register + renew watch channels
  process-event.ts                → shared flow: directions → weather → Gemini → GCal

actions/
  complete-onboarding.ts
  save-settings.ts                → also saves onboarding_answers when AI mode selected
  save-override.ts                → saves departure/travel_mode/buffer to DB only (no GCal)
  apply-route.ts                  → saves chosen route, creates/updates GCal travel block
```

---

## SQL Schema

Run migrations in order via Supabase SQL editor.

### `supabase/migrations/001_init.sql`
```sql
users (id, google_id, email, access_token, refresh_token,
       default_departure, default_travel_mode, default_buffer_minutes,
       reminder_mode, fixed_reminder_minutes, onboarding_answers jsonb,
       onboarding_complete, created_at)

event_overrides (id, user_id, gcal_event_id,
                 departure_location, travel_mode, buffer_minutes,
                 reminder_minutes, last_gemini_title, last_gemini_description,
                 travel_block_gcal_id, last_event_start,
                 updated_at, unique(user_id, gcal_event_id))

watch_channels (id, user_id, channel_id, resource_id, expiration, created_at)
```

### `supabase/migrations/002_directions_error.sql`
```sql
alter table event_overrides add column if not exists directions_error text;
```

---

## Event Side Panel Behaviour

- **Save overrides** — saves departure location, travel mode, buffer to DB only
- **Reminder section** — independent AI/Fixed toggle per event (defaults to user's global setting)
  - Fixed: type minutes → "Update reminder on calendar" → updates GCal travel block + DB
  - AI: "Update reminder on calendar" → always calls Gemini fresh → updates GCal + DB
- **Travel Update / Change Route** — fetches routes for current mode (1 API call), shows expandable cards → tap to expand → "Choose this route" → updates GCal travel block

---

## Calendar Event Description Format

```
Travel time: 45 min  |  Leave by: 2:05 PM

Route:
  🚌 Bus 72: board College St → alight Spadina Ave (4 stops)
  🚶 Walk to destination (5 min)

Weather at destination (3:00 PM):
🌧️ Precipitation: 1.2mm | 🌡️ 8°C (feels like 5°C)

⚠️ Reminder time not updated — open app to refresh   ← only on auto-moved events
```

---

## Required Environment Variables

See `.env.local.example` for full list. Key ones:

```
NEXTAUTH_SECRET          # openssl rand -base64 32
NEXTAUTH_URL             # http://localhost:3000 in dev
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_MAPS_API_KEY
GEMINI_API_KEY
NEXT_PUBLIC_APP_URL      # your Vercel URL in prod (used for webhook registration)
CRON_SECRET
```

---

## Google Cloud Setup (Required)

1. Create a project, enable billing
2. Enable **Google Calendar API** and **Directions API (Legacy)**
3. Create OAuth 2.0 credentials
   - Authorised redirect URI: `http://localhost:3000/api/auth/callback/google` (dev) + your Vercel URL (prod)
4. Set daily quota cap on Directions API (~50 req/day) + $1/month budget alert

---

## Known Issues / TODO

- [ ] Gemini sometimes returns wrong values — prompt improvement needed
- [ ] Webhooks don't fire on `localhost` (Google can't reach it). Use ngrok/Cloudflare tunnel or deploy to Vercel to test the automatic flow. Manual Refresh on each event works as a workaround in dev.