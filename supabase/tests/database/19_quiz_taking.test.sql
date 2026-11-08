-- Step 9.1b-3 (no migration): taking a quiz with the app's own writes. An answer upserted by attempt and
-- question (saved again: replaced, one row); the AI's grade written only where the answer is still
-- pending (the quiz function's update) moves the score; her grade set while the AI grades wins, and
-- keeps the grade it changed (original_verdict); a question left unanswered at Finish (response {},
-- wrong) makes its review card; the attempt finished with its length.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values ('dddddddd-0000-0000-0000-000000000191', 'taking@test.dev');

set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000191", "role": "authenticated"}';

insert into public.courses (id, name) values ('c1900000-0000-0000-0000-000000000001', 'Psicobiología');
insert into public.files (id, course_id, kind, title) values ('c1900000-0000-0000-0000-000000000002', 'c1900000-0000-0000-0000-000000000001', 'lecture', 'Tema 1');
insert into public.lectures (id) values ('c1900000-0000-0000-0000-000000000002');
insert into public.quizzes (id, course_id, title, settings, plan, status, question_count)
values ('c1900000-0000-0000-0000-000000000010', 'c1900000-0000-0000-0000-000000000001', 'Tema 1', '{}', '{}', 'ready', 4);
insert into public.quiz_questions (id, quiz_id, position, type, prompt, data, answer_text, source_file_id)
values
  ('c1900000-0000-0000-0000-000000000021', 'c1900000-0000-0000-0000-000000000010', 0, 'multiple_choice', '¿Qué estudia?',
   '{"options": ["La conducta", "Las rocas"], "correct": 0}', 'La conducta', 'c1900000-0000-0000-0000-000000000002'),
  ('c1900000-0000-0000-0000-000000000022', 'c1900000-0000-0000-0000-000000000010', 1, 'short_answer', 'Define filogenia', '{"modelAnswer": "La historia evolutiva"}', 'La historia evolutiva', null),
  ('c1900000-0000-0000-0000-000000000023', 'c1900000-0000-0000-0000-000000000010', 2, 'long_answer', 'Explica las 5 preguntas', '{"modelAnswer": "…", "keyPoints": []}', '…', null),
  ('c1900000-0000-0000-0000-000000000024', 'c1900000-0000-0000-0000-000000000010', 3, 'true_false', 'La TIR es una tasa.', '{"correct": true}', 'True', null);

-- Started (the app: id, quiz, grading, one point a question).
insert into public.quiz_attempts (id, quiz_id, status, started_at, grading, pass_threshold, max_points)
values ('c1900000-0000-0000-0000-000000000031', 'c1900000-0000-0000-0000-000000000010', 'in_progress', now() - interval '400 seconds', 'score', 60, 4);

-- ---------------------------------------------------------------------
-- Answers, saved again
-- ---------------------------------------------------------------------

insert into public.quiz_answers (id, attempt_id, question_id, response, verdict, points, graded_by)
values ('c1900000-0000-0000-0000-000000000041', 'c1900000-0000-0000-0000-000000000031', 'c1900000-0000-0000-0000-000000000021', '{"choice": 1}', 'wrong', 0, 'code')
on conflict (attempt_id, question_id) do update set response = excluded.response, verdict = excluded.verdict, points = excluded.points;
insert into public.quiz_answers (id, attempt_id, question_id, response, verdict, points, graded_by)
values ('c1900000-0000-0000-0000-000000000041', 'c1900000-0000-0000-0000-000000000031', 'c1900000-0000-0000-0000-000000000021', '{"choice": 0}', 'correct', 1, 'code')
on conflict (attempt_id, question_id) do update set response = excluded.response, verdict = excluded.verdict, points = excluded.points;
select is(
  (select count(*)::int from public.quiz_answers where attempt_id = 'c1900000-0000-0000-0000-000000000031' and question_id = 'c1900000-0000-0000-0000-000000000021'),
  1, 'an answer saved again replaces it: one row per question');
select is((select score from public.quiz_attempts where id = 'c1900000-0000-0000-0000-000000000031'), 2.5::numeric(3, 1), 'its new grade counts: 1 of 4');

insert into public.quiz_answers (id, attempt_id, question_id, response, verdict, points)
values
  ('c1900000-0000-0000-0000-000000000042', 'c1900000-0000-0000-0000-000000000031', 'c1900000-0000-0000-0000-000000000022', '{"text": "la evolución"}', 'pending', 0),
  ('c1900000-0000-0000-0000-000000000043', 'c1900000-0000-0000-0000-000000000031', 'c1900000-0000-0000-0000-000000000023', '{"text": "Qué, cómo…"}', 'pending', 0);
select is((select score from public.quiz_attempts where id = 'c1900000-0000-0000-0000-000000000031'), 2.5::numeric(3, 1), 'pending answers count 0');

-- ---------------------------------------------------------------------
-- The AI's grade only on a pending answer; hers wins
-- ---------------------------------------------------------------------

-- The quiz function's write: where the answer is still pending.
update public.quiz_answers set verdict = 'partly', points = 0.5, reason = 'Falta “historia”.', graded_by = 'ai'
 where id = 'c1900000-0000-0000-0000-000000000042' and verdict = 'pending';
select is((select points from public.quiz_attempts where id = 'c1900000-0000-0000-0000-000000000031'), 1.5::numeric(7, 3), 'the AI’s grade on a pending answer moves the score');
select ok(
  (select reason = 'Falta “historia”.' and graded_by = 'ai' from public.quiz_answers where id = 'c1900000-0000-0000-0000-000000000042'),
  'with its one-line reason, as the AI''s');

-- She grades the long answer herself while the AI is still grading it…
update public.quiz_answers set verdict = 'correct', points = 1, graded_by = 'student', original_verdict = null
 where id = 'c1900000-0000-0000-0000-000000000043';
-- …then the AI's grade arrives: it changes nothing.
update public.quiz_answers set verdict = 'wrong', points = 0, reason = 'No.', graded_by = 'ai'
 where id = 'c1900000-0000-0000-0000-000000000043' and verdict = 'pending';
select ok(
  (select verdict = 'correct' and graded_by = 'student' and reason = '' from public.quiz_answers where id = 'c1900000-0000-0000-0000-000000000043'),
  'her grade set while the AI graded wins');
select is((select points from public.quiz_attempts where id = 'c1900000-0000-0000-0000-000000000031'), 2.5::numeric(7, 3), 'and the score is hers');

-- She changes the AI's partly to correct: the grade it changed is kept.
update public.quiz_answers set verdict = 'correct', points = 1, graded_by = 'student', original_verdict = 'partly'
 where id = 'c1900000-0000-0000-0000-000000000042';
select ok(
  (select verdict = 'correct' and original_verdict = 'partly' and graded_by = 'student' from public.quiz_answers where id = 'c1900000-0000-0000-0000-000000000042'),
  'an override keeps original_verdict');
select is((select score from public.quiz_attempts where id = 'c1900000-0000-0000-0000-000000000031'), 7.5::numeric(3, 1), 'the score follows: 3 of 4');
select ok(
  (select deleted_at is not null from public.flashcards where source = 'quiz' and source_ref = 'c1900000-0000-0000-0000-000000000022'),
  'its card (made by the partly) goes to the trash: never reviewed, no wrong answer left');

-- ---------------------------------------------------------------------
-- Finish: the question left unanswered is wrong and comes back for review
-- ---------------------------------------------------------------------

insert into public.quiz_answers (id, attempt_id, question_id, response, verdict, points, graded_by)
values ('c1900000-0000-0000-0000-000000000044', 'c1900000-0000-0000-0000-000000000031', 'c1900000-0000-0000-0000-000000000024', '{}', 'wrong', 0, 'code')
on conflict (attempt_id, question_id) do update set response = excluded.response, verdict = excluded.verdict, points = excluded.points;
update public.quiz_attempts set status = 'finished', finished_at = now(), duration_ms = 400000
 where id = 'c1900000-0000-0000-0000-000000000031';

select is(
  (select count(*)::int from public.flashcards f join public.review_schedule r on r.flashcard_id = f.id
    where f.source = 'quiz' and f.source_ref = 'c1900000-0000-0000-0000-000000000024' and f.deleted_at is null and r.due_at <= now()),
  1, 'an unanswered question (wrong, response {}) makes its review card, due at once');
select ok(
  (select status = 'finished' and duration_ms = 400000 and score = 7.5 from public.quiz_attempts where id = 'c1900000-0000-0000-0000-000000000031'),
  'the attempt finished with its length; the score unchanged by the finish');
select throws_ok(
  $$ insert into public.quiz_answers (attempt_id, question_id, response) values ('c1900000-0000-0000-0000-000000000031', 'c1900000-0000-0000-0000-000000000022', null) $$,
  '23502', null, 'a response is never SQL null (unanswered is {})');

select * from finish();
rollback;
