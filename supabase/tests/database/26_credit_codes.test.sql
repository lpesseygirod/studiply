-- Step 10.2 codes (20261029153100_credit_codes): free-credit codes and the admins.
--   Nobody but the functions reaches private.admins, credit_codes and code_attempts; anon can't redeem;
--   only the service role makes check admins. am_i_admin(). The admin functions refuse a student
--   (42501); an admin makes a code (upper-cased, one of a kind, its format checked) and switches it off.
--   Redeeming: once per account (lower case and spaces still match), until its total uses (full);
--   unknown, switched off and expired all answer invalid; 10 wrong tries in an hour → too_many, also with
--   a right code, and after the hour it works. The ledger: grant_code rows (+ only), key code:<id>,
--   label the code. Deleting an account deletes its tries and its admin row.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000261', 'codes-a@test.dev'),
  ('dddddddd-0000-0000-0000-000000000262', 'codes-admin@test.dev'),
  ('dddddddd-0000-0000-0000-000000000263', 'codes-c@test.dev'),
  ('dddddddd-0000-0000-0000-000000000264', 'codes-d@test.dev'),
  ('dddddddd-0000-0000-0000-000000000265', 'codes-e@test.dev');

/** As this student (her JWT): the function's answer as "outcome units balance". */
create function pg_temp.redeem_as(uid uuid, code text) returns text language plpgsql as $$
declare r record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.redeem_code(code);
  reset role;
  return r.outcome || ' ' || r.units || ' ' || r.balance_after;
