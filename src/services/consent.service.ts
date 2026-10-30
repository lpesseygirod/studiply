/**
 * consent.service.ts
 * Asking before anything is sent to an AI service (Apple guideline
 * 5.1.2(i)). The Edge Functions refuse without an ai_consent row of the
 * current policy version; this asks the student once per kind of data and
 * records their answer.
 *
 * A minimal prompt for development (step 1.7). The real consent screen,
 * with its own policy version, comes in step 10.1; consent given here then
 * stops counting.
 */

import { supabase } from '../lib/supabase';
import { serviceError } from '../lib/cloudRows';
import { showAlert } from '../components/dialogs/dialogs';
import { CONSENT_POLICY_VERSION, type ConsentScope } from '../../supabase/functions/_shared/policy';

/** Thrown when the student chooses "Not now": nothing was sent. */
export class ConsentDeclinedError extends Error {
  constructor(readonly scope: ConsentScope) {
    super('Nothing was sent. Your recording is saved; tap Retry when you want to continue.');
    this.name = 'ConsentDeclinedError';
  }
}

const QUESTIONS: Record<ConsentScope, { title: string; message: string }> = {
  transcription: {
    title: 'Send the recording to ElevenLabs?',
    message: 'To turn your recording into text, Studiply sends its audio to ElevenLabs. You will only be asked once.',
  },
  assistant_summary: {
    title: 'Send the transcript to Anthropic?',
    message:
      'To write your notes and answer questions about this lecture, Studiply sends its transcript and notes to Anthropic (Claude). You will only be asked once.',
  },
  images: {
    title: 'Send photos and PDFs to Anthropic?',
    message:
      'To include your photos and PDFs in the notes, Studiply sends them to Anthropic (Claude). You will only be asked once.',
  },
};

/** Scopes already granted in this app session, so the table is read once. */
const granted = new Set<ConsentScope>();

async function hasConsent(scope: ConsentScope): Promise<boolean> {
  const { data, error } = await supabase
    .from('ai_consent')
    .select('id')
    .eq('scope', scope)
    .eq('policy_version', CONSENT_POLICY_VERSION)
    .is('withdrawn_at', null)
    .limit(1);
  if (error) throw serviceError(error, 'Could not check your permissions.');
  return data.length > 0;
}

function ask(scope: ConsentScope): Promise<boolean> {
  const { title, message } = QUESTIONS[scope];
  return new Promise((resolve) => {
    showAlert(title, message, [
      { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Allow', onPress: () => resolve(true) },
    ]);
  });
}

/** Whether the student already allowed `scope`, without asking (false offline or on error). */
export async function consentGiven(scope: ConsentScope): Promise<boolean> {
  if (granted.has(scope)) return true;
  const yes = await hasConsent(scope).catch(() => false);
  if (yes) granted.add(scope);
  return yes;
}

// -------------------------------------------------------------------
// ensureConsent
// Resolves once the student has consent for every scope (asking for the
// missing ones, in order); throws ConsentDeclinedError on "Not now".
// -------------------------------------------------------------------
export async function ensureConsent(...scopes: ConsentScope[]): Promise<void> {
  for (const scope of scopes) {
    if (granted.has(scope)) continue;
    if (!(await hasConsent(scope))) {
      if (!(await ask(scope))) throw new ConsentDeclinedError(scope);
      // Only scope and policy_version may be written; the database sets the rest.
      const { error } = await supabase.from('ai_consent').insert({ scope, policy_version: CONSENT_POLICY_VERSION });
      if (error) throw serviceError(error, 'Could not save your permission.');
    }
    granted.add(scope);
  }
}

/** Forgets what was granted in this session (after sign-out, or a 403 from a function). */
export function forgetConsent(): void {
  granted.clear();
}
