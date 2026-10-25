-- =====================================================================
-- Step 1.2 · Migration 2 — what a lecture produces: recording metadata,
-- audio chunks, transcript, note lines, marks, media, assistant messages
-- and stored summaries.
--
-- Same conventions as migration 1: owner-only RLS, composite
-- (parent_id, user_id) foreign keys, t_ms = milliseconds from the start
-- of the recording.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Lectures (recording metadata for a file of kind 'lecture')
-- ---------------------------------------------------------------------
-- Shares its primary key with files: lectures.id = files.id.

create table public.lectures (
  id                 uuid primary key,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lecture_number     integer check (lecture_number > 0),
  recorded_at        timestamptz,
  duration_ms        integer check (duration_ms >= 0),
  language           text not null default 'en',
  status             text not null default 'draft'
                       check (status in ('draft', 'recording', 'uploading', 'transcribing', 'ready', 'failed')),
  transcript_quality text check (transcript_quality in ('good', 'fair', 'poor')),
  avg_confidence     real check (avg_confidence between 0 and 1),
  audio_retention    text not null default 'delete_3_days'
                       check (audio_retention in ('delete_now', 'delete_3_days', 'delete_manually', 'keep_permanently')),
  audio_delete_after timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, user_id),
  foreign key (id, user_id) references public.files (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Audio chunks (30-second pieces uploaded to Storage, step 1.4 / 5.2)
-- ---------------------------------------------------------------------

create table public.audio_chunks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lecture_id   uuid not null,
  seq          integer not null check (seq >= 0),
  start_ms     integer not null check (start_ms >= 0),
  duration_ms  integer not null check (duration_ms > 0),
  storage_path text,
  status       text not null default 'pending'
                 check (status in ('pending', 'uploaded', 'transcribed', 'failed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id),
  unique (lecture_id, seq),
  foreign key (lecture_id, user_id) references public.lectures (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Transcript segments (timestamped Whisper output)
-- ---------------------------------------------------------------------

create table public.transcript_segments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lecture_id uuid not null,
  chunk_id   uuid,
  start_ms   integer not null check (start_ms >= 0),
  end_ms     integer not null,
  text       text not null,
  confidence real check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  check (end_ms >= start_ms),
  foreign key (lecture_id, user_id) references public.lectures (id, user_id) on delete cascade,
  foreign key (chunk_id, user_id) references public.audio_chunks (id, user_id) on delete set null (chunk_id)
);

-- ---------------------------------------------------------------------
-- Note lines — a derived index, NOT the source of truth
-- ---------------------------------------------------------------------
-- The student's notes live in the ProseMirror JSON of the lecture's
-- 'notes' document (public.documents). That JSON is the source of truth.
--
-- note_lines is an index derived from it: one row per block, matched by
-- block_id (the ProseMirror node id). The app rebuilds the rows for a
-- document from its JSON on every save; nothing edits note_lines directly.
-- It exists so the notes coverage check ("N of N lines") and the summarize
-- pipeline can read timestamped lines without parsing documents.
--
-- t_ms is the recording time stamped on the line; null for lines written
-- outside a recording.

create table public.note_lines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lecture_id  uuid not null,
  document_id uuid not null,
  block_id    text not null,
  t_ms        integer check (t_ms >= 0),
  text        text not null default '',
  content     jsonb, -- the block's ProseMirror JSON, so formatting is kept
  position    integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (document_id, block_id),
  foreign key (lecture_id, user_id) references public.lectures (id, user_id) on delete cascade,
  foreign key (document_id, user_id) references public.documents (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Marks — the source of truth
-- ---------------------------------------------------------------------
-- This table is the source of truth for marks (Important, Confused, Exam).
-- A mark chip in a document stores only the mark's id (markId node
-- attribute); its type, level and note are always read from here.
-- Changing the level from the chip updates this row, never the document.

create table public.marks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lecture_id uuid not null,
  type       text not null check (type in ('important', 'confused', 'exam')),
  level      smallint not null check (level between 1 and 10),
  t_ms       integer not null check (t_ms >= 0),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lecture_id, user_id) references public.lectures (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Media (slides, board photos, readings, links)
-- ---------------------------------------------------------------------
-- Attached to a lecture (with t_ms for photos), to a library file (an
-- uploaded PDF), or both (library slides used in a lecture).

create table public.media (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lecture_id     uuid,
  file_id        uuid,
  kind           text not null check (kind in ('slides', 'photo', 'reading', 'link')),
  storage_path   text,
  url            text,
  mime_type      text,
  size_bytes     bigint check (size_bytes >= 0),
  t_ms           integer check (t_ms >= 0),
  page_count     integer check (page_count > 0),
  extracted_text text,
  caption        text,
  alt_text       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (num_nonnulls(lecture_id, file_id) >= 1),
  check (num_nonnulls(storage_path, url) >= 1),
  foreign key (lecture_id, user_id) references public.lectures (id, user_id) on delete cascade,
  foreign key (file_id, user_id) references public.files (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Assistant messages (questions and answers during class)
-- ---------------------------------------------------------------------
-- asked_at_ms is the recording time of the question; the window is the
-- part of the transcript the answer used ("last 10 min" = now-10 min → now).

create table public.assistant_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lecture_id      uuid not null,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null default '',
  reply_to        uuid,
  quick_prompt    text,
  asked_at_ms     integer check (asked_at_ms >= 0),
  window_start_ms integer check (window_start_ms >= 0),
  window_end_ms   integer,
  model           text,
  status          text not null default 'done' check (status in ('streaming', 'done', 'error')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  check (window_end_ms >= window_start_ms),
  foreign key (lecture_id, user_id) references public.lectures (id, user_id) on delete cascade,
  foreign key (reply_to, user_id) references public.assistant_messages (id, user_id) on delete set null (reply_to)
);

-- ---------------------------------------------------------------------
-- Summaries (each AI generation, stored in full)
-- ---------------------------------------------------------------------
-- result is the JSON Claude returned (SUMMARY-SPEC.md, "How to generate
-- it"). It is converted into editor blocks once; after that the Summary
-- document is the source of truth, and this row is kept so a later change
-- of Length can re-render without a new AI call.

create table public.summaries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_id            uuid not null, -- the document the summary was written into
  mode               text not null check (mode in ('new', 'extend', 'merge', 'exam_pack')),
  source_lecture_ids uuid[] not null default '{}',
  sliders            jsonb not null,
  applied_settings   jsonb,
  result             jsonb,
  note_lines_total   integer check (note_lines_total >= 0),
  note_lines_used    integer check (note_lines_used >= 0),
  marks_total        integer check (marks_total >= 0),
  marks_used         integer check (marks_used >= 0),
  status             text not null default 'pending'
                       check (status in ('pending', 'generating', 'checking', 'done', 'failed')),
  model              text,
  error              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, user_id),
  foreign key (file_id, user_id) references public.files (id, user_id) on delete cascade
);

alter table public.document_versions
  add foreign key (summary_id, user_id) references public.summaries (id, user_id) on delete set null (summary_id);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------

create trigger set_updated_at before update on public.lectures
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.audio_chunks
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.note_lines
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.marks
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.media
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.assistant_messages
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.summaries
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------

create index lectures_user_idx                on public.lectures (user_id);
create index audio_chunks_user_idx            on public.audio_chunks (user_id);
create index transcript_segments_lecture_idx  on public.transcript_segments (lecture_id, start_ms);
create index transcript_segments_chunk_idx    on public.transcript_segments (chunk_id);
create index transcript_segments_user_idx     on public.transcript_segments (user_id);
create index note_lines_lecture_idx           on public.note_lines (lecture_id, t_ms);
create index note_lines_user_idx              on public.note_lines (user_id);
create index marks_lecture_idx                on public.marks (lecture_id, t_ms);
create index marks_user_idx                   on public.marks (user_id);
create index media_lecture_idx                on public.media (lecture_id, t_ms);
create index media_file_idx                   on public.media (file_id);
create index media_user_idx                   on public.media (user_id);
create index assistant_messages_lecture_idx   on public.assistant_messages (lecture_id, created_at);
create index assistant_messages_reply_idx     on public.assistant_messages (reply_to);
create index assistant_messages_user_idx      on public.assistant_messages (user_id);
create index summaries_file_idx               on public.summaries (file_id, created_at desc);
create index summaries_user_idx               on public.summaries (user_id);
create index document_versions_summary_idx    on public.document_versions (summary_id);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

select private.apply_owner_rls('lectures');
select private.apply_owner_rls('audio_chunks');
select private.apply_owner_rls('transcript_segments');
select private.apply_owner_rls('note_lines');
select private.apply_owner_rls('marks');
select private.apply_owner_rls('media');
select private.apply_owner_rls('assistant_messages');
select private.apply_owner_rls('summaries');
