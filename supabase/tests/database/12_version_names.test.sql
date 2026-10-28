-- Step 4.3 (20261026090800): a version can be named (and the name changed
-- or removed) by its owner only; nothing else about a version can change.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-00000000000c', 'versions@test.dev'),
  ('cccccccc-0000-0000-0000-00000000000d', 'other@test.dev');

set local role authenticated;
set local request.jwt.claims to '{"sub": "cccccccc-0000-0000-0000-00000000000c", "role": "authenticated"}';

insert into public.files (id, kind, title) values ('dc000000-0000-0000-0000-000000000001', 'document', 'Apuntes');
insert into public.documents (id, file_id, tab) values ('bc000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000001', 'notes');
insert into public.document_versions (id, document_id, content, reason) values
  ('ec000000-0000-0000-0000-000000000001', 'bc000000-0000-0000-0000-000000000001', '{"type": "doc"}', 'session_end');

update public.document_versions set name = '  Antes del examen ' where id = 'ec000000-0000-0000-0000-000000000001';
select is((select name from public.document_versions where id = 'ec000000-0000-0000-0000-000000000001'), '  Antes del examen ', 'the owner names a version');

update public.document_versions set name = null where id = 'ec000000-0000-0000-0000-000000000001';
select is((select name from public.document_versions where id = 'ec000000-0000-0000-0000-000000000001'), null, 'and removes the name');

select throws_ok(
  $$ update public.document_versions set name = '   ' where id = 'ec000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a name is not empty');

select throws_ok(
  $$ update public.document_versions set name = repeat('a', 101) where id = 'ec000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a name has at most 100 characters');

select throws_ok(
  $$ update public.document_versions set content = '{"changed": true}' where id = 'ec000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'the content still can''t be changed');

select throws_ok(
  $$ update public.document_versions set reason = 'restore' where id = 'ec000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'nor the reason');

-- Someone else
set local request.jwt.claims to '{"sub": "cccccccc-0000-0000-0000-00000000000d", "role": "authenticated"}';
update public.document_versions set name = 'Mine now' where id = 'ec000000-0000-0000-0000-000000000001';
set local request.jwt.claims to '{"sub": "cccccccc-0000-0000-0000-00000000000c", "role": "authenticated"}';
select is((select name from public.document_versions where id = 'ec000000-0000-0000-0000-000000000001'), null, 'another user can''t name it');

select * from finish();
rollback;
