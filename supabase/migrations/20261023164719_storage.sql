-- =====================================================================
-- Step 1.4 — file storage: private buckets and owner-only policies.
--
-- Every object path starts with the owner's user id:
--   {user_id}/…            e.g. photos/{user_id}/profile/avatar-1729700000000.jpg
-- The policies below check that first path segment against auth.uid(), so a
-- user can only read, list, upload, overwrite or delete inside their own
-- folder. The app's upload helper (src/services/cloud-storage.service.ts)
-- adds the prefix itself.
--
-- Buckets are created here rather than in config.toml so they reach the
-- remote project together with the rest of the schema (step 1.7).
--
-- Deleting an account does not cascade into Storage: step 10.1 must also
-- remove every object under {user_id}/ in each bucket.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Buckets
-- ---------------------------------------------------------------------
-- audio-chunks: recording pieces sent to transcription; 25 MiB is the
--               Whisper upload limit.
-- slides:       slides and PDFs added to a lecture.
-- photos:       board photos and the profile photo. JPEG only: the app
--               converts every picked image, because Claude can't read HEIC.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('audio-chunks', 'audio-chunks', false, 25 * 1024 * 1024,
   array['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/webm']),
  ('slides', 'slides', false, 50 * 1024 * 1024,
   array['application/pdf', 'image/png', 'image/jpeg']),
  ('photos', 'photos', false, 10 * 1024 * 1024,
   array['image/jpeg'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Policies on storage.objects
-- ---------------------------------------------------------------------
-- Only for these three buckets and only for signed-in users; anon gets
-- nothing. Update checks the new path too, so a file can't be moved into
-- someone else's folder.

create policy "Owners read their files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id in ('audio-chunks', 'slides', 'photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Owners upload into their folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('audio-chunks', 'slides', 'photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Owners update their files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('audio-chunks', 'slides', 'photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id in ('audio-chunks', 'slides', 'photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Owners delete their files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('audio-chunks', 'slides', 'photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------
-- Profile photo
-- ---------------------------------------------------------------------
-- The column holds a path in the private photos bucket, not a URL; the
-- app shows it through a short-lived signed URL.

alter table public.profiles rename column avatar_url to avatar_path;
