/**
 * docx-import.service.ts
 * A Word file (.docx) becomes a Studiply document: uploaded on
 * the laptop (+ New → Upload, or dropped from the Finder onto a course or
 * folder) or picked from Files on the iPhone, in the course or folder that
 * is open, titled after the file. It isn't kept as a file the way a PDF is.
 *
 * 1. mammoth reads the .docx into HTML, with a style map that keeps Word's
 *    Title, Subtitle, quotes, underline, highlights and page breaks.
 * 2. `toDoc` turns the HTML into the document through the paste rules and
 *    the editor's schema (export/wordImport.ts): in the laptop's page, in
 *    the export WebView on the iPhone.
 * 3. The document is created with its text; each picture is then added as a
 *    photo of the document (doc-photo.service, queued on the iPhone, so it
 *    works offline) and the document saved with them. A picture that can be
 *    transparent is drawn on white there, as every photo is (utils/toJpeg).
 * What the file has that Studiply doesn't keep (headers and footers,
 * comments, tracked changes, text boxes, equations, colours) is found in
 * the file itself and said once, in a note after the import.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { JSONContent } from '@tiptap/core';

import { newBlockId } from '../editor/schema/blockMeta';
import { mediaSrc } from '../editor/media/photoSource';
import type { DocJSON } from '../editor/types';
import { DOCX_MIME, nameWithoutExtension } from '../utils/fileNames';
import { createDocument, saveDocument } from './document.service';
import { addDocPhoto } from './doc-photo.service';
import type { PickedFile, UploadPlace } from './library-upload.service';

/** As large as a PDF may be. */
export const MAX_DOCX_BYTES = 50 * 1024 * 1024;
/** Where a picture is until it is a photo of the document (export/wordImport.ts's IMPORT_PICTURE). */
const PICTURE = 'studiply-import:';

/** A Word file Studiply reads (.docx). */
export function isDocx(file: Pick<PickedFile, 'name' | 'mimeType'>): boolean {
  const mime = (file.mimeType ?? '').toLowerCase();
  return mime === DOCX_MIME || /\.docx$/i.test(file.name ?? '');
}

/** An old Word file (.doc), which can't be read. */
export const isOldWord = (file: Pick<PickedFile, 'name' | 'mimeType'>) => (file.mimeType ?? '').toLowerCase() === 'application/msword' || /\.doc$/i.test(file.name ?? '');

/**
 * mammoth's style map: Word's Title and Subtitle as the paste rules know
 * them (p.title, p.subtitle), quotes as quotes, underline kept, highlights
 * with their colour (wordImport.ts), page breaks as a mark for the paste rules.
 */
const STYLE_MAP = [
  "p[style-name='Title'] => p.title:fresh",
  "p[style-name='Subtitle'] => p.subtitle:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  'u => u',
  "br[type='page'] => hr.studiply-page-break",
  ...['yellow', 'green', 'cyan', 'magenta', 'blue', 'red', 'darkBlue', 'darkCyan', 'darkGreen', 'darkMagenta', 'darkRed', 'darkYellow', 'darkGray', 'lightGray'].map(
    (color) => `highlight[color='${color}'] => mark.hl-${color.toLowerCase()}`,
  ),
];

/** What the student is told: the file's things Studiply doesn't keep. */
export function notKeptIn(files: Record<string, string>): string[] {
  const body = files['word/document.xml'] ?? '';
  const out: string[] = [];
  const headerText = Object.entries(files)
    .filter(([name]) => /^word\/(header|footer)\d*\.xml$/.test(name))
    .flatMap(([, xml]) => Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g), (m) => m[1]))
    .join('')
    // A page number alone is what the Word export writes too: not worth a note.
    .replace(/\d+/g, '')
    .trim();
  if (headerText) out.push('headers and footers');
  const comments = (files['word/comments.xml'] ?? '').match(/<w:comment\s/g)?.length ?? 0;
  if (comments) out.push(comments === 1 ? '1 comment' : `${comments} comments`);
  if (/<w:(ins|del)\s[^>]*w:author/.test(body)) out.push('tracked changes (the text is as if they were accepted)');
  if (/<w:txbxContent/.test(body)) out.push('text boxes (their text is kept as ordinary lines)');
  if (/<m:oMath/.test(body)) out.push('equations');
  const colors = Array.from(body.matchAll(/<w:color\s[^>]*w:val="([0-9A-Fa-f]{6}|[a-z]+)"/g), (m) => m[1].toUpperCase()).filter((c) => c !== 'AUTO' && c !== '000000');
  if (colors.length) out.push('text colours');
  const fills = Array.from(body.matchAll(/<w:shd\s[^>]*w:fill="([0-9A-Fa-f]{6})"/g), (m) => m[1].toUpperCase()).filter((c) => c !== 'FFFFFF');
  if (fills.length) out.push('background colours (cell colours, and highlights made in Google Docs)');
  return out;
}

