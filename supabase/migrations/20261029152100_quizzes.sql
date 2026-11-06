-- Quizzes (step 9.1b; BUILD-PLAN "Create a quiz"): a quiz made from the student's lectures and
-- resources, its questions, her attempts and answers. Owner-only like every table.
--
-- - quizzes: the settings (10 sliders and the choices) and the calculator's plan (quiz-plan.ts), as
--   saved by the New quiz panel; status pending → generating → ready | failed (the quiz function,
--   step 9.1b-2, writes the questions). Soft delete (Delete with Undo).
-- - quiz_sources: what it covers (role lecture) and what goes with it (resource) or sets its format
--   (past_exam): files of hers (a lecture is a file too). A file deleted for good leaves the row empty.
-- - quiz_questions: one per question, in order. `data` holds the type's own fields (options, pairs,
--   steps, blanks, the numeric answer…); `answer_text` the right answer as plain text (for the
--   results and the review card). Each keeps its source: a lecture and its time, or a file and its
--   page. `from_question_id`: the question it repeats (a wrong answer that came back).
-- - quiz_attempts and quiz_answers: an attempt's answers; each answer's verdict and points (0–1),
--   who graded it (code, ai, student) and the first grade when she changed it.
--
-- Two triggers:
-- - The score: an attempt's points, score out of 10 and pass/fail are always computed from its
--   answers (any device, an offline answer sent later, a late AI grade, a grade she changed).
-- - Wrong answers into review: an answer graded wrong or partly makes one flashcard for its question
--   (source quiz, kind question, source_ref the original question), or takes it out of the trash;
--   9.1's flashcard trigger then gives it its review row, due at once. When she changes a grade to
--   correct, the card goes to the trash if it was never reviewed and no other answer to that
--   question is wrong.
--
-- Also: the course's quiz slider defaults (Save as course default), a past exam's format read once
-- per file (files.past_exam_format, step 9.1b-2), 'quiz' as an ai_usage operation and a flashcard
-- source (one quiz card per question: a unique index).

-- ---------------------------------------------------------------------
-- Quizzes
-- ---------------------------------------------------------------------

create table public.quizzes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id      uuid,
  title          text not null check (char_length(title) between 1 and 200),
  status         text not null default 'pending' check (status in ('pending', 'generating', 'ready', 'failed')),
  error          text,
  settings       jsonb not null,
  plan           jsonb not null,
  language       text check (language is null or language ~ '^[a-z]{2,3}$'),
  question_count integer not null default 0 check (question_count between 0 and 60),
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, user_id),
  foreign key (course_id, user_id) references public.courses (id, user_id) on delete set null (course_id)
);

create index quizzes_user_created_idx on public.quizzes (user_id, created_at desc);

comment on column public.quizzes.settings is 'The New quiz panel: the 10 sliders and the choices (step 9.1b).';
comment on column public.quizzes.plan is 'The quiz calculator''s plan (supabase/functions/_shared/quiz-plan.ts).';

create table public.quiz_sources (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quiz_id    uuid not null,
  role       text not null check (role in ('lecture', 'resource', 'past_exam')),
  file_id    uuid,
  position   integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quiz_id, role, file_id),
  foreign key (quiz_id, user_id) references public.quizzes (id, user_id) on delete cascade,
  foreign key (file_id, user_id) references public.files (id, user_id) on delete set null (file_id)
);

create table public.quiz_questions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quiz_id          uuid not null,
  position         integer not null check (position >= 0),
  type             text not null check (type in (
                     'multiple_choice', 'true_false', 'short_answer', 'fill_blank',
                     'long_answer', 'match_pairs', 'order_steps', 'numeric')),
  prompt           text not null,
  data             jsonb not null default '{}',
  answer_text      text not null default '',
  explanation      text not null default '',
  hint             text not null default '',
  added_context    text not null default '',
  source_file_id   uuid,
  source_ms        integer check (source_ms >= 0),
  source_page      integer check (source_page >= 1),
  mark_id          uuid,
  focus            text not null default 'any' check (focus in ('again', 'exam', 'weak', 'any')),
  difficulty       text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  from_question_id uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  unique (quiz_id, position),
  foreign key (quiz_id, user_id) references public.quizzes (id, user_id) on delete cascade,
  foreign key (source_file_id, user_id) references public.files (id, user_id) on delete set null (source_file_id),
  foreign key (from_question_id, user_id) references public.quiz_questions (id, user_id) on delete set null (from_question_id)
);

