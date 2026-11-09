/**
 * consent.service.ts
 * Asking before anything is sent to an AI service (Apple guideline 5.1.2(i); step 10.1). The Edge
 * Functions refuse without an ai_consent row of the current policy version that isn't withdrawn;
 * this asks the student with the consent screen (components/consent: desktop-09, iphone-12) and
 * records the answer.
 *
 * - One answer gives all three scopes (transcription → ElevenLabs; assistant_summary and images →
 *   Anthropic): the screen names them all (the advisor's D4). The rows stay per scope, so each
 *   function checks only what it sends.
 * - Settings → AI & privacy (iphone-08): consentStatus (allowed, since when), withdrawConsent (one
 *   tap, as easy as giving it), giveConsent (after the screen).
 * - Withdrawing works offline: AI is off on this device at once (lib/consentGate: nothing is sent),
 *   and the withdrawal reaches the server when online (the iPhone's queue: `consent_withdraw`; the
 *   laptop: when it is back online). Giving consent needs a connection, and sends a pending
 *   withdrawal first.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import { NetworkError, serviceError } from '../lib/cloudRows';
import { isOffline, onBackOnline } from '../lib/connectivity';
import { isAiPaused, setAiPaused } from '../lib/consentGate';
import { discardSync, enqueue, pendingSyncFor, registerSyncHandler, syncEnabled } from '../lib/sync';
import { syncError } from '../lib/sync/errors';
import { requestAiConsent, type ConsentContext } from '../components/consent/consentRequests';
import { CONSENT_POLICY_VERSION, CONSENT_SCOPES, type ConsentScope } from '../../supabase/functions/_shared/policy';

/** Thrown when the student chooses "Not now": nothing was sent. */
export class ConsentDeclinedError extends Error {
  constructor(readonly scope: ConsentScope) {
    super('Nothing was sent. Your recording is saved; tap Retry when you want to continue.');
    this.name = 'ConsentDeclinedError';
  }
}

/** Scopes already granted in this app session, so the table is read once. */
const granted = new Set<ConsentScope>();

/** The date the current consent was given, kept for Settings offline. */
const SINCE_KEY = 'studiply.ai.since';
const WITHDRAW_KEY = 'consent';

interface ConsentRow {
  scope: ConsentScope;
  granted_at: string;
}

/** Her rows of the current policy version that aren't withdrawn. */
async function currentRows(): Promise<ConsentRow[]> {
  const { data, error } = await supabase
    .from('ai_consent')
    .select('scope, granted_at')
    .eq('policy_version', CONSENT_POLICY_VERSION)
    .is('withdrawn_at', null);
  if (error) throw serviceError(error, 'Could not check your permissions.');
  return (data ?? []) as ConsentRow[];
}

// -------------------------------------------------------------------
// Listeners (the Settings card and the Settings list's "Allowed / Off")
// -------------------------------------------------------------------
const listeners = new Set<() => void>();
export function onConsentChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

/** Whether the student already allowed `scope`, without asking (false offline, on error, or while AI is off here). */
export async function consentGiven(scope: ConsentScope): Promise<boolean> {
  if (await isAiPaused()) return false;
  if (granted.has(scope)) return true;
  const rows = await currentRows().catch(() => []);
  rows.forEach((r) => granted.add(r.scope));
  return granted.has(scope);
}

// -------------------------------------------------------------------
// ensureConsent
// Resolves once the student has consent for every scope asked (showing the consent screen when one
// is missing; Allow gives all three); throws ConsentDeclinedError on "Not now".
// -------------------------------------------------------------------
export async function ensureConsent(...scopes: ConsentScope[]): Promise<void> {
  const paused = await isAiPaused();
  if (!paused && scopes.every((s) => granted.has(s))) return;
  if (!paused) {
    const rows = await currentRows();
    rows.forEach((r) => granted.add(r.scope));
    if (scopes.every((s) => granted.has(s))) return;
  }
  // Before a recording ("Before you record"), or any other AI action.
  const context: ConsentContext = scopes.includes('transcription') ? 'record' : 'ai';
  if (!(await requestAiConsent(context))) throw new ConsentDeclinedError(scopes[0] ?? 'assistant_summary');
  await giveConsent();
}

/**
 * Gives all three scopes under the current policy version (the consent screen's Allow, or the
 * Settings switch after it). A withdrawal still waiting to reach the server is sent first.
 */
export async function giveConsent(): Promise<void> {
  if (isOffline()) throw new NetworkError();
  const pending = await pendingSyncFor(WITHDRAW_KEY);
  if (pending.length || webWithdrawPending) {
    await sendWithdrawal();
    for (const op of pending) await discardSync(op.id);
    webWithdrawPending = false;
  }
  const have = new Set((await currentRows()).map((r) => r.scope));
  const missing = CONSENT_SCOPES.filter((s) => !have.has(s));
  if (missing.length) {
    // Only scope and policy_version may be written; the database sets the rest.
    const { error } = await supabase.from('ai_consent').insert(missing.map((scope) => ({ scope, policy_version: CONSENT_POLICY_VERSION })));
    if (error) throw serviceError(error, 'Could not save your permission.');
  }
  CONSENT_SCOPES.forEach((s) => granted.add(s));
  await setAiPaused(false);
  notify();
}

/** Settings → AI & privacy: on or off on this account, and since when (offline: the last known date). */
export async function consentStatus(): Promise<{ allowed: boolean; since: string | null }> {
  if (await isAiPaused()) return { allowed: false, since: null };
  try {
    const rows = await currentRows();
    const allowed = CONSENT_SCOPES.every((s) => rows.some((r) => r.scope === s));
    const since = allowed ? rows.map((r) => r.granted_at).sort()[0] : null;
    await (since ? AsyncStorage.setItem(SINCE_KEY, since) : AsyncStorage.removeItem(SINCE_KEY)).catch(() => {});
    return { allowed, since };
  } catch (err) {
    const since = await AsyncStorage.getItem(SINCE_KEY).catch(() => null);
    if (since) return { allowed: true, since };
    throw err;
  }
}

// -------------------------------------------------------------------
// withdrawConsent: one tap, also offline
// -------------------------------------------------------------------

/** Every consent row of hers that isn't withdrawn, withdrawn now (the server's time: withdraw_ai_consent). */
async function sendWithdrawal(): Promise<void> {
  const { error } = await supabase.rpc('withdraw_ai_consent');
  if (error) throw syncError(error, 'Could not save that AI is off.');
}

/** The laptop has no queue: a withdrawal made offline is sent when it is back online. */
let webWithdrawPending = false;

export async function withdrawConsent(): Promise<void> {
  // Off on this device at once: nothing is sent from here on (lib/functions.ts).
  await setAiPaused(true);
  forgetConsent();
  await AsyncStorage.removeItem(SINCE_KEY).catch(() => {});
  notify();
  try {
    if (isOffline()) throw new NetworkError();
    await sendWithdrawal();
  } catch {
    if (syncEnabled) {
      await enqueue({ kind: 'consent_withdraw', key: WITHDRAW_KEY, payload: {} });
    } else if (!webWithdrawPending) {
      webWithdrawPending = true;
      const stop = onBackOnline(() => {
        stop();
        sendWithdrawal()
          .then(() => (webWithdrawPending = false))
          .catch(() => {});
      });
    }
  }
}

registerSyncHandler<Record<string, never>>('consent_withdraw', {
  run: async () => {
    await sendWithdrawal();
  },
  merge: (_earlier, later) => later,
});

/** Forgets what was granted in this session (after sign-out, or a 403 from a function). */
export function forgetConsent(): void {
  granted.clear();
}
