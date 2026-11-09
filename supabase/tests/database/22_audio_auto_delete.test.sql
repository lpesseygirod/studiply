-- Step 10.1b-3 (20261029152600_audio_auto_delete): a recording is deleted 3 days after its
-- transcription, by default.
--   The date: set when the last chunk of a recorded lecture is transcribed (or when the lecture
--   moves past recording with every chunk already transcribed), 3 days later, with the server's
--   time; changing the setting changes or clears it; a client can't set another one.
--   D9 (the migration's one-time conversion) on rows made the old way: nothing recorded before this
--   step is deleted automatically, dated or not.
--   The job: audio_purge_plan lists only due lectures' stored chunks (every student's, nobody else's
--   lectures); audio_purge clears those paths and marks those lectures, nothing else of hers or of
--   anyone else; service role only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000221', 'audio-a@test.dev'),
  ('dddddddd-0000-0000-0000-000000000222', 'audio-b@test.dev');

insert into public.courses (id, user_id, name) values
  ('c2200000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000221', 'A'),
  ('c2200000-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000222', 'B');
insert into public.files (id, user_id, kind, title, course_id)
select ('a2200000-0000-0000-0000-00000000000' || n)::uuid, u::uuid, 'lecture', 'L' || n, c::uuid
  from (values (1, 'dddddddd-0000-0000-0000-000000000221', 'c2200000-0000-0000-0000-000000000001'),
               (2, 'dddddddd-0000-0000-0000-000000000221', 'c2200000-0000-0000-0000-000000000001'),
               (3, 'dddddddd-0000-0000-0000-000000000221', 'c2200000-0000-0000-0000-000000000001'),
               (4, 'dddddddd-0000-0000-0000-000000000221', 'c2200000-0000-0000-0000-000000000001'),
               (5, 'dddddddd-0000-0000-0000-000000000222', 'c2200000-0000-0000-0000-000000000002'),
               (6, 'dddddddd-0000-0000-0000-000000000222', 'c2200000-0000-0000-0000-000000000002')) v(n, u, c);

-- L1 (A): recorded, two chunks, the default setting.
insert into public.lectures (id, user_id, status) values ('a2200000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000221', 'transcribing');
insert into public.audio_chunks (user_id, lecture_id, seq, start_ms, duration_ms, storage_path, status) values
  ('dddddddd-0000-0000-0000-000000000221', 'a2200000-0000-0000-0000-000000000001', 0, 0, 30000, 'a/l1/0000.m4a', 'uploaded'),
  ('dddddddd-0000-0000-0000-000000000221', 'a2200000-0000-0000-0000-000000000001', 1, 30000, 30000, 'a/l1/0001.m4a', 'uploaded');

select is((select audio_retention from public.lectures where id = 'a2200000-0000-0000-0000-000000000001'), 'delete_3_days', 'a new lecture is on "Delete in 3 days" by default');

-- ---------------------------------------------------------------------
-- The date
-- ---------------------------------------------------------------------
update public.audio_chunks set status = 'transcribed' where lecture_id = 'a2200000-0000-0000-0000-000000000001' and seq = 0;
select is((select audio_delete_after from public.lectures where id = 'a2200000-0000-0000-0000-000000000001'), null, 'one chunk of two transcribed: no date yet');

update public.audio_chunks set status = 'transcribed' where lecture_id = 'a2200000-0000-0000-0000-000000000001' and seq = 1;
select ok((select transcribed_at between now() - interval '1 minute' and now() + interval '1 second' from public.lectures where id = 'a2200000-0000-0000-0000-000000000001'), 'the last chunk transcribed: transcribed now (the server''s time)');
select is((select audio_delete_after - transcribed_at from public.lectures where id = 'a2200000-0000-0000-0000-000000000001'), interval '3 days', 'deleted 3 days after transcription');

-- L2 (A): transcribed while still recording: dated only once the recording has ended.
insert into public.lectures (id, user_id, status) values ('a2200000-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000221', 'recording');
insert into public.audio_chunks (user_id, lecture_id, seq, start_ms, duration_ms, storage_path, status) values
  ('dddddddd-0000-0000-0000-000000000221', 'a2200000-0000-0000-0000-000000000002', 0, 0, 30000, 'a/l2/0000.m4a', 'uploaded');
update public.audio_chunks set status = 'transcribed' where lecture_id = 'a2200000-0000-0000-0000-000000000002';
select is((select transcribed_at from public.lectures where id = 'a2200000-0000-0000-0000-000000000002'), null, 'transcribed during the recording: no date while recording');
update public.lectures set status = 'transcribing' where id = 'a2200000-0000-0000-0000-000000000002';
select isnt((select audio_delete_after from public.lectures where id = 'a2200000-0000-0000-0000-000000000002'), null, 'the recording ended with every chunk transcribed: dated');

