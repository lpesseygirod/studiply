-- Step 10.2-1 (20261029152800_credits): the credit ledger and spending.
--   Who may do what: RLS on, her own rows only; nobody (the service role included) updates or deletes
--   a row; only the service role spends or grants. A new account gets 2 lectures (8 units) once, and
--   handle_new_user still makes the profile and the terms acceptance. credits_backfill() adds nothing
--   the second time; it carries over transcribed blocks and done summaries at 0 units.
--   spend_credits: spent / already / insufficient, never below 0; reverse_spend once (its own key),
--   then a reversed key pays again as attempt 2. spend_summary: the first is included, again costs 2,
--   an unpaid lecture pays 4 first, a reversed first summary frees "first". my_credits: her balance
--   and history. Deleting the account deletes her rows; purging a lecture leaves them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-0000-0000-0000-000000000241', 'credits-a@test.dev', '{"display_name": "A", "terms_version": "draft-31fd7f93", "age_16": true}'),
  ('dddddddd-0000-0000-0000-000000000242', 'credits-b@test.dev', '{"display_name": "B"}');

-- ---------------------------------------------------------------------
-- The table and who may do what
-- ---------------------------------------------------------------------
select has_table('public', 'credit_ledger', 'the table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.credit_ledger'::regclass), 'RLS is on');
select ok(not has_table_privilege('authenticated', 'public.credit_ledger', 'insert'), 'a student can''t add a row');
select ok(not has_table_privilege('authenticated', 'public.credit_ledger', 'update'), 'nor change one');
select ok(not has_table_privilege('authenticated', 'public.credit_ledger', 'delete'), 'nor delete one');
select ok(not has_table_privilege('service_role', 'public.credit_ledger', 'update'), 'the service role can''t change a row either (append-only)');
select ok(not has_table_privilege('service_role', 'public.credit_ledger', 'delete'), 'nor delete one');
select ok(has_table_privilege('service_role', 'public.credit_ledger', 'insert'), 'only the service role writes');
select ok(not has_function_privilege('authenticated', 'public.spend_credits(uuid, text, integer, text, uuid, uuid, text)', 'execute'), 'a student can''t spend');
select ok(not has_function_privilege('authenticated', 'public.grant_credits(uuid, text, text, integer, text, text, text)', 'execute'), 'nor grant herself credits');
select ok(not has_function_privilege('anon', 'public.reverse_spend(uuid, text)', 'execute'), 'nor can anon give back a spend');
select ok(has_function_privilege('authenticated', 'public.my_credits()', 'execute'), 'a student reads her credits');
select is((select count(*)::int from pg_trigger where tgrelid = 'public.credit_ledger'::regclass and not tgisinternal), 0, 'no trigger on the ledger (the account cascade runs into nothing)');

-- ---------------------------------------------------------------------
-- New accounts and the one-off backfill
-- ---------------------------------------------------------------------
select results_eq(
  $$ select kind, units, base_key from public.credit_ledger where user_id = 'dddddddd-0000-0000-0000-000000000241' $$,
  $$ values ('grant_free', 8, 'welcome') $$,
  'a new account gets 2 lectures (8 units), once');
select is((select count(*)::int from public.profiles where id = 'dddddddd-0000-0000-0000-000000000241'), 1, 'handle_new_user still makes the profile');
select is((select count(*)::int from public.terms_acceptances where user_id = 'dddddddd-0000-0000-0000-000000000241'), 1, 'and the terms acceptance');

insert into public.courses (id, user_id, name) values ('c2400000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000241', 'Math');
insert into public.files (id, user_id, kind, title, course_id) values
  ('a2400000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000241', 'lecture', 'Old lecture', 'c2400000-0000-0000-0000-000000000001'),
  ('a2400000-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000241', 'lecture', 'Tema 2', 'c2400000-0000-0000-0000-000000000001'),
  ('a2400000-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000241', 'lecture', 'Tema 3', 'c2400000-0000-0000-0000-000000000001');
insert into public.lectures (id, user_id) values
  ('a2400000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000241'),
  ('a2400000-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000241'),
  ('a2400000-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000241');
-- The old lecture: transcribed before this step, in blocks 0 and 1 (2 h 10 min), and summarized.
insert into public.audio_chunks (user_id, lecture_id, seq, start_ms, duration_ms, storage_path, status) values
  ('dddddddd-0000-0000-0000-000000000241', 'a2400000-0000-0000-0000-000000000001', 0, 0, 30000, 'a/l1/0000.m4a', 'transcribed'),
  ('dddddddd-0000-0000-0000-000000000241', 'a2400000-0000-0000-0000-000000000001', 1, 7800000, 30000, 'a/l1/0001.m4a', 'transcribed');
insert into public.summaries (id, user_id, file_id, mode, sliders, status, result) values
  ('e2400000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000241', 'a2400000-0000-0000-0000-000000000001', 'new', '{}', 'done', '{"format": "studiply-summary-v1"}');

