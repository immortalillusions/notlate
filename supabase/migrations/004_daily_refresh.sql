alter table users add column if not exists daily_refresh_enabled boolean not null default false;