-- Changing the setting.
update public.lectures set audio_retention = 'keep_permanently' where id = 'a2200000-0000-0000-0000-000000000002';
select is((select audio_delete_after from public.lectures where id = 'a2200000-0000-0000-0000-000000000002'), null, 'Keep forever: no date');
update public.lectures set audio_retention = 'delete_manually' where id = 'a2200000-0000-0000-0000-000000000002';
select is((select audio_delete_after from public.lectures where id = 'a2200000-0000-0000-0000-000000000002'), null, 'Delete manually: no date');
update public.lectures set audio_retention = 'delete_3_days' where id = 'a2200000-0000-0000-0000-000000000002';
select is((select audio_delete_after - transcribed_at from public.lectures where id = 'a2200000-0000-0000-0000-000000000002'), interval '3 days', 'back to Delete in 3 days: 3 days after transcription again (not after the change)');

-- A client can't set another date (she can only choose the setting).
set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000221", "role": "authenticated"}';
update public.lectures set audio_delete_after = now() + interval '1 year' where id = 'a2200000-0000-0000-0000-000000000001';
select is((select audio_delete_after - transcribed_at from public.lectures where id = 'a2200000-0000-0000-0000-000000000001'), interval '3 days', 'a date sent by the app is replaced by the server''s');
reset role;

-- D9, the migration's one-time conversion, on lectures made the old way (the app set its own date,
-- or none): without the date trigger, as when the migration ran it.
alter table public.lectures disable trigger lecture_audio_dates;
insert into public.files (id, user_id, kind, title, course_id) values
  ('a2200000-0000-0000-0000-000000000007', 'dddddddd-0000-0000-0000-000000000221', 'lecture', 'Old undated', 'c2200000-0000-0000-0000-000000000001'),
  ('a2200000-0000-0000-0000-000000000008', 'dddddddd-0000-0000-0000-000000000221', 'lecture', 'Old dated', 'c2200000-0000-0000-0000-000000000001'),
  ('a2200000-0000-0000-0000-000000000009', 'dddddddd-0000-0000-0000-000000000221', 'lecture', 'Being recorded', 'c2200000-0000-0000-0000-000000000001');
-- L8: dated by the app before this step, the date already passed, its audio still stored.
insert into public.lectures (id, user_id, status, audio_retention, audio_delete_after) values
  ('a2200000-0000-0000-0000-000000000007', 'dddddddd-0000-0000-0000-000000000221', 'ready', 'delete_3_days', null),
  ('a2200000-0000-0000-0000-000000000008', 'dddddddd-0000-0000-0000-000000000221', 'ready', 'delete_3_days', now() - interval '2 days'),
  ('a2200000-0000-0000-0000-000000000009', 'dddddddd-0000-0000-0000-000000000221', 'recording', 'delete_3_days', null);
insert into public.audio_chunks (user_id, lecture_id, seq, start_ms, duration_ms, storage_path, status) values
  ('dddddddd-0000-0000-0000-000000000221', 'a2200000-0000-0000-0000-000000000008', 0, 0, 30000, 'a/l8/0000.m4a', 'transcribed');
select private.audio_retention_before_auto_delete();
alter table public.lectures enable trigger lecture_audio_dates;
select results_eq(
  $$ select id::text, audio_retention, audio_delete_after from public.lectures where id in ('a2200000-0000-0000-0000-000000000007', 'a2200000-0000-0000-0000-000000000008', 'a2200000-0000-0000-0000-000000000009') order by id $$,
  $$ values ('a2200000-0000-0000-0000-000000000007', 'delete_manually', null::timestamptz),
            ('a2200000-0000-0000-0000-000000000008', 'delete_manually', null::timestamptz),
            ('a2200000-0000-0000-0000-000000000009', 'delete_3_days', null::timestamptz) $$,
  'D9: an old lecture becomes Delete manually with no date, whether it had none or a past one; one being recorded keeps the new default');
select ok(
  not exists (select 1 from public.audio_purge_plan(now()) where lecture_id = 'a2200000-0000-0000-0000-000000000008')
  and (select storage_path from public.audio_chunks where lecture_id = 'a2200000-0000-0000-0000-000000000008') = 'a/l8/0000.m4a',
  'D9: the old lecture whose date had passed keeps its audio: the nightly job never lists it');

-- ---------------------------------------------------------------------
-- The job
-- ---------------------------------------------------------------------
-- L3 (A): due (its date passed); L4 (A): kept forever; L5 (B): due, its files already gone;
-- L6 (B): not due yet. L1 and L2 (A): dated in 3 days.
insert into public.lectures (id, user_id, status, transcribed_at) values
  ('a2200000-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000221', 'ready', null),
  ('a2200000-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000221', 'ready', null),
  ('a2200000-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000222', 'ready', null),
  ('a2200000-0000-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000222', 'ready', null);
