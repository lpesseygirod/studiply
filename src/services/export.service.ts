import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { generateNoteHTML } from '../utils/pdf-template';
import type { Note, Session, Transcript } from '../types/database';

// -------------------------------------------------------------------
// exportNoteToPDF
// Generates a PDF from a note and opens the native share sheet.
// -------------------------------------------------------------------
export async function exportNoteToPDF(params: {
  note: Note;
  session: Session;
  transcript?: Transcript | null;
  projectName?: string;
}): Promise<void> {
  const { note, session, transcript, projectName } = params;

  const html = generateNoteHTML(note, session, transcript, projectName);

  if (Platform.OS === 'web') {
    printInBrowser(html, note.title);
    return;
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Export: ${note.title}`,
    UTI: 'com.adobe.pdf',
  });
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
