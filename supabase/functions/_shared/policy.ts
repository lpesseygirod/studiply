/**
 * policy.ts
 * Rules every AI Edge Function shares, kept free of Deno code so Jest can
 * test them.
 */

/**
 * Consent rows must carry this version. Step 10.1 (the store's consent screen, desktop-09 / iphone-12)
 * raised it from 'dev-2026-10-elevenlabs': consent given during development stops counting and every
 * student is asked again. Raise it whenever what is sent, or to whom, changes.
 */
export const CONSENT_POLICY_VERSION = '2026-11-store-1';

/** What ai_consent.scope allows; each function checks the one it needs. */
export type ConsentScope = 'transcription' | 'assistant_summary' | 'images';

/** Step 10.1: one answer ("Use AI on my lectures") gives all of them. */
export const CONSENT_SCOPES: readonly ConsentScope[] = ['transcription', 'assistant_summary', 'images'];

/** Daily limits look back this far (a rolling 24 hours, not a calendar day). */
export const LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Seconds of audio transcribed per rolling 24 hours. A placeholder until
 * plans and server-enforced limits arrive in step 10.2. Here, not in
 * transcript.ts, because the app shows it too: transcript.ts names the
 * providers' key variables, which must not end up in the app's bundle.
 */
export const DAILY_LIMIT_SECONDS = 6 * 60 * 60;
