-- One user can never read, change or delete another user's rows, in any
-- table, and can't attach rows to another user's data.
--
-- User A owns one row in every table. User B then tries to see, update and
-- delete them. A positive control proves A does see its own rows, so the
-- zero counts for B are not vacuous.
begin;
create extension if not exists pgtap with schema extensions;
select plan(101);

-- ---------------------------------------------------------------------
-- Test helpers (in a throwaway schema, rolled back with the test)
-- ---------------------------------------------------------------------

create schema tests;
grant usage on schema tests to anon, authenticated;

-- Every public table, the column that holds its owner, and what an update
-- and a delete by a stranger should return ('0' rows or 'denied').
create table tests.tables (tbl text, owner_col text, set_clause text, stranger_update text, stranger_delete text);
insert into tests.tables values
  ('profiles',            'id',      'display_name = display_name', '0',      'denied'),
  ('courses',             'user_id', 'name = name',                 '0',      '0'),
  ('course_settings',     'user_id', 'professor = professor',       '0',      'denied'),
  ('folders',             'user_id', 'name = name',                 '0',      '0'),
  ('files',               'user_id', 'title = title',               '0',      '0'),
  ('documents',           'user_id', 'content = content',           '0',      '0'),
  ('document_versions',   'user_id', 'content = content',           'denied', '0'),
  ('lectures',            'user_id', 'language = language',         '0',      '0'),
  ('audio_chunks',        'user_id', 'status = status',             '0',      '0'),
  ('transcript_segments', 'user_id', 'text = text',                 '0',      '0'),
  ('note_lines',          'user_id', 'text = text',                 '0',      '0'),
  ('marks',               'user_id', 'level = level',               '0',      '0'),
  ('media',               'user_id', 'caption = caption',           '0',      '0'),
  ('assistant_messages',  'user_id', 'content = content',           '0',      '0'),
  ('summaries',           'user_id', 'status = status',             '0',      '0'),
  ('flashcards',          'user_id', 'front = front',               '0',      '0'),
  ('review_schedule',     'user_id', 'reps = reps',                 '0',      '0'),
  ('ai_usage',            'user_id', 'model = model',               'denied', 'denied'),
  ('ai_consent',          'user_id', 'withdrawn_at = now()',        '0',      'denied');
grant select on tests.tables to anon, authenticated;

-- Each helper runs as the current role, so RLS applies. 'denied' means the
-- role has no privilege for that operation at all.
create function tests.count_rows(tbl text, owner_col text, owner uuid) returns text
language plpgsql as $$
declare n int;
begin
  execute format('select count(*) from public.%I where %I = $1', tbl, owner_col) into n using owner;
  return n::text;
exception when insufficient_privilege then
  return 'denied';
end;
$$;

create function tests.update_rows(tbl text, owner_col text, set_clause text, owner uuid) returns text
language plpgsql as $$
declare n int;
begin
  execute format('update public.%I set %s where %I = $1', tbl, set_clause, owner_col) using owner;
  get diagnostics n = row_count;
  return n::text;
exception when insufficient_privilege then
  return 'denied';
end;
$$;

create function tests.delete_rows(tbl text, owner_col text, owner uuid) returns text
language plpgsql as $$
declare n int;
begin
  execute format('delete from public.%I where %I = $1', tbl, owner_col) using owner;
  get diagnostics n = row_count;
  return n::text;
exception when insufficient_privilege then
  return 'denied';
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------
-- Seed: users A and B, then one row per table owned by A (inserted as A)
-- ---------------------------------------------------------------------

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a@test.dev'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b@test.dev');

set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-0000-0000-000000000000", "role": "authenticated"}';

