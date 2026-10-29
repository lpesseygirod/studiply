-- Transcription moves to ElevenLabs Scribe v2 (branch transcribe-model,
-- merged 29 Oct 2026): transcribe-chunk logs its cost with provider
-- 'elevenlabs'. Without this every Scribe chunk would fail after being paid
-- for, because the cost row is written first. 'openai' stays for the rows
-- whisper-1 wrote and until it shuts down on 26 Feb 2027.

alter table public.ai_usage drop constraint ai_usage_provider_check;
alter table public.ai_usage
  add constraint ai_usage_provider_check check (provider in ('openai', 'anthropic', 'elevenlabs'));
