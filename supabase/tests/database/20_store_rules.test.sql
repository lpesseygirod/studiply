-- Step 10.1 (20261029152300_store_rules):
--   withdraw_ai_consent(): a signed-in student withdraws all her consent rows at once, with the
--     server's time; never another student's; she can give again afterwards.
--   account_storage_objects(uid): the Storage objects under her id in the three buckets, for the
--     delete-account function only (the service role).
--   Deleting her auth user as the auth service does (supabase_auth_admin, no grants on our tables:
--     20261029152400; skipped where this session can't take that role — then
--     `npm run check:account-deletion` is the end-to-end guard) works, and leaves no row of hers in any public table with a user_id column
--     (every one cascades; the tables are found from information_schema, so a future table is covered
--     too); another student's rows stay. Storage doesn't cascade: that's why the function removes her
--     files first. Every AFTER update/delete trigger in public is listed, so a new one is checked.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

set local storage.allow_delete_query = 'true';

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000201', 'store-a@test.dev'),
  ('dddddddd-0000-0000-0000-000000000202', 'store-b@test.dev');

-- ---------------------------------------------------------------------
-- Who may call them
-- ---------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.account_storage_objects(uuid)', 'execute'), 'a signed-in student cannot list anyone''s files');
select ok(not has_function_privilege('anon', 'public.account_storage_objects(uuid)', 'execute'), 'anon cannot either');
select ok(has_function_privilege('service_role', 'public.account_storage_objects(uuid)', 'execute'), 'the service role can (delete-account)');
select ok(has_function_privilege('authenticated', 'public.withdraw_ai_consent()', 'execute'), 'a signed-in student can withdraw her consent');
select ok(not has_function_privilege('anon', 'public.withdraw_ai_consent()', 'execute'), 'anon cannot');

-- ---------------------------------------------------------------------
-- Her files
-- ---------------------------------------------------------------------
insert into storage.objects (bucket_id, name) values
  ('audio-chunks', 'dddddddd-0000-0000-0000-000000000201/l1/0000.webm'),
  ('slides', 'dddddddd-0000-0000-0000-000000000201/l1/slides.pdf'),
  ('photos', 'dddddddd-0000-0000-0000-000000000201/profile/avatar.jpg'),
  ('photos', 'dddddddd-0000-0000-0000-000000000202/l2/board.jpg');

select set_eq(
  $$select bucket_id, name from public.account_storage_objects('dddddddd-0000-0000-0000-000000000201')$$,
  $$values ('audio-chunks', 'dddddddd-0000-0000-0000-000000000201/l1/0000.webm'),
           ('slides', 'dddddddd-0000-0000-0000-000000000201/l1/slides.pdf'),
           ('photos', 'dddddddd-0000-0000-0000-000000000201/profile/avatar.jpg')$$,
  'her objects in every bucket, nobody else''s');

-- ---------------------------------------------------------------------
-- Withdrawing consent
-- ---------------------------------------------------------------------
insert into public.ai_consent (user_id, scope, policy_version) values
  ('dddddddd-0000-0000-0000-000000000202', 'transcription', '2026-11-store-1');

set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000201", "role": "authenticated"}';

insert into public.ai_consent (scope, policy_version) values
  ('transcription', '2026-11-store-1'), ('assistant_summary', '2026-11-store-1'), ('images', '2026-11-store-1');
select is((select public.withdraw_ai_consent()), 3, 'one call withdraws her three rows');
select ok((select bool_and(withdrawn_at is not null and withdrawn_at >= granted_at) from public.ai_consent), 'each with a time after it was given');
select is((select public.withdraw_ai_consent()), 0, 'again: nothing left to withdraw');
select lives_ok($$ insert into public.ai_consent (scope, policy_version) values ('transcription', '2026-11-store-1') $$, 'she can give it again afterwards');
select is((select count(*)::int from public.ai_consent where withdrawn_at is null), 1, 'the new one is not withdrawn');

reset role;
select ok((select withdrawn_at is null from public.ai_consent where user_id = 'dddddddd-0000-0000-0000-000000000202'), 'another student''s consent is untouched');

-- ---------------------------------------------------------------------
-- Deleting her account: nothing of hers left in any table
-- ---------------------------------------------------------------------
insert into public.courses (id, user_id, name) values
  ('c2000000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000201', 'Psicobiología'),
  ('c2000000-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000202', 'B course');
insert into public.folders (user_id, course_id, name) values
  ('dddddddd-0000-0000-0000-000000000201', 'c2000000-0000-0000-0000-000000000001', 'Tema 1');
insert into public.files (id, user_id, kind, title, course_id) values
  ('a2000000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000201', 'lecture', 'Tema 1', 'c2000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000201', 'document', 'Notas', 'c2000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000202', 'lecture', 'B lecture', 'c2000000-0000-0000-0000-000000000002');
insert into public.lectures (id, user_id) values
  ('a2000000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000201'),
  ('a2000000-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000202');
insert into public.documents (user_id, file_id, tab) values
  ('dddddddd-0000-0000-0000-000000000201', 'a2000000-0000-0000-0000-000000000002', 'notes');
