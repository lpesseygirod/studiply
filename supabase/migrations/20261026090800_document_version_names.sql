-- Step 4.3 (Lea): "Name this version" in a document's version history, as
-- in Google Docs. A named version is never thinned out.
--
-- Versions stay unchangeable otherwise: the owner may update only the name
-- (a column grant), never the content, the reason or the dates.

alter table public.document_versions
  add column name text
    constraint document_versions_name_check check (name is null or char_length(btrim(name)) between 1 and 100);

comment on column public.document_versions.name is
  'The student''s name for this version (null: not named). Named versions are never thinned out.';

grant update (name) on table public.document_versions to authenticated;

create policy "Owner can name" on public.document_versions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
