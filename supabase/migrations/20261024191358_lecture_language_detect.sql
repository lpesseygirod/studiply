-- =====================================================================
-- Step 1.5 — a lecture's language can be unknown until transcription.
--
-- null = not known yet: transcribe-chunk then lets Whisper detect the
-- language and stores it here (ISO 639-1, e.g. 'en', 'fr', 'de'), so the
-- next chunks and the summary use it. A language set by the student is
-- always passed to Whisper as is and never overwritten.
-- =====================================================================

alter table public.lectures
  alter column language drop not null,
  alter column language drop default,
  add constraint lectures_language_code check (language ~ '^[a-z]{2,3}$');
