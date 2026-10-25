/**
 * library-upload.service.ts
 * Photos and PDFs uploaded into a course or folder as library files
 * (step 3.4): a `files` row (kind image or pdf) with its own media row
 * (file_id set, lecture_id null) and its Storage object at
 * {userId}/{fileId}/{mediaId}.{ext}. Before 3.4 uploads went into the
 * course's hidden "Project Files" lecture.
 *
 * Photos are re-encoded as JPEG (the photos bucket takes JPEG only); PDFs
 * go to the slides bucket (50 MB at most). On the laptop the file is
 * uploaded at once; on the iPhone it goes through the sync queue
 * (`upload_library_file`), so a photo taken in class without a connection
 * shows at once ("Waiting to upload") and is sent later.
 */

import { supabase } from '../lib/supabase';
import { newId } from '../lib/mappers';
import { NetworkError, serviceError, type FileRow } from '../lib/cloudRows';
import { cacheUser, markClean, notifyLibraryUpdated, readRow, remember, saveLocalRow } from '../lib/cache';
import type { MediaRow } from '../lib/cache/localQueries';
import { isOffline } from '../lib/connectivity';
import { keepPendingFile, pendingFileExists, removePendingFile } from '../lib/pendingFiles';
import { enqueue, PermanentSyncError, registerSyncHandler, syncEnabled } from '../lib/sync';
import { syncError } from '../lib/sync/errors';
import { nameWithoutExtension, withExtension } from '../utils/fileNames';
import { toJpeg } from '../utils/toJpeg';
import { Buckets, removeFiles, uploadFile } from './cloud-storage.service';

/** A file picked, taken, dropped or pasted. */
export interface PickedFile {
  /** Local file (iPhone) or blob:/data: URI (web). */
  uri: string;
  /** The file's own name ("Tema 1.pdf"), if it has one. */
  name: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  /** Photos: the size, so large ones are scaled down. */
  size?: { width: number; height: number };
}

/** Where it goes: a course's top level (folderId null) or a folder. */
export interface UploadPlace {
  courseId: string | null;
  folderId: string | null;
}

export type UploadKind = 'photo' | 'pdf';

export const MAX_PDF_BYTES = 50 * 1024 * 1024;
const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif'];

