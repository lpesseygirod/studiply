/**
 * apple-auth.ios.ts
 * Sign in with Apple on the iPhone: Apple's own sheet (expo-apple-authentication), then
 * Supabase with the identity token. Needs the app's Sign in with Apple entitlement (app.json
 * ios.usesAppleSignIn), so an EAS build: in Expo Go the token is issued to Expo Go, not to Studiply.
 */

import * as AppleAuthentication from 'expo-apple-authentication';

import { AppleSignInCancelled, finishAppleSignIn, fullNameOf, makeNonce } from './apple-auth-core';

export { AppleSignInCancelled, hasAppleIdentity } from './apple-auth-core';

/** Whether this device offers Sign in with Apple (iOS 13+). */
export const isAppleSignInAvailable = (): Promise<boolean> => AppleAuthentication.isAvailableAsync().catch(() => false);

/** Nothing to set up on the iPhone (the bundle id is the client). */
export const appleSignInConfigured = () => true;

const cancelled = (err: unknown) => (err as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED';

export async function signInWithApple(): Promise<void> {
  const nonce = await makeNonce();
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: nonce.hashed,
    });
  } catch (err) {
    if (cancelled(err)) throw new AppleSignInCancelled();
    throw err;
  }
  if (!credential.identityToken) throw new Error('Apple didn’t send a sign-in token. Please try again.');
  await finishAppleSignIn(credential.identityToken, nonce.raw, fullNameOf(credential.fullName));
}

/**
 * Deleting an account with Sign in with Apple: Apple is asked once more, for a fresh authorization
 * code the server uses to revoke the token (delete-account). Null when she cancels: the account is
 * still deleted, without the revocation.
 */
export async function appleCodeForDeletion(): Promise<{ code: string; client: 'ios' } | null> {
  try {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    return credential.authorizationCode ? { code: credential.authorizationCode, client: 'ios' } : null;
  } catch {
    return null;
  }
}
