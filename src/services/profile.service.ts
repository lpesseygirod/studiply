import { supabase } from '../lib/supabase';
import { generateInitials } from '../utils/initials';
import { toJpeg } from '../utils/toJpeg';
import { Buckets, removeFiles, uploadFile, type UploadOptions } from './cloud-storage.service';

// -------------------------------------------------------------------
// updateProfile
// Updates the display name in Supabase and re-derives the initials.
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
}

// -------------------------------------------------------------------
// setProfilePhoto
// Converts the picked image to JPEG, uploads it to the photos bucket under a
// new name (so no stale cached image is shown), saves the path on the
// profile, then deletes the previous photo. Resolves with the new path.
// -------------------------------------------------------------------
export async function setProfilePhoto(
  userId: string,
  picked: { uri: string; width?: number; height?: number },
  previousPath: string | null,
  callbacks: Pick<UploadOptions, 'onProgress' | 'onRetry'> = {},
): Promise<string> {
  const size = picked.width && picked.height ? { width: picked.width, height: picked.height } : undefined;
  let jpeg: Awaited<ReturnType<typeof toJpeg>>;
  try {
    jpeg = await toJpeg(picked.uri, size);
  } catch {
    // e.g. HEIC in a browser that can't decode it.
    throw new Error("This image can't be read. Try a JPEG or PNG.");
  }

  const { path } = await uploadFile({
    bucket: Buckets.photos,
    path: `profile/avatar-${Date.now()}.jpg`,
    uri: jpeg.uri,
    contentType: jpeg.mimeType,
    ...callbacks,
  });

  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
  if (error) {
    await removeFiles(Buckets.photos, [path]).catch(() => {});
    throw new Error('Could not save your photo. Check your connection and try again.');
  }

  // Best effort: a leftover old photo only costs space.
  if (previousPath && previousPath !== path) {
    await removeFiles(Buckets.photos, [previousPath]).catch(() => {});
  }
  return path;
}

// -------------------------------------------------------------------
// removeProfilePhoto
// Clears the photo from the profile first, so the initials show even if
// deleting the file fails.
// -------------------------------------------------------------------
export async function removeProfilePhoto(userId: string, path: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId);
  if (error) throw new Error('Could not remove your photo. Check your connection and try again.');
  await removeFiles(Buckets.photos, [path]).catch(() => {});
}