/** A photo, a PDF, or neither (then it is refused). */
export function uploadKindOf(file: Pick<PickedFile, 'name' | 'mimeType'>): UploadKind | null {
  const mime = (file.mimeType ?? '').toLowerCase();
  const ext = (file.name ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (mime === 'application/pdf' || (!mime && ext === 'pdf')) return 'pdf';
  if (mime.startsWith('image/') || (!mime && PHOTO_EXTENSIONS.includes(ext))) return 'photo';
  return null;
}

export type UploadCheck = { ok: true; kind: UploadKind } | { ok: false; reason: string };

/** Whether it can be uploaded, or why not (shown to the student). */
export function checkUpload(file: Pick<PickedFile, 'name' | 'mimeType' | 'sizeBytes'>): UploadCheck {
  const kind = uploadKindOf(file);
  if (!kind) return { ok: false, reason: 'Only PDFs and photos for now.' };
  if (kind === 'pdf' && (file.sizeBytes ?? 0) > MAX_PDF_BYTES) return { ok: false, reason: 'PDFs can be at most 50 MB.' };
  return { ok: true, kind };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A camera photo's name: "Photo 26 Oct 10.42" (dots: a colon can't be in a file name). */
export function cameraPhotoName(at: Date): string {
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  return `Photo ${at.getDate()} ${MONTHS[at.getMonth()]} ${hh}.${mm}`;
}

/** The file's title with the extension it is stored with (photos are always .jpg). */
export function libraryTitle(kind: UploadKind, name: string | null, at: Date): string {
  const base = nameWithoutExtension((name ?? '').trim()).trim();
  return withExtension(base || (kind === 'photo' ? cameraPhotoName(at) : 'Document'), kind === 'photo' ? 'jpg' : 'pdf');
}

interface UploadLibraryPayload {
  fileId: string;
  mediaId: string;
  kind: 'photo' | 'slides';
  title: string;
  courseId: string | null;
  folderId: string | null;
  uri: string;
  contentType: string;
  ext: string;
  sizeBytes: number | null;
}

const bucketFor = (kind: 'photo' | 'slides') => (kind === 'photo' ? Buckets.photos : Buckets.slides);

/**
 * Uploads one photo or PDF into `place` as a library file. Returns the new
 * file's id. Throws a message the student can act on when it is refused.
 */
export async function uploadLibraryFile(
  place: UploadPlace,
  picked: PickedFile,
  { onProgress, now = new Date() }: { onProgress?: (fraction: number) => void; now?: Date } = {},
): Promise<string> {
  const check = checkUpload(picked);
  if (!check.ok) throw new Error(check.reason);
  if (place.courseId === null && place.folderId === null) throw new Error('Open a course or folder first.');

  let uri = picked.uri;
  let contentType = 'application/pdf';
  let ext = 'pdf';
  if (check.kind === 'photo') {
    try {
      ({ uri, mimeType: contentType } = await toJpeg(picked.uri, picked.size));
    } catch {
      throw new Error("This image can't be read. Try a JPEG or PNG.");
    }
    ext = 'jpg';
  }
  const payload: UploadLibraryPayload = {
    fileId: newId(),
    mediaId: newId(),
    kind: check.kind === 'photo' ? 'photo' : 'slides',
    title: libraryTitle(check.kind, picked.name, now),
    courseId: place.courseId,
    folderId: place.folderId,
    uri,
    contentType,
    ext,
    sizeBytes: check.kind === 'pdf' ? picked.sizeBytes : null,
  };

  if (syncEnabled) {
    await queueLibraryFile(payload, check.kind === 'pdf');
    return payload.fileId;
  }
  await uploadNow(payload, onProgress);
  return payload.fileId;
}

/** The laptop (and any device without the queue): file row, Storage, media row; undone step by step on failure. */
async function uploadNow(p: UploadLibraryPayload, onProgress?: (fraction: number) => void): Promise<void> {
  if (isOffline()) throw new NetworkError();
  const removeFile = () => supabase.from('files').delete().eq('id', p.fileId);

  const { data: file, error: fileError } = await supabase
    .from('files')
    .insert({ id: p.fileId, kind: p.kind === 'photo' ? 'image' : 'pdf', title: p.title, course_id: p.courseId, folder_id: p.folderId })
    .select('*');
  if (fileError) throw serviceError(fileError, 'Could not add the file.');

  let path: string;
  try {
    ({ path } = await uploadFile({ bucket: bucketFor(p.kind), path: `${p.fileId}/${p.mediaId}.${p.ext}`, uri: p.uri, contentType: p.contentType, onProgress }));
  } catch (err) {
    await removeFile();
    throw err;
  }

  const { data: media, error: mediaError } = await supabase
    .from('media')
    .insert({
      id: p.mediaId,
      file_id: p.fileId,
      lecture_id: null,
      kind: p.kind,
      storage_path: path,
      mime_type: p.contentType,
      size_bytes: p.sizeBytes,
      caption: p.title,
    })
    .select('*');
  if (mediaError) {
    await removeFiles(bucketFor(p.kind), [path]).catch(() => {});
    await removeFile();
    throw serviceError(mediaError, 'Could not add the file.');
  }
  remember('files', file ?? []);
  remember('media', media ?? []);
  notifyLibraryUpdated();
}

/** The iPhone: the file shows at once from this device's rows, and the queue sends it. */
async function queueLibraryFile(p: UploadLibraryPayload, copyPicked: boolean): Promise<void> {
  const userId = cacheUser();
  if (!userId) throw new Error('Could not add the file.');
  const at = new Date().toISOString();
  // A converted photo is ours to move; a picked PDF is the picker's copy.
  const uri = await keepPendingFile(p.fileId, `${p.mediaId}.${p.ext}`, p.uri, copyPicked);
  const file: FileRow = {
    id: p.fileId,
    user_id: userId,
    kind: p.kind === 'photo' ? 'image' : 'pdf',
    title: p.title,
    course_id: p.courseId,
    folder_id: p.folderId,
    sort_order: 0,
    starred_at: null,
    last_opened_at: null,
    deleted_at: null,
    created_at: at,
    updated_at: at,
    changed_at: at,
  };
  const media: MediaRow & { local_uri: string } = {
    id: p.mediaId,
    user_id: userId,
    lecture_id: null,
    file_id: p.fileId,
    kind: p.kind,
    // Where uploadFile will put it ({userId}/…).
    storage_path: `${userId}/${p.fileId}/${p.mediaId}.${p.ext}`,
    url: null,
    mime_type: p.contentType,
    size_bytes: p.sizeBytes,
    t_ms: null,
    page_count: null,
    extracted_text: null,
    caption: p.title,
    alt_text: null,
    starred_at: null,
    created_at: at,
    updated_at: at,
    changed_at: at,
    local_uri: uri,
  };
  await saveLocalRow('files', file);
  await saveLocalRow('media', media);
  await enqueue<UploadLibraryPayload>({ kind: 'upload_library_file', key: p.fileId, payload: { ...p, uri } });
  notifyLibraryUpdated();
}

/** A large PDF on a slow connection takes a while; longer means it hung. */
const UPLOAD_TIMEOUT_MS = 10 * 60_000;

registerSyncHandler<UploadLibraryPayload>('upload_library_file', {
  timeoutMs: UPLOAD_TIMEOUT_MS,
  run: async (p, ctx) => {
    // The file row first (the media row points to it). Safe to repeat; the
    // iPhone's copy wins if the title or place changed while it waited.
    const local = await readRow<FileRow>('files', p.fileId);
    const { error: fileError } = await supabase.from('files').upsert(
      {
        id: p.fileId,
        kind: p.kind === 'photo' ? 'image' : 'pdf',
        title: local?.title ?? p.title,
        course_id: local ? local.course_id : p.courseId,
        folder_id: local ? local.folder_id : p.folderId,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (fileError) throw syncError(fileError, 'Could not add the file.');

    const bucket = bucketFor(p.kind);
    const { data: existing, error: readError } = await supabase.from('media').select('*').eq('id', p.mediaId).maybeSingle();
    if (readError) throw syncError(readError, 'Could not add the file.');

    let row = existing;
    if (!row) {
      if (!(await pendingFileExists(p.uri))) throw new PermanentSyncError('This file is no longer on this iPhone.');
      const { path } = await uploadFile({
        bucket,
        path: `${p.fileId}/${p.mediaId}.${p.ext}`,
        uri: p.uri,
        contentType: p.contentType,
        upsert: true,
        onProgress: ctx.progress,
      });
      const { data, error } = await supabase
        .from('media')
        .insert({
          id: p.mediaId,
          file_id: p.fileId,
          lecture_id: null,
          kind: p.kind,
          storage_path: path,
          mime_type: p.contentType,
          size_bytes: p.sizeBytes,
          caption: local?.title ?? p.title,
        })
        .select('*')
        .single();
      if (error) {
        const failure = syncError(error, 'Could not add the file.');
        if (failure instanceof PermanentSyncError) await removeFiles(bucket, [path]).catch(() => {});
        throw failure;
      }
      row = data;
    }
    await markClean('media', p.mediaId, row);
    await removePendingFile(p.uri);
    notifyLibraryUpdated();
  },
});
