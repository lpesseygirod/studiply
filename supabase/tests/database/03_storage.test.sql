-- Storage: the three buckets are private, and one user can never read,
-- list, overwrite, move or delete another user's files.
--
-- User A uploads one object into its own folder in every bucket. User B
-- then tries to see, list, overwrite, update and delete them. Positive
-- controls prove A does see and change its own objects, so the zero counts
-- for B are not vacuous.
--
-- Storage refuses direct deletes from storage.objects unless
-- storage.allow_delete_query is set (the protect_delete trigger). It is set
-- here so the delete tests reach the RLS policy instead of that trigger.
begin;
create extension if not exists pgtap with schema extensions;
select plan(60);

set local storage.allow_delete_query = 'true';

-- ---------------------------------------------------------------------
-- Test helpers (in a throwaway schema, rolled back with the test)
-- ---------------------------------------------------------------------

create schema tests;
grant usage on schema tests to anon, authenticated;

create table tests.buckets (bucket text, file_size_limit bigint, mime_types text[]);
insert into tests.buckets values
  ('audio-chunks', 25 * 1024 * 1024,
   array['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/webm']),
  ('slides', 50 * 1024 * 1024, array['application/pdf', 'image/png', 'image/jpeg']),
  ('photos', 10 * 1024 * 1024, array['image/jpeg']);
grant select on tests.buckets to anon, authenticated;

-- Each helper runs as the current role, so RLS applies.

-- Runs a statement; returns the number of rows it touched, or the SQLSTATE
-- it failed with (42501 = refused by a policy or missing privilege).
create function tests.run(stmt text) returns text
language plpgsql as $$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return sqlstate;
end;
$$;

-- Counts the rows a query returns, as text (or the SQLSTATE on error).
create function tests.count(query text) returns text
language plpgsql as $$
declare n int;
begin
  execute format('select count(*) from (%s) q', query) into n;
  return n::text;
exception when others then
  return sqlstate;
end;
$$;

-- A's object in a bucket, and the two ways the Storage API lists a folder.
create function tests.a_path() returns text
language sql as $$ select 'aaaaaaaa-0000-0000-0000-000000000000/profile/test.jpg' $$;

create function tests.sees_a(bucket text) returns text
language sql as $$
  select tests.count(format('select 1 from storage.objects where bucket_id = %L and name = %L', bucket, tests.a_path()))
$$;

create function tests.search_a(bucket text) returns text
language sql as $$
  select tests.count(format(
    'select 1 from storage.search(%L, %L) where name = %L',
    'aaaaaaaa-0000-0000-0000-000000000000/profile/', bucket, 'test.jpg'))
$$;

create function tests.list_a(bucket text) returns text
language sql as $$
  select tests.count(format(
    'select 1 from storage.list_objects_with_delimiter(%L, %L, %L) where name like %L',
    bucket, 'aaaaaaaa-0000-0000-0000-000000000000/', '/', 'aaaaaaaa-0000-0000-0000-000000000000/profile/%'))
$$;

grant execute on all functions in schema tests to anon, authenticated;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a@test.dev'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b@test.dev');

-- ---------------------------------------------------------------------
-- Buckets exist, are private and have the expected limits (3 tests)
-- ---------------------------------------------------------------------

select is(
  (select row(b.public, b.file_size_limit, b.allowed_mime_types)::text from storage.buckets b where b.id = t.bucket),
  row(false, t.file_size_limit, t.mime_types)::text,
  format('%s is private with the expected size and type limits', t.bucket))
from tests.buckets t;

-- ---------------------------------------------------------------------
-- A uploads into its own folder, sees and lists it (4 × 3 = 12 tests)
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-0000-0000-000000000000", "role": "authenticated"}';

select is(
  tests.run(format('insert into storage.objects (bucket_id, name) values (%L, %L)', bucket, tests.a_path())),
  '1', format('A uploads into its own folder in %s', bucket))
from tests.buckets;

select is(tests.sees_a(bucket), '1', format('A sees its own file in %s', bucket)) from tests.buckets;
select is(tests.search_a(bucket), '1', format('A finds its own file with storage.search in %s', bucket)) from tests.buckets;
select is(tests.list_a(bucket), '1', format('A lists its own folder in %s', bucket)) from tests.buckets;

