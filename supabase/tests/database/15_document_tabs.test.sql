-- Step 4.7b (20261029151900): tabs in every document. An added tab's id is
-- t-<uuid>; other names are refused; one row per (file, tab); title, kind and
-- position are checked; a tab can be soft-deleted; another user can neither
-- see nor change a tab.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000151', 'tabs@test.dev'),
  ('dddddddd-0000-0000-0000-000000000152', 'other-tabs@test.dev');

set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000151", "role": "authenticated"}';

insert into public.files (id, kind, title) values ('d1500000-0000-0000-0000-000000000001', 'document', 'Apuntes');
insert into public.documents (id, file_id, tab) values ('b1500000-0000-0000-0000-000000000001', 'd1500000-0000-0000-0000-000000000001', 'notes');

select ok(
  (select title is null and position is null and deleted_at is null and kind is null
     from public.documents where id = 'b1500000-0000-0000-0000-000000000001'),
  'a document''s first tab starts with no title, position, deletion or kind (the defaults)');

select lives_ok(
  $$ insert into public.documents (id, file_id, tab, title, position)
     values ('b1500000-0000-0000-0000-000000000002', 'd1500000-0000-0000-0000-000000000001',
             't-0b6f1c2e-4d3a-4f5b-9c8d-7e6f5a4b3c2d', 'Semana 3', 1) $$,
  'an added tab: t-<uuid>, with a title and a position');

select lives_ok(
  $$ insert into public.documents (id, file_id, tab, title, kind)
     values ('b1500000-0000-0000-0000-000000000003', 'd1500000-0000-0000-0000-000000000001',
             't-1c7f2d3e-5e4b-4a6c-8d9e-0f1a2b3c4d5e', 'Presupuesto', 'sheet') $$,
  'a spreadsheet tab (kind sheet)');

select throws_ok(
  $$ insert into public.documents (file_id, tab) values ('d1500000-0000-0000-0000-000000000001', 'week3') $$,
  '23514', null, 'any other tab name is refused');

select throws_ok(
  $$ insert into public.documents (file_id, tab) values ('d1500000-0000-0000-0000-000000000001', 't-123') $$,
  '23514', null, 't- needs a whole uuid');

select throws_ok(
  $$ insert into public.documents (file_id, tab) values ('d1500000-0000-0000-0000-000000000001', 't-0B6F1C2E-4D3A-4F5B-9C8D-7E6F5A4B3C2D') $$,
  '23514', null, 'in lower case');

select throws_ok(
  $$ insert into public.documents (file_id, tab) values ('d1500000-0000-0000-0000-000000000001', 't-0b6f1c2e-4d3a-4f5b-9c8d-7e6f5a4b3c2d') $$,
  '23505', null, 'one row per tab of a file');

select throws_ok(
  $$ update public.documents set title = '   ' where id = 'b1500000-0000-0000-0000-000000000002' $$,
  '23514', null, 'a title is not empty');

select throws_ok(
  $$ update public.documents set title = repeat('a', 101) where id = 'b1500000-0000-0000-0000-000000000002' $$,
  '23514', null, 'a title has at most 100 characters');

select lives_ok(
  $$ update public.documents set title = repeat('a', 100) where id = 'b1500000-0000-0000-0000-000000000002' $$,
  '100 characters are fine');

select throws_ok(
  $$ update public.documents set kind = 'chart' where id = 'b1500000-0000-0000-0000-000000000002' $$,
  '23514', null, 'kind is summary or sheet');

select throws_ok(
  $$ update public.documents set position = 'NaN' where id = 'b1500000-0000-0000-0000-000000000002' $$,
  '23514', null, 'a position is a real number');

update public.documents set position = 0.5, deleted_at = now() where id = 'b1500000-0000-0000-0000-000000000002';
select ok(
  (select position = 0.5 and deleted_at is not null from public.documents where id = 'b1500000-0000-0000-0000-000000000002'),
  'the owner moves a tab and deletes it (softly)');

-- Another user.
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000152", "role": "authenticated"}';
select is(
  (select count(*)::int from public.documents where file_id = 'd1500000-0000-0000-0000-000000000001'),
  0, 'another user sees none of the tabs');
update public.documents set title = 'Mío', deleted_at = null where id = 'b1500000-0000-0000-0000-000000000002';
-- Row Level Security refuses a tab written as the owner (under their own id
-- the foreign key to the owner's file would refuse it instead, 23503).
select throws_ok(
  $$ insert into public.documents (file_id, user_id, tab)
     values ('d1500000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000151', 't-2d8a3e4f-6f5c-4b7d-9eaf-1a2b3c4d5e6f') $$,
  '42501', null, 'nor adds a tab to it');

set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000151", "role": "authenticated"}';
select ok(
  (select title = repeat('a', 100) and deleted_at is not null from public.documents where id = 'b1500000-0000-0000-0000-000000000002'),
  'nor changes one');

select * from finish();
rollback;
