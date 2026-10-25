-- Step 3.4: uploads are library files now. Photos and PDFs uploaded before
-- that went into a hidden lecture called "Project Files" in each course
-- (shown under "Photos & PDFs from lectures"); this turns each of them into
-- a file at that lecture's place (the course's top level), the same shape
-- the app makes when uploading: a `files` row (kind image or pdf) owning
-- the media row (file_id set, lecture_id null).
--
--   * Only hidden lectures: titled "Project Files", not deleted, and with
--     none of a real lecture's own data (recording, transcript, note
--     lines, marks, assistant messages, summaries, documents). A lecture a
--     student named "Project Files" keeps everything.
--   * Each photo or PDF keeps its name (its caption, else "Photo N" /
--     "Document N" in date order), its date and its favourite; the name
--     gets the extension of its Storage object.
--   * No Storage object is moved, copied or removed (paths stay as they
--     are; deleting goes by rows).
--   * The emptied hidden lecture is then deleted (it has nothing left).
--     Its media rows no longer point to it, so its delete cascade can't
--     reach them.
-- changed_at moves on every row touched, so the iPhone downloads it all.

create function private.project_files_to_library()
returns table (course_id uuid, photos integer, pdfs integer, lectures_deleted integer)
language plpgsql
set search_path = ''
as $$
begin
  -- Can run more than once in a transaction (the tests call it again).
  drop table if exists pg_temp.hidden_lectures;
  drop table if exists pg_temp.moved;

  create temporary table hidden_lectures on commit drop as
  select f.id, f.user_id, f.course_id, f.folder_id
    from public.files f
    join public.lectures l on l.id = f.id
   where f.kind = 'lecture'
     and f.title = 'Project Files'
     and f.deleted_at is null
     and not exists (select 1 from public.audio_chunks x where x.lecture_id = f.id)
     and not exists (select 1 from public.transcript_segments x where x.lecture_id = f.id)
     and not exists (select 1 from public.note_lines x where x.lecture_id = f.id)
     and not exists (select 1 from public.marks x where x.lecture_id = f.id)
     and not exists (select 1 from public.assistant_messages x where x.lecture_id = f.id)
     and not exists (select 1 from public.summaries x where x.file_id = f.id)
     and not exists (select 1 from public.documents x where x.file_id = f.id);

  create temporary table moved on commit drop as
  select m.id as media_id,
         gen_random_uuid() as file_id,
         h.id as lecture_id,
         h.user_id,
         h.course_id,
         h.folder_id,
         m.kind,
         m.created_at,
         m.starred_at,
         nullif(btrim(m.caption), '') as caption,
         row_number() over (partition by h.id, m.kind order by m.created_at, m.id) as n,
         coalesce(
           lower(substring(m.storage_path from '\.([A-Za-z0-9]+)$')),
           case m.kind when 'photo' then 'jpg' else 'pdf' end
         ) as ext
    from pg_temp.hidden_lectures h
    join public.media m on m.lecture_id = h.id
   where m.file_id is null
     and m.kind in ('photo', 'slides');

  insert into public.files (id, user_id, kind, title, course_id, folder_id, starred_at, created_at, updated_at)
  select mv.file_id,
         mv.user_id,
         case mv.kind when 'photo' then 'image' else 'pdf' end,
         case
           when lower(coalesce(mv.caption, '')) like '%.' || mv.ext then mv.caption
           else coalesce(mv.caption, case mv.kind when 'photo' then 'Photo ' else 'Document ' end || mv.n) || '.' || mv.ext
         end,
         mv.course_id,
         mv.folder_id,
         mv.starred_at,
         mv.created_at,
         mv.created_at
    from pg_temp.moved mv;

  update public.media m
     set file_id = mv.file_id,
         lecture_id = null,
         caption = f.title
    from pg_temp.moved mv
    join public.files f on f.id = mv.file_id
   where m.id = mv.media_id;

  -- Deleting a lecture's file row cascades to the lecture and to anything
  -- still pointing to it; its photos and PDFs point to their files now.
  delete from public.files f
   using pg_temp.hidden_lectures h
   where f.id = h.id
     and not exists (select 1 from public.media m where m.lecture_id = h.id);

  -- One row per course: what became files, and how many hidden lectures went.
  return query
  select h.course_id,
         sum((select count(*) from pg_temp.moved mv where mv.lecture_id = h.id and mv.kind = 'photo'))::integer,
         sum((select count(*) from pg_temp.moved mv where mv.lecture_id = h.id and mv.kind = 'slides'))::integer,
         count(*) filter (where not exists (select 1 from public.files f where f.id = h.id))::integer
    from pg_temp.hidden_lectures h
   group by h.course_id;
end;
$$;

select * from private.project_files_to_library();
