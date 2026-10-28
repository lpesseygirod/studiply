/**
 * doc-photo.service.ts
 * Photos in documents (step 4.5). A photo is a `media` row (kind photo,
 * file_id = the document, lecture_id null) with its JPEG at
 * photos/{userId}/{fileId}/{mediaId}.jpg; the document's photo node points
 * to it as `media:<id>` (src/editor/media/photoSource).
 *
 * Adding: every photo is re-encoded as JPEG (toJpeg, longest side 2048).
 * On the laptop it is uploaded at once (the editor shows it from the browser
 * meanwhile); on the iPhone it is kept on the phone and goes through the
 * sync queue (`upload_doc_photo`), so a photo taken in class without a
 * connection shows at once and is sent later.
 *
 * Showing: the media row gives a signed link. The iPhone keeps a copy of
 * every photo it has shown (lib/photoCache), so it shows offline too, and
 * hands the editor's WebView data URIs (it can't read the app's files).
 *
 * Removing a photo from the text keeps its file (undo and version history
 * can bring it back); the files go when the document is deleted (the trash
 * purge removes a purged file's media objects).
 */

import { Platform } from 'react-native';

import { supabase } from '../lib/supabase';
import { newId } from '../lib/mappers';
import { NetworkError, serviceError } from '../lib/cloudRows';
import { cacheUser, markClean, readRow, remember, saveLocalRow } from '../lib/cache';
import type { MediaRow } from '../lib/cache/localQueries';
import { isOffline } from '../lib/connectivity';
import { keepPendingFile, pendingFileExists, removePendingFile } from '../lib/pendingFiles';
import { cachedPhoto, downloadPhoto, keepPhoto, photoDataUri } from '../lib/photoCache';
import { enqueue, PermanentSyncError, registerSyncHandler, syncEnabled } from '../lib/sync';
import { syncError } from '../lib/sync/errors';
import { toJpeg } from '../utils/toJpeg';
import type { PhotoSource } from '../editor/media/photoSource';
import { Buckets, getSignedUrl, removeFiles, uploadFile } from './cloud-storage.service';
import type { PickedFile } from './library-upload.service';

type LocalMediaRow = MediaRow & { local_uri?: string };

interface DocPhotoPayload {
  /** The document's file. */
  fileId: string;
  mediaId: string;
  /** The JPEG on this iPhone (pending-uploads/<fileId>/<mediaId>.jpg). */
  uri: string;
}

const storagePath = (fileId: string, mediaId: string) => `${fileId}/${mediaId}.jpg`;

/**
 * Adds a photo to a document's files. `onReady` gets its media id and a
 * picture to show at once (before the upload, so the editor can insert it);
 * the promise ends when it is uploaded (laptop) or queued (iPhone). Throws a
 * message the student can act on.
 */
export async function addDocPhoto(
  fileId: string,
  picked: PickedFile,
  { onReady }: { onReady?: (mediaId: string, previewUri: string) => void } = {},
): Promise<string> {
  let jpeg: string;
  try {
    ({ uri: jpeg } = await toJpeg(picked.uri, picked.size));
  } catch {
    throw new Error("This image can't be read. Try a JPEG or PNG.");
  }
  const p: DocPhotoPayload = { fileId, mediaId: newId(), uri: jpeg };
  if (syncEnabled) {
    p.uri = await queueDocPhoto(p);
    onReady?.(p.mediaId, p.uri);
    return p.mediaId;
  }
  if (isOffline()) throw new NetworkError();
  onReady?.(p.mediaId, jpeg);
  await uploadNow(p);
  return p.mediaId;
}

/** The laptop: Storage, then the media row (the Storage object is removed if the row is refused). */
async function uploadNow(p: DocPhotoPayload): Promise<void> {
  const { path } = await uploadFile({ bucket: Buckets.photos, path: storagePath(p.fileId, p.mediaId), uri: p.uri, contentType: 'image/jpeg' });
  const { data, error } = await supabase
    .from('media')
    .insert({ id: p.mediaId, file_id: p.fileId, lecture_id: null, kind: 'photo', storage_path: path, mime_type: 'image/jpeg' })
    .select('*');
  if (error) {
    await removeFiles(Buckets.photos, [path]).catch(() => {});
    throw serviceError(error, 'Could not add the photo.');
  }
  remember('media', data ?? []);
}

