/**
 * pendingFiles.ts
 * Recordings, photos and PDFs waiting to be uploaded by the sync queue,
 * kept in the app's documents folder (pending-uploads/<lectureId>/). The
 * recorder and the pickers write to the cache folder, which iOS may empty
 * at any time, so files are moved here first and deleted once uploaded.
 * The web build (pendingFiles.web.ts) uploads straight away instead.
 */

import * as FileSystem from 'expo-file-system/legacy';

const ROOT = `${FileSystem.documentDirectory}pending-uploads`;

/** Moves (or copies, `copy`) a file into the lecture's pending folder; returns its new URI. */
export async function keepPendingFile(lectureId: string, name: string, uri: string, copy = false): Promise<string> {
  const dir = `${ROOT}/${lectureId}`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const target = `${dir}/${name}`;
  if (target === uri) return uri;
  await FileSystem.deleteAsync(target, { idempotent: true });
  if (copy) await FileSystem.copyAsync({ from: uri, to: target });
  else await FileSystem.moveAsync({ from: uri, to: target });
  return target;
}

export async function pendingFileExists(uri: string): Promise<boolean> {
  return (await FileSystem.getInfoAsync(uri).catch(() => ({ exists: false }))).exists;
}

export async function removePendingFile(uri: string): Promise<void> {
  if (!uri.startsWith(ROOT)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

/** Everything still waiting (sign-out, "Delete all data"). */
export async function removeAllPendingFiles(): Promise<void> {
  await FileSystem.deleteAsync(ROOT, { idempotent: true }).catch(() => {});
}
