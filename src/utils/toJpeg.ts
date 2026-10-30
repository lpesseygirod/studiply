import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

import { flattenOnWhiteNative } from '../lib/pictureFlattener';
import { ALPHA_HEADER_BYTES, imageType, mayHaveAlpha } from './imageAlpha';

/** Longest side after conversion; enough for board photos sent to Claude later. */
const MAX_SIDE = 2048;

const bytesOf = (base64: string) => Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));

/**
 * A picture that can be transparent, drawn on white (step 4.8b) into a PNG in the cache; null for one
 * that can't be (a camera photo), or a file that can't be read here (then it is converted as it is).
 */
async function onWhite(uri: string): Promise<string | null> {
  let head: Uint8Array;
  try {
    head = bytesOf(await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position: 0, length: ALPHA_HEADER_BYTES }));
  } catch {
    return null;
  }
  if (!mayHaveAlpha(head)) return null;
  const type = imageType(head) ?? 'image/png';
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const flat = await flattenOnWhiteNative(`data:${type};base64,${base64}`);
  const out = `${FileSystem.cacheDirectory}on-white-${Date.now()}-${Math.round(Math.random() * 1e6)}.png`;
  await FileSystem.writeAsStringAsync(out, flat.replace(/^data:[^,]*,/, ''), { encoding: FileSystem.EncodingType.Base64 });
  return out;
}

// -------------------------------------------------------------------
// toJpeg
// Re-encodes any picked image (HEIC, PNG, WebP…) as JPEG, scaled down so
// its longest side is at most 2048 px. The photos bucket only accepts JPEG,
// because Claude can't read HEIC. A picture that can be transparent (a PNG
// logo, a GIF) is first drawn on white (in the editor bundle's WebView:
// React Native has no canvas), since a JPEG has no transparency and its
// transparent pixels would turn black (step 4.8b). Returns a new local URI.
// -------------------------------------------------------------------
export async function toJpeg(
  uri: string,
  size?: { width: number; height: number },
): Promise<{ uri: string; mimeType: 'image/jpeg' }> {
  const white = await onWhite(uri);
  try {
    const context = ImageManipulator.manipulate(white ?? uri);
    if (size && Math.max(size.width, size.height) > MAX_SIDE) {
      context.resize(size.width >= size.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
    }
    const image = await context.renderAsync();
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    return { uri: result.uri, mimeType: 'image/jpeg' };
  } finally {
    if (white) await FileSystem.deleteAsync(white, { idempotent: true }).catch(() => {});
  }
}
