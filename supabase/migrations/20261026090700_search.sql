-- Step 3.5: Search across titles, notes, terms and transcripts.
--
--   search.norm(text)        lower case, no accents, no Catalan middle dot
--                             ("Col·legi Filogenético" → "collegi filogenetico").
--                             src/utils/searchText.ts normalizes the same way
--                             for the iPhone's offline search.
--   search.note_fields(json) a note's searchable parts, one row each: title,
--                             summary, key concepts, definitions, formulas.
--   search.note_text(json)   all of them in one text, for the index.
--   public.search_library(q, max_results)
--                             the hits, best first. security invoker: owner RLS
--                             decides, so a student only ever finds their own
--                             rows. Nothing in the trash is found.
--
-- Matching is "contains" (LIKE '%q%') on normalized text, served by trigram
-- indexes. "Term" hits are a key concept's or a definition's term until the
-- glossary arrives (Phase 7).
--
-- The helpers live in their own schema, `search`, not in `private`: the
-- indexes run them whenever a signed-in student saves a row, and
-- search_library runs them as that student, so app users need to reach
-- them. They are pure functions of their arguments; `private` stays closed.
-- The API does not expose this schema.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema search;
grant usage on schema search to authenticated, service_role;

-- unaccent() is only stable (its dictionary could change); naming the
-- dictionary makes it safe to declare this immutable and index it.
create function search.norm(t text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, t)), '·', '')
$$;

