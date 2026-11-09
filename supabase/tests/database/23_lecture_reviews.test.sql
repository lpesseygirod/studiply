-- Step 9.2-1 (20261029152700_lecture_reviews): spaced review of lectures.
--   A lecture's review row: one per lecture; review_lecture writes it as the student, only when the
--   review is later than the stored one (another device's earlier review, sent late, is ignored);
--   undo_lecture_review puts the earlier time back only while nothing later came; another student
--   can't review or undo hers. "Study reminders for this lecture": lectures.study_reminders (null:
--   the course's default) and course_settings.study_reminders (on by default).
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000231', 'plan-a@test.dev'),
  ('dddddddd-0000-0000-0000-000000000232', 'plan-b@test.dev');

insert into public.courses (id, user_id, name) values
  ('c2300000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000231', 'Psicobiología');
insert into public.files (id, user_id, kind, title, course_id) values
  ('a2300000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000231', 'lecture', 'Tema 1', 'c2300000-0000-0000-0000-000000000001'),
  ('a2300000-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000231', 'lecture', 'Tema 2', 'c2300000-0000-0000-0000-000000000001');
insert into public.lectures (id, user_id) values
  ('a2300000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000231'),
  ('a2300000-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000231');

-- ---------------------------------------------------------------------
-- The switch (Lea, 9 Nov)
-- ---------------------------------------------------------------------
select is((select study_reminders from public.lectures where id = 'a2300000-0000-0000-0000-000000000001'), null, 'a lecture follows its course''s default (null)');
select is((select study_reminders from public.course_settings where course_id = 'c2300000-0000-0000-0000-000000000001'), true, 'a course''s default is on');

set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000231", "role": "authenticated"}';

select lives_ok($$ update public.lectures set study_reminders = false where id = 'a2300000-0000-0000-0000-000000000002' $$, 'she turns a lecture''s study reminders off');
select lives_ok($$ update public.course_settings set study_reminders = false where course_id = 'c2300000-0000-0000-0000-000000000001' $$, 'and saves the course''s default');
select throws_ok($$ update public.course_settings set study_reminders = null where course_id = 'c2300000-0000-0000-0000-000000000001' $$, '23502', null, 'the course''s default is on or off, never empty');

-- ---------------------------------------------------------------------
-- review_lecture: the later review wins
-- ---------------------------------------------------------------------
select ok(public.review_lecture('e2300000-0000-0000-0000-000000000001', 'a2300000-0000-0000-0000-000000000001', '2026-11-10 18:00+00', '2026-11-12 00:00+00'), 'a first review makes the lecture''s row');
select results_eq(
  $$ select id, flashcard_id, reps, last_reviewed_at from public.review_schedule where file_id = 'a2300000-0000-0000-0000-000000000001' $$,
  $$ values ('e2300000-0000-0000-0000-000000000001'::uuid, null::uuid, 1, '2026-11-10 18:00+00'::timestamptz) $$,
  'with the id given (the iPhone''s copy keeps it), no card, reviewed once');
select ok(not public.review_lecture('e2300000-0000-0000-0000-000000000099', 'a2300000-0000-0000-0000-000000000001', '2026-11-10 09:00+00', '2026-11-11 00:00+00'), 'an earlier review (another device, offline) is not written');
select ok(public.review_lecture('e2300000-0000-0000-0000-000000000099', 'a2300000-0000-0000-0000-000000000001', '2026-11-12 19:00+00', '2026-11-16 00:00+00'), 'a later one is');
select results_eq(
  $$ select id, reps, last_reviewed_at, due_at from public.review_schedule where file_id = 'a2300000-0000-0000-0000-000000000001' $$,
  $$ values ('e2300000-0000-0000-0000-000000000001'::uuid, 2, '2026-11-12 19:00+00'::timestamptz, '2026-11-16 00:00+00'::timestamptz) $$,
  'into the same row (one per lecture): reviewed twice, the next session noted');
select throws_ok(
  $$ insert into public.review_schedule (file_id, due_at) values ('a2300000-0000-0000-0000-000000000001', now()) $$,
  '23505', null, 'a lecture never has two review rows');

-- ---------------------------------------------------------------------
-- Undo of Mark reviewed
-- ---------------------------------------------------------------------
select ok(not public.undo_lecture_review('a2300000-0000-0000-0000-000000000001', '2026-11-10 18:00+00', null), 'undoing a review that isn''t the last one does nothing');
select ok(public.undo_lecture_review('a2300000-0000-0000-0000-000000000001', '2026-11-12 19:00+00', '2026-11-10 18:00+00'), 'undoing the last review');
select results_eq(
  $$ select reps, last_reviewed_at from public.review_schedule where file_id = 'a2300000-0000-0000-0000-000000000001' $$,
  $$ values (1, '2026-11-10 18:00+00'::timestamptz) $$,
  'puts the earlier one back');

-- ---------------------------------------------------------------------
-- Another student
-- ---------------------------------------------------------------------
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000232", "role": "authenticated"}';
select is((select count(*)::int from public.review_schedule where file_id is not null), 0, 'another student sees none of her lecture reviews');
select throws_ok(
  $$ select public.review_lecture('e2300000-0000-0000-0000-000000000077', 'a2300000-0000-0000-0000-000000000001', '2026-12-01 10:00+00', '2026-12-02 00:00+00') $$,
  null, null, 'nor can review her lecture');
select ok(not public.undo_lecture_review('a2300000-0000-0000-0000-000000000001', '2026-11-10 18:00+00', null), 'nor undo her review');
update public.lectures set study_reminders = true where id = 'a2300000-0000-0000-0000-000000000002';
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000231", "role": "authenticated"}';
select results_eq(
  $$ select reps, last_reviewed_at, (select study_reminders from public.lectures where id = 'a2300000-0000-0000-0000-000000000002') from public.review_schedule where file_id = 'a2300000-0000-0000-0000-000000000001' $$,
  $$ values (1, '2026-11-10 18:00+00'::timestamptz, false) $$,
  'her review and her switch are as she left them');

reset role;

select ok(not has_function_privilege('anon', 'public.review_lecture(uuid, uuid, timestamptz, timestamptz)', 'execute'), 'anon can''t review a lecture');
select ok(has_function_privilege('authenticated', 'public.undo_lecture_review(uuid, timestamptz, timestamptz)', 'execute'), 'a signed-in student can undo her own');

select * from finish();
rollback;
