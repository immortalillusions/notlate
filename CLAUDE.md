@AGENTS.md

# Travel Time Calendar App — Project Spec

## Overview

A web app that automatically adds travel time blocks to Google Calendar events that have a location. Users manage settings and routes via a web dashboard; all output reflects natively in Google Calendar on all devices (PC, phone, etc.).

---

## Tech Stack

- **Frontend/Backend:** Next.js 16 App Router (TypeScript, Tailwind v4)
- **Auth:** Auth.js v5 (`next-auth@beta`) — Google OAuth with `calendar.readonly` + `calendar.events` scopes, `trustHost: true` required for Vercel
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

### Google Places API *(Autocomplete + Details)*
- Used for departure address autocomplete in EventSidePanel, Settings, and Onboarding
- **Server-side proxy only** — `GOOGLE_MAPS_API_KEY` never exposed to client
- **Session tokens** (critical for billing): `crypto.randomUUID()` client-side, reused across all keystrokes in one typing session, same token sent to Details to close the session → billed as 1 session regardless of how many predictions were fetched
- Token reset to `null` after selection so next search starts a fresh session
- Proxy routes: `GET /api/places/autocomplete?input=...&sessiontoken=...` and `GET /api/places/details?place_id=...&sessiontoken=...`

### Open-Meteo API *(Free, no key)*
- Called on travel block create/refresh
- Lat/lng taken from the Directions API `end_location` — no extra geocoding call needed
- Returns: precipitation, feels-like temp, actual temp for the event hour

### Gemini API
- Model: `gemini-3.1-flash-lite-preview` via `@ai-sdk/google`
- Called when user clicks "Update reminder on calendar" with AI mode selected
- Also called in background (`processEvent`) if event title/description has changed since last call
- Explicit user button always calls Gemini fresh (no change-detection cache) — avoids stale results after onboarding answers are updated
- Background auto-creation uses change detection to avoid unnecessary API calls
- If Gemini fails or returns non-integer, returns `-1` sentinel and caller falls back to `fixed_reminder_minutes`
- Classifies events into: `PROFESSIONAL_LOW`, `PROFESSIONAL_HIGH`, `SOCIAL`, `FITNESS`, `ERRANDS`, `SPECIAL_EVENT`
- Returns the user's prep time for the matched category; defaults to 15 if no match

---

## One-Time Setup Flow

1. User logs in via Google OAuth → upserted into `users` table
2. Redirected to `/onboarding` if `onboarding_complete = false`
3. Onboarding collects:
   - Default departure address (with Places autocomplete)
   - Default travel mode (driving / transit / walking)
   - Default buffer time
   - Reminder mode: **Fixed** (X min) or **AI/Predictive**
   - If AI: preparation time questionnaire per activity type (stored in `onboarding_answers` JSON with keys: `professional_low`, `professional_high`, `social`, `fitness`, `errands`, `special_event`)
4. On submit: saves to DB, registers Google Calendar webhook, redirects to `/dashboard`

---

## Auto-Creation Flow (Background)

### Webhook Setup
- Registered on onboarding completion via `POST /calendars/primary/events/watch`
- Webhook TTL ≈ 7 days — Vercel Cron renews every 6 days (`vercel.json`)
- On `localhost`: Google cannot POST to localhost, so webhooks never fire in dev
- Settings page shows webhook status (active / expired / not registered) with days remaining, Re-register button, and Sync now button

### Webhook Change Detection (critical)
The webhook fires frequently (phone syncs, other clients). To avoid unnecessary API calls:
- **`calendar_events` table** caches the last-known `location` and `start_at` for each event
- On webhook: snapshot cache → fetch current events from GCal → update cache → for each event check if `location` or `start_at` changed
- **Only call `processEvent` (Directions API) if `location` or `start_at` changed** — title/description changes alone are ignored
- Travel blocks have no `location` so they never appear in results → feedback loop impossible
- After processing changes: `revalidatePath('/dashboard')` so dashboard auto-updates

### On New/Updated Event (via webhook or manual Refresh)
`lib/process-event.ts` handles both paths:

1. Fetch directions using departure + mode + buffer (override or user defaults)
2. If `DirectionsNoRouteError`: store error in `event_overrides.directions_error`, return without touching GCal
3. Fetch weather (Open-Meteo) using lat/lng from directions response
4. If `reminder_mode = ai` AND title/description changed: call Gemini
5. Create or update travel block in Google Calendar (with `timeZone` set for correct local time display)
6. Upsert `event_overrides` — clears `directions_error` on success

### Event Window
- `listUpcomingEventsWithLocation` fetches events from now through the next **7 days** only
- Limits Directions/Gemini API calls to imminent events
- Events beyond 7 days are picked up automatically once they fall within the window on the next webhook fire or sync

### On Event Ended (naturally passed)
- Travel block is **kept on Google Calendar** (user may want it as a record)
- `event_overrides` and `calendar_events` rows are purged by the `purge-expired-events` cron (runs every 3 days)
- Dashboard hides passed events via `start_at >= now` filter — no GCal call needed

