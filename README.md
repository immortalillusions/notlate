# NotLate — Travel Time Calendar App

Automatically adds travel time blocks to Google Calendar events that have a location. Manage settings and routes via a web dashboard; travel blocks appear natively in Google Calendar on all devices.

## Tech Stack

- **Frontend/Backend:** Next.js 16 App Router (TypeScript, Tailwind v4)
- **Auth:** Auth.js v5 (`next-auth@beta`) — Google OAuth
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel
- **Scheduler:** Vercel Cron Jobs

## Features

- Auto-creates travel blocks when a Google Calendar event with a location is added or updated
- Webhook-based real-time sync — only processes events in the next 7 days, only triggers Directions API when location or start time changes
- Driving, transit, and walking support with detailed route steps
- Weather at destination included in travel block description
- AI reminder estimation via Gemini (classifies event type, returns your prep time for that category)
- Fixed or AI reminder mode per event, with per-event overrides
- Places autocomplete (server-side proxy, session-token billed)
- Dashboard auto-refreshes when webhooks detect changes

## Setup

### 1. Environment Variables

Create `.env.local`:

```env
NEXTAUTH_SECRET=          # openssl rand -base64 32
AUTH_SECRET=              # same value as NEXTAUTH_SECRET
NEXTAUTH_URL=             # http://localhost:3000 (omit on Vercel)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_MAPS_API_KEY=      # server-side only
GEMINI_API_KEY=
NEXT_PUBLIC_APP_URL=      # your Vercel URL in prod
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

> **Note:** Google Calendar webhooks require a public HTTPS URL and won't fire on localhost. Use the "Sync now" button in Settings or "Refresh" on each event card to test the flow locally.

## How Google knows where to send webhook notifications

During onboarding (and on each cron renewal), `registerWebhook()` in `lib/webhook.ts` calls the Google Calendar watch API and registers your app's URL as the notification target. Google stores that URL and POSTs to it on every calendar change.

The registration returns a `channel_id` which is saved to the `watch_channels` Supabase table. When Google fires a notification, it includes that `channel_id` in the request headers — the POST handler in `app/api/webhook/calendar/route.ts` uses it to look up which user the notification belongs to (since all users share the same endpoint URL).

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
- `app/api/cron/renew-webhooks/route.ts` — automatic renewal every 6 days (watch channels expire after ~7 days)

## Dashboard refresh vs. travel block creation

These are two independent concerns — it's easy to conflate them.

**Travel block creation is purely server-side.** When a calendar change happens, Google posts to the webhook, which calls `processEvent`, which calls the Directions API and creates/updates the travel block in Google Calendar. This is instant and requires nothing from the browser.

**The dashboard UI is a different story.** The webhook calls `revalidatePath('/dashboard')` after processing, which marks the server's cached render as stale. But the browser tab that's already open has no way of knowing this happened — HTTP doesn't push. So `DashboardRefresher` polls `router.refresh()` every 30 seconds to pick up the fresh render.

Without the poll: travel blocks still get created instantly in Google Calendar, but the dashboard card would show stale data until the user manually refreshed the page. The poll exists purely for dashboard UI freshness, not for the core functionality.

If you wanted to remove the poll, you'd need a WebSocket or Server-Sent Events channel so the server can notify the browser immediately after `revalidatePath` — more complexity than it's worth for a calendar app.

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