/** The note after Word imports: what each file had that isn't kept, said once (null: nothing to say). */
export function importNote(imports: { title: string; notKept: string[] }[]): { title: string; message: string } | null {
  const shown = imports.filter((n) => n.notKept.length > 0);
  if (!shown.length) return null;
  const list = (items: string[]) => items.map((i) => `• ${i}`).join('\n');
  if (shown.length === 1) {
    return { title: 'Imported from Word', message: `“${shown[0].title}” is a document now. Not kept from the Word file:\n${list(shown[0].notKept)}` };
  }
  return { title: 'Imported from Word', message: shown.map((n) => `“${n.title}”, not kept:\n${list(n.notKept)}`).join('\n\n') };
}

/** The parts of the .docx that say what it has (its text, headers, footers and comments). */
async function partsOf(bytes: ArrayBuffer): Promise<Record<string, string>> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const JSZip = require('jszip') as typeof import('jszip');
  const zip = await JSZip.loadAsync(bytes);
  const out: Record<string, string> = {};
  for (const name of Object.keys(zip.files)) {
    if (/^word\/(document|comments|header\d*|footer\d*)\.xml$/.test(name)) out[name] = await zip.files[name].async('string');
  }
  return out;
}

/** The file's bytes: a blob:/data: link on the laptop, a file on the iPhone. */
async function bytesOf(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

interface WordPicture {
  contentType: string;
  base64: string;
}

/** Word's pictures Studiply can show (Windows' EMF / WMF drawings and TIFFs can't be). */
const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];

/** The .docx as HTML (mammoth), its pictures taken out and numbered. */
export async function readDocx(bytes: ArrayBuffer): Promise<{ html: string; pictures: WordPicture[] }> {
  // Loaded only now: mammoth is big.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require('mammoth') as typeof import('mammoth');
  const pictures: WordPicture[] = [];
  const result = await mammoth.convertToHtml(
    { arrayBuffer: bytes },
    {
      styleMap: STYLE_MAP,
      convertImage: mammoth.images.imgElement(async (image) => {
        const n = pictures.length;
        pictures.push({ contentType: (image.contentType ?? '').toLowerCase(), base64: await image.readAsBase64String() });
        return { src: `${PICTURE}${n}` };
      }),
    },
  );
  return { html: result.value, pictures };
}

/** Every top-level block the student's, dated now (an import is the student's own text). */
export function asStudentBlocks(doc: DocJSON, now: number): DocJSON {
  const content = (doc.content ?? []).map((block) => ({ ...block, attrs: { ...block.attrs, blockId: newBlockId(), origin: 'student', editedAt: now } }));
  return { ...doc, content: content.length ? content : [{ type: 'paragraph', attrs: { blockId: newBlockId(), origin: 'student', editedAt: now } }] };
}

const pictureIndex = (node: JSONContent): number | null => {
  const src = node.attrs?.src;
  if ((node.type !== 'image' && node.type !== 'inlineImage') || typeof src !== 'string' || !src.startsWith(PICTURE)) return null;
  const n = Number(src.slice(PICTURE.length));
  return Number.isInteger(n) ? n : null;
};

