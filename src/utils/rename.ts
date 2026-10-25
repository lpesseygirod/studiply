import { promptText, showAlert } from '../components/dialogs/dialogs';
import { RenameIncompleteError, renameSession } from '../services/session.service';
import {
  editableName,
  fileExtension,
  renameLibraryFile,
  renameSourceFile,
  type LibraryFile,
} from '../services/source-file.service';
import { nameWithoutExtension } from './fileNames';
import type { Session, SourceFile } from '../types/database';
import { errorMessage } from './errors';

/**
 * The Rename… menu items for lectures, photos and PDFs: the shared prompt
 * (native on iPhone; on the web Enter saves and Esc cancels), the rename,
 * and the error. Each resolves with the renamed item, or null when the
 * student cancelled or it failed (the error has then been shown).
 */

function showRenameError(err: unknown, fallback: string): void {
  if (err instanceof RenameIncompleteError) {
    showAlert('Rename not complete', err.message);
    return;
  }
  const own = err instanceof Error && /^(Enter a name|Use at most|This file is still uploading)/.test(err.message);
  showAlert('Error', own ? (err as Error).message : errorMessage(err, fallback));
}

export async function promptRenameLecture(session: Pick<Session, 'id' | 'title'>): Promise<Session | null> {
  const title = await promptText('Rename Lecture', { defaultValue: session.title, placeholder: 'Lecture name' });
  if (!title || title === session.title) return null;
  try {
    return await renameSession(session.id, title);
  } catch (err) {
    showRenameError(err, 'Could not rename the lecture.');
    return null;
  }
}

export async function promptRenameFile(file: SourceFile, allFiles: SourceFile[]): Promise<SourceFile | null> {
  if (file.file_type === 'audio') return null;
  const ext = fileExtension(file);
  const current = editableName(file, allFiles);
  const name = await promptText(file.file_type === 'photo' ? 'Rename Photo' : 'Rename PDF', {
    defaultValue: current,
    placeholder: 'File name',
    message: `The ".${ext}" ending stays.`,
  });
  if (!name || name === current) return null;
  try {
    return await renameSourceFile(file, name);
  } catch (err) {
    showRenameError(err, 'Could not rename the file.');
    return null;
  }
}

export async function promptRenameLibraryFile(file: LibraryFile): Promise<LibraryFile | null> {
  const ext = file.media ? fileExtension(file.media) : file.kind === 'pdf' ? 'pdf' : 'jpg';
  const current = nameWithoutExtension(file.title);
  const name = await promptText(file.kind === 'image' ? 'Rename Photo' : 'Rename PDF', {
    defaultValue: current,
    placeholder: 'File name',
    message: `The ".${ext}" ending stays.`,
  });
  if (!name || name === current) return null;
  try {
    return await renameLibraryFile(file, name);
  } catch (err) {
    showRenameError(err, 'Could not rename the file.');
    return null;
  }
}
