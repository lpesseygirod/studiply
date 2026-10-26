-- Step 3.4: the photos and PDFs in each course's hidden "Project Files"
-- lecture become library files (20261026090300). Real lectures are never
-- touched, and deleting the emptied hidden lecture never deletes the moved
-- media rows or their Storage objects (Lea).
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email) values ('bbbbbbbb-0000-0000-0000-000000000008', 'projectfiles@test.dev');

-- Math: a hidden lecture (2 photos, a PDF), and a real lecture someone named "Project Files" (it has a recording).
-- Bio: a hidden lecture inside a folder (one uncaptioned PDF), and a normal lecture with a photo.
insert into public.courses (id, user_id, name) values
  ('c8000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000008', 'Math'),
  ('c8000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000008', 'Bio');
insert into public.folders (id, user_id, course_id, name) values
  ('f8000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000008', 'c8000000-0000-0000-0000-000000000002', 'Tema 1');
insert into public.files (id, user_id, kind, title, course_id, folder_id) values
  ('a8000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000008', 'lecture', 'Project Files', 'c8000000-0000-0000-0000-000000000001', null),
  ('a8000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000008', 'lecture', 'Project Files', 'c8000000-0000-0000-0000-000000000001', null),
  ('a8000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000008', 'lecture', 'Project Files', 'c8000000-0000-0000-0000-000000000002', 'f8000000-0000-0000-0000-000000000001'),
  ('a8000000-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000008', 'lecture', 'Cèl·lules', 'c8000000-0000-0000-0000-000000000002', null);
insert into public.lectures (id, user_id, status) values
  ('a8000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000008', 'ready'),
  ('a8000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000008', 'ready'),
  ('a8000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000008', 'ready'),
  ('a8000000-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000008', 'ready');
insert into public.audio_chunks (user_id, lecture_id, seq, start_ms, duration_ms) values
  ('bbbbbbbb-0000-0000-0000-000000000008', 'a8000000-0000-0000-0000-000000000002', 0, 0, 30000);
insert into public.media (id, user_id, lecture_id, kind, storage_path, caption, starred_at, created_at) values
  ('e8000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000008', 'a8000000-0000-0000-0000-000000000001', 'photo', 'bbbbbbbb-0000-0000-0000-000000000008/a8000000-0000-0000-0000-000000000001/p1.jpg', null, '2026-10-20 09:00+00', '2026-10-01 10:00+00'),
  ('e8000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000008', 'a8000000-0000-0000-0000-000000000001', 'photo', 'bbbbbbbb-0000-0000-0000-000000000008/a8000000-0000-0000-0000-000000000001/p2.jpg', null, null, '2026-10-02 10:00+00'),
  ('e8000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000008', 'a8000000-0000-0000-0000-000000000001', 'slides', 'bbbbbbbb-0000-0000-0000-000000000008/a8000000-0000-0000-0000-000000000001/d1.pdf', 'Tema 1.pdf', null, '2026-10-03 10:00+00'),
  ('e8000000-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000008', 'a8000000-0000-0000-0000-000000000002', 'photo', 'bbbbbbbb-0000-0000-0000-000000000008/a8000000-0000-0000-0000-000000000002/r1.jpg', null, null, '2026-10-04 10:00+00'),
  ('e8000000-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000008', 'a8000000-0000-0000-0000-000000000003', 'slides', 'bbbbbbbb-0000-0000-0000-000000000008/a8000000-0000-0000-0000-000000000003/d2.pdf', null, null, '2026-10-05 10:00+00'),
  ('e8000000-0000-0000-0000-000000000006', 'bbbbbbbb-0000-0000-0000-000000000008', 'a8000000-0000-0000-0000-000000000004', 'photo', 'bbbbbbbb-0000-0000-0000-000000000008/a8000000-0000-0000-0000-000000000004/l1.jpg', null, null, '2026-10-06 10:00+00');
-- The Storage objects behind the hidden lecture's photos and PDF.
insert into storage.objects (bucket_id, name) values
  ('photos', 'bbbbbbbb-0000-0000-0000-000000000008/a8000000-0000-0000-0000-000000000001/p1.jpg'),
  ('photos', 'bbbbbbbb-0000-0000-0000-000000000008/a8000000-0000-0000-0000-000000000001/p2.jpg'),
  ('slides', 'bbbbbbbb-0000-0000-0000-000000000008/a8000000-0000-0000-0000-000000000001/d1.pdf');

create temporary table result on commit drop as
select * from private.project_files_to_library()
 where course_id in ('c8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000002');

select results_eq(
  'select course_id, photos, pdfs, lectures_deleted from result order by course_id',
  $$values ('c8000000-0000-0000-0000-000000000001'::uuid, 2, 1, 1), ('c8000000-0000-0000-0000-000000000002'::uuid, 0, 1, 1)$$,
  'per course: what became files, and the hidden lectures deleted');

