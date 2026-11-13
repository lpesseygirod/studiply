// Which pictures can be transparent, from their first bytes:
// those are drawn on white before they become JPEG photos.
import { imageType, mayHaveAlpha } from '../imageAlpha';

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (type: string, length: number) => [...be32(length), ...ascii(type), ...new Array(length).fill(0), 0, 0, 0, 0];
/** A PNG's signature, IHDR (with its colour type) and the chunks named. */
function png(colourType: number, ...chunks: [string, number][]): Uint8Array {
  const ihdr = [...be32(13), ...ascii('IHDR'), ...be32(4), ...be32(4), 8, colourType, 0, 0, 0, 0, 0, 0, 0];
  return Uint8Array.from([0x89, ...ascii('PNG'), 13, 10, 26, 10, ...ihdr, ...chunks.flatMap(([t, n]) => chunk(t, n))]);
}
const webp = (kind: string, flags = 0) => Uint8Array.from([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii(kind), 0, 0, 0, 0, flags, 0, 0, 0]);

describe('mayHaveAlpha', () => {
  it('a PNG with an alpha channel (RGBA, grey and alpha) or a tRNS chunk; not an opaque one', () => {
    expect(mayHaveAlpha(png(6, ['IDAT', 10]))).toBe(true);
    expect(mayHaveAlpha(png(4, ['IDAT', 10]))).toBe(true);
    expect(mayHaveAlpha(png(3, ['PLTE', 12], ['tRNS', 2], ['IDAT', 10]))).toBe(true);
    expect(mayHaveAlpha(png(2, ['tEXt', 20], ['IDAT', 10]))).toBe(false);
    expect(mayHaveAlpha(png(3, ['PLTE', 12], ['IDAT', 10]))).toBe(false);
  });

  it('a PNG whose read part ends before its pixels: maybe (drawn on white to be safe)', () => {
    expect(mayHaveAlpha(png(2, ['iCCP', 3000]).slice(0, 100))).toBe(true);
  });

  it('GIFs yes; WebP with alpha or lossless yes, lossy no; 32-bit BMP yes; JPEG and HEIC no', () => {
    expect(mayHaveAlpha(Uint8Array.from(ascii('GIF89a......')))).toBe(true);
    expect(mayHaveAlpha(webp('VP8X', 0x10))).toBe(true);
    expect(mayHaveAlpha(webp('VP8X', 0))).toBe(false);
    expect(mayHaveAlpha(webp('VP8L'))).toBe(true);
    expect(mayHaveAlpha(webp('VP8 '))).toBe(false);
    const bmp = (bits: number) => Uint8Array.from([...ascii('BM'), ...new Array(26).fill(0), bits, 0]);
    expect(mayHaveAlpha(bmp(32))).toBe(true);
    expect(mayHaveAlpha(bmp(24))).toBe(false);
    expect(mayHaveAlpha(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...ascii('JFIF')]))).toBe(false);
    expect(mayHaveAlpha(Uint8Array.from([0, 0, 0, 24, ...ascii('ftypheic')]))).toBe(false);
  });

  it('imageType names the file for its data URI', () => {
    expect(imageType(png(6))).toBe('image/png');
    expect(imageType(Uint8Array.from(ascii('GIF89a')))).toBe('image/gif');
    expect(imageType(webp('VP8L'))).toBe('image/webp');
    expect(imageType(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
    expect(imageType(Uint8Array.from([1, 2, 3, 4]))).toBeNull();
  });
});
