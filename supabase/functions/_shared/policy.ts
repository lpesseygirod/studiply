/**
 * policy.ts
 * Rules every AI Edge Function shares, kept free of Deno code so Jest can
 * test them.
 */

/**
 * Consent rows must carry this version. Step 10.1 gives the real consent
 * text a new version, so consent given during development stops counting.
 */
export const CONSENT_POLICY_VERSION = 'dev-2026-10';

/** What ai_consent.scope allows; each function checks the one it needs. */
export type ConsentScope = 'transcription' | 'assistant_summary' | 'images';

/** Daily limits look back this far (a rolling 24 hours, not a calendar day). */
export const LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