-- A note's list (keyConcepts, definitions, formulas): an array, or an array
-- saved as a JSON string by older versions; anything else is empty.
create function search.json_list(v jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
begin
  if v is null then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(v) = 'string' then
    begin
      v := (v #>> '{}')::jsonb;
    exception when others then
      return '[]'::jsonb;
    end;
  end if;
  return case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end;
end;
$$;

-- field: title | summary | concept | definition | formula; ord keeps the
-- note's order (for "the first match").
create function search.note_fields(result jsonb)
returns table (field text, term text, body text, ord integer)
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 'title', null, result ->> 'title', 0
  union all
  select 'summary', null, result ->> 'summary', 1
  union all
  select 'concept', e.value ->> 'term', e.value ->> 'explanation', 100 + e.ordinality::integer
    from jsonb_array_elements(search.json_list(result -> 'keyConcepts')) with ordinality e
  union all
  select 'definition', e.value ->> 'term', e.value ->> 'definition', 1000 + e.ordinality::integer
    from jsonb_array_elements(search.json_list(result -> 'definitions')) with ordinality e
  union all
  select 'formula', e.value ->> 'name', concat_ws(' ', e.value ->> 'expression', e.value ->> 'description'), 10000 + e.ordinality::integer
    from jsonb_array_elements(search.json_list(result -> 'formulas')) with ordinality e
$$;

create function search.note_text(result jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(string_agg(concat_ws(' ', f.term, f.body), E'\n' order by f.ord), '')
    from search.note_fields(result) f
$$;

create index courses_search_idx on public.courses using gin (search.norm(name) extensions.gin_trgm_ops);
create index folders_search_idx on public.folders using gin (search.norm(name) extensions.gin_trgm_ops);
create index files_search_idx on public.files using gin (search.norm(title) extensions.gin_trgm_ops);
create index summaries_search_idx on public.summaries using gin (search.norm(search.note_text(result)) extensions.gin_trgm_ops);
create index transcript_segments_search_idx on public.transcript_segments using gin (search.norm(text) extensions.gin_trgm_ops);

-- One row per hit:
--   kind       course | folder | file | note | term | transcript
--   item_id    what opens: the course, the folder or the file (a lecture for
--              note, term and transcript hits)
--   file_kind  files.kind for file, note, term and transcript hits
--   course_id, folder_id
--              where it is (a folder: its parent folder)
--   title      the course, folder or file name (for notes: the lecture's)
--   matched    the text the query was found in (a term: "term — explanation")
--   field      title | summary | concept | definition | formula | transcript
--   t_ms       a transcript hit's time
--
-- At most 1 note hit and 3 term hits per lecture, 3 transcript hits per
-- lecture (the earliest), 20 title hits, 30 note and term hits, 30
-- transcript hits; best first, then up to max_results in all.
create function public.search_library(q text, max_results integer default 60)
returns table (
  kind text,
  item_id uuid,
  file_kind text,
  course_id uuid,
  folder_id uuid,
  course_name text,
  course_color text,
  title text,
  matched text,
  field text,
  t_ms integer,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with
    query as (
      select n.nq,
             replace(replace(replace(n.nq, '\', '\\'), '%', '\%'), '_', '\_') as esc
        from (select search.norm(btrim(coalesce(q, ''))) as nq) n
       where char_length(n.nq) >= 2
    ),
    pat as (
      select nq, '%' || esc || '%' as p, esc || '%' as prefix from query
    ),
    live_files as (
      select f.* from public.files f
       where f.deleted_at is null
         and not (f.kind = 'lecture' and f.title = 'Project Files')
    ),
    title_hits as (
      select 'course' as kind, c.id as item_id, null::text as file_kind, c.id as course_id, null::uuid as folder_id,
             c.name as title, c.name as matched, 'title' as field, null::integer as t_ms,
             (3 + case when search.norm(c.name) like pat.prefix then 0.5 else 0 end)::real as base
        from public.courses c, pat
       where c.deleted_at is null and not c.is_archived and search.norm(c.name) like pat.p
      union all
      select 'folder', fo.id, null, fo.course_id, fo.parent_id,
             fo.name, fo.name, 'title', null,
             (3 + case when search.norm(fo.name) like pat.prefix then 0.5 else 0 end)::real
        from public.folders fo, pat
       where fo.deleted_at is null and search.norm(fo.name) like pat.p
      union all
      select 'file', f.id, f.kind, f.course_id, f.folder_id,
             f.title, f.title, 'title', null,
             (3 + case when search.norm(f.title) like pat.prefix then 0.5 else 0 end)::real
        from live_files f, pat
       where search.norm(f.title) like pat.p
    ),
    latest_notes as (
      select s.file_id, s.result
        from public.summaries s, pat
       where s.result ->> 'format' = 'legacy-note-v1'
         and s.result ->> 'isConfirmed' = 'true'
         and search.norm(search.note_text(s.result)) like pat.p
         and not exists (
           select 1 from public.summaries newer
            where newer.file_id = s.file_id
              and newer.result ->> 'format' = 'legacy-note-v1'
              and newer.created_at > s.created_at
         )
    ),
    note_parts as (
      select n.file_id, nf.field, nf.term, nf.body, nf.ord,
             (nf.field in ('concept', 'definition') and search.norm(nf.term) like pat.p) as is_term
        from latest_notes n, pat, lateral search.note_fields(n.result) nf
       where search.norm(concat_ws(' ', nf.term, nf.body)) like pat.p
    ),
    note_hits as (
      select case when np.is_term then 'term' else 'note' end as kind,
             f.id as item_id, f.kind as file_kind, f.course_id, f.folder_id,
             f.title,
             case when np.is_term then concat_ws(' — ', np.term, np.body)
                  when np.field in ('concept', 'definition', 'formula') then concat_ws(' — ', np.term, np.body)
                  else np.body end as matched,
             np.field, null::integer as t_ms,
             (case when np.is_term then 2.5 else 2 end)::real as base,
             row_number() over (partition by f.id, np.is_term order by np.ord) as n,
             np.is_term
        from note_parts np
        join live_files f on f.id = np.file_id
    ),
    transcript_hits as (
      select 'transcript' as kind, f.id as item_id, f.kind as file_kind, f.course_id, f.folder_id,
             f.title, ts.text as matched, 'transcript' as field, ts.start_ms as t_ms,
             1::real as base,
             row_number() over (partition by f.id order by ts.start_ms) as n
        from public.transcript_segments ts
        join live_files f on f.id = ts.lecture_id
        cross join pat
       where search.norm(ts.text) like pat.p
    ),
    capped as (
      select h.*, row_number() over (order by h.base desc, h.title) as g from title_hits h
    ),
    hits as (
      select kind, item_id, file_kind, course_id, folder_id, title, matched, field, t_ms, base
        from capped where g <= 20
      union all
      select kind, item_id, file_kind, course_id, folder_id, title, matched, field, t_ms, base
        from (
          select nh.*, row_number() over (order by nh.base desc, nh.title, nh.n) as g
            from note_hits nh
           where nh.n <= case when nh.is_term then 3 else 1 end
        ) x
       where x.g <= 30
      union all
      select kind, item_id, file_kind, course_id, folder_id, title, matched, field, t_ms, base
        from (
          select th.*, row_number() over (order by th.title, th.n) as g
            from transcript_hits th
           where th.n <= 3
        ) y
       where y.g <= 30
    )
  select h.kind, h.item_id, h.file_kind, h.course_id, h.folder_id,
         c.name, c.color, h.title, h.matched, h.field, h.t_ms,
         (h.base + extensions.word_similarity((select nq from pat), search.norm(h.matched)) * 0.1)::real
    from hits h
    left join public.courses c on c.id = h.course_id
   order by 12 desc, h.title, h.t_ms nulls first
   limit greatest(1, least(coalesce(max_results, 60), 100))
$$;

revoke execute on function public.search_library(text, integer) from public, anon;
grant execute on function public.search_library(text, integer) to authenticated;
