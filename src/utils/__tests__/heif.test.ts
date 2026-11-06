// Lea, 6 Nov: a HEIC on the laptop is recognised (by its type, its name or its bytes) so the web's
// toJpeg decodes it itself; AVIF and ordinary images are left to the browser.
import { isHeifBytes, isHeifName, isHeifType, isImageFile } from '../heif';

/** The start of an ISO-BMFF file: an `ftyp` box with a major brand, version 0 and compatible brands. */
function ftyp(major: string, compatible: string[] = []): Uint8Array {
  const brands = [major, '\0\0\0\0', ...compatible].join('');
  const size = 8 + brands.length;
  const bytes = new Uint8Array(size + 8);
  new DataView(bytes.buffer).setUint32(0, size);
  for (const [i, ch] of [...`ftyp${brands}`].entries()) bytes[4 + i] = ch.charCodeAt(0);
  return bytes;
}

describe('HEIC / HEIF', () => {
  it('by its bytes: an iPhone photo (heic), a HEIF still (mif1), a brand among the compatible ones', () => {
    expect(isHeifBytes(ftyp('heic', ['mif1', 'heic']))).toBe(true);
    expect(isHeifBytes(ftyp('mif1', ['heic']))).toBe(true);
    expect(isHeifBytes(ftyp('heix'))).toBe(true);
    expect(isHeifBytes(ftyp('isom', ['mif1']))).toBe(true);
  });

  it('not: AVIF (the browser draws it), an MP4, a JPEG, too short', () => {
    expect(isHeifBytes(ftyp('avif', ['mif1']))).toBe(false);
    expect(isHeifBytes(ftyp('isom', ['mp41']))).toBe(false);
    expect(isHeifBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]))).toBe(false);
    expect(isHeifBytes(new Uint8Array(8))).toBe(false);
  });

  it('by its type or its name', () => {
    expect([isHeifType('image/heic'), isHeifType('IMAGE/HEIF'), isHeifType('image/jpeg'), isHeifType('')]).toEqual([true, true, false, false]);
    expect([isHeifName('IMG_0412.HEIC'), isHeifName('foto.heif'), isHeifName('foto.jpg'), isHeifName(null)]).toEqual([true, true, false, false]);
  });

  it('a file taken as a photo: any image type, or a HEIC that came without one', () => {
    expect(isImageFile({ type: 'image/png', name: 'Captura.png' })).toBe(true);
    expect(isImageFile({ type: '', name: 'IMG_0412.HEIC' })).toBe(true);
    expect(isImageFile({ type: 'application/pdf', name: 'Tema 1.pdf' })).toBe(false);
  });
});