-- The hidden lecture's photos and PDF are files at its place
select is((select lecture_id from public.media where id = 'e8000000-0000-0000-0000-000000000001'), null, 'a photo no longer belongs to the hidden lecture');
select results_eq(
  $$select f.kind, f.title, f.course_id, f.folder_id, f.created_at, f.starred_at
      from public.files f join public.media m on m.file_id = f.id
     where m.id in ('e8000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000002', 'e8000000-0000-0000-0000-000000000003')
     order by m.created_at$$,
  $$values
    ('image', 'Photo 1.jpg', 'c8000000-0000-0000-0000-000000000001'::uuid, null::uuid, '2026-10-01 10:00+00'::timestamptz, '2026-10-20 09:00+00'::timestamptz),
    ('image', 'Photo 2.jpg', 'c8000000-0000-0000-0000-000000000001'::uuid, null::uuid, '2026-10-02 10:00+00'::timestamptz, null::timestamptz),
    ('pdf',   'Tema 1.pdf',  'c8000000-0000-0000-0000-000000000001'::uuid, null::uuid, '2026-10-03 10:00+00'::timestamptz, null::timestamptz)$$,
  'names (caption, else Photo N, with the extension), kind, place, date and favourite');
select is((select caption from public.media where id = 'e8000000-0000-0000-0000-000000000001'), 'Photo 1.jpg', 'the media caption is the file name');
select is(
  (select storage_path from public.media where id = 'e8000000-0000-0000-0000-000000000003'),
  'bbbbbbbb-0000-0000-0000-000000000008/a8000000-0000-0000-0000-000000000001/d1.pdf',
  'the Storage path is unchanged (nothing is moved or copied)');
select results_eq(
  $$select f.title, f.course_id, f.folder_id from public.files f join public.media m on m.file_id = f.id where m.id = 'e8000000-0000-0000-0000-000000000005'$$,
  $$values ('Document 1.pdf', 'c8000000-0000-0000-0000-000000000002'::uuid, 'f8000000-0000-0000-0000-000000000001'::uuid)$$,
  'a hidden lecture in a folder: its PDF goes into that folder, "Document 1.pdf"');

-- The emptied hidden lectures are gone
select is((select count(*)::int from public.files where id in ('a8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000003')), 0, 'the hidden lectures are deleted');
select is((select count(*)::int from public.lectures where id in ('a8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000003')), 0, 'their lecture rows went with them');

-- (Lea) deleting them never deleted the moved media rows or their Storage objects
select is(
  (select count(*)::int from public.media where id in ('e8000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000002', 'e8000000-0000-0000-0000-000000000003', 'e8000000-0000-0000-0000-000000000005')),
  4, 'every moved media row is still there');
select is(
  (select count(*)::int from storage.objects where name like 'bbbbbbbb-0000-0000-0000-000000000008/a8000000-0000-0000-0000-000000000001/%'),
  3, 'every Storage object of the deleted lecture is still there');
select is(
  (select count(*)::int from public.media m join public.files f on f.id = m.file_id
    where m.id in ('e8000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-000000000002', 'e8000000-0000-0000-0000-000000000003')
      and f.deleted_at is null),
  3, 'each moved photo or PDF hangs off a live file');

-- Real lectures are untouched
select is((select title from public.files where id = 'a8000000-0000-0000-0000-000000000002'), 'Project Files', 'a real lecture named "Project Files" (with a recording) stays');
select is((select lecture_id from public.media where id = 'e8000000-0000-0000-0000-000000000004'), 'a8000000-0000-0000-0000-000000000002'::uuid, 'its photo stays with it');
select is((select file_id from public.media where id = 'e8000000-0000-0000-0000-000000000004'), null, 'and does not become a file');
select is((select lecture_id from public.media where id = 'e8000000-0000-0000-0000-000000000006'), 'a8000000-0000-0000-0000-000000000004'::uuid, 'another lecture''s photo stays with its lecture');
select is((select count(*)::int from public.audio_chunks where lecture_id = 'a8000000-0000-0000-0000-000000000002'), 1, 'the real lecture keeps its recording');

-- Running it again changes nothing
select is(
  (select count(*)::int from private.project_files_to_library()
    where course_id in ('c8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000002')),
  0, 'a second run finds nothing to do');
select is(
  (select count(*)::int from public.files where user_id = 'bbbbbbbb-0000-0000-0000-000000000008' and kind in ('image', 'pdf')),
  4, 'and adds no files');

-- The iPhone downloads the changes (changed_at moved on the media rows)
select ok(
  (select changed_at >= now() from public.media where id = 'e8000000-0000-0000-0000-000000000001'),
  'the moved media rows are marked changed');

select * from finish();
rollback;
