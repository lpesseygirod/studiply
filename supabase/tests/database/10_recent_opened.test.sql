-- Step 3.5 (20261026090600): opening a file (last_opened_at) is not an
-- edit. updated_at ("Date edited") stays, changed_at moves (the iPhone
-- downloads it), and an edit together with an open still counts as an edit.
-- Rows start with an old updated_at/changed_at: inside one transaction now()
-- doesn't move, so "moved" means "is now()".
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'recent@test.dev');

set local role authenticated;
set local request.jwt.claims to '{"sub": "bbbbbbbb-0000-0000-0000-00000000000b", "role": "authenticated"}';

insert into public.courses (id, name, updated_at, changed_at) values
  ('ca000000-0000-0000-0000-000000000001', 'Math', '2020-01-01', '2020-01-01');
insert into public.files (id, course_id, kind, title, updated_at, changed_at) values
  ('da000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'lecture', 'Opened', '2020-01-01', '2020-01-01'),
  ('da000000-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000001', 'pdf', 'Opened and renamed', '2020-01-01', '2020-01-01'),
  ('da000000-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-000000000001', 'image', 'Opened and starred', '2020-01-01', '2020-01-01');

-- Opening
update public.files set last_opened_at = now() where id = 'da000000-0000-0000-0000-000000000001';
select is((select updated_at from public.files where id = 'da000000-0000-0000-0000-000000000001'), '2020-01-01'::timestamptz, 'opening keeps updated_at');
select is((select changed_at from public.files where id = 'da000000-0000-0000-0000-000000000001'), now(), 'opening moves changed_at (the iPhone downloads it)');
select is((select last_opened_at from public.files where id = 'da000000-0000-0000-0000-000000000001'), now(), 'last_opened_at is saved');

-- Opening again later still isn't an edit
update public.files set last_opened_at = now() + interval '1 minute' where id = 'da000000-0000-0000-0000-000000000001';
select is((select updated_at from public.files where id = 'da000000-0000-0000-0000-000000000001'), '2020-01-01'::timestamptz, 'opening again keeps updated_at');

-- An edit in the same update is an edit
update public.files set last_opened_at = now(), title = 'Renamed' where id = 'da000000-0000-0000-0000-000000000002';
select is((select updated_at from public.files where id = 'da000000-0000-0000-0000-000000000002'), now(), 'opening and renaming together moves updated_at');

-- Opening and starring together is still not an edit
update public.files set last_opened_at = now(), starred_at = now() where id = 'da000000-0000-0000-0000-000000000003';
select is((select updated_at from public.files where id = 'da000000-0000-0000-0000-000000000003'), '2020-01-01'::timestamptz, 'opening and starring keeps updated_at');

-- Courses (no last_opened_at) keep the plain rule
update public.courses set name = 'Maths' where id = 'ca000000-0000-0000-0000-000000000001';
select is((select updated_at from public.courses where id = 'ca000000-0000-0000-0000-000000000001'), now(), 'renaming a course still moves updated_at');

select * from finish();
rollback;
