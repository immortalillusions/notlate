-- Cache of upcoming Google Calendar events with a location.
-- Populated by the webhook handler; read by the dashboard to avoid
-- a Calendar API call on every page load.
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

-- Debounce column: skip processing if this was updated < 2 min ago.
alter table watch_channels
  add column if not exists last_synced_at timestamptz;
