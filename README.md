# NotLate: Planned for you to leave on cue!

Automatically adds travel time blocks to Google Calendar events that have a location. Manage settings and routes via a web dashboard; travel blocks appear natively in Google Calendar on all devices. Reminder notifications are personalized with AI to user's behaviour.

## Tech Stack

- **Frontend/Backend:** Next.js 16 App Router (TypeScript, Tailwind v4)
- **Auth:** Auth.js v5 (`next-auth@beta`) — Google OAuth with `calendar.readonly` + `calendar.events` scopes, `trustHost: true` required for Vercel
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel
- **Scheduler:** Vercel Cron Jobs (`vercel.json`)

## Features

- Auto-creates travel blocks when a Google Calendar event with a location is added or updated
- Webhook-based real-time sync — only processes events in the next 7 days, only triggers Directions API when location or start time changes
- Disable webhook button in Settings — pauses all automatic calendar writes without deleting any data; re-registering resumes normal operation
- Driving, transit, and walking support with detailed route steps
- Weather at destination included in travel block description
- AI reminder estimation via Gemini (classifies event type, returns your prep time for that category)
- Fixed or AI reminder mode per event, with per-event overrides
- Places autocomplete (server-side proxy, session-token billed)
- Dashboard auto-refreshes via Supabase Realtime WebSocket when webhooks detect changes

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
- **Set a daily quota cap (~50 req/day) + $1/month budget alert** in Google Cloud Console to avoid surprise bills

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
- If Gemini fails or returns non-integer, returns `-1` sentinel and caller falls back to `fixed_reminder_minutes`
- Classifies events into: `PROFESSIONAL_LOW`, `PROFESSIONAL_HIGH`, `SOCIAL`, `FITNESS`, `ERRANDS`, `SPECIAL_EVENT`

## One-Time Setup Flow

1. User logs in via Google OAuth → upserted into `users` table
2. Redirected to `/onboarding` if `onboarding_complete = false`
3. Onboarding collects:
   - Default departure address (with Places autocomplete)
   - Default travel mode (driving / transit / walking)
   - Default buffer time
   - Reminder mode: **Fixed** (X min) or **AI/Predictive**
   - If AI: preparation time questionnaire per activity type (stored in `onboarding_answers` JSON)
4. On submit: saves to DB, registers Google Calendar webhook, redirects to `/dashboard`

## Setup

### 1. Environment Variables

Create `.env.local`:

```env
NEXTAUTH_SECRET=          # openssl rand -base64 32
AUTH_SECRET=              # same value as NEXTAUTH_SECRET (Auth.js v5 reads both)
NEXTAUTH_URL=             # http://localhost:3000 in dev (omit on Vercel — trustHost handles it)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # used by DashboardRefresher for Supabase Realtime WebSocket
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_MAPS_API_KEY=      # server-side only — used for Directions API + Places API proxy
GEMINI_API_KEY=
NEXT_PUBLIC_APP_URL=      # your Vercel URL in prod (used for webhook registration)
CRON_SECRET=
```

### 2. Google Cloud

1. Create a project and enable billing
2. Enable: **Google Calendar API**, **Directions API (Legacy)**, **Places API**
3. Create OAuth 2.0 credentials
   - Authorised redirect URIs: `http://localhost:3000/api/auth/callback/google` + your Vercel URL
4. Set a daily quota cap on Directions API (~50 req/day) + $1/month budget alert

### 3. Supabase

Run migrations in order via the Supabase SQL editor:

- `supabase/migrations/001_init.sql`
- `supabase/migrations/002_directions_error.sql`
- `supabase/migrations/003_calendar_events.sql`

Enable **Realtime** on the `calendar_events` table in the Supabase dashboard (required for `DashboardRefresher`).

### 4. Vercel

Deploy and set all env vars. Cron jobs are configured in `vercel.json`:

| Route | Schedule | Purpose |
|---|---|---|
| `/api/cron/renew-webhooks` | Every 6 days | Renews Google Calendar watch channels before they expire (TTL ~7 days) |
| `/api/cron/purge-expired-events` | Every 3 days | Deletes past events from DB (`calendar_events` + `event_overrides`); travel blocks are kept on GCal |

Both routes require `Authorization: Bearer <CRON_SECRET>`.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** Google Calendar webhooks require a public HTTPS URL and won't fire on localhost. Use the "Refresh" button on each event card to test the flow locally.

## Auto-Creation Flow

### Webhook Setup

- Registered on onboarding completion via `POST /calendars/primary/events/watch`
- Webhook TTL ≈ 7 days — Vercel Cron renews every 6 days
- Settings page shows webhook status (active / expired / not registered) with days remaining, Re-register button, and Disable button

### Disabling the webhook

The Settings page has a **Disable webhook** button (visible when the webhook is active). This is the intended way for users to pause the app:

