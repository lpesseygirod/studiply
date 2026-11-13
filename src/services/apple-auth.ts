/**
 * apple-auth.ts
 * Sign in with Apple: the iPhone's is apple-auth.ios.ts, the laptop's apple-auth.web.ts.
 * Elsewhere (Android, not a target) it isn't offered. Same exports as both.
 */

export { AppleSignInCancelled, hasAppleIdentity } from './apple-auth-core';

export const isAppleSignInAvailable = async (): Promise<boolean> => false;

export const appleSignInConfigured = () => false;

export async function signInWithApple(): Promise<void> {
  throw new Error('Sign in with Apple isn’t available on this device.');
}

export async function appleCodeForDeletion(): Promise<{ code: string; client: 'ios' | 'web' } | null> {
  return null;
}
