-- Page setup per document (pulled forward from 4.7, Lea after test D):
-- paper size, orientation, margins, page numbers and the gap between pages,
-- Google Docs style. The page view follows it, and the export (4.8) will.
-- Null means the defaults (A4 portrait, 2.54 cm margins, numbers at the
-- bottom centre). The row's owner reads and writes it like the content
-- (documents RLS, apply_owner_rls); updated_at moves with it, so the other
-- device picks the change up.

alter table public.documents
  add column page_setup jsonb
    constraint documents_page_setup_object check (page_setup is null or jsonb_typeof(page_setup) = 'object');

comment on column public.documents.page_setup is
  'Page setup: {size: a4|letter, orientation: portrait|landscape, margins: {top, bottom, left, right} in cm, numbers: off|bottom-center|bottom-right|top-right, gap: px}. Null: the defaults.';
