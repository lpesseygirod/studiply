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
