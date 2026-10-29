-- LOCAL ONLY — never run this against the remote project.
-- Gives transcription consent for one account, standing in for the consent
-- screen that comes in step 10.1. Paste into Studio (http://127.0.0.1:54323)
-- → SQL Editor, put your email below, and run.
-- policy_version must match CONSENT_POLICY_VERSION in
-- supabase/functions/_shared/policy.ts.

insert into public.ai_consent (user_id, scope, policy_version)
select id, 'transcription', 'dev-2026-10-elevenlabs'
from auth.users
where email = 'you@example.com'
returning user_id, scope, policy_version, granted_at;
