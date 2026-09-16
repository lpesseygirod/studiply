import { first, run } from '../lib/db';
import { buildSet, mapProfile, now, type ProfileRow } from '../lib/mappers';
import { generateInitials } from '../utils/initials';
import type { Profile } from '../types/database';

// -------------------------------------------------------------------
// updateProfile
// Updates display name and re-derives initials.
// -------------------------------------------------------------------
export async function updateProfile(
  userId: string,
  updates: { username?: string; display_name?: string; avatar_url?: string | null },
): Promise<Profile> {
  // Re-derive initials if name is changing
  const nameForInitials = updates.username ?? updates.display_name;

  const set = buildSet({
    username: updates.username,
    display_name: updates.display_name,
    avatar_url: updates.avatar_url,
    initials: nameForInitials ? generateInitials(nameForInitials) : undefined,
    updated_at: now(),
  });

  if (set) {
    await run(`UPDATE profiles SET ${set.clause} WHERE id = ?`, [...set.values, userId]);
  }

  const row = await first<ProfileRow>(`SELECT * FROM profiles WHERE id = ?`, [userId]);
  if (!row) throw new Error('Profile not found.');
  return mapProfile(row);
}
