-- Step 3.5: run the trash clean-up (Edge Function purge-trash) every night
-- at 03:15 UTC. pg_cron starts private.run_trash_purge(), which POSTs to the
-- function through pg_net with the shared secret in `x-cron-secret`.
--
-- Nothing project-specific is in this file. Both values are read from Vault
-- at run time; they are set once per project (by hand, never in git):
--
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<the CRON_SECRET of the function>', 'cron_secret');
--
-- Until both exist the job runs and does nothing (local Supabase, a fresh
-- project). The app's clean-up at sign-in stays as a backup.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function private.run_trash_purge()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  secret text;
begin
  select s.decrypted_secret into base from vault.decrypted_secrets s where s.name = 'project_url';
  select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name = 'cron_secret';
  if coalesce(base, '') = '' or coalesce(secret, '') = '' then
    return;
  end if;
  perform net.http_post(
    url := rtrim(base, '/') || '/functions/v1/purge-trash',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

-- It reads Vault: only the scheduler (postgres) may run it.
revoke execute on function private.run_trash_purge() from public, anon, authenticated, service_role;

-- Same name again replaces the job, so this is safe to re-run.
select cron.schedule('purge-trash', '15 3 * * *', 'select private.run_trash_purge()');
