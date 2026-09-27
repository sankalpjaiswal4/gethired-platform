-- Generate the cron-to-function bearer in Vault, never in GitHub or browser content.
do $$begin
 if not exists(select 1 from vault.secrets where name='gh_contact_cleanup_secret') then
   perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'gh_contact_cleanup_secret');
 end if;
end $$;
create or replace function public.gh_check_cleanup_secret(p_secret text)
returns boolean language sql security definer set search_path=public,vault as $$
 select p_secret is not null and length(p_secret)=64 and exists(
  select 1 from vault.decrypted_secrets where name='gh_contact_cleanup_secret'
  and decrypted_secret=p_secret
 );
$$;
revoke all on function public.gh_check_cleanup_secret(text) from public,anon,authenticated;
grant execute on function public.gh_check_cleanup_secret(text) to service_role;
