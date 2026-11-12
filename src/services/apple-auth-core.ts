/**
 * apple-auth-core.ts
 * Sign in with Apple: what the iPhone (apple-auth.ios.ts) and the laptop (apple-auth.web.ts)
 * share. Apple gets the SHA-256 of a one-time nonce, Supabase the nonce itself, so a token can't be
 * replayed (Supabase checks that the token's nonce is the hash). Apple gives the name only on the
 * first sign-in: it is saved at once.
 */

import * as Crypto from 'expo-crypto';

import { supabase } from '../lib/supabase';

/** A fresh nonce (hex) and the SHA-256 Apple is given. */
export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = Array.from(Crypto.getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

/** "Lea Pessey", from Apple's parts; null when Apple sent none (every sign-in after the first). */
export function fullNameOf(parts: { givenName?: string | null; familyName?: string | null } | null | undefined): string | null {
  const name = [parts?.givenName, parts?.familyName].filter((p) => p && p.trim()).join(' ').trim();
  return name.length >= 2 ? name : null;
}

/** Signs in with Apple's identity token (and the raw nonce); the name kept when Apple sent one and none is set. */
export async function finishAppleSignIn(identityToken: string, rawNonce: string, name: string | null): Promise<void> {
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken, nonce: rawNonce });
  if (error) throw new Error(error.message || 'Sign in with Apple didn’t work. Please try again.');
  const user = data.user;
  if (!name || !user || user.user_metadata?.display_name) return;
  await supabase.auth.updateUser({ data: { display_name: name } }).catch(() => {});
  await supabase.from('profiles').update({ display_name: name }).eq('id', user.id).is('display_name', null);
}

/** Whether the signed-in account has Sign in with Apple (Settings → Account: Linked / Not linked). */
export async function hasAppleIdentity(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  return (data.user?.identities ?? []).some((i) => i.provider === 'apple');
}

/** The student closed Apple's sheet or popup: nothing to say. */
export class AppleSignInCancelled extends Error {
  constructor() {
    super('Sign in with Apple was cancelled.');
    this.name = 'AppleSignInCancelled';
  }
}
