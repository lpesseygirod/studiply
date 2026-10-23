-- =====================================================================
-- Step 1.2 · Migration 3 — study tools (flashcards, review schedule)
-- and AI bookkeeping (usage, consent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Flashcards
-- ---------------------------------------------------------------------
-- Cards outlive the course or file they came from (the link is cleared).
-- source_ref points at what created the card (a summary, an assistant
-- message…); it is informational, so it has no foreign key.

create table public.flashcards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id  uuid,
  file_id    uuid,
  source     text not null check (source in ('summary', 'assistant', 'selection', 'manual')),
  source_ref uuid,
  front      text not null,
  back       text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (course_id, user_id) references public.courses (id, user_id) on delete set null (course_id),
  foreign key (file_id, user_id) references public.files (id, user_id) on delete set null (file_id)
);

-- ---------------------------------------------------------------------
-- Review schedule
-- ---------------------------------------------------------------------
-- One row schedules either a flashcard (Again / Good / Easy reviews) or a
-- lecture file (day 1, 3, 7, 21 reminders, planned back from the exam date).

create table public.review_schedule (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  flashcard_id     uuid unique,
  file_id          uuid,
  due_at           timestamptz not null,
  interval_days    real not null default 0 check (interval_days >= 0),
  ease             real not null default 2.5 check (ease > 0),
  reps             integer not null default 0 check (reps >= 0),
  last_grade       text check (last_grade in ('again', 'good', 'easy')),
  last_reviewed_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (num_nonnulls(flashcard_id, file_id) = 1),
  foreign key (flashcard_id, user_id) references public.flashcards (id, user_id) on delete cascade,
  foreign key (file_id, user_id) references public.files (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- AI usage (cost log, written only by Edge Functions)
-- ---------------------------------------------------------------------
-- Users can read their own usage but never write it: the daily limits are
-- computed from this table, so deleting rows must not reset a limit.

create table public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  lecture_id    uuid,
  operation     text not null
                  check (operation in ('transcription', 'assistant', 'summary', 'ocr', 'image_analysis')),
  provider      text not null check (provider in ('openai', 'anthropic')),
  model         text not null,
  tokens_input  integer not null default 0 check (tokens_input >= 0),
  tokens_output integer not null default 0 check (tokens_output >= 0),
  audio_seconds numeric(10, 2) not null default 0 check (audio_seconds >= 0),
  cost_usd      numeric(12, 6) not null default 0 check (cost_usd >= 0),
  created_at    timestamptz not null default now(),
  foreign key (lecture_id, user_id) references public.lectures (id, user_id) on delete set null (lecture_id)
);

-- ---------------------------------------------------------------------
-- AI consent (Apple guideline 5.1.2(i))
-- ---------------------------------------------------------------------
-- One row per consent given. Withdrawing sets withdrawn_at; giving consent
-- again adds a new row. A row can't be rewritten or un-withdrawn, so the
-- history stays trustworthy. Edge Functions check for a row with the
-- current policy_version and withdrawn_at is null before calling any AI.

create table public.ai_consent (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scope          text not null check (scope in ('transcription', 'assistant_summary', 'images')),
  policy_version text not null,
  granted_at     timestamptz not null default now(),
  withdrawn_at   timestamptz,
  created_at     timestamptz not null default now(),
  check (withdrawn_at >= granted_at)
);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------

create trigger set_updated_at before update on public.flashcards
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.review_schedule
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------

create index flashcards_user_idx         on public.flashcards (user_id);
create index flashcards_course_idx       on public.flashcards (course_id);
create index flashcards_file_idx         on public.flashcards (file_id);
create index review_schedule_due_idx     on public.review_schedule (user_id, due_at);
create index review_schedule_file_idx    on public.review_schedule (file_id);
create index ai_usage_user_created_idx   on public.ai_usage (user_id, created_at);
create index ai_usage_lecture_idx        on public.ai_usage (lecture_id);
create index ai_consent_user_scope_idx   on public.ai_consent (user_id, scope);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

select private.apply_owner_rls('flashcards');
select private.apply_owner_rls('review_schedule');
select private.apply_owner_rls('ai_usage', array['select']);

select private.apply_owner_rls('ai_consent', array['select']);

grant insert (scope, policy_version) on table public.ai_consent to authenticated;
create policy "Owner can give consent" on public.ai_consent
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant update (withdrawn_at) on table public.ai_consent to authenticated;
create policy "Owner can withdraw consent" on public.ai_consent
  for update to authenticated
  using ((select auth.uid()) = user_id and withdrawn_at is null)
  with check ((select auth.uid()) = user_id and withdrawn_at is not null);
