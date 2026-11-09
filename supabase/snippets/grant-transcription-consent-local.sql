-- LOCAL ONLY — never run this against the remote project.
-- Gives AI consent (all three scopes, as the step 10.1 consent screen's Allow
-- does) for one account. Paste into Studio (http://127.0.0.1:54323) → SQL
-- Editor, put your email below, and run. The app's consent screen does the same.
-- policy_version must match CONSENT_POLICY_VERSION in
-- supabase/functions/_shared/policy.ts.

insert into public.ai_consent (user_id, scope, policy_version)
select u.id, s.scope, '2026-11-store-1'
from auth.users u
cross join (values ('transcription'), ('assistant_summary'), ('images')) as s(scope)
where u.email = 'you@example.com'
returning user_id, scope, policy_version, granted_at;
