-- Only synthetic owner calls. This function does not process or store candidate data.
create table if not exists public.gethired_owner_quota (
  owner_id uuid not null references auth.users(id) on delete cascade,
  day_utc date not null,
  calls integer not null default 0 check (calls between 0 and 20),
  last_call timestamptz not null,
  primary key (owner_id, day_utc)
);
alter table public.gethired_owner_quota enable row level security;
revoke all on public.gethired_owner_quota from public, anon, authenticated;
create or replace function public.gethired_take_owner_quota() returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid := auth.uid(); v_now timestamptz := clock_timestamp(); v_day date := (v_now at time zone 'UTC')::date;
v_count integer; v_last timestamptz;
begin
  if v_id is null or not exists(select 1 from auth.users where id = v_id and lower(email) = 'sankalpjaiswal2006@gmail.com' and email_confirmed_at is not null) then return false; end if;
  -- Serialize simultaneous calls by the owner; an insert-conflict cannot bypass the limit.
  perform pg_advisory_xact_lock(hashtext(v_id::text));
  select calls, last_call into v_count, v_last from public.gethired_owner_quota where owner_id=v_id and day_utc=v_day for update;
  if found then
    if v_count>=20 or v_now-v_last<interval '20 seconds' then return false; end if;
    update public.gethired_owner_quota set calls=calls+1,last_call=v_now where owner_id=v_id and day_utc=v_day;
  else
    insert into public.gethired_owner_quota(owner_id,day_utc,calls,last_call) values(v_id,v_day,1,v_now);
  end if;
  return true;
end;
$$;
revoke all on function public.gethired_take_owner_quota() from public, anon;
grant execute on function public.gethired_take_owner_quota() to authenticated;
