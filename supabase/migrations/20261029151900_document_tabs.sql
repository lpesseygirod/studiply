-- Tabs in every document (step 4.7b): a document can have more tabs than a
-- lecture's notes / summary / transcript. Each tab stays one documents row,
-- so its content, page setup, versions (document_id), the offline queue key
-- (file:tab) and conflict copies keep working as they are.
--
-- - tab: the tab's id. 'notes', 'summary' and 'transcript' stay; an added
--   tab is 't-' and a lowercase uuid, made on the device, so a tab created
--   offline needs no server. unique (file_id, tab) stays.
-- - title: the tab's name; null means the default (My notes / Summary /
--   Transcript in a lecture, "Tab 1" for a plain document's notes).
-- - position: where the tab sits among the movable ones; null means the
--   default order. Moving a tab writes only its own position (halfway
--   between its new neighbours), so two devices moving different tabs never
--   undo each other.
-- - deleted_at: a deleted tab (soft, for Undo and for an edit made offline
--   on another device, which brings it back).
-- - kind: null for an ordinary tab, 'summary' for a summary written into a
--   new tab (Phase 7), 'sheet' for a spreadsheet tab (4.7e).
--
-- Existing rows are not rewritten: the new columns start null, which the app
-- reads as the defaults (an update would move every row's updated_at).
-- Row Level Security is unchanged: documents' owner policies
-- (apply_owner_rls) cover the new columns.

alter table public.documents drop constraint documents_tab_check;

alter table public.documents
  add constraint documents_tab_id check (
    tab in ('notes', 'summary', 'transcript')
    or tab ~ '^t-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  add column title text
    constraint documents_title_length check (title is null or char_length(btrim(title)) between 1 and 100),
  add column position double precision
    constraint documents_position_finite check (position is null or (position > '-infinity'::float8 and position < 'infinity'::float8)),
  add column deleted_at timestamptz,
  add column kind text
    constraint documents_kind check (kind is null or kind in ('summary', 'sheet'));

comment on column public.documents.tab is
  'The tab''s id: notes | summary | transcript, or t-<uuid> for an added tab (step 4.7b).';
comment on column public.documents.title is
  'The tab''s name (1-100 characters); null: the default (My notes, Summary, Transcript; "Tab 1" for a plain document''s notes).';
comment on column public.documents.position is
  'Where the tab sits among the movable tabs; null: the default order. Moving a tab writes only its own position.';
comment on column public.documents.deleted_at is
  'A deleted tab (Undo; an edit from another device brings it back).';
comment on column public.documents.kind is
  'null: an ordinary tab; summary: a summary in its own tab (Phase 7); sheet: a spreadsheet tab (4.7e).';