-- ---------------------------------------------------------------------
-- A can't upload outside its own folder (2 × 3 = 6 tests)
-- ---------------------------------------------------------------------

select is(
  tests.run(format('insert into storage.objects (bucket_id, name) values (%L, %L)',
    bucket, 'bbbbbbbb-0000-0000-0000-000000000000/planted.jpg')),
  '42501', format('A can''t upload into B''s folder in %s', bucket))
from tests.buckets;

select is(
  tests.run(format('insert into storage.objects (bucket_id, name) values (%L, %L)', bucket, 'loose.jpg')),
  '42501', format('A can''t upload at the root of %s', bucket))
from tests.buckets;

-- ---------------------------------------------------------------------
-- B can't read, list, overwrite, move or delete A's files (7 × 3 = 21 tests)
-- ---------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "bbbbbbbb-0000-0000-0000-000000000000", "role": "authenticated"}';

select is(tests.sees_a(bucket), '0', format('B can''t read A''s file in %s', bucket)) from tests.buckets;
select is(tests.search_a(bucket), '0', format('B can''t find A''s file with storage.search in %s', bucket)) from tests.buckets;
select is(tests.list_a(bucket), '0', format('B can''t list A''s folder in %s', bucket)) from tests.buckets;

select is(
  tests.run(format('insert into storage.objects (bucket_id, name) values (%L, %L)', bucket, tests.a_path())),
  '42501', format('B can''t upload over A''s file in %s', bucket))
from tests.buckets;

select is(
  tests.run(format('update storage.objects set metadata = %L where bucket_id = %L and name = %L',
    '{"overwritten": true}', bucket, tests.a_path())),
  '0', format('B can''t change A''s file in %s', bucket))
from tests.buckets;

select is(
  tests.run(format('update storage.objects set name = %L where bucket_id = %L and name = %L',
    'bbbbbbbb-0000-0000-0000-000000000000/stolen.jpg', bucket, tests.a_path())),
  '0', format('B can''t move A''s file into its own folder in %s', bucket))
from tests.buckets;

select is(
  tests.run(format('delete from storage.objects where bucket_id = %L and name = %L', bucket, tests.a_path())),
  '0', format('B can''t delete A''s file in %s', bucket))
from tests.buckets;

-- ---------------------------------------------------------------------
-- Signed out (anon): no access at all (2 × 3 = 6 tests)
-- ---------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';

select is(tests.sees_a(bucket), '0', format('anon can''t read A''s file in %s', bucket)) from tests.buckets;

select is(
  tests.run(format('insert into storage.objects (bucket_id, name) values (%L, %L)',
    bucket, 'aaaaaaaa-0000-0000-0000-000000000000/anon.jpg')),
  '42501', format('anon can''t upload in %s', bucket))
from tests.buckets;

-- ---------------------------------------------------------------------
-- A's files are untouched; A can change, but not move away, and delete
-- its own (3 + 3 × 3 = 12 tests)
-- ---------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-0000-0000-000000000000", "role": "authenticated"}';

select is(
  tests.count(format('select 1 from storage.objects where bucket_id = %L and name = %L and metadata is null',
    bucket, tests.a_path())),
  '1', format('A''s file in %s is still there, unchanged', bucket))
from tests.buckets;

select is(
  tests.run(format('update storage.objects set metadata = %L where bucket_id = %L and name = %L',
    '{"edited": true}', bucket, tests.a_path())),
  '1', format('A can change its own file in %s', bucket))
from tests.buckets;

select is(
  tests.run(format('update storage.objects set name = %L where bucket_id = %L and name = %L',
    'bbbbbbbb-0000-0000-0000-000000000000/gift.jpg', bucket, tests.a_path())),
  '42501', format('A can''t move its file into B''s folder in %s', bucket))
from tests.buckets;

select is(
  tests.run(format('delete from storage.objects where bucket_id = %L and name = %L', bucket, tests.a_path())),
  '1', format('A can delete its own file in %s', bucket))
from tests.buckets;

select * from finish();
rollback;
