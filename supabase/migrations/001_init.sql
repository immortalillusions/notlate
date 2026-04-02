create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_id text unique not null,
  email text not null,
  access_token text,
  refresh_token text,
  default_departure text,
  default_travel_mode text default 'driving',
  default_buffer_minutes integer default 10,
  reminder_mode text default 'fixed',
  fixed_reminder_minutes integer default 15,
  onboarding_answers jsonb,
  onboarding_complete boolean default false,
  created_at timestamptz default now()
);

create table if not exists event_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  gcal_event_id text not null,
  departure_location text,
  travel_mode text,
  buffer_minutes integer,
  reminder_minutes integer,
  last_gemini_title text,
  last_gemini_description text,
  travel_block_gcal_id text,
  last_event_start timestamptz,
  updated_at timestamptz default now(),
  unique(user_id, gcal_event_id)
);

create table if not exists watch_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  channel_id text unique not null,
  resource_id text not null,
  expiration timestamptz not null,
  created_at timestamptz default now()
);
