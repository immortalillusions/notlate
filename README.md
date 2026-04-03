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
- Webhook-based real-time sync (only triggers Directions API when location or start time changes)
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

Deploy and set all env vars. Add a Cron Job in `vercel.json` to call `/api/cron/renew-webhooks` every 6 days (webhooks expire after 7 days).

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** Google Calendar webhooks require a public HTTPS URL and won't fire on localhost. Use the "Sync now" button in Settings or "Refresh" on each event card to test the flow locally.

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