### On Event Deleted / Location Removed
- Delete associated travel block from Google Calendar
- Remove `event_overrides` row

### On Event Moved
- Update travel block start/end times
---

## Dashboard

- Reads from `calendar_events` Supabase cache — **no Calendar API call on page load**
- `DashboardRefresher` client component subscribes to `calendar_events` changes via Supabase Realtime (WebSocket); calls `router.refresh()` once per change
- If no webhook is registered: shows banner prompting user to go to Settings

### Why Supabase Realtime is used instead of polling
The webhook calls `revalidatePath('/dashboard')` server-side, but that only marks the Next.js cache as stale — it has no way to push to an open browser tab. The browser must ask. On Vercel serverless, a persistent WebSocket connection between the webhook handler and an open browser tab isn't possible without external pub/sub infrastructure. **Supabase Realtime** solves this cleanly: the client opens a WebSocket connection to Supabase and subscribes directly to `calendar_events` changes; when the webhook upserts rows, Supabase pushes the event over that WebSocket to the browser, which calls `router.refresh()` once. No polling, no extra infrastructure. Free tier includes 500 concurrent connections and 2 million messages/month.

---

## Web App Structure

```
app/
  page.tsx                        → redirects to /dashboard or /login
  (auth)/login/page.tsx           → Google sign-in button
  (app)/
    layout.tsx                    → auth check (redirects to /login if no session)
    dashboard/page.tsx            → Server Component, reads from calendar_events cache
    settings/page.tsx             → edit defaults + WebhookSection
  onboarding/page.tsx             → first-run setup (outside (app) group to avoid redirect loop)
  api/
    auth/[...nextauth]/route.ts          → Auth.js handler
    webhook/calendar/route.ts           → Google Calendar push notifications (content-based change detection)
    directions/route.ts                 → server proxy for Directions API
    places/
      autocomplete/route.ts             → server proxy for Places Autocomplete (auth-protected)
      details/route.ts                  → server proxy for Place Details (closes billing session)
    events/[eventId]/
      refresh/route.ts                  → manual refresh (calls processEvent)
      reminder/route.ts                 → update reminder on GCal travel block
    cron/
      renew-webhooks/route.ts           → Vercel Cron every 6 days — renews expiring watch channels
      purge-expired-events/route.ts     → Vercel Cron every 3 days — deletes past events from DB (travel blocks kept on GCal)
  _components/
    AddressAutocomplete.tsx       → Places autocomplete input (session tokens, createPortal dropdown)
    DashboardRefresher.tsx        → client component, subscribes to calendar_events via Supabase Realtime WebSocket; calls router.refresh() on any change
    EventCard.tsx                 → shows event + mode emoji + departure + buffer + reminder values
    EventSidePanel.tsx            → travel settings + Get routes (saves overrides only on route selection)
    RoutePicker.tsx               → expandable route cards → "Choose this route"
    WebhookSection.tsx            → webhook status, Re-register button, Sync now button
    OnboardingForm.tsx            → multi-step onboarding with Places autocomplete
    SettingsForm.tsx              → settings with Places autocomplete + AI questionnaire
    SessionProvider.tsx           → wraps next-auth SessionProvider

lib/
  auth.ts                         → Auth.js v5 config (trustHost: true)
  supabase.ts                     → lazy-init Supabase proxy (avoids build-time errors)
  supabase-types.ts               → TypeScript interfaces (User, EventOverride, WatchChannel, CalendarEvent)
  google-token.ts                 → access token refresh
  google-calendar.ts              → Calendar API wrappers (timeZone-aware create/update)
  directions.ts                   → Directions API + step parsing (drive: HTML+distance, walk: HTML+distance, transit: stops)
  weather.ts                      → Open-Meteo
  gemini.ts                       → Gemini prep time estimation (returns -1 on failure)
  travel-block.ts                 → title (mode emoji) + description (departure, route steps, weather) builders
  webhook.ts                      → register + renew watch channels
  process-event.ts                → shared flow: directions → weather → Gemini → GCal

actions/
  complete-onboarding.ts          → saves settings + registers webhook
  save-settings.ts                → revalidates /dashboard and /settings
  save-override.ts                → saves departure/travel_mode/buffer to DB only (no GCal)
  apply-route.ts                  → saves chosen route + overrides, creates/updates GCal travel block
  register-webhook.ts             → manual re-register (throttled: skips if >3 days remaining)
  sync-events.ts                  → fetches Calendar API → upserts calendar_events cache
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

### `supabase/migrations/003_calendar_events.sql`
```sql
-- Cache of upcoming GCal events with a location (populated by webhook)
create table if not exists calendar_events (
  user_id        uuid    not null references users(id) on delete cascade,
  gcal_event_id  text    not null,
  summary        text    not null default '',
  location       text,
  description    text,
  start_at       timestamptz not null,
  end_at         timestamptz not null,
  updated_at     timestamptz default now(),
  primary key (user_id, gcal_event_id)
);