- Calls Google's `channels.stop` endpoint to unsubscribe, then deletes the `watch_channels` row
- Without that row, the webhook POST handler returns 200 immediately without processing anything
- The `renew-webhooks` cron skips users with no `watch_channels` row, so the webhook will not be auto-renewed
- Manual dashboard actions (Refresh, route selection, reminder updates) still work — those require explicit user clicks
- Re-registering via the Register button resumes full automatic operation; no duplicate travel blocks are created because `processEvent` always upserts by `travel_block_gcal_id`

### How Google knows where to send notifications

`registerWebhook()` in `lib/webhook.ts` calls the Google Calendar watch API and registers your app's URL as the notification target. The registration returns a `channel_id` saved to `watch_channels`. When Google fires a notification, it includes that `channel_id` — the POST handler in `app/api/webhook/calendar/route.ts` uses it to look up which user the notification belongs to.

```
lib/webhook.ts → registerWebhook()
  → POSTs to Google Calendar watch API
  → tells Google: send notifications to /api/webhook/calendar
  → saves channel_id + expiration to watch_channels table

Calendar changes later...
  → Google POSTs to /api/webhook/calendar
  → route.ts reads x-goog-channel-id header
  → looks up channel_id in watch_channels → finds user
  → processes changes
```

`registerWebhook()` is called from:
- `actions/complete-onboarding.ts` — on first setup
- `actions/register-webhook.ts` — manual re-register from Settings
- `app/api/cron/renew-webhooks/route.ts` — automatic renewal every 6 days

`stopWebhook()` is called from:
- `actions/disable-webhook.ts` — Disable button in Settings

### Webhook Change Detection

The webhook fires frequently (phone syncs, other clients). To avoid unnecessary API calls:

- **`calendar_events` table** caches the last-known `location` and `start_at` for each event
- On webhook: snapshot cache → fetch current events from GCal → update cache → for each event check if `location` or `start_at` changed
- **Only call `processEvent` (Directions API) if `location` or `start_at` changed** — title/description changes alone are ignored
- Travel blocks have no `location` so they never appear in results → feedback loop impossible

### `processEvent` Steps (`lib/process-event.ts`)

Handles both webhook-triggered auto-creation and manual Refresh:

1. Fetch directions using departure + mode + buffer (override or user defaults)
2. If `DirectionsNoRouteError`: store error in `event_overrides.directions_error`, return without touching GCal
3. Fetch weather (Open-Meteo) using lat/lng from directions response
4. If `reminder_mode = ai` AND event title/description changed since last Gemini call: call Gemini
5. Create or update travel block in Google Calendar (with `timeZone` set for correct local time display)
6. Upsert `event_overrides` — clears `directions_error` on success, explicitly round-trips `departure_location`/`travel_mode`/`buffer_minutes` to prevent Supabase from silently nulling them

### Event Window

`listUpcomingEventsWithLocation` fetches events from now through the next **7 days** only. Events beyond 7 days are picked up automatically once they fall within the window on the next webhook fire or sync.

### Event Lifecycle

**Event naturally passes:** Travel block is kept on Google Calendar as a record. `event_overrides` and `calendar_events` rows are purged by the `purge-expired-events` cron every 3 days.

**Event deleted or location removed:** Associated travel block is deleted from Google Calendar; `event_overrides` row is removed.

**Event moved:** Travel block start/end times are updated.

## Dashboard

- Reads from `calendar_events` Supabase cache — **no Calendar API call on page load**
- `DashboardRefresher` client component subscribes to `calendar_events` changes via Supabase Realtime WebSocket; calls `router.refresh()` once per change
- If no webhook is registered: shows banner prompting user to go to Settings

### Why Supabase Realtime instead of polling

The webhook calls `revalidatePath('/dashboard')` server-side, but that only marks the Next.js cache as stale — it has no way to push to an open browser tab. On Vercel serverless, a persistent WebSocket connection between the webhook handler and an open browser tab isn't possible without external pub/sub infrastructure. **Supabase Realtime** solves this cleanly: the browser opens a WebSocket connection to Supabase and subscribes directly to `calendar_events` changes via Postgres `LISTEN/NOTIFY`; when the webhook upserts rows, Supabase pushes the event over that WebSocket to the browser, which calls `router.refresh()` once. No polling, no extra infrastructure. Free tier includes 500 concurrent connections and 2 million messages/month.

## Event Side Panel Behaviour

- **Get routes** — saves departure/mode/buffer to DB AND fetches routes in one click. Overrides are only saved when a route is actually selected ("Choose this route"). Exiting the panel without choosing a route leaves existing overrides untouched.
- **Reminder section** — independent AI/Fixed toggle per event
  - On initial travel block creation: if user default is `ai`, Gemini is called once; if `fixed`, uses `fixed_reminder_minutes`
  - **Refresh, event edits/moves, and apply-route do NOT change reminders** — they only update travel block content (title/description/start/end) and preserve the existing reminder value
  - "Update reminder on calendar": Fixed mode saves the typed value; AI mode always calls Gemini fresh (no caching)
  - If Gemini fails, falls back to `fixed_reminder_minutes`

