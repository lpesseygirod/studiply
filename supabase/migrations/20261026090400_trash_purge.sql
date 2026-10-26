-- Step 3.5: the nightly trash clean-up (Edge Function purge-trash) needs,
-- for everyone's items trashed before a cutoff (30 days ago):
--
--   public.trash_purge_plan(older_than) — the Storage objects that go with
--     them (bucket, path), found through rows, never by path prefix: audio
--     chunks of the lectures, media of the lectures and of the library
--     files. A photo moved out of a lecture belongs to its file now
--     (lecture_id null), so deleting the old lecture never lists it.
--   public.trash_purge(older_than) — deletes those rows: files, then
--     folders, then courses; the database cascades to everything inside.
--
-- SQL can't remove Storage objects (Supabase protects storage.objects), so
-- the function removes them through the Storage API between the two calls.
-- Only the service role may run these: they see every user's rows.

create function public.trash_purge_plan(older_than timestamptz)
returns table (bucket text, path text)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive
    doomed_courses as (
      select c.id from public.courses c where c.deleted_at < older_than
    ),
    doomed_folders as (
      select f.id from public.folders f
       where f.deleted_at < older_than
          or f.course_id in (select id from doomed_courses)
      union
      select child.id from public.folders child join doomed_folders d on child.parent_id = d.id
    ),
    doomed_files as (
      select f.id from public.files f
       where f.deleted_at < older_than
          or f.course_id in (select id from doomed_courses)
          or f.folder_id in (select id from doomed_folders)
    )
  select 'audio-chunks', a.storage_path
    from public.audio_chunks a
   where a.lecture_id in (select id from doomed_files) and a.storage_path is not null
  union
  select case m.kind when 'photo' then 'photos' else 'slides' end, m.storage_path
    from public.media m
   where (m.lecture_id in (select id from doomed_files) or m.file_id in (select id from doomed_files))
     and m.storage_path is not null;
$$;

create function public.trash_purge(older_than timestamptz)
returns table (files integer, folders integer, courses integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n_files integer;
  n_folders integer;
  n_courses integer;
begin
  delete from public.files f where f.deleted_at < older_than;
  get diagnostics n_files = row_count;
  delete from public.folders f where f.deleted_at < older_than;
  get diagnostics n_folders = row_count;
  delete from public.courses c where c.deleted_at < older_than;
  get diagnostics n_courses = row_count;
  return query select n_files, n_folders, n_courses;
end;
$$;

-- New functions in public are callable by anon and authenticated by
-- default; these are for the service role only.
revoke execute on function public.trash_purge_plan(timestamptz) from public, anon, authenticated;
revoke execute on function public.trash_purge(timestamptz) from public, anon, authenticated;
grant execute on function public.trash_purge_plan(timestamptz) to service_role;
grant execute on function public.trash_purge(timestamptz) to service_role;
