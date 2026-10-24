/**
 * localProfile.ts
 * Keeps a local SQLite profile row for the signed-in Supabase user (iPhone).
 *
 * Until step 1.7 the library, notes and recording services still read SQLite
 * rows keyed by user_id, and every local table references profiles(id). So
 * after a Supabase sign-in this device needs a matching local profile and
 * settings row, created on first use with the Supabase user id.
 *
 * Local profiles from before Supabase Auth are left untouched: their data
 * stays on the device and is uploaded in step 1.9.
 *
 * The web build uses localProfile.web.ts, which never loads expo-sqlite.
 */

import { first, run, transaction } from '../lib/db';
import { now } from '../lib/mappers';
import { deleteUserStorage } from './storage.service';
import { generateInitials } from '../utils/initials';

// -------------------------------------------------------------------
// ensureLocalProfile
// Creates the local profile + settings rows if they don't exist yet.
// -------------------------------------------------------------------
export async function ensureLocalProfile(userId: string, name: string): Promise<void> {
  const existing = await first<{ id: string }>(`SELECT id FROM profiles WHERE id = ?`, [userId]);

  if (!existing) {
    const timestamp = now();
    // Profile and settings are created together: every other service assumes a
    // settings row exists for a signed-in user.
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
  }
}

// -------------------------------------------------------------------
// updateLocalProfile
// Mirrors a name change into the local row.
// -------------------------------------------------------------------
export async function updateLocalProfile(userId: string, name: string): Promise<void> {
  await run(
    `UPDATE profiles SET username = ?, display_name = ?, initials = ?, updated_at = ? WHERE id = ?`,
    [name, name, generateInitials(name), now(), userId],
  );
}

// -------------------------------------------------------------------
// deleteLocalUserData
// Irreversibly removes the local profile and everything it owns on this
// device. The Supabase account and its rows are deleted in step 10.1.
// -------------------------------------------------------------------
export async function deleteLocalUserData(userId: string): Promise<void> {
  // Files first: once the profile row is gone we can no longer enumerate
  // what belonged to it, so a failure here would orphan the files on disk.
  await deleteUserStorage(userId);

  // One delete is enough — every table references profiles(id) with
  // ON DELETE CASCADE, so projects, folders, sessions, notes, transcripts,
  // source_files, ai_usage and user_settings all go with it.
  await run(`DELETE FROM profiles WHERE id = ?`, [userId]);
}
