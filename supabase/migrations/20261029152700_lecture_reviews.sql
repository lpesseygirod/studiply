-- Spaced review of lectures (step 9.2-1; the approved plan, docs/reports/plan-9.2.md).
--
-- The plan itself (day 1, 3, 7 and 21 after a lecture, steered by the course's exam date) is
-- computed in code from the dates (src/lib/review/lecturePlan.ts), so a new exam date re-plans
-- every lecture at once. Only what can't be computed is stored:
--
-- - review_schedule, a lecture's row (file_id, made in 20261023155457 for this): when the lecture
--   was last reviewed (last_reviewed_at) and how many times (reps). due_at is the next session as
--   planned when it was written, for information only (the plan is computed again each time).
--   One row per lecture (a unique index), written by review_lecture as the student: only a later
--   review than the stored one is written (the iPhone reviews offline and sends it later). Undo of
--   Mark reviewed: undo_lecture_review puts the earlier time back, only while nothing later came.
-- - Lea, 9 Nov: "Study reminders for this lecture", a switch in the summarize panel, on by default:
--   lectures.study_reminders (null: the course's default; false: no review sessions for it, so not
--   in the plan, the Review today count, the lectures card or the notifications) and
--   course_settings.study_reminders, the course's default (Save as course default).
--
-- Row Level Security is unchanged: review_schedule's, lectures' and course_settings' owner policies
-- cover the new columns and the functions' writes (security invoker).

alter table public.lectures add column study_reminders boolean;

comment on column public.lectures.study_reminders is
  'Step 9.2: review sessions for this lecture (true / false), or null: the course''s default (course_settings.study_reminders).';

alter table public.course_settings add column study_reminders boolean not null default true;

comment on column public.course_settings.study_reminders is
  'Step 9.2: the course''s default for "Study reminders for this lecture" (Save as course default).';

create unique index review_schedule_file_unique on public.review_schedule (file_id) where file_id is not null;

-- p_id: the row's id when it is new (the iPhone's own copy keeps the same id); an existing row keeps its own.
create function public.review_lecture(
  p_id uuid,
  p_file_id uuid,
  p_reviewed_at timestamptz,
  p_next_due timestamptz
) returns boolean
  language sql
  security invoker
  set search_path = ''
as $$
  with done as (
    insert into public.review_schedule (id, file_id, due_at, reps, last_reviewed_at)
    values (p_id, p_file_id, p_next_due, 1, p_reviewed_at)
    on conflict (file_id) where file_id is not null do update
      set due_at = excluded.due_at,
          reps = public.review_schedule.reps + 1,
          last_reviewed_at = excluded.last_reviewed_at
      where public.review_schedule.last_reviewed_at is null
         or public.review_schedule.last_reviewed_at < excluded.last_reviewed_at
    returning 1
  )
  select exists (select 1 from done);
$$;

comment on function public.review_lecture(uuid, uuid, timestamptz, timestamptz) is
  'Step 9.2: a lecture reviewed (Mark reviewed, or its Quiz me deck finished); written only when later than the stored review (true: written).';

create function public.undo_lecture_review(
  p_file_id uuid,
  p_reviewed_at timestamptz,
  p_previous timestamptz
) returns boolean
  language sql
  security invoker
  set search_path = ''
as $$
  with done as (
    update public.review_schedule
    set last_reviewed_at = p_previous,
        reps = greatest(reps - 1, 0)
    where file_id = p_file_id
      and last_reviewed_at = p_reviewed_at
    returning 1
  )
  select exists (select 1 from done);
$$;

comment on function public.undo_lecture_review(uuid, timestamptz, timestamptz) is
  'Step 9.2: Undo of Mark reviewed: the earlier review time back, only while the stored one is the review undone (true: undone).';

revoke execute on function public.review_lecture(uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.review_lecture(uuid, uuid, timestamptz, timestamptz) to authenticated;
revoke execute on function public.undo_lecture_review(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.undo_lecture_review(uuid, timestamptz, timestamptz) to authenticated;
