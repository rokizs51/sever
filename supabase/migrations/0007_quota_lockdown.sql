-- 0007_quota_lockdown.sql
-- generation_quota is a rate-limit counter AND the global cost ledger, but the
-- browser holds the anon key + the user JWT, so the old `for all` policy let
-- any user PATCH/POST/DELETE their own row via PostgREST (zeroing the cap and
-- corrupting the budget breaker). Users may now only read their row; all
-- writes go through record_usage(), which derives user_id from the JWT and the
-- month from the server clock so neither can be forged.

drop policy if exists generation_quota_owner_all on public.generation_quota;

create policy generation_quota_owner_select
  on public.generation_quota
  as permissive
  for select
  to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.generation_quota from authenticated, anon;

create or replace function public.record_usage(p_cost bigint, p_generations int default 1)
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
  -- Reject negatives: otherwise the caller could decrement the counter/cost.
  if p_cost < 0 or p_generations < 0 then
    raise exception 'usage values must be non-negative';
  end if;

  insert into public.generation_quota (user_id, month, generations, llm_cost_micros)
  values (uid, m, p_generations, p_cost)
  on conflict (user_id, month) do update
    set generations = public.generation_quota.generations + excluded.generations,
        llm_cost_micros = public.generation_quota.llm_cost_micros + excluded.llm_cost_micros;
end;
$$;

revoke all on function public.record_usage(bigint, int) from public;
revoke execute on function public.record_usage(bigint, int) from anon;
grant execute on function public.record_usage(bigint, int) to authenticated;