-- The library sequence from the step 1.7 commit 2 test, run with the
-- updates the app sends: courses Math and Science, folder Funcions (with a
-- subfolder and a lecture) in Math, Funcions moved to the top of Science,
-- Math renamed to History.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values ('bbbbbbbb-0000-0000-0000-000000000004', 'moves@test.dev');

set local role authenticated;
set local request.jwt.claims to '{"sub": "bbbbbbbb-0000-0000-0000-000000000004", "role": "authenticated"}';

insert into public.courses (id, name) values
  ('c4000000-0000-0000-0000-000000000001', 'Math'),
  ('c4000000-0000-0000-0000-000000000002', 'Science');
insert into public.folders (id, course_id, name) values
  ('f4000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'Funcions');
insert into public.folders (id, parent_id, name) values
  ('f4000000-0000-0000-0000-000000000002', 'f4000000-0000-0000-0000-000000000001', 'Derivades');
insert into public.files (id, folder_id, kind, title) values
  ('d4000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000002', 'lecture', 'Tema 1');

-- The update the app sent before the fix: only the parent. The folder
-- stays in Math, which is what the test showed.
update public.folders set parent_id = null where id = 'f4000000-0000-0000-0000-000000000001';

select is(
  (select course_id from public.folders where id = 'f4000000-0000-0000-0000-000000000001'),
  'c4000000-0000-0000-0000-000000000001'::uuid,
  'clearing only the parent keeps the folder in its old course (the bug)');

-- The update the app sends now: parent and course.
update public.folders
   set parent_id = null, course_id = 'c4000000-0000-0000-0000-000000000002'
 where id = 'f4000000-0000-0000-0000-000000000001';

update public.courses set name = 'History' where id = 'c4000000-0000-0000-0000-000000000001';

select results_eq(
  $$ select name from public.folders
      where course_id = 'c4000000-0000-0000-0000-000000000002' and parent_id is null $$,
  $$ values ('Funcions'::text) $$,
  'Science lists Funcions at its top level');

select is(
  (select course_id from public.folders where id = 'f4000000-0000-0000-0000-000000000002'),
  'c4000000-0000-0000-0000-000000000002'::uuid,
  'the subfolder moved to Science with it');

select is(
  (select parent_id from public.folders where id = 'f4000000-0000-0000-0000-000000000002'),
  'f4000000-0000-0000-0000-000000000001'::uuid,
  'the subfolder is still inside Funcions');

select is(
  (select course_id from public.files where id = 'd4000000-0000-0000-0000-000000000001'),
  'c4000000-0000-0000-0000-000000000002'::uuid,
  'the lecture deep inside moved to Science too');

select is(
  (select count(*)::int from public.folders where course_id = 'c4000000-0000-0000-0000-000000000001'),
  0,
  'History (the renamed Math) has no folders left');

select results_eq(
  $$ select name from public.courses where user_id = 'bbbbbbbb-0000-0000-0000-000000000004' order by name $$,
  $$ values ('History'::text), ('Science'::text) $$,
  'the rename changed Math only');

select results_eq(
  $$ select name from public.folders where user_id = 'bbbbbbbb-0000-0000-0000-000000000004' order by name $$,
  $$ values ('Derivades'::text), ('Funcions'::text) $$,
  'the course rename left the folder names alone');

select * from finish();
rollback;
