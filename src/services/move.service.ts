/**
 * move.service.ts
 * Moving things around the library, without any UI, so the "Move to…"
 * menus and drag and drop share one implementation:
 *  - moveItem: a lecture (its note goes with it), a folder (with everything
 *    in it) or a library file, to a course or folder;
 *  - moveMediaToLecture: a lecture's photo or PDF to another lecture;
 *  - saveMediaToLibrary: a copy of a lecture's photo or PDF as its own file.
 * Each returns an `undo` that puts things back exactly as they were. All
 * are online only.
 *
 * Moving a folder into itself or one of its subfolders is refused here
 * (canMoveTo, which drop targets can also use) and by the database.
 */

import { supabase } from '../lib/supabase';
import { NetworkError, serviceError, PgCodes } from '../lib/cloudRows';
import { notifyLibraryUpdated, remember } from '../lib/cache';
import { isOffline } from '../lib/connectivity';
import { newId } from '../lib/mappers';
import { extensionFor, nameWithoutExtension, withExtension } from '../utils/fileNames';
import { Buckets, removeFiles } from './cloud-storage.service';
import type { SourceFile } from '../types/database';
import { canMoveTo, placeOf, type LibraryItem, type Place } from '../utils/moveRules';

export { canMoveTo, type LibraryItem, type MoveCheck, type Place } from '../utils/moveRules';

export interface MoveResult {
  to: Place;
  undo: () => Promise<void>;
}

/** A refusal written for the student ("It's already in Math."). */
export class MoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoveError';
  }
}

function online(): void {
  if (isOffline()) throw new NetworkError();
}

/** A file (lecture or library file) to a place. Inside a folder, the database takes the folder's course. */
async function placeFile(id: string, courseId: string | null, folderId: string | null): Promise<void> {
  const { data, error } = await supabase
    .from('files')
    .update({ course_id: courseId, folder_id: folderId })
    .eq('id', id)
    .select('*');
  if (error) throw serviceError(error, 'Could not move it.');
  remember('files', data);
}

async function placeFolder(id: string, courseId: string | null, parentId: string | null): Promise<void> {
  const { data, error } = await supabase
    .from('folders')
    .update({ course_id: courseId, parent_id: parentId })
    .eq('id', id)
    .select('*');
  if (error?.code === PgCodes.checkViolation) {
    throw new MoveError("A folder can't be moved into itself or one of its subfolders.");
  }
  if (error) throw serviceError(error, 'Could not move the folder.');
  remember('folders', data);
}

// -------------------------------------------------------------------
// moveItem
// -------------------------------------------------------------------
export async function moveItem(item: LibraryItem, to: Place): Promise<MoveResult> {
  online();
  if (item.type === 'folder') {
    const { data, error } = await supabase.from('folders').select('id, parent_id');
    if (error) throw serviceError(error, 'Could not move the folder.');
    const check = canMoveTo(item, to, data);
    if (check === 'into-itself') throw new MoveError("A folder can't be moved into itself or one of its subfolders.");
    if (check === 'same-place') throw new MoveError(`It's already in ${to.label}.`);
  } else if (canMoveTo(item, to, []) === 'same-place') {
    throw new MoveError(`It's already in ${to.label}.`);
  }

  const from = placeOf(item);
  if (item.type === 'folder') await placeFolder(item.id, to.courseId, to.folderId);
  else await placeFile(item.id, to.courseId, to.folderId);
  notifyLibraryUpdated();

  return {
    to,
    undo: async () => {
      online();
      // A folder's subfolders and files follow it back (database cascade).
      if (item.type === 'folder') await placeFolder(item.id, from.courseId, from.folderId);
      else await placeFile(item.id, from.courseId, from.folderId);
      notifyLibraryUpdated();
    },
  };
}

// -------------------------------------------------------------------
// moveMediaToLecture
// The media row points to the other lecture; the Storage object stays
// where it is (its path keeps the old lecture's id). Deleting the old
// lecture goes by rows, so it never takes this photo along.
// -------------------------------------------------------------------
async function setMediaLecture(mediaId: string, lectureId: string): Promise<void> {
  const { data, error } = await supabase.from('media').update({ lecture_id: lectureId }).eq('id', mediaId).select('*');
  if (error) throw serviceError(error, 'Could not move the file.');
  // Added on this iPhone and not on the server yet.
  if (data.length === 0) throw new MoveError('This file is still uploading. Try again in a moment.');
  remember('media', data);
}

export async function moveMediaToLecture(file: SourceFile, lecture: { id: string; title: string }): Promise<MoveResult> {
  if (file.file_type === 'audio') throw new MoveError('A recording stays with its lecture.');
  if (file.session_id === lecture.id) throw new MoveError(`It's already in ${lecture.title}.`);
  online();

  const fromLecture = file.session_id;
  await setMediaLecture(file.id, lecture.id);
  notifyLibraryUpdated();
  return {
    to: { courseId: null, folderId: null, label: lecture.title },
    undo: async () => {
      online();
      await setMediaLecture(file.id, fromLecture);
      notifyLibraryUpdated();
    },
  };
}

// -------------------------------------------------------------------
// saveMediaToLibrary
// A new library file with its own media row and its own copy of the
// Storage object, so removing the photo from the lecture (or the lecture
// itself) never removes it. If a step fails, the earlier ones are undone.
// -------------------------------------------------------------------
export interface SaveResult extends MoveResult {
  fileId: string;
  title: string;
}

