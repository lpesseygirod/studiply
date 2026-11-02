-- Step 9.1 (20261029152000): flashcards in review. A new card is due at once (its own
-- review_schedule row, made by a trigger); trashed, it loses its row; restored, it gets one again.
-- kind is term | question | card; a review's grade can be hard. review_card writes a card's next
-- review only when it is later than the stored one, and only on the student's own cards.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000161', 'cards@test.dev'),
  ('dddddddd-0000-0000-0000-000000000162', 'other-cards@test.dev');

set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000161", "role": "authenticated"}';

insert into public.flashcards (id, source, front, back, kind)
values ('c1600000-0000-0000-0000-000000000001', 'summary', 'Parentesco filogenético', 'Relación evolutiva entre especies.', 'term');

select ok(
  (select due_at <= now() and reps = 0 and ease = 2.5 and last_grade is null
     from public.review_schedule where flashcard_id = 'c1600000-0000-0000-0000-000000000001'),
  'a new card has its review row, due at once');

select lives_ok(
  $$ insert into public.flashcards (source, front, back, kind) values ('summary', '¿Qué es la conducta?', 'Lo que hace un organismo.', 'question') $$,
  'kind question');
select lives_ok(
  $$ insert into public.flashcards (source, front, back) values ('assistant', 'Q', 'A') $$,
  'no kind (a card saved before 9.1, or any other card)');
select throws_ok(
  $$ insert into public.flashcards (source, front, back, kind) values ('summary', 'Q', 'A', 'definition') $$,
  '23514', null, 'kind is term, question or card');

-- review_card: the later review wins.
select ok(
  public.review_card('c1600000-0000-0000-0000-000000000001', now() + interval '3 days', 3, 2.5, 1, 'good', '2026-11-01 10:00+00'),
  'a review is written');
select ok(
  not public.review_card('c1600000-0000-0000-0000-000000000001', now() + interval '1 minute', 0, 2.3, 0, 'again', '2026-11-01 09:00+00'),
  'an earlier one (another device, offline) is not');
select ok(
  (select last_grade = 'good' and reps = 1 and interval_days = 3 from public.review_schedule where flashcard_id = 'c1600000-0000-0000-0000-000000000001'),
  'the later review stays');
select ok(
  public.review_card('c1600000-0000-0000-0000-000000000001', now() + interval '1 day', 1, 2.35, 1, 'hard', '2026-11-01 11:00+00'),
  'hard is a grade');
select throws_ok(
  $$ select public.review_card('c1600000-0000-0000-0000-000000000001', now(), 1, 2.5, 1, 'perfect', '2026-11-01 12:00+00') $$,
  '23514', null, 'and nothing else is');

-- The trash.
update public.flashcards set deleted_at = now() where id = 'c1600000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.review_schedule where flashcard_id = 'c1600000-0000-0000-0000-000000000001'),
  0, 'a card in the trash has no review row (not counted in Review today)');
update public.flashcards set deleted_at = null where id = 'c1600000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.review_schedule where flashcard_id = 'c1600000-0000-0000-0000-000000000001'),
  1, 'taken out of the trash, it has one again');

-- Another user.
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000162", "role": "authenticated"}';
select ok(
  not public.review_card('c1600000-0000-0000-0000-000000000001', now() + interval '30 days', 30, 3, 9, 'easy', '2026-12-01 10:00+00'),
  'another user cannot review your card');
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000161", "role": "authenticated"}';
select ok(
  (select reps <> 9 from public.review_schedule where flashcard_id = 'c1600000-0000-0000-0000-000000000001'),
  'nor change it');

select * from finish();
rollback;