insert into public.courses (id, name) values ('a0000000-0000-0000-0000-000000000001', 'A course');
insert into public.folders (id, course_id, name) values ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'A folder');
insert into public.files (id, folder_id, kind, title) values ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'lecture', 'A lecture');
insert into public.documents (id, file_id, tab) values ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'notes');
insert into public.document_versions (document_id, content, reason) values ('a0000000-0000-0000-0000-000000000004', '{}', 'session_end');
insert into public.lectures (id) values ('a0000000-0000-0000-0000-000000000003');
insert into public.audio_chunks (id, lecture_id, seq, start_ms, duration_ms) values ('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', 0, 0, 30000);
insert into public.transcript_segments (lecture_id, chunk_id, start_ms, end_ms, text) values ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 0, 4000, 'Hola');
insert into public.note_lines (lecture_id, document_id, block_id, t_ms, text, position) values ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'b1', 252000, 'Def: conducta', 0);
insert into public.marks (lecture_id, type, level, t_ms) values ('a0000000-0000-0000-0000-000000000003', 'confused', 7, 1110000);
insert into public.media (lecture_id, kind, storage_path, t_ms) values ('a0000000-0000-0000-0000-000000000003', 'photo', 'a/board.jpg', 760000);
insert into public.assistant_messages (lecture_id, role, content) values ('a0000000-0000-0000-0000-000000000003', 'user', 'Explain the last 10 min');
insert into public.summaries (file_id, mode, sliders) values ('a0000000-0000-0000-0000-000000000003', 'new', '{}');
insert into public.flashcards (id, source, front, back) values ('a0000000-0000-0000-0000-000000000006', 'manual', 'Q', 'A');
-- Its review_schedule row is made by the card's trigger (step 9.1).
insert into public.ai_consent (scope, policy_version) values ('transcription', '2026-10');

-- ai_usage is written only by Edge Functions (service role), so seed it as the owner role.
reset role;
insert into public.ai_usage (user_id, operation, provider, model) values ('aaaaaaaa-0000-0000-0000-000000000000', 'transcription', 'openai', 'whisper-1');

-- ---------------------------------------------------------------------
-- Positive control: A sees exactly its one row in every table (19 tests)
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-0000-0000-000000000000", "role": "authenticated"}';

select is(tests.count_rows(tbl, owner_col, 'aaaaaaaa-0000-0000-0000-000000000000'), '1', format('A sees its own %s row', tbl))
from tests.tables;

-- ---------------------------------------------------------------------
-- B can't see, update or delete A's rows (3 × 19 = 57 tests)
-- ---------------------------------------------------------------------

set local request.jwt.claims to '{"sub": "bbbbbbbb-0000-0000-0000-000000000000", "role": "authenticated"}';

select is(tests.count_rows(tbl, owner_col, 'aaaaaaaa-0000-0000-0000-000000000000'), '0', format('B sees none of A''s %s', tbl))
from tests.tables;

select is(tests.update_rows(tbl, owner_col, set_clause, 'aaaaaaaa-0000-0000-0000-000000000000'), stranger_update, format('B can''t update A''s %s', tbl))
from tests.tables;

select is(tests.delete_rows(tbl, owner_col, 'aaaaaaaa-0000-0000-0000-000000000000'), stranger_delete, format('B can''t delete A''s %s', tbl))
from tests.tables;

-- ---------------------------------------------------------------------
-- B can't write rows as A or attach rows to A's data
-- ---------------------------------------------------------------------

select throws_ok(
  $$ insert into public.courses (user_id, name) values ('aaaaaaaa-0000-0000-0000-000000000000', 'planted') $$,
  '42501', null, 'B can''t insert a course owned by A');

select throws_ok(
  $$ insert into public.marks (lecture_id, type, level, t_ms) values ('a0000000-0000-0000-0000-000000000003', 'exam', 9, 0) $$,
  '23503', null, 'B can''t add a mark to A''s lecture');

select throws_ok(
  $$ insert into public.note_lines (lecture_id, document_id, block_id, text, position)
     values ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'x', 'planted', 1) $$,
  '23503', null, 'B can''t add a note line to A''s document');

select throws_ok(
  $$ insert into public.files (folder_id, kind, title) values ('a0000000-0000-0000-0000-000000000002', 'document', 'planted') $$,
  '23503', null, 'B can''t put a file in A''s folder');

select throws_ok(
  $$ insert into public.documents (file_id, tab) values ('a0000000-0000-0000-0000-000000000003', 'summary') $$,
  '23503', null, 'B can''t add a tab to A''s file');

select throws_ok(
  $$ insert into public.document_versions (file_id, content, reason) values ('a0000000-0000-0000-0000-000000000003', '{}', 'conflict') $$,
  '23503', null, 'B can''t add a conflict version to A''s lecture');

-- ---------------------------------------------------------------------
-- Signed-out (anon) can't touch any table (19 tests)
-- ---------------------------------------------------------------------

set local role anon;
set local request.jwt.claims to '{"role": "anon"}';

select is(tests.count_rows(tbl, owner_col, 'aaaaaaaa-0000-0000-0000-000000000000'), 'denied', format('anon can''t read %s', tbl))
from tests.tables;

select * from finish();
rollback;