select private.credits_backfill();
select private.credits_backfill();
select is((select count(*)::int from public.credit_ledger where user_id = 'dddddddd-0000-0000-0000-000000000241' and base_key in ('welcome', 'beta-2026-11')), 2, 'the backfill: 2 free and 10 beta lectures, added once (run twice)');
select is((select sum(units)::int from public.credit_ledger where user_id = 'dddddddd-0000-0000-0000-000000000241'), 48, 'A has 12 lectures');
select results_eq(
  $$ select base_key, units from public.credit_ledger where lecture_id = 'a2400000-0000-0000-0000-000000000001' and kind = 'carry_over' order by base_key $$,
  $$ values ('lecture:a2400000-0000-0000-0000-000000000001:block:0', 0), ('lecture:a2400000-0000-0000-0000-000000000001:block:1', 0) $$,
  'the old lecture''s two blocks carried over at 0 units');

-- ---------------------------------------------------------------------
-- Spending (as the service role)
-- ---------------------------------------------------------------------
set local role service_role;

select results_eq(
  $$ select outcome, charged from public.spend_credits('dddddddd-0000-0000-0000-000000000241', 'lecture:a2400000-0000-0000-0000-000000000001:block:1', 4, 'spend_lecture', 'a2400000-0000-0000-0000-000000000001') $$,
  $$ values ('already', 0) $$,
  'a chunk of the old lecture retried: already paid, nothing charged');
select results_eq(
  $$ select outcome, charged, balance_after from public.spend_credits('dddddddd-0000-0000-0000-000000000241', 'lecture:a2400000-0000-0000-0000-000000000002:block:0', 4, 'spend_lecture', 'a2400000-0000-0000-0000-000000000002') $$,
  $$ values ('spent', 4, 44) $$,
  'Tema 2''s first chunk spends its lecture (4 units)');
select results_eq(
  $$ select outcome, charged from public.spend_credits('dddddddd-0000-0000-0000-000000000241', 'lecture:a2400000-0000-0000-0000-000000000002:block:0', 4, 'spend_lecture', 'a2400000-0000-0000-0000-000000000002') $$,
  $$ values ('already', 4) $$,
  'its next chunk in the same 2 hours: already paid');

-- Summaries: decided by the server.
select results_eq(
  $$ select outcome, charged from public.spend_summary('dddddddd-0000-0000-0000-000000000241', 'a2400000-0000-0000-0000-000000000002', 'e2400000-0000-0000-0000-000000000002') $$,
  $$ values ('spent', 0) $$,
  'Tema 2''s first summary is included');
select results_eq(
  $$ select outcome, charged from public.spend_summary('dddddddd-0000-0000-0000-000000000241', 'a2400000-0000-0000-0000-000000000002', 'e2400000-0000-0000-0000-000000000002') $$,
  $$ values ('already', 0) $$,
  'the same summary asked again (a retry): nothing more');
select results_eq(
  $$ select outcome, charged from public.spend_summary('dddddddd-0000-0000-0000-000000000241', 'a2400000-0000-0000-0000-000000000002', 'e2400000-0000-0000-0000-000000000003') $$,
  $$ values ('spent', 2) $$,
  'writing it again costs ½ a lecture (2 units)');
select results_eq(
  $$ select outcome, charged from public.spend_summary('dddddddd-0000-0000-0000-000000000241', 'a2400000-0000-0000-0000-000000000001', 'e2400000-0000-0000-0000-000000000004') $$,
  $$ values ('spent', 2) $$,
  'the old lecture had a summary before this step: a new one is "again"');
select results_eq(
  $$ select outcome, charged from public.spend_summary('dddddddd-0000-0000-0000-000000000241', 'a2400000-0000-0000-0000-000000000003', 'e2400000-0000-0000-0000-000000000005') $$,
  $$ values ('spent', 4) $$,
  'a lecture never paid for (its transcript not from transcribe-chunk): its credit first (4), the summary included');
select is((select count(*)::int from public.credit_ledger where base_key = 'lecture:a2400000-0000-0000-0000-000000000003:block:0' and units = -4), 1, '…as its lecture''s spend');

-- Giving back, exactly once, with its own key.
select results_eq(
  $$ select outcome, charged from public.reverse_spend('dddddddd-0000-0000-0000-000000000241', 'summary:e2400000-0000-0000-0000-000000000003') $$,
  $$ values ('reversed', 2) $$,
  'a summary that failed gets its 2 units back');
select results_eq(
  $$ select outcome, charged from public.reverse_spend('dddddddd-0000-0000-0000-000000000241', 'summary:e2400000-0000-0000-0000-000000000003') $$,
  $$ values ('none', 0) $$,
  'only once');
