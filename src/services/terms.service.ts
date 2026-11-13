/**
 * terms.service.ts
 * Accepting the Terms of Service and the Privacy Policy, and the minimum age (16).
 *
 * - Sign-up with email: both boxes ticked → `signUpAcceptance()` goes in the sign-up metadata and
 *   the new-user trigger saves it with the server's time (20261029152500_terms_acceptance).
 * - Sign in with Apple can create an account before the app can ask, and accounts made before this
 *   step never ticked: after sign-in `termsStatus` finds no acceptance and the gate asks (D3: "I
 *   don't agree" signs out). If the boxes were ticked before Continue with Apple
 *   (`rememberTicked`), that acceptance is saved instead of asking again.
 * - `acceptTerms` adds her row (her own, insert only; the server sets the time). A version is
 *   accepted once: accepting it again is not an error.
 *
 * "Accepted" is remembered per account on this device, so the gate never flashes and an offline
 * start never blocks her; it is only asked when the server says there is none.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { isNetworkError, serviceError } from '../lib/cloudRows';
import { supabase } from '../lib/supabase';
import { LEGAL_VERSION } from '../legal/texts.generated';

export const MINIMUM_AGE = 16;
export const UNDER_AGE_MESSAGE = `Studiply is for people aged ${MINIMUM_AGE} or older.`;

export type TermsStatus = 'accepted' | 'missing' | 'unknown';
export type AcceptanceSource = 'sign_up' | 'gate';

const keyFor = (userId: string) => `studiply.terms.accepted.${userId}`;

/** The sign-up metadata after both boxes were ticked (read by the new-user trigger). */
export function signUpAcceptance(): { terms_version: string; age_16: true } {
  return { terms_version: LEGAL_VERSION, age_16: true };
}

// The boxes' state when Continue with Apple was pressed (this app session only).
let tickedBeforeApple = false;

/** Before Sign in with Apple: whether both boxes were ticked on the screen it was pressed from. */
export function rememberTicked(both: boolean): void {
  tickedBeforeApple = both;
}

async function remembered(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(keyFor(userId))) !== null;
  } catch {
    return false;
  }
}

async function remember(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), LEGAL_VERSION);
  } catch {
    // No storage: asked of the server next time.
  }
}

/**
 * Whether this account has accepted: 'missing' only when the server says it has no acceptance;
 * 'unknown' when it can't be asked (offline), so nothing is blocked.
 */
export async function termsStatus(userId: string): Promise<TermsStatus> {
  if (await remembered(userId)) return 'accepted';
  const { data, error } = await supabase.from('terms_acceptances').select('id').eq('user_id', userId).limit(1);
  if (error) return 'unknown';
  if ((data ?? []).length > 0) {
    await remember(userId);
    return 'accepted';
  }
  return 'missing';
}

/** Saves her acceptance of the current texts (both boxes ticked). */
export async function acceptTerms(userId: string, source: AcceptanceSource): Promise<void> {
  const { error } = await supabase.from('terms_acceptances').insert({ terms_version: LEGAL_VERSION, age_confirmed: true, source });
  // 23505: this version is already accepted (another device, a second tap).
  if (error && error.code !== '23505') {
    const err = serviceError(error, 'Your answer couldn’t be saved. Please try again.');
    throw isNetworkError(err) ? serviceError(error, 'Accepting needs a connection. Please try again when you’re online.') : err;
  }
  await remember(userId);
}

/**
 * After sign-in: 'accepted', 'missing' (the gate asks) or 'unknown'. A missing acceptance is saved
 * at once when the boxes were ticked before Continue with Apple.
 */
export async function checkTerms(userId: string): Promise<TermsStatus> {
  const status = await termsStatus(userId);
  if (status !== 'missing' || !tickedBeforeApple) return status;
  tickedBeforeApple = false;
  try {
    await acceptTerms(userId, 'sign_up');
    return 'accepted';
  } catch {
    return 'missing';
  }
}
