/**
 * apple-auth.web.ts
 * Sign in with Apple on the laptop (the advisor's D1): Apple's own JS sign-in in a popup
 * (appleid.auth.js, loaded from Apple's CDN when first needed), then Supabase with the identity token,
 * as on the iPhone. No client secret: nothing to renew every 6 months.
 *
 * Two public settings (EXPO_PUBLIC_, in .env.local; both are sent to the browser anyway):
 * - EXPO_PUBLIC_APPLE_SERVICES_ID: the web's Services ID (Apple Developer → Identifiers);
 * - EXPO_PUBLIC_APPLE_REDIRECT_URI: a return URL registered on that Services ID (the popup doesn't
 *   use it, Apple requires one); the page's own address when unset.
 * Without the Services ID the button says Sign in with Apple isn't set up yet.
 */

import { AppleSignInCancelled, finishAppleSignIn, fullNameOf, makeNonce } from './apple-auth-core';

export { AppleSignInCancelled, hasAppleIdentity } from './apple-auth-core';

const SCRIPT = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
const SERVICES_ID = process.env.EXPO_PUBLIC_APPLE_SERVICES_ID ?? '';
const REDIRECT_URI = process.env.EXPO_PUBLIC_APPLE_REDIRECT_URI ?? '';

interface AppleSignInResponse {
  authorization: { code: string; id_token: string };
  user?: { name?: { firstName?: string; lastName?: string } };
}

interface AppleIDGlobal {
  auth: {
    init(config: { clientId: string; scope: string; redirectURI: string; nonce?: string; usePopup: boolean }): void;
    signIn(): Promise<AppleSignInResponse>;
  };
}

let loading: Promise<AppleIDGlobal> | null = null;

function appleJs(): Promise<AppleIDGlobal> {
  const ready = (window as unknown as { AppleID?: AppleIDGlobal }).AppleID;
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise<AppleIDGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => {
      const apple = (window as unknown as { AppleID?: AppleIDGlobal }).AppleID;
      if (apple) resolve(apple);
      else reject(new Error('Sign in with Apple couldn’t load.'));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error('Sign in with Apple couldn’t load. Check your connection.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export const isAppleSignInAvailable = async (): Promise<boolean> => true;

/** Whether the web's Services ID is set (EXPO_PUBLIC_APPLE_SERVICES_ID). */
export const appleSignInConfigured = () => SERVICES_ID.length > 0;

async function signInPopup(nonce?: string): Promise<AppleSignInResponse> {
  if (!SERVICES_ID) throw new Error('Sign in with Apple isn’t set up for the web version yet.');
  const apple = await appleJs();
  apple.auth.init({ clientId: SERVICES_ID, scope: 'name email', redirectURI: REDIRECT_URI || window.location.origin, nonce, usePopup: true });
  try {
    return await apple.auth.signIn();
  } catch (err) {
    const code = (err as { error?: string } | null)?.error;
    if (code === 'popup_closed_by_user' || code === 'user_cancelled_authorize') throw new AppleSignInCancelled();
    throw new Error('Sign in with Apple didn’t work. Please try again.');
  }
}

export async function signInWithApple(): Promise<void> {
  const nonce = await makeNonce();
  const res = await signInPopup(nonce.hashed);
  const name = fullNameOf({ givenName: res.user?.name?.firstName, familyName: res.user?.name?.lastName });
  await finishAppleSignIn(res.authorization.id_token, nonce.raw, name);
}

/** Deleting an account with Sign in with Apple: a fresh code for the revocation (null: cancelled or not set up). */
export async function appleCodeForDeletion(): Promise<{ code: string; client: 'web' } | null> {
  try {
    const res = await signInPopup();
    return { code: res.authorization.code, client: 'web' };
  } catch {
    return null;
  }
}
