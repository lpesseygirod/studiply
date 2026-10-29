-- 20261029151800: transcription's cost rows may say 'elevenlabs' (Scribe v2);
-- the earlier providers stay allowed and an unknown one is refused. The
-- Edge Functions write these rows as the service role (postgres here).
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email) values ('dddddddd-0000-0000-0000-000000000014', 'usage-providers@test.dev');

select lives_ok(
  $$ insert into public.ai_usage (user_id, operation, provider, model, audio_seconds, cost_usd)
     values ('dddddddd-0000-0000-0000-000000000014', 'transcription', 'elevenlabs', 'scribe_v2', 60, 0.003667) $$,
  'an ElevenLabs transcription row is accepted');

select lives_ok(
  $$ insert into public.ai_usage (user_id, operation, provider, model, audio_seconds, cost_usd)
     values ('dddddddd-0000-0000-0000-000000000014', 'transcription', 'openai', 'whisper-1', 60, 0.006) $$,
  'whisper-1 rows still are');

select throws_ok(
  $$ insert into public.ai_usage (user_id, operation, provider, model)
     values ('dddddddd-0000-0000-0000-000000000014', 'transcription', 'somebody', 'x') $$,
  '23514', null, 'an unknown provider is refused');

select * from finish();
rollback;
