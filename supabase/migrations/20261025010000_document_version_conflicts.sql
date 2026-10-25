-- =====================================================================
-- Step 1.8 — conflict history for notes edited on two devices.
--
-- When the same block of a note is changed on two devices before they
-- sync, the newer edit wins and the other one is kept here, reason
-- 'conflict', so the student can find it again (version history, 4.3).
--
-- Until Phase 4 a lecture's note is a summaries row (legacy-note-v1), not
-- a `documents` row, so a version can now belong to a file instead: the
-- lecture (file_id, deleted with it) and its summary (summary_id).
-- =====================================================================

alter table public.document_versions
  alter column document_id drop not null,
  add column file_id uuid,
  add foreign key (file_id, user_id) references public.files (id, user_id) on delete cascade,
  add constraint document_versions_owner check (document_id is not null or file_id is not null),
  drop constraint document_versions_reason_check,
  add constraint document_versions_reason_check
    check (reason in ('ai_generation', 'session_end', 'restore', 'conflict'));

create index document_versions_file_idx on public.document_versions (file_id, created_at desc);
