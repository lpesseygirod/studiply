import { extensionFor, nameWithoutExtension, pdfFileName, withExtension } from '../fileNames';

describe('extensionFor (the real file decides)', () => {
  it('takes the stored file name first', () => {
    expect(extensionFor({ storagePath: 'u/l/m.png', mimeType: 'image/jpeg', kind: 'photo' })).toBe('png');
    expect(extensionFor({ storagePath: 'u/l/m.JPEG', kind: 'photo' })).toBe('jpg');
    expect(extensionFor({ storagePath: 'u/l/m.pdf', kind: 'pdf' })).toBe('pdf');
  });

  it('then the MIME type, then the kind', () => {
    expect(extensionFor({ storagePath: null, mimeType: 'image/heic', kind: 'photo' })).toBe('heic');
    expect(extensionFor({ storagePath: 'u/l/noext', mimeType: 'image/png', kind: 'photo' })).toBe('png');
    expect(extensionFor({ kind: 'photo' })).toBe('jpg');
    expect(extensionFor({ kind: 'pdf' })).toBe('pdf');
  });
});

describe('names', () => {
  it('removes only a trailing extension', () => {
    expect(nameWithoutExtension('Tema 1.pdf')).toBe('Tema 1');
    expect(nameWithoutExtension('v2.1 notes')).toBe('v2.1 notes');
    expect(nameWithoutExtension('Photo 2')).toBe('Photo 2');
  });

  it('adds the extension once', () => {
    expect(withExtension('Tema 2', 'pdf')).toBe('Tema 2.pdf');
    expect(withExtension('Tema 2.PDF', 'pdf')).toBe('Tema 2.PDF');
    expect(withExtension(' Board ', 'png')).toBe('Board.png');
  });
});

describe('pdfFileName', () => {
  it('replaces characters file systems refuse', () => {
    expect(pdfFileName('Macro: Tema 1/2')).toBe('Macro Tema 1 2.pdf');
    expect(pdfFileName('a*b?"c"<d>|e\\f')).toBe('a b c d e f.pdf');
  });

  it('falls back when nothing is left, and keeps at most 100 characters', () => {
    expect(pdfFileName('')).toBe('Studiply notes.pdf');
    expect(pdfFileName(' / // ')).toBe('Studiply notes.pdf');
    expect(pdfFileName('x'.repeat(150))).toBe(`${'x'.repeat(100)}.pdf`);
  });
});