## Travel Block Format

**Title:** `{emoji} Leave by {time} — {event name}`
- 🚗 driving, 🚌 transit, 🚶 walking

**Description:**
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

### Timezone Handling

- `event.start.timeZone` used when present (IANA name e.g. `America/Toronto`)
- Fallback: extract UTC offset from `event.start.dateTime` ISO string → `Etc/GMT±X`
- Vercel runs in UTC so this fallback is essential for correct local time display
- `google-calendar.ts` uses `formatDateForCalendar()` to format dates in the event's timezone when creating/updating travel blocks

## File Structure

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
      purge-expired-events/route.ts     → Vercel Cron every 3 days — deletes past events from DB
  _components/
    AddressAutocomplete.tsx       → Places autocomplete input (session tokens, createPortal dropdown, reverts on exit without selection)
    DashboardRefresher.tsx        → subscribes to calendar_events via Supabase Realtime WebSocket; calls router.refresh() on change
    EventCard.tsx                 → shows event + mode emoji + departure + buffer + reminder values
    EventSidePanel.tsx            → travel settings + Get routes (saves overrides only on route selection)
    RoutePicker.tsx               → expandable route cards → "Choose this route"
    SelectDropdown.tsx            → custom rounded dropdown (native select can't be rounded)
    WebhookSection.tsx            → webhook status, Re-register button, Disable button
    OnboardingForm.tsx            → multi-step onboarding with Places autocomplete
    SettingsForm.tsx              → settings with Places autocomplete + AI questionnaire
    ThemeProvider.tsx             → reads localStorage on mount, applies dark class to <html>
    ThemeToggle.tsx               → sun/moon button, toggles dark class + persists to localStorage
    CyclingText.tsx               → fades between phrases; invisible spacer prevents layout shift
    FeatureList.tsx               → framer-motion animated feature list on login page
    TutorialModal.tsx             → modal opened via custom window event
    SessionProvider.tsx           → wraps next-auth SessionProvider

lib/
  auth.ts                         → Auth.js v5 config (trustHost: true)
  supabase.ts                     → lazy-init Supabase service-role client
  supabase-client.ts              → client-side Supabase anon client for Realtime
  supabase-types.ts               → TypeScript interfaces (User, EventOverride, WatchChannel, CalendarEvent)
  google-token.ts                 → access token refresh
  google-calendar.ts              → Calendar API wrappers (timeZone-aware create/update)
  directions.ts                   → Directions API + step parsing (drive: HTML+distance, walk: HTML+distance, transit: stops)
  weather.ts                      → Open-Meteo
  gemini.ts                       → Gemini prep time estimation (returns -1 on failure)
  travel-block.ts                 → title (mode emoji) + description (departure, route steps, weather) builders
  webhook.ts                      → register, renew, and stop watch channels
  process-event.ts                → shared flow: directions → weather → Gemini → GCal create/update

actions/
  complete-onboarding.ts          → saves settings + registers webhook
  save-settings.ts                → revalidates /dashboard and /settings
  save-override.ts                → saves departure/travel_mode/buffer to DB only (no GCal)
  apply-route.ts                  → saves chosen route + overrides, creates/updates GCal travel block
  register-webhook.ts             → manual re-register (skips if >3 days remaining)
  disable-webhook.ts              → stops webhook via Google channels.stop + deletes watch_channels row
  sync-events.ts                  → fetches Calendar API → upserts calendar_events cache
```

## SQL Schema

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

alter table watch_channels add column if not exists last_synced_at timestamptz;
```

## Why `calendar_events` and `event_overrides` are separate tables

Both tables share the same primary key (`user_id`, `gcal_event_id`) and are always queried together, so combining them is tempting. The key risk: `calendar_events` is overwritten aggressively on every webhook fire; `event_overrides` is written carefully and infrequently — only when a travel block is created or the user explicitly changes a setting. If combined, every webhook upsert would need to explicitly name only the GCal columns, otherwise it would silently overwrite the user's custom settings. Currently that safety is structural.

## AI Reminder Categories

When AI mode is selected, Gemini classifies each event into one of:

| Category | Examples |
|---|---|
| Professional (Low) | Work meetings, classes |
| Professional (High) | Interviews, exams, networking |
| Social | Hangouts, dinners, parties, dates |
| Fitness | Gym, runs, sports |
| Errands | Groceries, therapy, appointments |
| Special Event | Weddings, concerts, conferences |

The matched category's prep time (set during onboarding/settings) is used as the reminder.

## Known Issues / TODO

- [ ] Webhooks don't fire on `localhost` (Google can't reach it). Use ngrok/Cloudflare tunnel or deploy to Vercel to test the automatic flow. Manual Refresh on each event works as a workaround in dev.
- [ ] Consider merging `calendar_events` + `event_overrides` — same PK, always queried together. Main risk: the webhook upserts `calendar_events` aggressively on every fire; a combined table requires every upsert to explicitly list only GCal columns to avoid clobbering user override columns. Currently safe by structure.