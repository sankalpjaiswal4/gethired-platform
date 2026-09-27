-- Dedicated private CV intake bucket. No anon/authenticated Storage policies.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('contact-cvs','contact-cvs',false,5242880,array['application/pdf','application/msword'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;
alter table public.gh_contact_interest add column if not exists resume_path text;
alter table public.gh_contact_interest add column if not exists resume_name text;
create unique index if not exists gh_contact_resume_path_unique on public.gh_contact_interest(resume_path) where resume_path is not null;
-- Only the service-role Edge Function can upload, read or remove files in this bucket.
-- The existing cron will be replaced after the cleanup Edge Function and its Vault key are ready.

alter table public.gh_contact_interest drop constraint if exists gh_contact_interest_consent_version_check;
alter table public.gh_contact_interest add constraint gh_contact_interest_consent_version_check check (consent_version in ('contact-v1','contact-cv-v2'));
