alter table event_overrides
  add column if not exists directions_error text;
