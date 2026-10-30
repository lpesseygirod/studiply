import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { generateNoteHTML } from '../utils/pdf-template';
import { DOCX_MIME, docxFileName, pdfFileName } from '../utils/fileNames';
import type { Note, Session, Transcript } from '../types/database';
import type { PrintOptions, PrintResult, PrintTab } from '../editor/export/printPages';
import type { WordOptions } from '../editor/export/docxBuild';
import { drawRequests, photoRequests, pictureRequests, textWidthPx, type DrawRequest } from '../editor/export/docxPictures';
import type { DrawnPictures } from '../editor/bridges/export';
import { drawWordPictures } from './word-drawings';
import { loadWordPhotos } from './word-photos';

declare global {
  interface Window {
    /** The laptop's last print document (the PDF export), for the Chrome check (export.mjs). */
    studiplyPrint?: { title: string; html: string; pages: number };
    /** The laptop's last Word file (step 4.8b), for the Chrome check (docx.mjs). */
    studiplyDocx?: { title: string; fileName: string; blob: Blob; missing: number; reasons: string[] };
  }
}

// -------------------------------------------------------------------
// exportNoteToPDF
// Generates a PDF from a note and opens the native share sheet. The file
// is named after the note's title ("Tema 1.pdf"), which a rename keeps
// equal to the lecture's.
// -------------------------------------------------------------------
export async function exportNoteToPDF(params: {
  note: Note;
  session: Session;
  transcript?: Transcript | null;
  projectName?: string;
}): Promise<void> {
  const { note, session, transcript, projectName } = params;

  const html = generateNoteHTML(note, session, transcript, projectName);

  const fileName = pdfFileName(note.title);

  if (Platform.OS === 'web') {
    // "Save as PDF" proposes the printed document's title as the file name.
    await printInBrowser(html, fileName.replace(/\.pdf$/, ''));
    return;
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  await shareNamedPdf(uri, fileName, `Export: ${note.title}`);
}

// -------------------------------------------------------------------
// exportDocumentPdf (step 4.8a)
// A document's tabs as a PDF with its page setup, pages as the page view
// shows them (editor/export/printPages.ts). Laptop: the print dialog,
// where "Save as PDF" writes the file. iPhone: `build` is the PdfRenderer's
// (the editor bundle in a WebView); expo-print writes the PDF at the
// paper's size and the share sheet opens.
// -------------------------------------------------------------------
export async function exportDocumentPdf(params: {
  title: string;
  tabs: PrintTab[];
  options: Omit<PrintOptions, 'target'>;
  build?: (tabs: PrintTab[], options: PrintOptions, title: string) => Promise<PrintResult>;
}): Promise<void> {
  const { title, tabs, options, build } = params;
  const fileName = pdfFileName(title);

  if (Platform.OS === 'web') {
    const { buildPrint } = await import('../editor/export/printPages');
    const result = await buildPrint(tabs, { ...options, target: 'browser' }, title);
    window.studiplyPrint = { title, html: result.html, pages: result.pages };
    await printInBrowser(result.html, fileName.replace(/\.pdf$/, ''));
    return;
  }

  if (!build) throw new Error('Could not make the PDF.');
  const result = await build(tabs, { ...options, target: 'ios' }, title);
  const { uri } = await Print.printToFileAsync({
    html: result.html,
    width: result.width,
    height: result.height,
    margins: { left: 0, top: 0, right: 0, bottom: 0 },
    base64: false,
  });
  await shareNamedPdf(uri, fileName, `Export: ${title}`);
}

// -------------------------------------------------------------------
// exportDocumentWord (step 4.8b)
// A document's tabs as a .docx (editor/export/docxBuild.ts) with the page
// setup. Formulas and graphs go in as pictures the editor draws (laptop: in
// the page; iPhone: `draw` is the PdfRenderer's, the editor bundle in a
// WebView), photos as their files. Laptop: the file downloads; iPhone: it
// is written to the cache and the share sheet opens. Returns how many
// pictures couldn't be put in (a formula's LaTeX is there instead, a photo
// is left out).
// -------------------------------------------------------------------
export async function exportDocumentWord(params: {
  title: string;
  tabs: PrintTab[];
  options: Omit<WordOptions, 'title'>;
  draw?: (requests: DrawRequest[]) => Promise<DrawnPictures>;
}): Promise<{ missing: number }> {
  const { title, tabs, options, draw } = params;
  const fileName = docxFileName(title);
  // Loaded only now: the docx library is big.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildDocx } = require('../editor/export/docxBuild') as typeof import('../editor/export/docxBuild');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Packer } = require('docx') as typeof import('docx');
  const requests = pictureRequests(
    tabs.map((t) => t.content),
    textWidthPx(options.setup),
    options.language ?? null,
  );

  const drawn = await drawWordPictures(drawRequests(requests), draw);
  const photos = await loadWordPhotos(photoRequests(requests));
  const doc = buildDocx(tabs, { ...options, title }, [...drawn.pictures, ...photos.pictures]);
  const missing = drawn.failed.length + photos.failed.length;
  const reasons = [...(drawn.reasons ?? []), ...photos.failed.map(() => 'photo: not loaded')];
  if (__DEV__ && reasons.length) console.warn('[export] pictures left out:', reasons.join('; '));

  if (Platform.OS === 'web') {
    const blob = new Blob([await Packer.toArrayBuffer(doc)], { type: DOCX_MIME });
    window.studiplyDocx = { title, fileName, blob, missing, reasons };
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { missing };
  }

  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const named = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(named, await Packer.toBase64String(doc), { encoding: FileSystem.EncodingType.Base64 });
  try {
    await Sharing.shareAsync(named, { mimeType: DOCX_MIME, dialogTitle: `Export: ${title}`, UTI: 'org.openxmlformats.wordprocessingml.document' });
  } finally {
    await FileSystem.deleteAsync(named, { idempotent: true }).catch(() => {});
  }
  return { missing };
}

// -------------------------------------------------------------------
// shareNamedPdf
// expo-print names the file at random; the share sheet shows the title
// instead.
// -------------------------------------------------------------------
async function shareNamedPdf(uri: string, fileName: string, dialogTitle: string): Promise<void> {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }

  const named = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.deleteAsync(named, { idempotent: true });
  await FileSystem.moveAsync({ from: uri, to: named });
  try {
    await Sharing.shareAsync(named, {
      mimeType: 'application/pdf',
      dialogTitle,
      UTI: 'com.adobe.pdf',
    });
  } finally {
    await FileSystem.deleteAsync(named, { idempotent: true }).catch(() => {});
  }
}

// -------------------------------------------------------------------
// printInBrowser
// Browsers have no share sheet, and expo-print on web only prints the
// current page. The HTML goes into a hidden iframe and the print dialog
// opens, where "Save as PDF" makes the file. (An iframe, not a new
// window, so popup blockers don't stop it.) Photos and fonts load first,
// so the PDF never has an empty frame.
// -------------------------------------------------------------------
async function printInBrowser(html: string, title: string): Promise<void> {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    throw new Error('Could not open the print dialog.');
  }
  doc.open();
  doc.write(html);
  doc.close();
  doc.title = title;

  const loaded = (img: HTMLImageElement) =>
    img.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        });
  const ready = Promise.all([...Array.from(doc.images).map(loaded), doc.fonts?.ready.catch(() => undefined)]);
  await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 10000))]);

  const cleanUp = () => setTimeout(() => frame.remove(), 1000);
  win.addEventListener('afterprint', cleanUp, { once: true });
  setTimeout(() => {
    win.focus();
    win.print();
  }, 250);
}