/** The iPhone: the photo shows at once from this device, and the queue sends it. Returns where it is kept. */
async function queueDocPhoto(p: DocPhotoPayload): Promise<string> {
  const userId = cacheUser();
  if (!userId) throw new Error('Could not add the photo.');
  const uri = await keepPendingFile(p.fileId, `${p.mediaId}.jpg`, p.uri);
  const at = new Date().toISOString();
  const media: LocalMediaRow & { local_uri: string } = {
    id: p.mediaId,
    user_id: userId,
    lecture_id: null,
    file_id: p.fileId,
    kind: 'photo',
    // Where uploadFile will put it ({userId}/…).
    storage_path: `${userId}/${storagePath(p.fileId, p.mediaId)}`,
    url: null,
    mime_type: 'image/jpeg',
    size_bytes: null,
    t_ms: null,
    page_count: null,
    extracted_text: null,
    caption: null,
    alt_text: null,
    starred_at: null,
    created_at: at,
    updated_at: at,
    changed_at: at,
    local_uri: uri,
  };
  await saveLocalRow('media', media);
  // Keyed by the document: it waits behind the document's own creation if that is still queued.
  await enqueue<DocPhotoPayload>({ kind: 'upload_doc_photo', key: p.fileId, payload: { ...p, uri } });
  return uri;
}

/** Where a photo can be seen from: this device's file (not uploaded yet), or a signed link. */
export async function docPhotoSource(mediaId: string): Promise<PhotoSource> {
  const local = await readRow<LocalMediaRow>('media', mediaId).catch(() => null);
  if (local?.local_uri) return { url: local.local_uri };
  let row: MediaRow | null = local;
  if (!isOffline()) {
    const { data, error } = await supabase.from('media').select('*').eq('id', mediaId).maybeSingle();
    if (!error) {
      row = data;
      if (data) remember('media', [data]);
    }
  }
  if (isOffline()) return { state: 'offline' };
  if (!row?.storage_path) return { state: 'missing' };
  try {
    return { url: await getSignedUrl(Buckets.photos, row.storage_path) };
  } catch {
    return { state: 'offline' };
  }
}

/**
 * What the editor shows for a photo. The laptop: its signed link. The
 * iPhone: a data URI of its copy on the phone, made from the link the first
 * time (so it shows offline afterwards).
 */
export async function editorPhotoSource(mediaId: string): Promise<PhotoSource> {
  if (Platform.OS === 'web') return docPhotoSource(mediaId);
  const kept = await cachedPhoto(mediaId);
  if (kept) return { url: await photoDataUri(kept) };
  const source = await docPhotoSource(mediaId);
  if (!('url' in source)) return source;
  if (!/^https?:/.test(source.url)) return { url: await photoDataUri(source.url) };
  const copy = await downloadPhoto(mediaId, source.url);
  return copy ? { url: await photoDataUri(copy) } : source;
}

registerSyncHandler<DocPhotoPayload>('upload_doc_photo', {
  run: async (p, ctx) => {
    const { data: existing, error: readError } = await supabase.from('media').select('*').eq('id', p.mediaId).maybeSingle();
    if (readError) throw syncError(readError, 'Could not add the photo.');
    let row = existing;
    if (!row) {
      if (!(await pendingFileExists(p.uri))) throw new PermanentSyncError('This photo is no longer on this iPhone.');
      const { path } = await uploadFile({
        bucket: Buckets.photos,
        path: storagePath(p.fileId, p.mediaId),
        uri: p.uri,
        contentType: 'image/jpeg',
        upsert: true,
        onProgress: ctx.progress,
      });
      const { data, error } = await supabase
        .from('media')
        .insert({ id: p.mediaId, file_id: p.fileId, lecture_id: null, kind: 'photo', storage_path: path, mime_type: 'image/jpeg' })
        .select('*')
        .single();
      if (error) {
        const failure = syncError(error, 'Could not add the photo.');
        if (failure instanceof PermanentSyncError) await removeFiles(Buckets.photos, [path]).catch(() => {});
        throw failure;
      }
      row = data;
    }
    // The photo stays on this iPhone as a copy (it shows offline), not as a pending upload.
    await keepPhoto(p.mediaId, p.uri);
    await markClean('media', p.mediaId, row);
    await removePendingFile(p.uri);
  },
});