create index quiz_questions_from_idx on public.quiz_questions (from_question_id) where from_question_id is not null;

comment on column public.quiz_questions.mark_id is 'The student''s mark the question came from (informational, no foreign key).';

create table public.quiz_attempts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quiz_id        uuid not null,
  status         text not null default 'in_progress' check (status in ('in_progress', 'finished')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  duration_ms    integer check (duration_ms >= 0),
  grading        text not null default 'score' check (grading in ('score', 'pass_fail')),
  pass_threshold smallint not null default 60 check (pass_threshold between 1 and 100),
  max_points     integer not null default 0 check (max_points >= 0),
  points         numeric(7, 3) not null default 0 check (points >= 0),
  score          numeric(3, 1) not null default 0 check (score between 0 and 10),
  passed         boolean,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, user_id),
  foreign key (quiz_id, user_id) references public.quizzes (id, user_id) on delete cascade
);

create index quiz_attempts_quiz_idx on public.quiz_attempts (quiz_id);

comment on column public.quiz_attempts.max_points is 'The number of questions when the attempt started (each worth 1 point).';

create table public.quiz_answers (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  attempt_id       uuid not null,
  question_id      uuid not null,
  response         jsonb not null default 'null',
  verdict          text not null default 'pending' check (verdict in ('correct', 'partly', 'wrong', 'pending')),
  points           numeric(4, 3) not null default 0 check (points between 0 and 1),
  reason           text not null default '',
  graded_by        text check (graded_by in ('code', 'ai', 'student')),
  original_verdict text check (original_verdict in ('correct', 'partly', 'wrong')),
  hint_used        boolean not null default false,
  time_ms          integer check (time_ms >= 0),
  answered_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  unique (attempt_id, question_id),
  foreign key (attempt_id, user_id) references public.quiz_attempts (id, user_id) on delete cascade,
  foreign key (question_id, user_id) references public.quiz_questions (id, user_id) on delete cascade
);

create index quiz_answers_question_idx on public.quiz_answers (question_id);

create trigger set_updated_at before update on public.quizzes
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.quiz_sources
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.quiz_questions
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.quiz_attempts
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.quiz_answers
  for each row execute function private.set_updated_at();

select private.apply_owner_rls('quizzes');
select private.apply_owner_rls('quiz_sources');
select private.apply_owner_rls('quiz_questions');
select private.apply_owner_rls('quiz_attempts');
select private.apply_owner_rls('quiz_answers');

-- ---------------------------------------------------------------------
-- The score: always from the attempt's answers
-- ---------------------------------------------------------------------
-- Before an attempt is written: points = the sum of its answers' points (a pending answer counts 0
-- until it is graded), score = points ÷ max_points × 10 (one decimal), passed = the share ≥ the
-- threshold (pass/fail grading only). After an answer changes, its attempt is touched so this runs.

create function private.quiz_attempt_score() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  select coalesce(sum(a.points), 0) into new.points from public.quiz_answers a where a.attempt_id = new.id;
  new.score := case when new.max_points > 0 then least(10, round(new.points * 10 / new.max_points, 1)) else 0 end;
  new.passed := case when new.grading = 'pass_fail' and new.max_points > 0 then new.points * 100 / new.max_points >= new.pass_threshold end;
  return new;
end;
$$;

create trigger quiz_attempt_score before insert or update on public.quiz_attempts
  for each row execute function private.quiz_attempt_score();

create function private.quiz_answer_touch_attempt() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.quiz_attempts set max_points = max_points where id = old.attempt_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.attempt_id <> old.attempt_id) then
    update public.quiz_attempts set max_points = max_points where id = new.attempt_id;
  end if;
  return null;
end;
$$;

create trigger quiz_answer_touch_attempt after insert or delete or update of points, attempt_id on public.quiz_answers
  for each row execute function private.quiz_answer_touch_attempt();

-- ---------------------------------------------------------------------
-- Wrong answers into review
-- ---------------------------------------------------------------------

alter table public.flashcards drop constraint flashcards_source_check;
alter table public.flashcards
  add constraint flashcards_source_check check (source in ('summary', 'assistant', 'selection', 'manual', 'quiz'));

