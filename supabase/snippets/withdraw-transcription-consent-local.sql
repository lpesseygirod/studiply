-- LOCAL ONLY — never run this against the remote project.
-- Withdraws transcription consent for one account; transcribe-chunk then
-- answers 403 consent_required. Put your email below and run in Studio.

update public.ai_consent
set withdrawn_at = now()
where scope = 'transcription'
  and withdrawn_at is null
  and user_id = (select id from auth.users where email = 'you@example.com')
returning user_id, scope, policy_version, withdrawn_at;