insert into public.marks (user_id, lecture_id, type, level, t_ms) values
  ('dddddddd-0000-0000-0000-000000000201', 'a2000000-0000-0000-0000-000000000001', 'exam', 9, 400000);
insert into public.audio_chunks (user_id, lecture_id, seq, start_ms, duration_ms, storage_path) values
  ('dddddddd-0000-0000-0000-000000000201', 'a2000000-0000-0000-0000-000000000001', 0, 0, 1000, 'dddddddd-0000-0000-0000-000000000201/l1/0000.webm');
insert into public.quizzes (id, user_id, course_id, title, settings, plan) values
  ('92000000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000201', 'c2000000-0000-0000-0000-000000000001', 'Quiz', '{}', '{}');
-- An attempt with an answer (wrong: it also makes a review card): the account cascade deletes the
-- answer, whose AFTER DELETE trigger used to touch the attempt (20261029152400).
insert into public.quiz_questions (id, user_id, quiz_id, position, type, prompt, data) values
  ('92000000-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000201', '92000000-0000-0000-0000-000000000001', 0, 'true_false', 'Q', '{"correct": true}');
insert into public.quiz_attempts (id, user_id, quiz_id, max_points) values
  ('92000000-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000201', '92000000-0000-0000-0000-000000000001', 1);
insert into public.quiz_answers (user_id, attempt_id, question_id, response, verdict, points, graded_by) values
  ('dddddddd-0000-0000-0000-000000000201', '92000000-0000-0000-0000-000000000003', '92000000-0000-0000-0000-000000000002', '{"value": false}', 'wrong', 0, 'code');

-- Every public table with a user_id column, counted for her (and for B) before and after.
create temporary table owner_tables on commit drop as
  select c.table_name::text as name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
   where c.table_schema = 'public' and c.column_name = 'user_id' and t.table_type = 'BASE TABLE';

create function pg_temp.rows_of(uid uuid) returns integer language plpgsql as $$
declare
  t text;
  n integer;
  total integer := 0;
begin
  for t in select name from owner_tables loop
    execute format('select count(*) from public.%I where user_id = %L', t, uid) into n;
    total := total + n;
  end loop;
  return total;
end;
$$;

select ok((select count(*) from owner_tables) >= 20, 'many tables carry a user_id (the check below is not vacuous)');
select ok(pg_temp.rows_of('dddddddd-0000-0000-0000-000000000201') >= 12, 'she has rows before');

-- As delete-account does it: auth.admin.deleteUser runs the DELETE as supabase_auth_admin, which has
-- no grants on our tables (AFTER triggers fired by the cascade run as it). Where this session may act
-- as that role, the DELETE runs as it (pgTAP itself can't run as it, so an error is kept in a setting
-- and checked after). Where it may not (the local stack: "permission denied to set role"), the DELETE
-- runs as postgres and that check is SKIPPED: `npm run check:account-deletion` is then the end-to-end
-- guard for the cascade, through the real auth service.
do $$
begin
  if pg_has_role('supabase_auth_admin', 'member') then
    set local role supabase_auth_admin;
    begin
      delete from auth.users where id = 'dddddddd-0000-0000-0000-000000000201';
    exception when others then
      perform set_config('test.cascade_error', sqlerrm, true);
    end;
    reset role;
  else
    delete from auth.users where id = 'dddddddd-0000-0000-0000-000000000201';
  end if;
end;
$$;
select case
  when pg_has_role('supabase_auth_admin', 'member') then
    is(nullif(current_setting('test.cascade_error', true), ''), null,
       'deleted as the auth service does (supabase_auth_admin): no trigger in the cascade is refused')
  else
    skip('this session can''t act as supabase_auth_admin; npm run check:account-deletion checks the cascade through the real auth service', 1)
end;

select is(pg_temp.rows_of('dddddddd-0000-0000-0000-000000000201'), 0, 'no row of hers left in any table with a user_id');
select is((select count(*)::int from public.profiles where id = 'dddddddd-0000-0000-0000-000000000201'), 0, 'her profile is gone');
select ok(pg_temp.rows_of('dddddddd-0000-0000-0000-000000000202') >= 4, 'another student''s rows stay');

-- Every AFTER trigger on update or delete in public, checked against the account cascade
-- (20261029152400). A new one fails here until it is checked there (it must not touch another table
-- when the cascade fires it) and added to this list.
select set_eq(
  $$ select c.relname || '.' || t.tgname
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal
        and (t.tgtype & 2) = 0 and (t.tgtype & 64) = 0   -- AFTER (not BEFORE, not INSTEAD OF)
        and (t.tgtype & 24) <> 0 $$,                     -- on DELETE (8) or UPDATE (16)
  $$ values ('quiz_answers.quiz_answer_touch_attempt'), ('quiz_answers.quiz_answer_review'),
            ('flashcards.flashcard_schedule'), ('folders.folders_cascade_course'),
            -- 20261029152600: on UPDATE OF status only (the cascade deletes, never updates a chunk).
            ('audio_chunks.audio_chunk_transcribed') $$,
  'every AFTER update/delete trigger was checked against the account cascade');

select * from finish();
rollback;
