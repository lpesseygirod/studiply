-- Step 3.5: the nightly job (20261026090500). It is scheduled at 03:15 UTC,
-- does nothing without its Vault secrets, POSTs to purge-trash with the
-- secret once they exist, and no app user can run it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is((select schedule from cron.job where jobname = 'purge-trash'), '15 3 * * *', 'purge-trash runs daily at 03:15 UTC');
select is((select command from cron.job where jobname = 'purge-trash'), 'select private.run_trash_purge()', 'it runs private.run_trash_purge()');

select ok(not has_function_privilege('authenticated', 'private.run_trash_purge()', 'execute'), 'a signed-in user cannot start it');
select ok(not has_function_privilege('anon', 'private.run_trash_purge()', 'execute'), 'anon cannot start it');
select ok(not has_function_privilege('service_role', 'private.run_trash_purge()', 'execute'), 'nor can the service role (it reads Vault)');

-- Without the secrets: no request
delete from vault.secrets where name in ('project_url', 'cron_secret');
create temporary table before on commit drop as select coalesce(max(id), 0) as id from net.http_request_queue;
select private.run_trash_purge();
select is((select count(*)::int from net.http_request_queue where id > (select id from before)), 0, 'without its Vault secrets it sends nothing');

-- With them: one POST to the function, with the secret
select vault.create_secret('http://example.test/', 'project_url');
select vault.create_secret('test-secret', 'cron_secret');
select private.run_trash_purge();
select is(
  (select url from net.http_request_queue where id > (select id from before)),
  'http://example.test/functions/v1/purge-trash',
  'with them it POSTs to the purge-trash function');
select is(
  (select headers->>'x-cron-secret' from net.http_request_queue where id > (select id from before)),
  'test-secret',
  'and sends the secret');

select * from finish();
rollback;
