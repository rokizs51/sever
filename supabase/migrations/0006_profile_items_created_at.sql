-- profile_items had no timestamp, so rows sharing a position (every manual
-- item was 0) had no defined display order. Same one-line house pattern as
-- the other tables in 0001; existing rows backfill to migration time.
alter table public.profile_items add column created_at timestamptz not null default now();
