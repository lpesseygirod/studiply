import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { generateNoteHTML } from '../utils/pdf-template';
import { pdfFileName } from '../utils/fileNames';
import type { Note, Session, Transcript } from '../types/database';

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
    printInBrowser(html, fileName.replace(/\.pdf$/, ''));
    return;
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }

  // expo-print names the file at random; the share sheet shows the title instead.
  const named = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.deleteAsync(named, { idempotent: true });
  await FileSystem.moveAsync({ from: uri, to: named });
  try {
    await Sharing.shareAsync(named, {
      mimeType: 'application/pdf',
      dialogTitle: `Export: ${note.title}`,
      UTI: 'com.adobe.pdf',
    });
  } finally {
    await FileSystem.deleteAsync(named, { idempotent: true }).catch(() => {});
  }
}

// -------------------------------------------------------------------
// printInBrowser
// Browsers have no share sheet, and expo-print on web only prints the
// current page. The note's HTML goes into a hidden iframe and the print
// dialog opens, where "Save as PDF" makes the file. (An iframe, not a new
// window, so popup blockers don't stop it.)
// -------------------------------------------------------------------
function printInBrowser(html: string, title: string): void {
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

  const cleanUp = () => setTimeout(() => frame.remove(), 1000);
  win.addEventListener('afterprint', cleanUp, { once: true });
  setTimeout(() => {
    win.focus();
    win.print();
  }, 250);
}
