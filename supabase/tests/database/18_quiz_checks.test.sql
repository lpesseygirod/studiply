-- Step 9.1b-2 (20261029152200): a quiz keeps the report of the run that wrote it (quizzes.checks,
-- jsonb, null until written), and only its owner reads or writes it (owner-only RLS, as 9.1b-1).
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_column('public', 'quizzes', 'checks', 'quizzes has checks');
select col_type_is('public', 'quizzes', 'checks', 'jsonb', 'checks is jsonb');
select col_is_null('public', 'quizzes', 'checks', 'checks may be null (until written)');

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000181', 'quiz-checks@test.dev'),
  ('dddddddd-0000-0000-0000-000000000182', 'other@test.dev');

set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000181", "role": "authenticated"}';
insert into public.quizzes (id, title, settings, plan, checks)
values ('c1800000-0000-0000-0000-000000000001', 'Quiz', '{}', '{}', '{"version": 1, "requested": 10, "written": 9}');

select is(
  (select (checks ->> 'written')::int from public.quizzes where id = 'c1800000-0000-0000-0000-000000000001'),
  9,
  'the owner reads its report');

set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000182", "role": "authenticated"}';
select is(
  (select count(*)::int from public.quizzes where id = 'c1800000-0000-0000-0000-000000000001'),
  0,
  'another user sees no quiz and no report');

select * from finish();
rollback;
