/**
 * photoCache.ts
 * Copies of document photos on this iPhone, so a photo shown once
 * still shows offline: in the app's documents folder (doc-photos/<media id>.jpg),
 * kept until sign-out. The editor's WebView gets them as data URIs (it can't
 * read the app's files). The web build (photoCache.web.ts) keeps nothing.
 */

import * as FileSystem from 'expo-file-system/legacy';

const ROOT = `${FileSystem.documentDirectory}doc-photos`;

const fileOf = (mediaId: string) => `${ROOT}/${mediaId}.jpg`;

async function exists(uri: string): Promise<boolean> {
  return (await FileSystem.getInfoAsync(uri).catch(() => ({ exists: false }))).exists;
}

/** This iPhone's copy of the photo, if it has one. */
export async function cachedPhoto(mediaId: string): Promise<string | null> {
  const uri = fileOf(mediaId);
  return (await exists(uri)) ? uri : null;
}

/** Keeps a copy of a photo already on this iPhone (one just uploaded). */
export async function keepPhoto(mediaId: string, from: string): Promise<void> {
  await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true }).catch(() => {});
  await FileSystem.copyAsync({ from, to: fileOf(mediaId) }).catch(() => {});
}

/** Downloads a photo into the copies; null if that failed. */
export async function downloadPhoto(mediaId: string, url: string): Promise<string | null> {
  await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true }).catch(() => {});
  const target = fileOf(mediaId);
  try {
    const result = await FileSystem.downloadAsync(url, target);
    if (result.status === 200) return target;
  } catch {
    // Below: nothing half-written stays.
  }
  await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
  return null;
}

/** A local JPEG as a data URI (what the WebView can show). */
export async function photoDataUri(uri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:image/jpeg;base64,${base64}`;
}

/** Sign-out: the copies belong to the student who left. */
export async function removeAllCachedPhotos(): Promise<void> {
  await FileSystem.deleteAsync(ROOT, { idempotent: true }).catch(() => {});
}