select is((select base_key from public.credit_ledger where kind = 'reverse' and user_id = 'dddddddd-0000-0000-0000-000000000241' limit 1),
  (select 'reverse:' || id::text from public.credit_ledger where base_key = 'summary:e2400000-0000-0000-0000-000000000003'),
  'the reverse has its own key (reverse:<the row it undoes>)');

-- A quiz: refunded, then tried again: it pays again as attempt 2.
select results_eq(
  $$ select outcome, charged from public.spend_credits('dddddddd-0000-0000-0000-000000000241', 'quiz:f2400000-0000-0000-0000-000000000001', 2, 'spend_extra', null, 'f2400000-0000-0000-0000-000000000001', 'Quiz') $$,
  $$ values ('spent', 2) $$,
  'a quiz of 25 questions: ½ a lecture');
select results_eq(
  $$ select outcome from public.reverse_spend('dddddddd-0000-0000-0000-000000000241', 'quiz:f2400000-0000-0000-0000-000000000001') $$,
  $$ values ('reversed') $$,
  'it failed: given back');
select results_eq(
  $$ select outcome, charged from public.spend_credits('dddddddd-0000-0000-0000-000000000241', 'quiz:f2400000-0000-0000-0000-000000000001', 2, 'spend_extra', null, 'f2400000-0000-0000-0000-000000000001', 'Quiz') $$,
  $$ values ('spent', 2) $$,
  'Try again pays again');
select is((select max(attempt)::int from public.credit_ledger where base_key = 'quiz:f2400000-0000-0000-0000-000000000001'), 2, '…as attempt 2');

-- A first summary that failed frees "first" again.
select results_eq(
  $$ select outcome, charged from public.reverse_spend('dddddddd-0000-0000-0000-000000000241', 'summary:e2400000-0000-0000-0000-000000000005') $$,
  $$ values ('reversed', 0) $$,
  'Tema 3''s first summary failed (0 units back: it was included)');
select results_eq(
  $$ select outcome, charged from public.spend_summary('dddddddd-0000-0000-0000-000000000241', 'a2400000-0000-0000-0000-000000000003', 'e2400000-0000-0000-0000-000000000006') $$,
  $$ values ('spent', 0) $$,
  'so its next summary is the first again (and the lecture stays paid)');

-- Not enough: nothing written, never below 0.
select results_eq(
  $$ select outcome, charged, balance_after from public.spend_credits('dddddddd-0000-0000-0000-000000000242', 'lecture:a2400000-0000-0000-0000-000000000009:block:0', 52, 'spend_lecture') $$,
  $$ values ('insufficient', 0, 48) $$,
  'B (48 units) can''t spend 52 at once (a made-up price, to test the refusal)…');
select is((select count(*)::int from public.credit_ledger where user_id = 'dddddddd-0000-0000-0000-000000000242' and units < 0), 0, '…nothing was written');
select throws_ok(
  $$ select public.spend_credits('dddddddd-0000-0000-0000-000000000242', 'x', 0, 'spend_lecture') $$,
  'P0001', null, 'a spend of 0 is refused');
select results_eq(
  $$ select outcome from public.grant_credits('dddddddd-0000-0000-0000-000000000242', 'grant_admin', 'web-check', 40, 'Test credits') $$,
  $$ values ('granted') $$, 'a grant');
select results_eq(
  $$ select outcome from public.grant_credits('dddddddd-0000-0000-0000-000000000242', 'grant_admin', 'web-check', 40, 'Test credits') $$,
  $$ values ('already') $$, 'once per key');
select throws_ok($$ update public.credit_ledger set units = 1000 $$, '42501', null, 'the service role can''t change a row');

reset role;

-- ---------------------------------------------------------------------
-- What she reads
-- ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000241", "role": "authenticated"}';
select is((public.my_credits() ->> 'units')::int, (select sum(units)::int from public.credit_ledger where user_id = 'dddddddd-0000-0000-0000-000000000241'), 'my_credits: her balance');
select is(
  (select count(*)::int from jsonb_array_elements(public.my_credits() -> 'history') h where (h ->> 'units')::int = 0),
  0, 'her history leaves out the 0-unit rows (carry-over, included summaries)');
select is((select count(distinct user_id)::int from public.credit_ledger), 1, 'she sees only her own rows');
reset role;

-- ---------------------------------------------------------------------
-- Purging a lecture; deleting the account
-- ---------------------------------------------------------------------
delete from public.files where id = 'a2400000-0000-0000-0000-000000000002';
select ok((select count(*) from public.credit_ledger where lecture_id = 'a2400000-0000-0000-0000-000000000002') > 0, 'purging a lecture leaves its ledger rows (no foreign key)');
delete from auth.users where id = 'dddddddd-0000-0000-0000-000000000241';
select is((select count(*)::int from public.credit_ledger where user_id = 'dddddddd-0000-0000-0000-000000000241'), 0, 'deleting the account deletes her ledger');

select * from finish();
rollback;