insert into public.audio_chunks (user_id, lecture_id, seq, start_ms, duration_ms, storage_path, status) values
  ('dddddddd-0000-0000-0000-000000000221', 'a2200000-0000-0000-0000-000000000003', 0, 0, 30000, 'a/l3/0000.m4a', 'transcribed'),
  ('dddddddd-0000-0000-0000-000000000221', 'a2200000-0000-0000-0000-000000000003', 1, 30000, 30000, 'a/l3/0001.m4a', 'transcribed'),
  ('dddddddd-0000-0000-0000-000000000221', 'a2200000-0000-0000-0000-000000000004', 0, 0, 30000, 'a/l4/0000.m4a', 'transcribed'),
  ('dddddddd-0000-0000-0000-000000000222', 'a2200000-0000-0000-0000-000000000005', 0, 0, 30000, null, 'transcribed'),
  ('dddddddd-0000-0000-0000-000000000222', 'a2200000-0000-0000-0000-000000000006', 0, 0, 30000, 'b/l6/0000.m4a', 'transcribed');
insert into public.transcript_segments (user_id, lecture_id, start_ms, end_ms, text) values
  ('dddddddd-0000-0000-0000-000000000221', 'a2200000-0000-0000-0000-000000000003', 0, 4000, 'Hola.');
-- Transcribed 4 days ago (L3, L4, L5), today (L6); L4 kept forever.
update public.lectures set transcribed_at = now() - interval '4 days' where id in ('a2200000-0000-0000-0000-000000000003', 'a2200000-0000-0000-0000-000000000004', 'a2200000-0000-0000-0000-000000000005');
update public.lectures set transcribed_at = now() where id = 'a2200000-0000-0000-0000-000000000006';
update public.lectures set audio_retention = 'keep_permanently' where id = 'a2200000-0000-0000-0000-000000000004';

select ok(not has_function_privilege('authenticated', 'public.audio_purge_plan(timestamptz)', 'execute'), 'a signed-in student can''t list recordings to delete');
select ok(not has_function_privilege('authenticated', 'public.audio_purge(uuid[])', 'execute'), 'nor mark them deleted');
select ok(has_function_privilege('service_role', 'public.audio_purge(uuid[])', 'execute'), 'the service role can (purge-trash)');

select set_eq(
  $$ select lecture_id, path from public.audio_purge_plan(now()) where lecture_id::text like 'a2200000-%' $$,
  $$ values ('a2200000-0000-0000-0000-000000000003'::uuid, 'a/l3/0000.m4a'), ('a2200000-0000-0000-0000-000000000003'::uuid, 'a/l3/0001.m4a'),
            ('a2200000-0000-0000-0000-000000000005'::uuid, null::text) $$,
  'the plan: the due lectures (both students), each stored chunk; one whose files are gone listed once without a path');

select results_eq(
  $$ select * from public.audio_purge(array['a2200000-0000-0000-0000-000000000003', 'a2200000-0000-0000-0000-000000000005']::uuid[]) $$,
  $$ values (2, 2) $$,
  'the purge: two lectures marked, two chunk paths cleared');

select is((select count(*)::int from public.audio_chunks where lecture_id = 'a2200000-0000-0000-0000-000000000003' and storage_path is null), 2, 'the due lecture''s chunks have no file any more');
select is((select count(*)::int from public.audio_chunks where lecture_id = 'a2200000-0000-0000-0000-000000000003'), 2, '…their rows stay (the transcript keeps its place)');
select is((select count(*)::int from public.transcript_segments where lecture_id = 'a2200000-0000-0000-0000-000000000003'), 1, 'the transcript stays');
select ok((select audio_deleted_at is not null and audio_delete_after is null from public.lectures where id = 'a2200000-0000-0000-0000-000000000003'), 'the lecture is marked deleted (and has no date left)');
select ok((select audio_deleted_at is not null from public.lectures where id = 'a2200000-0000-0000-0000-000000000005'), 'another student''s due lecture is marked too (files already gone)');
select is((select storage_path from public.audio_chunks where lecture_id = 'a2200000-0000-0000-0000-000000000004'), 'a/l4/0000.m4a', 'a lecture kept forever is untouched');
select is((select storage_path from public.audio_chunks where lecture_id = 'a2200000-0000-0000-0000-000000000006'), 'b/l6/0000.m4a', 'a lecture not due yet is untouched');
select is((select count(*)::int from public.audio_chunks where lecture_id in ('a2200000-0000-0000-0000-000000000001', 'a2200000-0000-0000-0000-000000000002') and storage_path is not null), 3, 'her lectures due later keep their files');
select is((select count(*)::int from public.audio_purge_plan(now()) where lecture_id::text like 'a2200000-%'), 0, 'a second night: nothing left to delete');

select * from finish();
rollback;