/** The document with each picture's placeholder replaced (`srcOf` gives its src, or null to leave it out). */
export function withPictures(doc: DocJSON, srcOf: (n: number) => string | null): DocJSON {
  const walk = (node: JSONContent): JSONContent | null => {
    const n = pictureIndex(node);
    if (n !== null) {
      const src = srcOf(n);
      return src ? { ...node, attrs: { ...node.attrs, src } } : null;
    }
    if (!node.content) return node;
    return { ...node, content: node.content.map(walk).filter((c): c is JSONContent => c !== null) };
  };
  return walk(doc) as DocJSON;
}

/** The numbers of the pictures the document shows. */
export function picturesIn(doc: DocJSON): number[] {
  const found: number[] = [];
  const walk = (node: JSONContent) => {
    const n = pictureIndex(node);
    if (n !== null) found.push(n);
    node.content?.forEach(walk);
  };
  walk(doc);
  return found;
}

/** A picture as a file addDocPhoto can take: a data URI on the laptop, a file in the cache on the iPhone. */
async function pictureFile(picture: WordPicture, n: number): Promise<PickedFile> {
  const ext = picture.contentType.split('/')[1] ?? 'png';
  const name = `Picture ${n + 1}.${ext === 'jpeg' ? 'jpg' : ext}`;
  if (Platform.OS === 'web') return { uri: `data:${picture.contentType};base64,${picture.base64}`, name, mimeType: picture.contentType, sizeBytes: null };
  const uri = `${FileSystem.cacheDirectory}word-import-${Date.now()}-${n}.${ext}`;
  await FileSystem.writeAsStringAsync(uri, picture.base64, { encoding: FileSystem.EncodingType.Base64 });
  return { uri, name, mimeType: picture.contentType, sizeBytes: null };
}

export interface DocxImport {
  fileId: string;
  title: string;
  /** What the file had that isn't kept (empty: everything was). */
  notKept: string[];
}

/** What needs a browser (the laptop's page, the iPhone's export WebView). */
export interface WordPage {
  /** mammoth's HTML as a document (export/wordImport.ts). */
  toDoc: (html: string) => Promise<DocJSON>;
}

/**
 * Imports a .docx into `place` as a new document; returns it with what wasn't kept.
 * Throws a message the student can act on.
 */
export async function importDocx(place: UploadPlace, picked: PickedFile, page: WordPage, now = Date.now()): Promise<DocxImport> {
  if ((picked.sizeBytes ?? 0) > MAX_DOCX_BYTES) throw new Error('Word files can be at most 50 MB.');
  let read: Awaited<ReturnType<typeof readDocx>>;
  let parts: Record<string, string>;
  try {
    const bytes = await bytesOf(picked.uri);
    [read, parts] = await Promise.all([readDocx(bytes), partsOf(bytes)]);
  } catch {
    throw new Error("This Word file can't be read. Open it in Word and save it again as .docx.");
  }
  const notKept = notKeptIn(parts);
  const doc = asStudentBlocks(await page.toDoc(read.html), now);
  const title = nameWithoutExtension((picked.name ?? '').trim()).trim() || 'Word document';

  // The text first (a picture that can't be added never costs the document); then the pictures.
  const textOnly = withPictures(doc, () => null);
  const fileId = await createDocument({ courseId: place.courseId, folderId: place.folderId, title, content: textOnly });
  const used = [...new Set(picturesIn(doc))];
  if (used.length) {
    const media = new Map<number, string>();
    let lost = 0;
    for (const n of used) {
      const picture = read.pictures[n];
      if (!picture || !PICTURE_TYPES.includes(picture.contentType)) {
        lost += 1;
        continue;
      }
      let file: PickedFile | null = null;
      try {
        file = await pictureFile(picture, n);
        media.set(n, mediaSrc(await addDocPhoto(fileId, file)));
      } catch {
        lost += 1;
      } finally {
        // The iPhone's copy in the cache (addDocPhoto keeps its own JPEG).
        if (file && Platform.OS !== 'web') await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {});
      }
    }
    if (media.size) await saveDocument({ fileId, tab: 'notes', base: textOnly, next: withPictures(doc, (n) => media.get(n) ?? null) });
    if (lost) notKept.push(lost === 1 ? '1 picture Studiply can’t show' : `${lost} pictures Studiply can’t show`);
  }
  return { fileId, title, notKept };
}
