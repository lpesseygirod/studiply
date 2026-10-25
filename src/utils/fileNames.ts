/**
 * fileNames.ts
 * Names of photos, PDFs and exported notes. Pure, so it is unit tested.
 *
 * A photo or PDF keeps its real extension when renamed: the student edits
 * the name, the extension stays (taken from the stored file, then its MIME
 * type, then its kind).
 */

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

/** The file's real extension, lower case, without the dot. */
export function extensionFor(file: {
  storagePath?: string | null;
  mimeType?: string | null;
  kind: 'photo' | 'pdf';
}): string {
  const fromPath = file.storagePath?.match(/\.([A-Za-z0-9]{2,5})$/)?.[1];
  if (fromPath) return fromPath.toLowerCase() === 'jpeg' ? 'jpg' : fromPath.toLowerCase();
  const fromMime = file.mimeType ? MIME_EXTENSIONS[file.mimeType.toLowerCase()] : undefined;
  if (fromMime) return fromMime;
  return file.kind === 'pdf' ? 'pdf' : 'jpg';
}

/** "Tema 1.pdf" → "Tema 1" (only a short trailing extension is removed). */
export function nameWithoutExtension(name: string): string {
  return name.replace(/\.[A-Za-z0-9]{2,5}$/, '');
}

/** The name with the extension, not doubled when the student typed it too. */
export function withExtension(name: string, ext: string): string {
  const base = name.trim();
  return base.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? base : `${base}.${ext}`;
}

const MAX_PDF_NAME = 100;

/**
 * A file name for an exported note: characters that file systems refuse
 * become spaces, at most 100 characters, "Studiply notes" when nothing is left.
 */
export function pdfFileName(title: string): string {
  const cleaned = title
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PDF_NAME)
    .trim();
  return `${cleaned || 'Studiply notes'}.pdf`;
}