-- Debounce column (kept for potential future use; debounce removed in favour of content-based detection)
alter table watch_channels add column if not exists last_synced_at timestamptz;
```

---

## Event Side Panel Behaviour

- **Get routes** — saves departure/mode/buffer to DB AND fetches routes in one click. Overrides are only saved when a route is actually selected ("Choose this route"). Exiting the panel without choosing a route leaves existing overrides untouched.
- **Reminder section** — independent AI/Fixed toggle per event
  - Initialization for new events:
    - When a calendar event is first created and a travel block is auto-generated, set the travel-block reminder as follows:
      - If the user default `reminder_mode` is `ai`, call Gemini once during initial creation to determine the reminder minutes and use that value.
      - If the user default `reminder_mode` is `fixed`, use the user's `fixed_reminder_minutes` for the travel block reminder.
  - Important rules for subsequent actions (Refresh / event updates / moves / apply-route):
    - Do NOT change reminders when the user clicks Refresh, when an event is edited/moved, or when `apply-route` runs. These actions should only create/update travel block content (title/description/start/end) and must preserve any existing reminder value.
    - Reminders are changed only by the explicit "Update reminder on calendar" action (Fixed or AI) or by the initial auto-creation of a travel block for a newly created calendar event.
  - "Update reminder on calendar" button behavior:
    - Fixed: when the user types minutes and clicks the button, update the travel block reminder on Google Calendar and save the override.
    - AI: when clicked, always call Gemini fresh (no caching) to get reminder minutes, update the travel block reminder on calendar, and save the override.
  - Background `process-event` behavior:
    - `process-event` may call Gemini only during initial creation of a travel block when the user's default is AI. It must not call Gemini on Refresh or when updating an existing travel block due to event edits/moves.
    - If Gemini fails or returns a non-integer it should return `-1` and the code must fall back to `fixed_reminder_minutes` as a safe default.

---

## Calendar Event Description Format

```
Travel time: 45 min  |  Leave by: 2:05 PM
From: 123 Main St, Toronto, ON

Route:
  🚌 Bus 72: board College St → alight Spadina Ave (4 stops)
  🚶 Head north on Spadina Ave (200 m)
  🚶 Turn left onto College St (100 m)

Weather at destination (3:00 PM):
🌧️ Precipitation: 1.2mm | 🌡️ 8°C (feels like 5°C)

```

Title format: `{emoji} Leave by {time} — {event name}`
- 🚗 driving, 🚌 transit, 🚶 walking

### Timezone handling
- `event.start.timeZone` used when present (IANA name e.g. `America/Toronto`)
- Fallback: extract UTC offset from `event.start.dateTime` ISO string → `Etc/GMT±X`
- Vercel runs in UTC so this fallback is essential for correct local time display
- `google-calendar.ts` uses `formatDateForCalendar()` to format dates in the event's timezone when creating/updating travel blocks

---

## Required Environment Variables

```
NEXTAUTH_SECRET          # openssl rand -base64 32
AUTH_SECRET              # same value as NEXTAUTH_SECRET (Auth.js v5 reads both)
NEXTAUTH_URL             # http://localhost:3000 in dev (omit on Vercel — trustHost handles it)
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   # used by DashboardRefresher for Supabase Realtime WebSocket
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_MAPS_API_KEY      # server-side only — used for Directions API + Places API proxy
GEMINI_API_KEY
NEXT_PUBLIC_APP_URL      # your Vercel URL in prod (used for webhook registration)
CRON_SECRET
```

---

## Google Cloud Setup (Required)

1. Create a project, enable billing
2. Enable **Google Calendar API**, **Directions API (Legacy)**, and **Places API**
3. Create OAuth 2.0 credentials
   - Authorised redirect URI: `http://localhost:3000/api/auth/callback/google` (dev) + your Vercel URL (prod)
4. Set daily quota cap on Directions API (~50 req/day) + $1/month budget alert

---

## Known Issues / TODO

- [ ] Gemini sometimes returns wrong values — prompt improvement needed
- [ ] Webhooks don't fire on `localhost` (Google can't reach it). Use ngrok/Cloudflare tunnel or deploy to Vercel to test the automatic flow. Manual Refresh on each event works as a workaround in dev.
- [ ] `calendar_events` table must be populated via "Sync now" in Settings after first webhook registration (the initial `sync` notification fires before the table is ready)
- [x] **Replace `DashboardRefresher` polling with Supabase Realtime** — implemented in `lib/supabase-client.ts` + `DashboardRefresher.tsx`. Still requires: `NEXT_PUBLIC_SUPABASE_ANON_KEY` env var + Realtime enabled on `calendar_events` table in Supabase dashboard.
- [ ] **Consider merging `calendar_events` + `event_overrides`** — same PK, always queried together. Main risk: the webhook upserts `calendar_events` aggressively on every fire; a combined table requires every upsert to explicitly list only GCal columns to avoid clobbering user override columns (departure, travel mode, etc.). Currently safe by structure.