end;
$$;
/** As this student: a statement's error code, or 'ok'. */
create function pg_temp.as_user(uid uuid, stmt text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    execute stmt;
  exception when others then
    reset role;
    return sqlstate;
  end;
  reset role;
  return 'ok';
end;
$$;
create function pg_temp.used_as(uid uuid, wanted text) returns integer language plpgsql as $$
declare r integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select c.used into r from public.admin_codes() c where c.code = wanted;
  reset role;
  return r;
end;
$$;
create function pg_temp.admin_as(uid uuid) returns boolean language plpgsql as $$
declare r boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.am_i_admin();
  reset role;
  return r;
end;
$$;

-- ---------------------------------------------------------------------
-- Who may reach what
-- ---------------------------------------------------------------------
select ok(not has_table_privilege('authenticated', 'private.credit_codes', 'select'), 'a student can''t read the codes');
select ok(not has_table_privilege('authenticated', 'private.code_attempts', 'select'), 'nor the tries');
select ok(not has_table_privilege('authenticated', 'private.admins', 'select'), 'nor who is an admin');
select ok(not has_function_privilege('anon', 'public.redeem_code(text)', 'execute'), 'anon can''t redeem');
select ok(not has_function_privilege('authenticated', 'public.service_set_admin(uuid, boolean)', 'execute'), 'only the service role makes check admins');
select is(pg_temp.admin_as('dddddddd-0000-0000-0000-000000000261'), false, 'am_i_admin: a student isn''t');
select is(pg_temp.as_user('dddddddd-0000-0000-0000-000000000261', 'select * from public.admin_codes()'), '42501', 'a student can''t list codes');
select is(pg_temp.as_user('dddddddd-0000-0000-0000-000000000261', $$ select public.admin_create_code('FREE99', 100, 999) $$), '42501', 'nor make one');

-- B is an admin (as Lea makes herself one in the SQL editor).
insert into private.admins (user_id, note) values ('dddddddd-0000-0000-0000-000000000262', 'test');
select is(pg_temp.admin_as('dddddddd-0000-0000-0000-000000000262'), true, 'am_i_admin: the admin is');

-- ---------------------------------------------------------------------
-- Making codes
-- ---------------------------------------------------------------------
select is(pg_temp.as_user('dddddddd-0000-0000-0000-000000000262', $$ select public.admin_create_code(' study10 ', 40, 2, null, 'For the class') $$), 'ok', 'the admin makes STUDY10 (10 lectures, 2 uses)');
select is((select code from private.credit_codes where note = 'For the class'), 'STUDY10', 'stored upper-case, without spaces');
select is(pg_temp.as_user('dddddddd-0000-0000-0000-000000000262', $$ select public.admin_create_code('Study10', 4, 5) $$), '23505', 'one of a kind (case doesn''t matter)');
select is(pg_temp.as_user('dddddddd-0000-0000-0000-000000000262', $$ select public.admin_create_code('A!', 4, 5) $$), '23514', 'its format is checked');

-- ---------------------------------------------------------------------
-- Redeeming
-- ---------------------------------------------------------------------
select is(pg_temp.redeem_as('dddddddd-0000-0000-0000-000000000261', ' study 10'), 'redeemed 40 48', 'A redeems it (lower case, spaces): 10 lectures added to her 2');
select is(pg_temp.redeem_as('dddddddd-0000-0000-0000-000000000261', 'STUDY10'), 'already 0 48', 'once per account');
select results_eq(
  $$ select kind, units, base_key = 'code:' || (select id from private.credit_codes where code = 'STUDY10')::text, label from public.credit_ledger where user_id = 'dddddddd-0000-0000-0000-000000000261' and kind = 'grant_code' $$,
  $$ values ('grant_code', 40, true, 'STUDY10') $$,
  'the ledger: one grant_code row, key code:<id>, labelled with the code');
select is(pg_temp.redeem_as('dddddddd-0000-0000-0000-000000000263', 'STUDY10'), 'redeemed 40 48', 'C uses it too (its 2nd use)');
select is(pg_temp.redeem_as('dddddddd-0000-0000-0000-000000000264', 'STUDY10'), 'full 0 8', 'D: its total uses are reached');
select is(pg_temp.used_as('dddddddd-0000-0000-0000-000000000262', 'STUDY10'), 2, 'the admin''s list counts its uses from the ledger');

-- Unknown, switched off and expired answer alike.
insert into private.credit_codes (code, units, max_redemptions, expires_at) values ('OLD2025', 4, 10, now() - interval '1 day');
insert into private.credit_codes (code, units, max_redemptions) values ('PAUSED', 4, 10);
select is(pg_temp.as_user('dddddddd-0000-0000-0000-000000000262', $$ select public.admin_set_code_active((select id from public.admin_codes() where code = 'PAUSED'), false) $$), 'ok', 'the admin switches PAUSED off');
select is(
  array[pg_temp.redeem_as('dddddddd-0000-0000-0000-000000000264', 'NOPE'), pg_temp.redeem_as('dddddddd-0000-0000-0000-000000000264', 'OLD2025'), pg_temp.redeem_as('dddddddd-0000-0000-0000-000000000264', 'PAUSED')],
  array['invalid 0 8', 'invalid 0 8', 'invalid 0 8'],
  'unknown, expired and switched off: the same answer');

-- Guessing: 10 wrong tries an hour.
insert into private.credit_codes (code, units, max_redemptions) values ('GOOD', 4, 10);
do $$ begin for i in 1..10 loop perform pg_temp.redeem_as('dddddddd-0000-0000-0000-000000000265', 'GUESS' || i); end loop; end $$;
select is(pg_temp.redeem_as('dddddddd-0000-0000-0000-000000000265', 'GOOD'), 'too_many 0 8', '10 wrong tries in an hour: too_many, even with a right code');
update private.code_attempts set at = now() - interval '61 minutes' where user_id = 'dddddddd-0000-0000-0000-000000000265';
select is(pg_temp.redeem_as('dddddddd-0000-0000-0000-000000000265', 'GOOD'), 'redeemed 4 12', 'after the hour it works');

-- ---------------------------------------------------------------------
-- The ledger and the account
-- ---------------------------------------------------------------------
select throws_ok(
  $$ insert into public.credit_ledger (user_id, units, kind, base_key) values ('dddddddd-0000-0000-0000-000000000264', -4, 'grant_code', 'code:x') $$,
  '23514', null, 'a grant_code row only adds');
select ok(not has_table_privilege('service_role', 'public.credit_ledger', 'update'), 'the ledger stays append-only');
delete from auth.users where id in ('dddddddd-0000-0000-0000-000000000265', 'dddddddd-0000-0000-0000-000000000262');
select is(
  (select count(*)::int from private.code_attempts where user_id = 'dddddddd-0000-0000-0000-000000000265')
  + (select count(*)::int from private.admins where user_id = 'dddddddd-0000-0000-0000-000000000262'),
  0, 'deleting an account deletes its tries and its admin row');

select * from finish();
rollback;
