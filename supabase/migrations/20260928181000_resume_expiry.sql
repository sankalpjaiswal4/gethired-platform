-- Replace the row-only expiry with an authenticated Storage API cleanup.
-- A failed file removal retains its database row for the next scheduled retry.
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname='gh-contact-expiry-daily';
select cron.schedule('gh-contact-expiry-daily','15 2 * * *',
  $$select net.http_post(
    url:='https://rlozvzlpapciwgointjp.supabase.co/functions/v1/gethired-contact',
    headers:=jsonb_build_object('Content-Type','application/json','x-cleanup-secret',(select decrypted_secret from vault.decrypted_secrets where name='gh_contact_cleanup_secret')),
    body:='{}'::jsonb,
    timeout_milliseconds:=120000
  );$$);
