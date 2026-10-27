-- 0008_quota_reservation.sql
-- P0-2 follow-up to 0007: the monthly cap was enforced read-then-act —
-- request code compared currentUsage() against 50 and record_usage() only ran
-- AFTER the LLM call, so N concurrent requests all passed the same check and
-- all spent. reserve_generation() moves check AND increment into one locked
-- statement (the ON CONFLICT DO UPDATE row lock serializes reservations);
-- release_generation() hands the credit back when the attempt fails before
-- its spend is recorded, so "a failed generation costs no quota" stays true.
-- The global budget ceiling stays a soft pre-read check in request code: the
-- true cost of a call only exists after it is spent, so an atomic ceiling
-- would need estimates on the ledger. The per-user atomic cap bounds what one
-- burst can cost. shortcut: ceiling race across concurrent users persists,
-- upgrade to estimate-and-settle if the breaker is ever tripped in practice.

create or replace function public.reserve_generation()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m text := to_char(now() at time zone 'utc', 'YYYY-MM');
  n int;
begin
  if uid is null then
    raise exception 'authentication required';
  end if;
  insert into public.generation_quota (user_id, month, generations, llm_cost_micros)
  values (uid, m, 1, 0)
  on conflict (user_id, month) do update
    set generations = public.generation_quota.generations + 1
    -- keep in sync with GENERATIONS_CAP in src/lib/db/quota.ts
    where public.generation_quota.generations < 50
  returning generations into n;
  if n is null then
    -- QT429: the wrapper in src/lib/db/quota.ts maps this one code to
    -- "cap reached"; every other error code stays a hard error.
    raise exception 'monthly generation cap reached' using errcode = 'QT429';
  end if;
  return n;
end;
$$;

create or replace function public.release_generation()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m text := to_char(now() at time zone 'utc', 'YYYY-MM');
begin
  if uid is null then
    raise exception 'authentication required';
  end if;
  update public.generation_quota
     set generations = public.generation_quota.generations - 1
   where user_id = uid
     and month = m
     and generations > 0;
end;
$$;

revoke all on function public.reserve_generation() from public;
revoke execute on function public.reserve_generation() from anon;
grant execute on function public.reserve_generation() to authenticated;

revoke all on function public.release_generation() from public;
revoke execute on function public.release_generation() from anon;
grant execute on function public.release_generation() to authenticated;
