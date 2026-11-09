-- Step 10.1b-2 (20261029152500_terms_acceptance): accepting the Terms and the Privacy Policy, 16+.
--   Sign-up with the boxes ticked (metadata) → a row with the server's time; without them, none.
--   A student can only add her own acceptance, with the server's time; never change or delete one,
--   never see another's; a version is accepted once; bad versions and age_confirmed false refused.
--   Deleting the account deletes her acceptances.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ---------------------------------------------------------------------
-- The table and who may do what
-- ---------------------------------------------------------------------
select has_table('public', 'terms_acceptances', 'the table exists');
select columns_are('public', 'terms_acceptances', array['id', 'user_id', 'terms_version', 'age_confirmed', 'source', 'accepted_at'], 'its columns');
select ok((select relrowsecurity from pg_class where oid = 'public.terms_acceptances'::regclass), 'RLS is on');
select ok(not has_table_privilege('anon', 'public.terms_acceptances', 'select'), 'anon can''t read');
select ok(not has_table_privilege('anon', 'public.terms_acceptances', 'insert'), 'anon can''t add');
select ok(not has_table_privilege('authenticated', 'public.terms_acceptances', 'update'), 'nobody signed in can change a row');
select ok(not has_table_privilege('authenticated', 'public.terms_acceptances', 'delete'), 'or delete one');
select ok(not has_column_privilege('authenticated', 'public.terms_acceptances', 'accepted_at', 'insert'), 'the time can''t be given: the server''s');
select ok(not has_column_privilege('authenticated', 'public.terms_acceptances', 'user_id', 'insert'), 'nor whose it is');

-- ---------------------------------------------------------------------
-- Sign-up (the new-user trigger)
-- ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-0000-0000-0000-000000000211', 'terms-a@test.dev', '{"display_name": "A", "terms_version": "draft-31fd7f93", "age_16": true}'),
  ('dddddddd-0000-0000-0000-000000000212', 'terms-b@test.dev', '{"display_name": "B"}'),
  ('dddddddd-0000-0000-0000-000000000213', 'terms-c@test.dev', '{"display_name": "C", "terms_version": "draft-31fd7f93", "age_16": false}'),
  ('dddddddd-0000-0000-0000-000000000214', 'terms-d@test.dev', '{"display_name": "D", "terms_version": "x''; drop table x; --", "age_16": true}');

select results_eq(
  $$ select terms_version, age_confirmed, source from public.terms_acceptances where user_id = 'dddddddd-0000-0000-0000-000000000211' $$,
  $$ values ('draft-31fd7f93', true, 'sign_up') $$,
  'signed up with both boxes: her acceptance, the version, 16+, at sign-up');
select ok((select accepted_at between now() - interval '1 minute' and now() + interval '1 second'
             from public.terms_acceptances where user_id = 'dddddddd-0000-0000-0000-000000000211'), 'with the server''s time');
select is((select count(*)::int from public.terms_acceptances where user_id = 'dddddddd-0000-0000-0000-000000000212'), 0, 'no boxes in the metadata (Sign in with Apple): no row, the gate asks');
select is((select count(*)::int from public.terms_acceptances where user_id = 'dddddddd-0000-0000-0000-000000000213'), 0, 'under 16: no row');
select is((select count(*)::int from public.profiles where id = 'dddddddd-0000-0000-0000-000000000214'), 1, 'a malformed version never stops the account being created');
select is((select count(*)::int from public.terms_acceptances where user_id = 'dddddddd-0000-0000-0000-000000000214'), 0, '…and is not saved');

-- ---------------------------------------------------------------------
-- The gate: B accepts herself
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000212", "role": "authenticated"}';

select lives_ok($$ insert into public.terms_acceptances (terms_version, age_confirmed, source) values ('draft-31fd7f93', true, 'gate') $$, 'she accepts at the gate');
select is((select count(*)::int from public.terms_acceptances), 1, 'she sees her own row only, not A''s');
select throws_ok($$ insert into public.terms_acceptances (terms_version, age_confirmed, source) values ('draft-31fd7f93', true, 'gate') $$,
  '23505', null, 'a version is accepted once');
select throws_ok($$ insert into public.terms_acceptances (terms_version, age_confirmed, source) values ('2026-12-01-a1b2c3d4', false, 'gate') $$,
  '23514', null, 'not 16 or older: refused');
select throws_ok($$ insert into public.terms_acceptances (terms_version, age_confirmed, source, accepted_at) values ('2026-12-01-a1b2c3d4', true, 'gate', '2020-01-01') $$,
  '42501', null, 'she can''t backdate it');
select throws_ok($$ insert into public.terms_acceptances (user_id, terms_version, age_confirmed, source) values ('dddddddd-0000-0000-0000-000000000211', '2026-12-01-a1b2c3d4', true, 'gate') $$,
  '42501', null, 'nor accept for someone else');
select throws_ok($$ update public.terms_acceptances set terms_version = 'draft-00000000' $$, '42501', null, 'nor change her acceptance to another version');
select throws_ok($$ delete from public.terms_acceptances $$, '42501', null, 'nor delete it');

reset role;

-- ---------------------------------------------------------------------
-- Deleting the account
-- ---------------------------------------------------------------------
delete from auth.users where id = 'dddddddd-0000-0000-0000-000000000211';
select is((select count(*)::int from public.terms_acceptances where user_id = 'dddddddd-0000-0000-0000-000000000211'), 0, 'deleting the account deletes her acceptances');

select * from finish();
rollback;