-- One quiz card per question (source_ref: the original question, also for the copies that came back).
create unique index flashcards_quiz_question_idx on public.flashcards (user_id, source_ref) where source = 'quiz';

create function private.quiz_answer_review() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  q record;
  original uuid;
  card uuid;
  front text;
  options text;
begin
  if tg_op = 'UPDATE' and new.verdict is not distinct from old.verdict then
    return null;
  end if;
  select qq.id, qq.from_question_id, qq.prompt, qq.type, qq.data, qq.answer_text, qq.explanation, qq.source_file_id, z.course_id
    into q
    from public.quiz_questions qq
    join public.quizzes z on z.id = qq.quiz_id
   where qq.id = new.question_id;
  if not found then
    return null;
  end if;
  original := coalesce(q.from_question_id, q.id);

  if new.verdict in ('wrong', 'partly') then
    select f.id into card from public.flashcards f where f.user_id = new.user_id and f.source = 'quiz' and f.source_ref = original;
    if card is null then
      front := q.prompt;
      -- A multiple-choice question's card lists its options: "A) …".
      if q.type = 'multiple_choice' and jsonb_typeof(q.data -> 'options') = 'array' then
        select string_agg(chr(64 + o.n::int) || ') ' || o.v, E'\n' order by o.n) into options
          from jsonb_array_elements_text(q.data -> 'options') with ordinality as o(v, n);
        front := concat_ws(E'\n', front, options);
      end if;
      insert into public.flashcards (user_id, course_id, file_id, source, source_ref, front, back, kind)
      values (
        new.user_id, q.course_id, q.source_file_id, 'quiz', original, front,
        coalesce(nullif(concat_ws(E'\n\n', nullif(q.answer_text, ''), nullif(q.explanation, '')), ''), '—'),
        'question');
    else
      update public.flashcards set deleted_at = null where id = card and deleted_at is not null;
    end if;
  elsif tg_op = 'UPDATE' and new.verdict = 'correct' and new.graded_by = 'student' and old.verdict in ('wrong', 'partly') then
    update public.flashcards f
       set deleted_at = now()
     where f.user_id = new.user_id
       and f.source = 'quiz'
       and f.source_ref = original
       and f.deleted_at is null
       and not exists (select 1 from public.review_schedule r where r.flashcard_id = f.id and r.reps > 0)
       and not exists (
         select 1
           from public.quiz_answers a
           join public.quiz_questions aq on aq.id = a.question_id
          where a.user_id = new.user_id
            and a.id <> new.id
            and a.verdict in ('wrong', 'partly')
            and coalesce(aq.from_question_id, aq.id) = original);
  end if;
  return null;
end;
$$;

create trigger quiz_answer_review after insert or update of verdict on public.quiz_answers
  for each row execute function private.quiz_answer_review();

-- ---------------------------------------------------------------------
-- The course's quiz defaults, a past exam's format, the cost log
-- ---------------------------------------------------------------------

alter table public.course_settings
  add column quiz_difficulty           smallint not null default 5 check (quiz_difficulty between 1 and 10),
  add column quiz_count                smallint not null default 2 check (quiz_count between 1 and 10),
  add column quiz_definitions          smallint not null default 5 check (quiz_definitions between 1 and 10),
  add column quiz_calculations         smallint not null default 5 check (quiz_calculations between 1 and 10),
  add column quiz_theory_practice      smallint not null default 5 check (quiz_theory_practice between 1 and 10),
  add column quiz_exam_focus           smallint not null default 5 check (quiz_exam_focus between 1 and 10),
  add column quiz_weak_spots           smallint not null default 5 check (quiz_weak_spots between 1 and 10),
  add column quiz_traps                smallint not null default 5 check (quiz_traps between 1 and 10),
  add column quiz_memory_understanding smallint not null default 5 check (quiz_memory_understanding between 1 and 10),
  add column quiz_detail               smallint not null default 5 check (quiz_detail between 1 and 10);

alter table public.files add column past_exam_format jsonb;

comment on column public.files.past_exam_format is
  'A past exam''s format, read once (question types and count, options, style; step 9.1b-2). Null: not read.';

alter table public.ai_usage drop constraint ai_usage_operation_check;
alter table public.ai_usage
  add constraint ai_usage_operation_check
    check (operation in ('transcription', 'assistant', 'summary', 'ocr', 'image_analysis', 'quiz'));
