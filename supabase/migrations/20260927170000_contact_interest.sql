-- Contact-only interest list, not a job application or employer account.
create table if not exists public.gh_contact_interest (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('job_seeker','employer')),
 full_name text,
 company_name text,
 contact_name text,
 email text not null,
 phone text,
 role_family text,
 experience_level text,
 hiring_roles text,
 consent_version text not null check(consent_version='contact-v1'),
 created_at timestamptz not null default now(),
 constraint seeker_fields check ((kind='job_seeker' and full_name is not null and phone is not null and role_family is not null and experience_level is not null and company_name is null and contact_name is null and hiring_roles is null) or (kind='employer' and company_name is not null and contact_name is not null and hiring_roles is not null and full_name is null and phone is null and role_family is null and experience_level is null)),
 unique(kind,email)
);
create table if not exists public.gh_contact_rate (
 ip_hash text not null,
 bucket timestamptz not null,
 attempts int not null default 0,
 primary key(ip_hash,bucket)
);
alter table public.gh_contact_interest enable row level security;
alter table public.gh_contact_rate enable row level security;
revoke all on public.gh_contact_interest,public.gh_contact_rate from anon, authenticated;
create or replace function public.gh_take_contact_rate(p_hash text) returns boolean language plpgsql security definer set search_path=public as $$
declare n int; b timestamptz:=date_trunc('hour',now());
begin
 if length(p_hash)<>64 or p_hash !~ '^[a-f0-9]+$' then return false; end if;
 insert into public.gh_contact_rate(ip_hash,bucket,attempts) values(p_hash,b,1)
 on conflict(ip_hash,bucket) do update set attempts=public.gh_contact_rate.attempts+1
 returning attempts into n;
 return n<=40;
end $$;
revoke all on function public.gh_take_contact_rate(text) from public,anon,authenticated;
grant execute on function public.gh_take_contact_rate(text) to service_role;

-- Retention is enforced in the database, including if the website is offline.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('gh-contact-expiry-daily','15 2 * * *',
  $$delete from public.gh_contact_interest where created_at < now() - interval '12 months';
    delete from public.gh_contact_rate where bucket < now() - interval '2 days';$$);
