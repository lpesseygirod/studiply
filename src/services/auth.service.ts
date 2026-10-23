/**
 * auth.service.ts
 * Email + password sign-in with Supabase Auth.
 *
 * Email is only needed twice, and both times the student types a 6-digit
 * code from the email into the app (no links, no deep links):
 *   - confirming the address after sign-up
 *   - resetting a forgotten password
 *
 * The session itself is stored by the Supabase client (Keychain on iPhone,
 * localStorage on web) and AuthProvider listens to its changes.
 */

import { isAuthRetryableFetchError, type AuthError, type User } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { deleteLocalUserData } from './localProfile';
import { generateInitials } from '../utils/initials';
import type { Profile } from '../types/database';

export const MIN_PASSWORD_LENGTH = 8;

// -------------------------------------------------------------------
// Errors
// `code` is Supabase's error code when there is one, so screens can react
// to specific cases (e.g. switch to the code step on email_not_confirmed).
// -------------------------------------------------------------------
export class AuthServiceError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Wrong email or password.',
  email_not_confirmed: 'Please confirm your email first. We sent you a new code.',
  otp_expired: 'That code is wrong or has expired. Ask for a new one.',
  weak_password: `Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
  same_password: 'Choose a password you haven’t used before.',
  user_already_exists: 'An account with this email already exists. Sign in instead.',
  email_address_invalid: 'Please enter a valid email address.',
  validation_failed: 'Please check your email address.',
  over_email_send_rate_limit: 'Too many emails sent. Wait a minute and try again.',
  over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
};

function toServiceError(error: AuthError): AuthServiceError {
  if (isAuthRetryableFetchError(error)) {
    return new AuthServiceError('No connection. Check your internet and try again.', 'network');
  }
  const code = error.code ?? undefined;
  return new AuthServiceError(
    (code && MESSAGES[code]) || 'Something went wrong. Please try again.',
    code,
  );
}

function cleanEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(value)) {
    throw new AuthServiceError(MESSAGES.email_address_invalid, 'email_address_invalid');
  }
  return value;
}

function checkPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthServiceError(MESSAGES.weak_password, 'weak_password');
  }
}

// -------------------------------------------------------------------
// signUp
// Creates the account; Supabase emails a 6-digit code. The profile row is
// created by the database trigger from `display_name`.
// -------------------------------------------------------------------
export async function signUp(name: string, email: string, password: string): Promise<void> {
  const displayName = name.trim();
  if (displayName.length < 2) throw new AuthServiceError('Please enter your name.');
  const address = cleanEmail(email);
  checkPassword(password);

  const { data, error } = await supabase.auth.signUp({
    email: address,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw toServiceError(error);

  // With email confirmation on, Supabase doesn't reveal that an address is
  // taken; it returns a user with no identities instead.
  if (data.user && data.user.identities?.length === 0) {
    throw new AuthServiceError(MESSAGES.user_already_exists, 'user_already_exists');
  }
}

// -------------------------------------------------------------------
// verifySignUpCode
// Confirms the email with the code and signs in.
// -------------------------------------------------------------------
export async function verifySignUpCode(email: string, code: string): Promise<void> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: cleanEmail(email),
    token: code.trim(),
    type: 'signup',
  });
  if (error) throw toServiceError(error);

  // The trigger stores a one-letter placeholder; use the app's initials.
  const user = data.user;
  const name = user?.user_metadata?.display_name;
  if (user && typeof name === 'string' && name) {
    await supabase
      .from('profiles')
      .update({ initials: generateInitials(name) })
      .eq('id', user.id);
  }
}

export async function resendSignUpCode(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: 'signup', email: cleanEmail(email) });
  if (error) throw toServiceError(error);
}

// -------------------------------------------------------------------
// signIn
// Throws AuthServiceError with code 'email_not_confirmed' when the account
// still needs its code; a fresh code is sent in that case.
// -------------------------------------------------------------------
export async function signIn(email: string, password: string): Promise<void> {
  const address = cleanEmail(email);
  const { error } = await supabase.auth.signInWithPassword({ email: address, password });
  if (!error) return;

  const serviceError = toServiceError(error);
  if (serviceError.code === 'email_not_confirmed') {
    await supabase.auth.resend({ type: 'signup', email: address });
  }
  throw serviceError;
}

// -------------------------------------------------------------------
// Forgotten password: email a code, then verify it and set the new password.
// -------------------------------------------------------------------
export async function sendPasswordResetCode(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail(email));
  if (error) throw toServiceError(error);
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  checkPassword(newPassword);
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: cleanEmail(email),
    token: code.trim(),
    type: 'recovery',
  });
  if (verifyError) throw toServiceError(verifyError);

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw toServiceError(error);
}

// -------------------------------------------------------------------
// signOut
// Without a connection Supabase still drops the session on this device
// (and notifies listeners); only the server-side revoke is skipped.
// -------------------------------------------------------------------
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error && __DEV__) console.warn('Sign-out could not reach Supabase:', error.message);
}

// -------------------------------------------------------------------
// getProfile
// Reads the Supabase profile and maps it to the app's Profile shape
// (`username` = display name). Offline, it falls back to the name stored
// in the session so the app still opens.
// -------------------------------------------------------------------
export async function getProfile(user: User): Promise<Profile> {
  const metaName = user.user_metadata?.display_name;
  const fallbackName =
    (typeof metaName === 'string' && metaName) || user.email?.split('@')[0] || '';

  const { data } = await supabase
    .from('profiles')
    .select('display_name, avatar_path, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  const name = data?.display_name || fallbackName;
  return {
    id: user.id,
    username: name,
    display_name: name || null,
    initials: generateInitials(name),
    avatar_path: data?.avatar_path ?? null,
    created_at: data?.created_at ?? user.created_at,
    updated_at: data?.updated_at ?? user.updated_at ?? user.created_at,
  };
}

// -------------------------------------------------------------------
// deleteAllUserData
// Removes everything this device stores for the user, then signs out.
// Deleting the Supabase account itself needs a server function and comes
// with account deletion in step 10.1.
// -------------------------------------------------------------------
export async function deleteAllUserData(userId: string): Promise<void> {
  await deleteLocalUserData(userId);
  await signOut();
}
