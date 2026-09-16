/**
 * storage.service.ts
 * On-device file store. Replaces what used to be a Supabase Storage bucket.
 *
 * Recordings and picked files arrive as URIs in temporary locations — the
 * recorder's cache directory, or an OS-owned picker cache. Those can be
 * cleared by the system at any time, which would leave a session pointing at
 * a file that no longer exists. "Uploading" now means copying the file into
 * the app's own document directory, which persists until we delete it.
 *
 * Layout mirrors the old bucket keys so existing storage_path values still
 * read correctly:
 *
 *   {documentDirectory}source-files/{userId}/{sessionId}/{filename}
 */

import * as FileSystem from 'expo-file-system/legacy';
import { markUploaded as dbMarkUploaded } from './source-file.service';

const ROOT = `${FileSystem.documentDirectory}source-files`;

/** Absolute on-device URI for a storage path. */
function uriFor(storagePath: string): string {
  return `${ROOT}/${storagePath}`;
}

/** Creates a directory (and parents) if it isn't already there. */
async function ensureDir(dir: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

// -------------------------------------------------------------------
// uploadFile — copy a local file into the app's managed store
// storagePath: e.g. "{userId}/{sessionId}/audio.m4a"
// -------------------------------------------------------------------
export async function uploadFile(params: {
  localUri: string;
  storagePath: string;
  mimeType: string;
}): Promise<string> {
  const destination = uriFor(params.storagePath);
  const dir = destination.slice(0, destination.lastIndexOf('/'));

  await ensureDir(dir);

  // Copying to an existing path throws, so clear it first — this keeps the
  // upsert behaviour callers already relied on.
  const existing = await FileSystem.getInfoAsync(destination);
  if (existing.exists) {
    await FileSystem.deleteAsync(destination, { idempotent: true });
  }

  await FileSystem.copyAsync({ from: params.localUri, to: destination });
  return params.storagePath;
}

// -------------------------------------------------------------------
// uploadSourceFile — store a source file and record it in the database
// -------------------------------------------------------------------
export async function uploadSourceFile(params: {
  sourceFileId: string;
  userId: string;
  sessionId: string;
  localUri: string;
  filename: string;
  mimeType: string;
}): Promise<string> {
  const storagePath = `${params.userId}/${params.sessionId}/${params.filename}`;

  await uploadFile({
    localUri: params.localUri,
    storagePath,
    mimeType: params.mimeType,
  });

  await dbMarkUploaded(params.sourceFileId, storagePath);
  return storagePath;
}

// -------------------------------------------------------------------
// getSignedUrl — resolve a storage path to a readable URI
// -------------------------------------------------------------------
// Kept for call-site compatibility. Local files need no signing or expiry,
// so `expiresInSeconds` is accepted and ignored.
export async function getSignedUrl(
  storagePath: string,
  _expiresInSeconds = 3600,
): Promise<string> {
  const uri = uriFor(storagePath);
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error('That file is no longer on this device.');
  }
  return uri;
}

// -------------------------------------------------------------------
// deleteStorageFile — remove a stored file
// -------------------------------------------------------------------
export async function deleteStorageFile(storagePath: string): Promise<void> {
  await FileSystem.deleteAsync(uriFor(storagePath), { idempotent: true });
}

// -------------------------------------------------------------------
// deleteUserStorage — remove every stored file belonging to one profile
// Used by "delete all my data". Other profiles on the device are untouched.
// -------------------------------------------------------------------
export async function deleteUserStorage(userId: string): Promise<void> {
  await FileSystem.deleteAsync(uriFor(userId), { idempotent: true });
}
