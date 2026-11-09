/**
 * save.ts
 * The iPhone: each part of the export is written to the app's cache folder and opened in the share
 * sheet (Save to Files, AirDrop…); the copy is removed once the sheet closes. Written as bytes
 * (expo-file-system's File), never as a base64 string twice its size.
 */

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export const SAVE_OUTPUT = 'uint8array' as const;

export async function saveExportPart(name: string, data: Blob | Uint8Array, part: { index: number; total: number }): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/zip',
      UTI: 'public.zip-archive',
      dialogTitle: part.total > 1 ? `Your Studiply data (part ${part.index} of ${part.total})` : 'Your Studiply data',
    });
  } finally {
    try {
      file.delete();
    } catch {
      // Already gone.
    }
  }
}
