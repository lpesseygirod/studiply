/**
 * offlineSession.ts
 * Staying signed in without a connection.
 *
 * Supabase keeps the session (access token, refresh token, user) in storage.
 * When the access token has expired (after an hour) and the refresh can't
 * reach the server, supabase-js reports "no session", but it keeps the stored
 * session because the failure was only the network. The app reads that stored
 * session itself and stays signed in until it can refresh. If the server
 * refuses the refresh token, supabase-js deletes it, and the student signs in
 * again as usual.
 */

import type { Session } from '@supabase/supabase-js';

import { secureStorage } from './secureStorage';

/** The key supabase-js stores the session under (its default for the URL). */
export function authStorageKey(url: string): string {
  const host = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/:?#]/)[0].toLowerCase();
  return `sb-${host.split('.')[0]}-auth-token`;
}

/** A stored session that can still be refreshed, or null. */
export function parseStoredSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Session> | null;
    if (!value || typeof value.refresh_token !== 'string' || !value.refresh_token) return null;
    if (!value.user || typeof value.user.id !== 'string') return null;
    return value as Session;
  } catch {
    return null;
  }
}

export async function readStoredSession(url: string): Promise<Session | null> {
  try {
    return parseStoredSession(await secureStorage.getItem(authStorageKey(url)));
  } catch {
    return null;
  }
}

/** Signing out while offline: supabase-js can't, so the stored session is removed here. */
export async function removeStoredSession(url: string): Promise<void> {
  await secureStorage.removeItem(authStorageKey(url));
}

export type StartupState = 'signed_in' | 'offline' | 'signed_out';

/**
 * What the app shows once Supabase has reported the session on launch:
 * its own session, the stored one (offline), or the sign-in screen.
 */
export function startupState(reported: Session | null, stored: Session | null): StartupState {
  if (reported) return 'signed_in';
  return stored ? 'offline' : 'signed_out';
}
