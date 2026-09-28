-- Atomic limits scoped to one UTC hour. No raw email or client IP is stored.
-- The function is service-role only; the caller hashes normalized email with
-- a server secret before invoking it.
create or replace function public.gh_take_contact_rate_v2(p_global_hash text, p_email_hash text)
returns boolean language plpgsql security definer set search_path=public as $$
declare n int; b timestamptz:=date_trunc('hour',now());
begin
 if p_global_hash !~ '^[a-f0-9]{64}$' or p_email_hash !~ '^[a-f0-9]{64}$'
   or p_global_hash=p_email_hash then return false; end if;
 -- A unique-email flood can still exhaust this global circuit breaker.
 insert into public.gh_contact_rate(ip_hash,bucket,attempts) values(p_global_hash,b,1)
 on conflict(ip_hash,bucket) do update set attempts=public.gh_contact_rate.attempts+1
 returning attempts into n;
 if n>400 then return false; end if;
 insert into public.gh_contact_rate(ip_hash,bucket,attempts) values(p_email_hash,b,1)
 on conflict(ip_hash,bucket) do update set attempts=public.gh_contact_rate.attempts+1
 returning attempts into n;
 return n<=3;
end $$;
revoke all on function public.gh_take_contact_rate_v2(text,text) from public,anon,authenticated;
grant execute on function public.gh_take_contact_rate_v2(text,text) to service_role;
