-- Every table in public has RLS and at least one policy, and anon has no
-- access to any of them. This also catches a future table added without RLS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select tables_are(
  'public',
  array[
    'profiles', 'courses', 'course_settings', 'folders', 'files', 'documents',
    'document_versions', 'lectures', 'audio_chunks', 'transcript_segments',
    'note_lines', 'marks', 'media', 'assistant_messages', 'summaries',
    'flashcards', 'review_schedule', 'ai_usage', 'ai_consent',
    -- Step 9.1b
    'quizzes', 'quiz_sources', 'quiz_questions', 'quiz_attempts', 'quiz_answers'
  ],
  'public has exactly the expected tables'
);

select is(
  (select array_agg(c.relname order by c.relname)
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  null,
  'every public table has RLS enabled'
);

select is(
  (select array_agg(t.tablename order by t.tablename)
   from pg_tables t
   where t.schemaname = 'public'
     and not exists (
       select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = t.tablename)),
  null,
  'every public table has at least one policy'
);

select is(
  (select array_agg(c.relname order by c.relname)
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate')
          or has_any_column_privilege('anon', c.oid, 'select, insert, update'))),
  null,
  'anon has no privileges on any public table'
);

select * from finish();
rollback;
