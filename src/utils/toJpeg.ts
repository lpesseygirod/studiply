import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Longest side after conversion; enough for board photos sent to Claude later. */
const MAX_SIDE = 2048;

// -------------------------------------------------------------------
// toJpeg
// Re-encodes any picked image (HEIC, PNG, WebP…) as JPEG, scaled down so
// its longest side is at most 2048 px. The photos bucket only accepts JPEG,
// because Claude can't read HEIC. Returns a new local URI (blob:/data: on web).
// -------------------------------------------------------------------
export async function toJpeg(
  uri: string,
  size?: { width: number; height: number },
): Promise<{ uri: string; mimeType: 'image/jpeg' }> {
  const context = ImageManipulator.manipulate(uri);
  if (size && Math.max(size.width, size.height) > MAX_SIDE) {
    context.resize(size.width >= size.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { uri: result.uri, mimeType: 'image/jpeg' };
}
