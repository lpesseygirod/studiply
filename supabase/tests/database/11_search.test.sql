-- Step 3.5 (20261026090700): search_library finds titles, notes, terms and
-- transcripts without caring about case or accents, never finds the trash
-- or another student's rows, and keeps at most 3 transcript hits per lecture.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email) values
  ('bbbbbbbb-0000-0000-0000-00000000000c', 'search-a@test.dev'),
  ('bbbbbbbb-0000-0000-0000-00000000000d', 'search-b@test.dev');

-- B first: a title with the word, never found by A
set local role authenticated;
set local request.jwt.claims to '{"sub": "bbbbbbbb-0000-0000-0000-00000000000d", "role": "authenticated"}';
insert into public.courses (id, name) values ('cb000000-0000-0000-0000-000000000009', 'B Filogenético');

set local request.jwt.claims to '{"sub": "bbbbbbbb-0000-0000-0000-00000000000c", "role": "authenticated"}';
insert into public.courses (id, name, color) values
  ('cb000000-0000-0000-0000-000000000001', 'Biología', '#2E7D32'),
  ('cb000000-0000-0000-0000-000000000002', 'Col·legi', '#455A64');
insert into public.folders (id, course_id, name) values
  ('fb000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'Tema 3');
insert into public.files (id, course_id, folder_id, kind, title, deleted_at) values
  ('db000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'lecture', 'Clase 4', null),
  ('db000000-0000-0000-0000-000000000002', 'cb000000-0000-0000-0000-000000000001', null, 'lecture', 'Árbol filogenético (borrada)', now()),
  ('db000000-0000-0000-0000-000000000003', 'cb000000-0000-0000-0000-000000000001', null, 'pdf', 'Resumen FILOGENÉTICO.pdf', null),
  ('db000000-0000-0000-0000-000000000004', 'cb000000-0000-0000-0000-000000000001', null, 'lecture', 'Project Files', null);
insert into public.lectures (id) values
  ('db000000-0000-0000-0000-000000000001'),
  ('db000000-0000-0000-0000-000000000002'),
  ('db000000-0000-0000-0000-000000000004');
insert into public.transcript_segments (lecture_id, start_ms, end_ms, text) values
  ('db000000-0000-0000-0000-000000000001', 60000, 64000, 'Hoy hablamos de células.'),
  ('db000000-0000-0000-0000-000000000001', 1102000, 1106000, 'El parentesco filogenético se ve en el árbol.'),
  ('db000000-0000-0000-0000-000000000001', 1200000, 1204000, 'Otro árbol filogenético.'),
  ('db000000-0000-0000-0000-000000000001', 1300000, 1304000, 'Un tercer análisis FILOGENÉTICO.'),
  ('db000000-0000-0000-0000-000000000001', 1400000, 1404000, 'Y un cuarto filogenético.'),
  ('db000000-0000-0000-0000-000000000002', 1000, 2000, 'Filogenético en la papelera.');
-- An older note (not confirmed) and the newest one (confirmed). keyConcepts
-- the usual way; definitions as an old JSON string.
insert into public.summaries (file_id, mode, sliders, created_at, result) values
  ('db000000-0000-0000-0000-000000000001', 'new', '{}', now() - interval '1 day',
   '{"format": "legacy-note-v1", "isConfirmed": true, "title": "Viejo", "summary": "Una palabra antigua: zarzaparrilla."}'),
  ('db000000-0000-0000-0000-000000000001', 'new', '{}', now(),
   jsonb_build_object(
     'format', 'legacy-note-v1', 'isConfirmed', true, 'title', 'Filogenia',
     'summary', 'Cómo se construye un árbol filogenético a partir de caracteres.',
     'keyConcepts', '[{"term": "Árbol filogenético", "explanation": "Diagrama de parentesco."}, {"term": "Clado", "explanation": "Grupo con su ancestro común."}]'::jsonb,
     'definitions', to_jsonb('[{"term": "Homología", "definition": "Semejanza por ancestro común."}]'::text),
     'formulas', '[]'::jsonb));

create temporary table r on commit drop as select * from public.search_library('filogenetico');

-- Accents and case, every source
select ok(not exists (select 1 from r where kind = 'course' and item_id = 'cb000000-0000-0000-0000-000000000001'), 'a course is not found by a word it doesn''t contain');
select ok(exists (select 1 from r where kind = 'file' and item_id = 'db000000-0000-0000-0000-000000000003'), 'a PDF title in capitals with an accent ("Resumen FILOGENÉTICO.pdf")');
select is((select count(*)::int from r where kind = 'transcript'), 3, 'transcript: at most 3 hits per lecture');
select is((select min(t_ms) from r where kind = 'transcript'), 1102000, 'transcript: the earliest hits, with their time (18:22)');
select is((select matched from r where kind = 'transcript' and t_ms = 1102000), 'El parentesco filogenético se ve en el árbol.', 'transcript: the segment''s own text');
select is((select title from r where kind = 'transcript' limit 1), 'Clase 4', 'transcript: the lecture''s title');
select is((select course_name || ' ' || course_color from r where kind = 'transcript' limit 1), 'Biología #2E7D32', 'with the course''s name and colour');
select is((select folder_id from r where kind = 'transcript' limit 1), 'fb000000-0000-0000-0000-000000000001'::uuid, 'and where the lecture is');
select is((select matched from r where kind = 'term'), 'Árbol filogenético — Diagrama de parentesco.', 'term: a key concept''s term');
select is((select count(*)::int from r where kind = 'note'), 1, 'note: one hit per lecture');
select is((select field from r where kind = 'note'), 'summary', 'note: the first part that matches (the summary)');

-- Trash, other students, hidden holders
select ok(not exists (select 1 from r where item_id = 'db000000-0000-0000-0000-000000000002'), 'nothing from a lecture in the trash (title or transcript)');
select ok(not exists (select 1 from r where course_id = 'cb000000-0000-0000-0000-000000000009'), 'never another student''s rows');

-- Order
select is((select kind from r order by rank desc limit 1), 'file', 'titles first');
select is((select kind from r order by rank asc limit 1), 'transcript', 'transcripts last');

-- Other queries
select is((select count(*)::int from public.search_library('HOMOLOGIA') where kind = 'term'), 1, 'a definition saved as an old JSON string is searched too');
select is((select count(*)::int from public.search_library('zarzaparrilla')), 0, 'only the newest note counts');
select is((select count(*)::int from public.search_library('collegi') where kind = 'course'), 1, 'Catalan middle dot: "collegi" finds "Col·legi"');
select is((select count(*)::int from public.search_library('f')), 0, 'one letter finds nothing');
select is((select count(*)::int from public.search_library('100%')), 0, 'a % in the query is a character, not a wildcard');

select * from finish();
rollback;
