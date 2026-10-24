-- =====================================================================
-- Step 1.7B — remove the old app's storage policies from the remote project.
--
-- The 23 Oct reset deleted the old `source-files` bucket and its files, but
-- its four policies on storage.objects stayed. They match no bucket that
-- exists any more. Locally they were never created, so this does nothing
-- there; `if exists` keeps it safe on both.
-- =====================================================================

drop policy if exists "Users can read own source files" on storage.objects;
drop policy if exists "Users can upload own source files" on storage.objects;
drop policy if exists "Users can update own source files" on storage.objects;
drop policy if exists "Users can delete own source files" on storage.objects;
