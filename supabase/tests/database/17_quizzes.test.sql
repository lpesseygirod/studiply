-- Step 9.1b (20261029152100): quizzes. The checks on quizzes, questions, attempts and answers; the
-- score computed from the answers (score out of 10, pass/fail); a wrong or partly answer makes one
-- review card for its question (also for a copy that came back), due at once; a card in the trash
-- comes back; a grade changed to correct trashes a card never reviewed, unless another answer is
-- still wrong; the course's quiz defaults; 'quiz' in ai_usage and as a flashcard source.
-- (Another user can't read or attach rows: 01_isolation.)
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

insert into auth.users (id, email) values ('dddddddd-0000-0000-0000-000000000171', 'quiz@test.dev');

set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000171", "role": "authenticated"}';

insert into public.courses (id, name) values ('c1700000-0000-0000-0000-000000000001', 'Corporate Finance');
insert into public.files (id, course_id, kind, title) values ('c1700000-0000-0000-0000-000000000002', 'c1700000-0000-0000-0000-000000000001', 'lecture', 'Tema 1');
insert into public.lectures (id) values ('c1700000-0000-0000-0000-000000000002');

-- ---------------------------------------------------------------------
-- Quizzes and their sources
-- ---------------------------------------------------------------------

select lives_ok(
  $$ insert into public.quizzes (id, course_id, title, settings, plan, question_count)
     values ('c1700000-0000-0000-0000-000000000010', 'c1700000-0000-0000-0000-000000000001', 'Corporate Finance · Tema 1', '{}', '{}', 10) $$,
  'a pending quiz with its settings and plan');
select is((select status from public.quizzes where id = 'c1700000-0000-0000-0000-000000000010'), 'pending', 'a quiz starts pending');
select throws_ok(
  $$ insert into public.quizzes (title, settings, plan, status) values ('Q', '{}', '{}', 'done') $$,
  '23514', null, 'status is pending, generating, ready or failed');
select throws_ok(
  $$ insert into public.quizzes (title, settings, plan) values ('', '{}', '{}') $$,
  '23514', null, 'a title is 1–200 characters');
select throws_ok(
  $$ insert into public.quizzes (title, settings, plan, language) values ('Q', '{}', '{}', 'Spanish') $$,
  '23514', null, 'the language is a code');
select lives_ok(
  $$ insert into public.quiz_sources (quiz_id, role, file_id) values
       ('c1700000-0000-0000-0000-000000000010', 'lecture', 'c1700000-0000-0000-0000-000000000002'),
       ('c1700000-0000-0000-0000-000000000010', 'past_exam', 'c1700000-0000-0000-0000-000000000002') $$,
  'sources: a lecture, a past exam');
select throws_ok(
  $$ insert into public.quiz_sources (quiz_id, role, file_id) values ('c1700000-0000-0000-0000-000000000010', 'slides', null) $$,
  '23514', null, 'a source is a lecture, a resource or a past exam');

-- ---------------------------------------------------------------------
-- Questions
-- ---------------------------------------------------------------------

select lives_ok(
  $$ insert into public.quiz_questions (quiz_id, position, type, prompt) values
       ('c1700000-0000-0000-0000-000000000010', 10, 'true_false', 'Q'),
       ('c1700000-0000-0000-0000-000000000010', 11, 'short_answer', 'Q'),
       ('c1700000-0000-0000-0000-000000000010', 12, 'fill_blank', 'Q'),
       ('c1700000-0000-0000-0000-000000000010', 13, 'long_answer', 'Q'),
       ('c1700000-0000-0000-0000-000000000010', 14, 'match_pairs', 'Q'),
       ('c1700000-0000-0000-0000-000000000010', 15, 'order_steps', 'Q'),
       ('c1700000-0000-0000-0000-000000000010', 16, 'numeric', 'Q') $$,
  'the question types');
select throws_ok(
  $$ insert into public.quiz_questions (quiz_id, position, type, prompt) values ('c1700000-0000-0000-0000-000000000010', 20, 'essay', 'Q') $$,
  '23514', null, 'and nothing else');

insert into public.quiz_questions (id, quiz_id, position, type, prompt, data, answer_text, explanation, source_file_id, source_ms, focus, difficulty)
values
  ('c1700000-0000-0000-0000-000000000021', 'c1700000-0000-0000-0000-000000000010', 0, 'multiple_choice', '¿Qué mide el VAN?',
   '{"options": ["El valor actual neto", "La tasa interna", "El plazo de recuperación", "El margen"], "correct": 0}',
   'El valor actual neto', 'Suma de flujos descontados menos la inversión.', 'c1700000-0000-0000-0000-000000000002', 400000, 'exam', 'easy'),
  ('c1700000-0000-0000-0000-000000000022', 'c1700000-0000-0000-0000-000000000010', 1, 'numeric', 'Calcula el VAN', '{"answer": 120.5, "tolerance": 0.5}',
   '120,5 €', '', 'c1700000-0000-0000-0000-000000000002', 900000, 'any', 'hard'),
  ('c1700000-0000-0000-0000-000000000023', 'c1700000-0000-0000-0000-000000000010', 2, 'true_false', 'La TIR es una tasa.', '{"correct": true}',
   'Verdadero', '', null, null, 'weak', 'medium'),
  ('c1700000-0000-0000-0000-000000000024', 'c1700000-0000-0000-0000-000000000010', 3, 'short_answer', 'Define WACC', '{}',
   'Coste medio ponderado del capital', '', null, null, 'any', 'medium');

select throws_ok(
  $$ insert into public.quiz_questions (quiz_id, position, type, prompt) values ('c1700000-0000-0000-0000-000000000010', 0, 'numeric', 'Q') $$,
  '23505', null, 'one question per position');
select throws_ok(
  $$ insert into public.quiz_questions (quiz_id, position, type, prompt, focus) values ('c1700000-0000-0000-0000-000000000010', 30, 'numeric', 'Q', 'flagged') $$,
  '23514', null, 'focus is again, exam, weak or any');
select throws_ok(
  $$ insert into public.quiz_questions (quiz_id, position, type, prompt, difficulty) values ('c1700000-0000-0000-0000-000000000010', 31, 'numeric', 'Q', 'tricky') $$,
  '23514', null, 'difficulty is easy, medium or hard');
select throws_ok(
  $$ insert into public.quiz_questions (quiz_id, position, type, prompt, source_ms) values ('c1700000-0000-0000-0000-000000000010', 32, 'numeric', 'Q', -1) $$,
  '23514', null, 'a source time is 0 or more');

-- ---------------------------------------------------------------------
-- An attempt and its score
-- ---------------------------------------------------------------------

insert into public.quiz_attempts (id, quiz_id, max_points) values ('c1700000-0000-0000-0000-000000000031', 'c1700000-0000-0000-0000-000000000010', 4);
insert into public.quiz_answers (attempt_id, question_id, response, verdict, points, graded_by) values
  ('c1700000-0000-0000-0000-000000000031', 'c1700000-0000-0000-0000-000000000021', '0', 'correct', 1, 'code'),
  ('c1700000-0000-0000-0000-000000000031', 'c1700000-0000-0000-0000-000000000023', 'true', 'correct', 1, 'code');
insert into public.quiz_answers (id, attempt_id, question_id, response, verdict) values
  ('c1700000-0000-0000-0000-000000000042', 'c1700000-0000-0000-0000-000000000031', 'c1700000-0000-0000-0000-000000000024', '"Coste del capital"', 'pending');

select is((select score from public.quiz_attempts where id = 'c1700000-0000-0000-0000-000000000031'), 5.0::numeric(3, 1), '2 of 4 right: 5.0 (a pending answer counts 0)');

update public.quiz_answers set verdict = 'partly', points = 0.5, graded_by = 'ai', reason = 'Falta "medio ponderado".'
 where id = 'c1700000-0000-0000-0000-000000000042';
select is((select points from public.quiz_attempts where id = 'c1700000-0000-0000-0000-000000000031'), 2.5::numeric(7, 3), 'a late AI grade counts');
select is((select score from public.quiz_attempts where id = 'c1700000-0000-0000-0000-000000000031'), 6.3::numeric(3, 1), '2.5 of 4: 6.3 (one decimal)');
select is((select passed from public.quiz_attempts where id = 'c1700000-0000-0000-0000-000000000031'), null::boolean, 'no pass/fail with a score out of 10');

update public.quiz_attempts set grading = 'pass_fail', pass_threshold = 60 where id = 'c1700000-0000-0000-0000-000000000031';
select ok((select passed from public.quiz_attempts where id = 'c1700000-0000-0000-0000-000000000031'), 'pass/fail: 62.5 % passes at 60 %');

select throws_ok(
  $$ insert into public.quiz_answers (attempt_id, question_id, verdict) values ('c1700000-0000-0000-0000-000000000031', 'c1700000-0000-0000-0000-000000000021', 'wrong') $$,
  '23505', null, 'one answer per question in an attempt');
select throws_ok(
  $$ insert into public.quiz_answers (attempt_id, question_id, verdict) values ('c1700000-0000-0000-0000-000000000031', 'c1700000-0000-0000-0000-000000000022', 'half') $$,
  '23514', null, 'a verdict is correct, partly, wrong or pending');
select throws_ok(
  $$ insert into public.quiz_answers (attempt_id, question_id, points) values ('c1700000-0000-0000-0000-000000000031', 'c1700000-0000-0000-0000-000000000022', 2) $$,
  '23514', null, 'points are 0–1');

-- ---------------------------------------------------------------------
-- Wrong answers into review
-- ---------------------------------------------------------------------

select is((select count(*)::int from public.flashcards where source = 'quiz' and source_ref = 'c1700000-0000-0000-0000-000000000021'), 0, 'a right answer makes no card');
select is(
  (select count(*)::int from public.flashcards where source = 'quiz' and source_ref = 'c1700000-0000-0000-0000-000000000024' and deleted_at is null),
  1, 'a partly answer (the AI''s late grade) makes one');

insert into public.quiz_attempts (id, quiz_id, max_points) values ('c1700000-0000-0000-0000-000000000032', 'c1700000-0000-0000-0000-000000000010', 4);
insert into public.quiz_answers (id, attempt_id, question_id, response, verdict, points, graded_by) values
  ('c1700000-0000-0000-0000-000000000051', 'c1700000-0000-0000-0000-000000000032', 'c1700000-0000-0000-0000-000000000021', '2', 'wrong', 0, 'code');

select is(
  (select count(*)::int from public.flashcards where source = 'quiz' and source_ref = 'c1700000-0000-0000-0000-000000000021' and kind = 'question' and deleted_at is null),
  1, 'a wrong answer makes one review card for its question');
select ok(
  (select f.front like '¿Qué mide el VAN?' || E'\n' || 'A) El valor actual neto' || E'\n' || 'B) %' and f.back like 'El valor actual neto%'
          and f.course_id = 'c1700000-0000-0000-0000-000000000001' and f.file_id = 'c1700000-0000-0000-0000-000000000002'
     from public.flashcards f where f.source = 'quiz' and f.source_ref = 'c1700000-0000-0000-0000-000000000021'),
  'its front lists the options, its back the answer; the course and the lecture');
select ok(
  (select r.due_at <= now() and r.reps = 0 from public.review_schedule r join public.flashcards f on f.id = r.flashcard_id
    where f.source = 'quiz' and f.source_ref = 'c1700000-0000-0000-0000-000000000021'),
  'and its review row, due at once');

-- The question comes back in the next quiz (a copy) and is wrong again: still one card.
insert into public.quizzes (id, course_id, title, settings, plan) values ('c1700000-0000-0000-0000-000000000011', 'c1700000-0000-0000-0000-000000000001', 'Next quiz', '{}', '{}');
insert into public.quiz_questions (id, quiz_id, position, type, prompt, data, answer_text, focus, from_question_id)
values ('c1700000-0000-0000-0000-000000000025', 'c1700000-0000-0000-0000-000000000011', 0, 'multiple_choice', '¿Qué mide el VAN?',
        '{"options": ["El valor actual neto", "La tasa interna"], "correct": 0}', 'El valor actual neto', 'again', 'c1700000-0000-0000-0000-000000000021');
insert into public.quiz_attempts (id, quiz_id, max_points) values ('c1700000-0000-0000-0000-000000000033', 'c1700000-0000-0000-0000-000000000011', 1);
insert into public.quiz_answers (id, attempt_id, question_id, response, verdict, points, graded_by) values
  ('c1700000-0000-0000-0000-000000000052', 'c1700000-0000-0000-0000-000000000033', 'c1700000-0000-0000-0000-000000000025', '1', 'partly', 0.5, 'ai');
select is((select count(*)::int from public.flashcards where source = 'quiz' and source_ref = 'c1700000-0000-0000-0000-000000000021'), 1, 'a copy answered partly: the same card, not a second');

-- She changes one grade to correct: another answer to the question is still wrong, so the card stays.
update public.quiz_answers set verdict = 'correct', points = 1, graded_by = 'student', original_verdict = 'partly'
 where id = 'c1700000-0000-0000-0000-000000000052';
select is((select count(*)::int from public.flashcards where source = 'quiz' and source_ref = 'c1700000-0000-0000-0000-000000000021' and deleted_at is null), 1, 'changed to correct while another answer is wrong: the card stays');
select is((select score from public.quiz_attempts where id = 'c1700000-0000-0000-0000-000000000033'), 10.0::numeric(3, 1), 'and the score follows her grade');

-- The other one too: no wrong answer left, never reviewed → the card goes to the trash.
update public.quiz_answers set verdict = 'correct', points = 1, graded_by = 'student', original_verdict = 'wrong'
 where id = 'c1700000-0000-0000-0000-000000000051';
select ok((select deleted_at is not null from public.flashcards where source = 'quiz' and source_ref = 'c1700000-0000-0000-0000-000000000021'),'no wrong answer left and never reviewed: the card goes to the trash');
select is(
  (select count(*)::int from public.review_schedule r join public.flashcards f on f.id = r.flashcard_id where f.source = 'quiz' and f.source_ref = 'c1700000-0000-0000-0000-000000000021'),
  0, 'so it is not counted in Review today');

-- Wrong again: the card comes back from the trash.
update public.quiz_answers set verdict = 'wrong', points = 0, graded_by = 'student' where id = 'c1700000-0000-0000-0000-000000000051';
select ok((select deleted_at is null from public.flashcards where source = 'quiz' and source_ref = 'c1700000-0000-0000-0000-000000000021'), 'wrong again: the card comes back');

-- Reviewed once, it stays when she changes the grade to correct.
update public.review_schedule r set reps = 1 from public.flashcards f where f.id = r.flashcard_id and f.source = 'quiz' and f.source_ref = 'c1700000-0000-0000-0000-000000000021';
update public.quiz_answers set verdict = 'correct', points = 1, graded_by = 'student' where id = 'c1700000-0000-0000-0000-000000000051';
select ok((select deleted_at is null from public.flashcards where source = 'quiz' and source_ref = 'c1700000-0000-0000-0000-000000000021'), 'a card already reviewed stays');

select throws_ok(
  $$ insert into public.flashcards (source, source_ref, front, back) values ('quiz', 'c1700000-0000-0000-0000-000000000021', 'Q', 'A') $$,
  '23505', null, 'one quiz card per question');

-- ---------------------------------------------------------------------
-- The course's quiz defaults, a past exam's format, the cost log
-- ---------------------------------------------------------------------

select ok(
  (select quiz_difficulty = 5 and quiz_count = 2 and quiz_definitions = 5 and quiz_detail = 5
     from public.course_settings where course_id = 'c1700000-0000-0000-0000-000000000001'),
  'a course''s quiz defaults: every slider 5, Number of questions 2');
select throws_ok(
  $$ update public.course_settings set quiz_traps = 11 where course_id = 'c1700000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a quiz slider is 1–10');
select lives_ok(
  $$ update public.files set past_exam_format = '{"questionCount": 20}' where id = 'c1700000-0000-0000-0000-000000000002' $$,
  'a file keeps a past exam''s format');

reset role;
select lives_ok(
  $$ insert into public.ai_usage (user_id, operation, provider, model) values ('dddddddd-0000-0000-0000-000000000171', 'quiz', 'anthropic', 'claude-opus-5-5') $$,
  'ai_usage takes quiz');

select * from finish();
rollback;
