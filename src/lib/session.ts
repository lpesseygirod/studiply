/**
 * session.ts
 * Local, offline stand-in for Supabase Auth.
 *
 * There is no backend and no remote identity: a "session" is just the id of
 * the profile row this device is currently using, persisted in AsyncStorage
 * so it survives restarts.
 *
 * The shape intentionally keeps a nested `user.id`, matching what
 * @supabase/supabase-js returned, so consumers read `session.user.id`
 * exactly as before.
 *
 * Nothing here is a security boundary. It identifies which local profile is
 * active; it does not authenticate anyone. Anyone with the unlocked device
 * has the data — device passcode and full-disk encryption are the real
 * protection.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = 'studiply.session.userId';

export interface LocalSession {
  user: { id: string };
}

type Listener = (session: LocalSession | null) => void;

const listeners = new Set<Listener>();

function emit(session: LocalSession | null): void {
  for (const listener of listeners) listener(session);
}

/**
 * Subscribes to sign-in / sign-out. Mirrors supabase.auth.onAuthStateChange's
 * return shape so the provider's teardown stays the same.
 */
export function onSessionChange(listener: Listener): { unsubscribe: () => void } {
  listeners.add(listener);
  return {
    unsubscribe: () => {
      listeners.delete(listener);
    },
  };
}

/** Reads the persisted session, or null when nobody has onboarded yet. */
export async function getSession(): Promise<LocalSession | null> {
  const userId = await AsyncStorage.getItem(SESSION_KEY);
  return userId ? { user: { id: userId } } : null;
}

/** Persists `userId` as the active session and notifies subscribers. */
export async function setSession(userId: string): Promise<LocalSession> {
  await AsyncStorage.setItem(SESSION_KEY, userId);
  const session: LocalSession = { user: { id: userId } };
  emit(session);
  return session;
}

/** Clears the active session and notifies subscribers. */
export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
  emit(null);
}
