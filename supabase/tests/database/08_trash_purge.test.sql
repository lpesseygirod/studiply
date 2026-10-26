-- Step 3.5: the nightly trash clean-up's SQL (20261026090400). Only what has
-- been in the trash longer than the cutoff goes, with what is inside it;
-- Storage objects are found through rows (a photo moved out of a deleted
-- lecture stays); only the service role can run it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('bbbbbbbb-0000-0000-0000-000000000009', 'purge-a@test.dev'),
  ('bbbbbbbb-0000-0000-0000-00000000000a', 'purge-b@test.dev');

-- User A
--   Old course (trashed 40 days ago) with a folder and a lecture (a recording, a photo).
--   Live course with: an old trashed lecture (its photo was moved out to a live library file),
--   a recently trashed PDF, and a live lecture.
-- User B: an old trashed lecture.
insert into public.courses (id, user_id, name, deleted_at) values
  ('c9000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000009', 'Old course', now() - interval '40 days'),
  ('c9000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000009', 'Live course', null),
  ('c9000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-00000000000a', 'B course', null);
insert into public.folders (id, user_id, course_id, name, deleted_at) values
  ('f9000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000009', 'c9000000-0000-0000-0000-000000000001', 'Tema', now() - interval '40 days');
insert into public.files (id, user_id, kind, title, course_id, folder_id, deleted_at) values
  ('a9000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000009', 'lecture', 'In old course', 'c9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000001', now() - interval '40 days'),
  ('a9000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000009', 'lecture', 'Old lecture', 'c9000000-0000-0000-0000-000000000002', null, now() - interval '35 days'),
  ('a9000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000009', 'pdf', 'Recent.pdf', 'c9000000-0000-0000-0000-000000000002', null, now() - interval '3 days'),
  ('a9000000-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000009', 'lecture', 'Live lecture', 'c9000000-0000-0000-0000-000000000002', null, null),
  ('a9000000-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000009', 'image', 'Moved out.jpg', 'c9000000-0000-0000-0000-000000000002', null, null),
  ('a9000000-0000-0000-0000-000000000006', 'bbbbbbbb-0000-0000-0000-00000000000a', 'lecture', 'B old', 'c9000000-0000-0000-0000-000000000003', null, now() - interval '50 days');
insert into public.lectures (id, user_id) values
  ('a9000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000009'),
  ('a9000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000009'),
  ('a9000000-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000009'),
  ('a9000000-0000-0000-0000-000000000006', 'bbbbbbbb-0000-0000-0000-00000000000a');
insert into public.audio_chunks (user_id, lecture_id, seq, start_ms, duration_ms, storage_path) values
  ('bbbbbbbb-0000-0000-0000-000000000009', 'a9000000-0000-0000-0000-000000000001', 0, 0, 1000, 'A/a1/0000.m4a'),
  ('bbbbbbbb-0000-0000-0000-000000000009', 'a9000000-0000-0000-0000-000000000004', 0, 0, 1000, 'A/a4/0000.m4a');
insert into public.media (id, user_id, lecture_id, file_id, kind, storage_path) values
  ('e9000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000009', 'a9000000-0000-0000-0000-000000000001', null, 'photo', 'A/a1/p.jpg'),
  -- Moved out of "Old lecture" into a library file: keeps the old lecture's path.
  ('e9000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000009', null, 'a9000000-0000-0000-0000-000000000005', 'photo', 'A/a2/moved.jpg'),
  ('e9000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000009', null, 'a9000000-0000-0000-0000-000000000003', 'slides', 'A/a3/recent.pdf'),
  ('e9000000-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-000000000006', null, 'slides', 'B/b6/s.pdf');

-- Only the service role may run it
select ok(not has_function_privilege('authenticated', 'public.trash_purge(timestamptz)', 'execute'), 'a signed-in user cannot purge');
select ok(not has_function_privilege('anon', 'public.trash_purge_plan(timestamptz)', 'execute'), 'anon cannot list what goes');
select ok(has_function_privilege('service_role', 'public.trash_purge(timestamptz)', 'execute'), 'the service role can');

-- What goes from Storage (30-day cutoff)
create temporary table plan on commit drop as
select * from public.trash_purge_plan(now() - interval '30 days')
 where path like 'A/%' or path like 'B/%';

select set_eq(
  'select bucket, path from plan',
  $$values ('audio-chunks', 'A/a1/0000.m4a'), ('photos', 'A/a1/p.jpg'), ('slides', 'B/b6/s.pdf')$$,
  'the old course''s recording and photo, and B''s old lecture''s PDF');
select ok(not exists (select 1 from plan where path = 'A/a2/moved.jpg'), 'a photo moved out of an old trashed lecture is not listed');
select ok(not exists (select 1 from plan where path = 'A/a3/recent.pdf'), 'a recently trashed PDF is not listed');
select ok(not exists (select 1 from plan where path = 'A/a4/0000.m4a'), 'a live lecture''s recording is not listed');

-- The rows
create temporary table counts on commit drop as select * from public.trash_purge(now() - interval '30 days');
select ok((select files >= 3 from counts), 'the old trashed files are deleted (reported)');

select is((select count(*)::int from public.courses where id = 'c9000000-0000-0000-0000-000000000001'), 0, 'the old course is gone');
select is((select count(*)::int from public.files where id in ('a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-000000000006')), 0, 'old lectures (both users, and the one inside the old course) are gone');
select is((select count(*)::int from public.audio_chunks where lecture_id = 'a9000000-0000-0000-0000-000000000001'), 0, 'their rows went with them (cascade)');
select is((select count(*)::int from public.files where id in ('a9000000-0000-0000-0000-000000000003', 'a9000000-0000-0000-0000-000000000004', 'a9000000-0000-0000-0000-000000000005')), 3, 'the recent PDF, the live lecture and the library file stay');
select is((select file_id from public.media where id = 'e9000000-0000-0000-0000-000000000002'), 'a9000000-0000-0000-0000-000000000005'::uuid, 'the moved photo stays with its file');
select is((select count(*)::int from public.courses where id in ('c9000000-0000-0000-0000-000000000002', 'c9000000-0000-0000-0000-000000000003')), 2, 'live courses stay');

select * from finish();
rollback;
