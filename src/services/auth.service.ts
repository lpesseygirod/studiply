/**
 * auth.service.ts
 * Local profile lifecycle. There is no remote auth — see src/lib/session.ts.
 *
 * "Signing up" creates a profile row plus its settings row and marks that
 * profile as this device's active session.
 */

import { all, first, run, transaction } from '../lib/db';
import { mapProfile, newId, now, type ProfileRow } from '../lib/mappers';
import { clearSession, setSession } from '../lib/session';
import { deleteUserStorage } from './storage.service';
import { generateInitials } from '../utils/initials';
import type { Profile } from '../types/database';

// -------------------------------------------------------------------
// signUpAnonymous
// Creates the local profile and signs this device into it.
// -------------------------------------------------------------------
export async function signUpAnonymous(username: string): Promise<void> {
  const name = username.trim();
  if (!name) throw new Error('Please enter a name.');

  const userId = newId();
  const timestamp = now();

  // Profile and settings are created together: every other service assumes a
  // settings row exists for a signed-in user, so a half-finished signup would
  // leave the app in a state the UI can't recover from.
  await transaction(async () => {
    await run(
      `INSERT INTO profiles (id, username, display_name, initials, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      [userId, name, name, generateInitials(name), timestamp, timestamp],
    );
    await run(
      `INSERT INTO user_settings (user_id, created_at, updated_at) VALUES (?, ?, ?)`,
      [userId, timestamp, timestamp],
    );
  });

  await setSession(userId);
}

// -------------------------------------------------------------------
// getProfile
// Returns null when the row doesn't exist, matching the previous contract
// (AuthProvider treats null as "not onboarded yet").
// -------------------------------------------------------------------
export async function getProfile(userId: string): Promise<Profile | null> {
  const row = await first<ProfileRow>(`SELECT * FROM profiles WHERE id = ?`, [userId]);
  return row ? mapProfile(row) : null;
}

// -------------------------------------------------------------------
// listProfiles
// Every local profile, newest first. Used to resume onto an existing
// profile after a sign-out instead of stranding its data.
// -------------------------------------------------------------------
export async function listProfiles(): Promise<Profile[]> {
  const rows = await all<ProfileRow>(`SELECT * FROM profiles ORDER BY created_at DESC`);
  return rows.map(mapProfile);
}

// -------------------------------------------------------------------
// signIn
// Switches this device to an existing local profile.
// -------------------------------------------------------------------
export async function signIn(userId: string): Promise<void> {
  const profile = await getProfile(userId);
  if (!profile) throw new Error('That profile no longer exists on this device.');
  await setSession(userId);
}

// -------------------------------------------------------------------
// signOut
// Clears the active session only. The profile and its data stay on the
// device and can be resumed via signIn().
// -------------------------------------------------------------------
export async function signOut(): Promise<void> {
  await clearSession();
}

// -------------------------------------------------------------------
// deleteAllUserData
// Irreversibly removes a profile and everything it owns.
// -------------------------------------------------------------------
export async function deleteAllUserData(userId: string): Promise<void> {
  // Files first: once the profile row is gone we can no longer enumerate
  // what belonged to it, so a failure here would orphan the files on disk.
  await deleteUserStorage(userId);

  // One delete is enough — every table references profiles(id) with
  // ON DELETE CASCADE, so projects, folders, sessions, notes, transcripts,
  // source_files, ai_usage and user_settings all go with it.
  await run(`DELETE FROM profiles WHERE id = ?`, [userId]);

  await clearSession();
}
