/**
 * imageAlpha.ts
 * Whether a picture can have transparent pixels, read from its first bytes.
 * Photos are kept as JPEGs, which have no transparency: a
 * transparent pixel saved as JPEG turns black, so such a picture is drawn on
 * white first (toJpeg). Camera photos (JPEG, HEIC) never are, and skip that.
 * Pure, so it is unit tested.
 */

/** How many of the file's first bytes are read: enough for a PNG's chunks before its pixels. */
export const ALPHA_HEADER_BYTES = 64 * 1024;

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.slice(at, at + n));
const u32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

/**
 * True when the picture may have transparent pixels: a PNG with an alpha channel (colour types 4
 * and 6) or a transparency chunk (tRNS), any GIF, a WebP with alpha (or lossless, which may), a
 * 32-bit BMP. False for JPEG, HEIC and anything else.
 */
export function mayHaveAlpha(bytes: Uint8Array): boolean {
  if (bytes.length >= 26 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') {
    const colourType = bytes[25];
    if (colourType === 4 || colourType === 6) return true;
    // The chunks before the pixels (IDAT): a tRNS makes a colour or palette transparent.
    for (let at = 8; at + 8 <= bytes.length; ) {
      const length = u32(bytes, at);
      const type = ascii(bytes, at + 4, 4);
      if (type === 'tRNS') return true;
      if (type === 'IDAT' || type === 'IEND') return false;
      at += 12 + length;
    }
    // The header read ends before the pixels: it could still come.
    return true;
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'GIF8') return true;
  if (bytes.length >= 16 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === 'VP8X') return bytes.length > 20 && (bytes[20] & 0x10) !== 0;
    return chunk === 'VP8L';
  }
  if (bytes.length >= 30 && ascii(bytes, 0, 2) === 'BM') return (bytes[28] | (bytes[29] << 8)) === 32;
  return false;
}

/** The picture's type from its first bytes (for a data URI), or null. */
export function imageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return 'image/png';
  if (ascii(bytes, 0, 4) === 'GIF8') return 'image/gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(bytes, 0, 2) === 'BM') return 'image/bmp';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  return null;
}
