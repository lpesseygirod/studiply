/**
 * localProfile.ts
 * Data that earlier versions of the app kept on this iPhone (SQLite and
 * files under the documents folder).
 *
 * Every service now reads and writes Supabase, so nothing new is
 * stored here. What is left from before is uploaded by the legacy import, and
 * "Delete all data" removes it with deleteLocalUserData.
 *
 * The web build uses localProfile.web.ts, which never loads expo-sqlite.
 */

import { clearCache } from '../lib/cache';
import { run } from '../lib/db';
import { deleteUserStorage } from './storage.service';

// -------------------------------------------------------------------
// deleteLocalUserData
// Irreversibly removes the local profile and everything it owns on this
// device. The Supabase account and its rows are deleted with Delete account.
// -------------------------------------------------------------------
export async function deleteLocalUserData(userId: string): Promise<void> {
  // Files first: once the profile row is gone we can no longer enumerate
  // what belonged to it, so a failure here would orphan the files on disk.
  await deleteUserStorage(userId);

  // One delete is enough — every table references profiles(id) with
  // ON DELETE CASCADE, so projects, folders, sessions, notes, transcripts,
  // source_files, ai_usage and user_settings all go with it.
  await run(`DELETE FROM profiles WHERE id = ?`, [userId]);

  // And the offline copy of the library (src/lib/cache).
  await clearCache(userId);
}
