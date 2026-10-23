-- Data rules enforced by the database: value ranges, the folder tree,
-- course settings defaults, the AI usage and consent restrictions, and
-- what happens on sign-up and account deletion.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'lea@test.dev', '{"display_name": "Lea"}');

-- ---------------------------------------------------------------------
-- Sign-up
-- ---------------------------------------------------------------------

select results_eq(
  $$ select display_name, initials from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000000' $$,
  $$ values ('Lea'::text, 'L'::text) $$,
  'sign-up creates a profile with display name and initials');

set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-0000-0000-000000000000", "role": "authenticated"}';

-- ---------------------------------------------------------------------
-- Course settings
-- ---------------------------------------------------------------------

insert into public.courses (id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'Macro'),
  ('c0000000-0000-0000-0000-000000000002', 'Law');

select results_eq(
  $$ select slider_starting_point, slider_length, slider_depth, slider_examples, slider_visuals,
            slider_exam_focus, slider_self_test, slider_language, slider_extra_resources, slider_follow_marks
     from public.course_settings where course_id = 'c0000000-0000-0000-0000-000000000001' $$,
  $$ values (2::smallint, 5::smallint, 6::smallint, 5::smallint, 4::smallint,
             5::smallint, 5::smallint, 4::smallint, 6::smallint, 7::smallint) $$,
  'a new course gets settings with the spec''s slider defaults');

select throws_ok(
  $$ update public.course_settings set slider_length = 11 where course_id = 'c0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'slider values stay between 1 and 10');

-- ---------------------------------------------------------------------
-- Folder tree
-- ---------------------------------------------------------------------

insert into public.folders (id, course_id, name) values ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Top');
insert into public.folders (id, parent_id, name) values ('f0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 'Child');
insert into public.folders (id, parent_id, name) values ('f0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000002', 'Grandchild');
insert into public.files (id, folder_id, kind, title) values ('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 'lecture', 'Tema 1');

select is(
  (select course_id from public.files where id = 'd0000000-0000-0000-0000-000000000001'),
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'a file takes its folder''s course');

select throws_ok(
  $$ update public.folders set parent_id = 'f0000000-0000-0000-0000-000000000003' where id = 'f0000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a folder can''t move into its own grandchild');

select throws_ok(
  $$ update public.folders set parent_id = id where id = 'f0000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'a folder can''t be its own parent');

update public.folders set course_id = 'c0000000-0000-0000-0000-000000000002' where id = 'f0000000-0000-0000-0000-000000000001';

select is(
  (select array_agg(distinct course_id) from public.folders),
  array['c0000000-0000-0000-0000-000000000002'::uuid],
  'moving a folder to another course moves its whole subtree');

select is(
  (select course_id from public.files where id = 'd0000000-0000-0000-0000-000000000001'),
  'c0000000-0000-0000-0000-000000000002'::uuid,
  'files deep in a moved folder follow it to the new course');

update public.folders set parent_id = null, course_id = null where id = 'f0000000-0000-0000-0000-000000000002';

select is(
  (select count(*)::int from public.folders where course_id is null),
  2,
  'moving a folder out to My library takes its subfolders along');

-- ---------------------------------------------------------------------
-- Value checks
-- ---------------------------------------------------------------------

insert into public.lectures (id) values ('d0000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ insert into public.marks (lecture_id, type, level, t_ms) values ('d0000000-0000-0000-0000-000000000001', 'important', 0, 0) $$,
  '23514', null, 'a mark level can''t be 0');

select throws_ok(
  $$ insert into public.marks (lecture_id, type, level, t_ms) values ('d0000000-0000-0000-0000-000000000001', 'important', 11, 0) $$,
  '23514', null, 'a mark level can''t be 11');

select throws_ok(
  $$ insert into public.media (kind, storage_path) values ('photo', 'x.jpg') $$,
  '23514', null, 'media must belong to a lecture or a file');

insert into public.flashcards (id, source, front, back) values ('e0000000-0000-0000-0000-000000000001', 'manual', 'Q', 'A');

select throws_ok(
  $$ insert into public.review_schedule (flashcard_id, file_id, due_at)
     values ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', now()) $$,
  '23514', null, 'a review schedules a flashcard or a file, not both');

insert into public.documents (id, file_id, tab) values ('b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'notes');
insert into public.document_versions (document_id, content, reason) values ('b0000000-0000-0000-0000-000000000001', '{}', 'session_end');

select throws_ok(
  $$ update public.document_versions set content = '{"changed": true}' $$,
  '42501', null, 'versions can''t be edited');

-- ---------------------------------------------------------------------
-- AI usage: read-only for users
-- ---------------------------------------------------------------------

reset role;
insert into public.ai_usage (user_id, operation, provider, model) values ('aaaaaaaa-0000-0000-0000-000000000000', 'summary', 'anthropic', 'test-model');
set local role authenticated;

select is((select count(*)::int from public.ai_usage), 1, 'a user can read their own AI usage');

select throws_ok(
  $$ insert into public.ai_usage (user_id, operation, provider, model) values ('aaaaaaaa-0000-0000-0000-000000000000', 'summary', 'anthropic', 'x') $$,
  '42501', null, 'a user can''t log AI usage');

select throws_ok($$ delete from public.ai_usage $$, '42501', null, 'a user can''t delete AI usage (would reset limits)');

-- ---------------------------------------------------------------------
-- AI consent: give, withdraw, never rewrite
-- ---------------------------------------------------------------------

select lives_ok(
  $$ insert into public.ai_consent (scope, policy_version) values ('transcription', '2026-10') $$,
  'a user can give consent');

select throws_ok(
  $$ insert into public.ai_consent (scope, policy_version, granted_at) values ('images', '2026-10', '2020-01-01') $$,
  '42501', null, 'consent can''t be backdated');

select throws_ok(
  $$ update public.ai_consent set policy_version = 'rewritten' $$,
  '42501', null, 'a consent record can''t be rewritten');

update public.ai_consent set withdrawn_at = now();

select isnt((select withdrawn_at from public.ai_consent), null, 'a user can withdraw consent');

-- Un-withdrawing matches no row, so withdrawn_at stays set.
update public.ai_consent set withdrawn_at = null;

select isnt((select withdrawn_at from public.ai_consent), null, 'withdrawn consent can''t be switched back on');

-- ---------------------------------------------------------------------
-- Account deletion removes everything
-- ---------------------------------------------------------------------

reset role;
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000000';

-- Only A's rows are counted: the local database may hold real test accounts.
select is(
  (select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000000')
  + (select count(*)::int from public.courses where user_id = 'aaaaaaaa-0000-0000-0000-000000000000')
  + (select count(*)::int from public.folders where user_id = 'aaaaaaaa-0000-0000-0000-000000000000')
  + (select count(*)::int from public.files where user_id = 'aaaaaaaa-0000-0000-0000-000000000000')
  + (select count(*)::int from public.ai_usage where user_id = 'aaaaaaaa-0000-0000-0000-000000000000')
  + (select count(*)::int from public.ai_consent where user_id = 'aaaaaaaa-0000-0000-0000-000000000000'),
  0,
  'deleting the account deletes all of its rows');

select * from finish();
rollback;
