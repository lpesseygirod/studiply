/**
 * HEIC / HEIF photos (Lea, 6 Nov: an iPhone photo on the laptop). Chrome can't draw them, so the web's
 * toJpeg decodes them itself (toJpeg.web.ts). Recognised by their type, their name, or their bytes: an
 * ISO-BMFF `ftyp` box at the start whose brands are HEIF's. AVIF (also HEIF-based) is left out: the
 * browser draws it.
 */

const HEIF_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);

export function isHeifName(name: string | null | undefined): boolean {
  return /\.(heic|heif)$/i.test(name ?? '');
}

export function isHeifType(type: string | null | undefined): boolean {
  return HEIF_TYPES.includes((type ?? '').toLowerCase());
}

const brandAt = (b: Uint8Array, i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

/** The file's first bytes: an `ftyp` box whose major or a compatible brand is HEIF's (and none says AVIF first). */
export function isHeifBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 16 || brandAt(bytes, 4) !== 'ftyp') return false;
  const size = Math.min(bytes.length, ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0);
  const major = brandAt(bytes, 8);
  if (major === 'avif' || major === 'avis') return false;
  if (HEIF_BRANDS.has(major)) return true;
  // Compatible brands follow the major brand and its version (4 bytes).
  for (let i = 16; i + 4 <= size; i += 4) if (HEIF_BRANDS.has(brandAt(bytes, i))) return true;
  return false;
}

/** A picked, dropped or pasted file that goes as a photo (a HEIC may come with no type on some systems). */
export function isImageFile(file: { type: string; name: string }): boolean {
  return file.type.startsWith('image/') || isHeifName(file.name);
}
