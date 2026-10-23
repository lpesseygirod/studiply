import { supabase } from '../lib/supabase';
import { updateLocalProfile } from './localProfile';
import { generateInitials } from '../utils/initials';

// -------------------------------------------------------------------
// updateProfile
// Updates the display name in Supabase, re-derives initials, and mirrors
// the change into the local profile row the SQLite services use (iPhone).
// AuthProvider.refreshProfile() re-reads the result.
// -------------------------------------------------------------------
export async function updateProfile(
  userId: string,
  updates: { username?: string; display_name?: string },
): Promise<void> {
  const name = (updates.display_name ?? updates.username)?.trim();
  if (!name) return;

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name, initials: generateInitials(name) })
    .eq('id', userId);
  if (error) throw new Error('Could not save your name. Check your connection and try again.');

  // Also keep the name in the session, so it shows when the app opens offline.
  await supabase.auth.updateUser({ data: { display_name: name } });

  await updateLocalProfile(userId, name);
}
