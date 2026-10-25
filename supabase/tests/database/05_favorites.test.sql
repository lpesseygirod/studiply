-- Favorites (starred_at) don't change updated_at, so Recent and the course
-- list keep their order; changed_at (what the iPhone downloads by) moves on
-- every update. Other tables keep the plain updated_at trigger.
-- Rows start with an old updated_at/changed_at: inside one transaction now()
-- doesn't move, so "moved" means "is now()".
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('bbbbbbbb-0000-0000-0000-000000000005', 'favorites@test.dev'),
  ('bbbbbbbb-0000-0000-0000-000000000006', 'other@test.dev');

set local role authenticated;
set local request.jwt.claims to '{"sub": "bbbbbbbb-0000-0000-0000-000000000005", "role": "authenticated"}';

insert into public.courses (id, name, updated_at, changed_at) values
  ('c5000000-0000-0000-0000-000000000001', 'Math', '2020-01-01', '2020-01-01');
insert into public.folders (id, course_id, name, updated_at, changed_at) values
  ('f5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'Funcions', '2020-01-01', '2020-01-01');
insert into public.files (id, course_id, kind, title, updated_at, changed_at) values
  ('d5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'lecture', 'Clase 1', '2020-01-01', '2020-01-01');
insert into public.lectures (id) values ('d5000000-0000-0000-0000-000000000001');
insert into public.media (id, lecture_id, kind, storage_path, updated_at, changed_at) values
  ('e5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'photo', 'x/photo.jpg', '2020-01-01', '2020-01-01');
insert into public.summaries (id, file_id, mode, sliders, updated_at) values
  ('a5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'new', '{}', '2020-01-01');

-- Adding to Favorites
update public.courses set starred_at = now() where id = 'c5000000-0000-0000-0000-000000000001';
update public.folders set starred_at = now() where id = 'f5000000-0000-0000-0000-000000000001';
update public.files   set starred_at = now() where id = 'd5000000-0000-0000-0000-000000000001';
update public.media   set starred_at = now() where id = 'e5000000-0000-0000-0000-000000000001';

select is((select updated_at from public.courses where id = 'c5000000-0000-0000-0000-000000000001'), '2020-01-01'::timestamptz, 'course: a favorite keeps updated_at');
select is((select updated_at from public.folders where id = 'f5000000-0000-0000-0000-000000000001'), '2020-01-01'::timestamptz, 'folder: a favorite keeps updated_at');
select is((select updated_at from public.files   where id = 'd5000000-0000-0000-0000-000000000001'), '2020-01-01'::timestamptz, 'file: a favorite keeps updated_at');
select is((select updated_at from public.media   where id = 'e5000000-0000-0000-0000-000000000001'), '2020-01-01'::timestamptz, 'lecture photo: a favorite keeps updated_at');

select is((select changed_at from public.courses where id = 'c5000000-0000-0000-0000-000000000001'), now(), 'course: changed_at moves');
select is((select changed_at from public.folders where id = 'f5000000-0000-0000-0000-000000000001'), now(), 'folder: changed_at moves');
select is((select changed_at from public.files   where id = 'd5000000-0000-0000-0000-000000000001'), now(), 'file: changed_at moves');
select is((select changed_at from public.media   where id = 'e5000000-0000-0000-0000-000000000001'), now(), 'lecture photo: changed_at moves');

-- Removing from Favorites
update public.files set starred_at = null where id = 'd5000000-0000-0000-0000-000000000001';
select is((select updated_at from public.files where id = 'd5000000-0000-0000-0000-000000000001'), '2020-01-01'::timestamptz, 'removing a favorite keeps updated_at');

-- A real edit still counts
update public.files set title = 'Clase 1 (bis)' where id = 'd5000000-0000-0000-0000-000000000001';
select is((select updated_at from public.files where id = 'd5000000-0000-0000-0000-000000000001'), now(), 'a rename moves updated_at');

update public.courses set name = 'Maths', starred_at = null where id = 'c5000000-0000-0000-0000-000000000001';
select is((select updated_at from public.courses where id = 'c5000000-0000-0000-0000-000000000001'), now(), 'a rename together with a favorite change moves updated_at');

-- Other tables keep the plain trigger
update public.summaries set status = status where id = 'a5000000-0000-0000-0000-000000000001';
select is((select updated_at from public.summaries where id = 'a5000000-0000-0000-0000-000000000001'), now(), 'summaries: an update still bumps updated_at');

-- Someone else can't add your things to their favorites
set local request.jwt.claims to '{"sub": "bbbbbbbb-0000-0000-0000-000000000006", "role": "authenticated"}';
update public.media set starred_at = null where id = 'e5000000-0000-0000-0000-000000000001';
update public.folders set starred_at = null where id = 'f5000000-0000-0000-0000-000000000001';
set local request.jwt.claims to '{"sub": "bbbbbbbb-0000-0000-0000-000000000005", "role": "authenticated"}';
select isnt((select starred_at from public.media where id = 'e5000000-0000-0000-0000-000000000001'), null, 'another user cannot change a photo''s favorite');
select isnt((select starred_at from public.folders where id = 'f5000000-0000-0000-0000-000000000001'), null, 'another user cannot change a folder''s favorite');

select * from finish();
rollback;