export async function saveMediaToLibrary(file: SourceFile, name: string, to: Place): Promise<SaveResult> {
  if (file.file_type === 'audio') throw new MoveError('A recording stays with its lecture.');
  if (!file.storage_path || !file.is_uploaded) throw new MoveError('This file is still uploading. Try again in a moment.');
  if (to.courseId === null && to.folderId === null) throw new MoveError('Choose a course or folder.');
  online();

  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) throw new MoveError('Could not save the file.');

  const isPhoto = file.file_type === 'photo';
  const ext = extensionFor({ storagePath: file.storage_path, mimeType: file.mime_type, kind: isPhoto ? 'photo' : 'pdf' });
  const title = withExtension(nameWithoutExtension(name.trim()) || (isPhoto ? 'Photo' : 'Document'), ext);
  const bucket = isPhoto ? Buckets.photos : Buckets.slides;
  const fileId = newId();
  const mediaId = newId();
  const copyPath = `${userId}/${fileId}/${mediaId}.${ext}`;

  const removeFile = () => supabase.from('files').delete().eq('id', fileId);

  const { error: fileError } = await supabase
    .from('files')
    .insert({ id: fileId, kind: isPhoto ? 'image' : 'pdf', title, course_id: to.courseId, folder_id: to.folderId });
  if (fileError) throw serviceError(fileError, 'Could not save the file.');

  const { error: copyError } = await supabase.storage.from(bucket).copy(file.storage_path, copyPath);
  if (copyError) {
    await removeFile();
    throw serviceError({ message: copyError.message }, 'Could not save the file.');
  }

  const { error: mediaError } = await supabase.from('media').insert({
    id: mediaId,
    file_id: fileId,
    lecture_id: null,
    kind: isPhoto ? 'photo' : 'slides',
    storage_path: copyPath,
    mime_type: file.mime_type,
    size_bytes: file.file_size_bytes,
    caption: title,
  });
  if (mediaError) {
    await removeFiles(bucket, [copyPath]).catch(() => {});
    await removeFile();
    throw serviceError(mediaError, 'Could not save the file.');
  }
  notifyLibraryUpdated();

  return {
    fileId,
    title,
    to,
    undo: async () => {
      online();
      // The media row goes with the file (cascade); then its own copy.
      const { error } = await removeFile();
      if (error) throw serviceError(error, 'Could not undo.');
      await removeFiles(bucket, [copyPath]).catch(() => {});
      notifyLibraryUpdated();
    },
  };
}

// -------------------------------------------------------------------
// moveMediaToLibrary
// A lecture's photo or PDF leaves its lecture and becomes a library file
// (Lea, 26 Oct: a move, not a copy). Its media row now belongs to a new
// file; the Storage object stays where it is. If the media row can't be
// moved, the new file is deleted again.
// -------------------------------------------------------------------
export async function moveMediaToLibrary(file: SourceFile, name: string, to: Place): Promise<SaveResult> {
  if (file.file_type === 'audio') throw new MoveError('A recording stays with its lecture.');
  if (!file.storage_path || !file.is_uploaded) throw new MoveError('This file is still uploading. Try again in a moment.');
  if (to.courseId === null && to.folderId === null) throw new MoveError('Choose a course or folder.');
  online();

  const isPhoto = file.file_type === 'photo';
  const ext = extensionFor({ storagePath: file.storage_path, mimeType: file.mime_type, kind: isPhoto ? 'photo' : 'pdf' });
  const title = withExtension(nameWithoutExtension(name.trim()) || (isPhoto ? 'Photo' : 'Document'), ext);
  const fileId = newId();
  const fromLecture = file.session_id;
  const removeFile = () => supabase.from('files').delete().eq('id', fileId);

  const { error: fileError } = await supabase.from('files').insert({
    id: fileId,
    kind: isPhoto ? 'image' : 'pdf',
    title,
    course_id: to.courseId,
    folder_id: to.folderId,
    starred_at: file.starred_at ?? null,
  });
  if (fileError) throw serviceError(fileError, 'Could not move the file.');

  const { data, error } = await supabase
    .from('media')
    .update({ file_id: fileId, lecture_id: null, caption: title })
    .eq('id', file.id)
    .select('*');
  if (error || !data?.length) {
    await removeFile();
    if (error) throw serviceError(error, 'Could not move the file.');
    // Added on this iPhone and not on the server yet.
    throw new MoveError('This file is still uploading. Try again in a moment.');
  }
  remember('media', data);
  notifyLibraryUpdated();

  return {
    fileId,
    title,
    to,
    undo: async () => {
      online();
      const { data: back, error: backError } = await supabase
        .from('media')
        .update({ lecture_id: fromLecture, file_id: null, caption: file.display_name ?? null })
        .eq('id', file.id)
        .select('*');
      if (backError) throw serviceError(backError, 'Could not undo.');
      remember('media', back ?? []);
      // Only now: deleting the file first would take the media row with it (cascade).
      const { error: removeError } = await removeFile();
      if (removeError) throw serviceError(removeError, 'Could not undo.');
      notifyLibraryUpdated();
    },
  };
}
