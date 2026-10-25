-- =====================================================================
-- Photos saved to the library ("Save to library…").
--
-- A photo or PDF of a lecture can be saved as its own file in a course or
-- folder. A PDF is a `files` row of kind 'pdf'; a photo needs its own kind,
-- 'image'. Either way the file's media row hangs off file_id only
-- (lecture_id null) and has its own copy of the Storage object, so removing
-- the photo from the lecture never removes the library file.
-- =====================================================================

alter table public.files
  drop constraint files_kind_check,
  add constraint files_kind_check
    check (kind in ('lecture', 'document', 'pdf', 'image', 'unit_summary', 'exam_pack'));
