import { Platform } from 'react-native';

import { supabase } from '../lib/supabase';
import { newId } from '../lib/mappers';
import { serviceError, type FileRow, type LectureRow } from '../lib/cloudRows';
import {
  cacheUser,
  isSessionLive,
  markClean,
  notifyLibraryUpdated,
  readRow,
  readRows,
  readThrough,
  remember,
  rememberScope,
  saveLocalRow,
  withLocalRows,
} from '../lib/cache';
import { audioOf, courseMedia, mediaOf } from '../lib/cache/localQueries';
import { getConnection, isOffline } from '../lib/connectivity';
import { keepPendingFile, pendingFileExists, removePendingFile } from '../lib/pendingFiles';
import {
  enqueue,
  onSyncEvent,
  pendingSyncFor,
  PermanentSyncError,
  registerSyncHandler,
  syncEnabled,
} from '../lib/sync';
import { syncError } from '../lib/sync/errors';
import { updateSession } from './session.service';
import { toJpeg } from '../utils/toJpeg';
import { Buckets, getSignedUrl, removeFiles, uploadFile, type Bucket } from './cloud-storage.service';
import type { Tables } from '../types/supabase';
import type { SourceFile } from '../types/database';

/**
 * A lecture's files, in Supabase Storage (step 1.4 buckets):
 *  - audio: one `audio_chunks` row per recorded chunk, the audio in
 *    `audio-chunks` at {userId}/{lectureId}/{seq}.{ext};
 *  - photos (always JPEG) and PDFs: `media` rows (kind photo / slides), the
 *    files in `photos` / `slides` at {userId}/{lectureId}/{mediaId}.{ext};
 *    a PDF's original name is kept in media.caption.
 * Files are uploaded when they are added, so they show on every device.
 * On the iPhone, recordings, photos and PDFs go through the sync queue: the
 * file is kept in the app's documents folder (src/lib/pendingFiles) and
 * uploaded when there is a connection, so nothing is lost offline. Until
 * then file_path is the local file.
 * SourceFile.file_path is a 1-hour signed URL for showing or playing the
 * file; storage_path is the path in its bucket. Audio retention is set on
 * the lecture (audio only: photos and PDFs are study material and stay).
 */

type AudioChunkRow = Tables<'audio_chunks'>;
type MediaRow = Tables<'media'>;
type Retention = SourceFile['retention_policy'];

const RETENTIONS: Retention[] = ['delete_now', 'delete_3_days', 'delete_manually', 'keep_permanently'];

function asRetention(value: string | null | undefined): Retention {
  return RETENTIONS.includes(value as Retention) ? (value as Retention) : 'delete_3_days';
}

/** The name to show for a file: a PDF keeps its original name (media.caption). */
export function sourceFileName(file: SourceFile): string {
  if (file.file_type === 'audio') return 'Recording';
  return file.display_name || 'Document';
}

function mediaBucket(kind: string): Bucket {
  return kind === 'photo' ? Buckets.photos : Buckets.slides;
}

/** Content type and extension of a recording; the server names the file for Whisper by its extension. */
async function audioFormat(uri: string): Promise<{ mimeType: string; ext: string }> {
  if (Platform.OS === 'ios') return { mimeType: 'audio/m4a', ext: 'm4a' };
  if (Platform.OS === 'web') {
    // MediaRecorder: webm in Chrome and Firefox, mp4 in Safari.
    const type = (await fetch(uri).then((r) => r.blob()).catch(() => null))?.type ?? '';
    if (type.includes('mp4')) return { mimeType: 'audio/mp4', ext: 'mp4' };
    return { mimeType: 'audio/webm', ext: 'webm' };
  }
  return { mimeType: 'audio/mp4', ext: 'mp4' };
}

async function signed(bucket: Bucket, path: string | null): Promise<string> {
  // Offline there is no link; the screens show a placeholder for ''.
  if (!path || isOffline()) return '';
  return getSignedUrl(bucket, path).catch(() => '');
}

function chunkToSourceFile(
  chunk: AudioChunkRow,
  lecture: { audio_retention: string; audio_delete_after: string | null } | null,
  url: string,
): SourceFile {
  const ext = chunk.storage_path?.split('.').pop() ?? '';
  return {
    id: chunk.id,
    user_id: chunk.user_id,
    session_id: chunk.lecture_id,
    file_type: 'audio',
    file_path: url,
    file_size_bytes: null,
    mime_type: ext === 'webm' ? 'audio/webm' : ext === 'mp4' ? 'audio/mp4' : 'audio/m4a',
    retention_policy: asRetention(lecture?.audio_retention),
    scheduled_deletion_at: lecture?.audio_delete_after ?? null,
    is_deleted: false,
    storage_path: chunk.storage_path,
    is_uploaded: chunk.status !== 'pending',
    created_at: chunk.created_at,
  };
}

/** A media row made on this iPhone and not uploaded yet carries its local file. */
type LocalMediaRow = MediaRow & { local_uri?: string };

function mediaToSourceFile(media: LocalMediaRow, url: string): SourceFile {
  return {
    id: media.id,
    user_id: media.user_id,
    session_id: media.lecture_id ?? media.file_id ?? '',
    file_type: media.kind === 'photo' ? 'photo' : 'pdf',
    file_path: url,
    file_size_bytes: media.size_bytes,
    mime_type: media.mime_type,
    retention_policy: 'keep_permanently',
    scheduled_deletion_at: null,
    is_deleted: false,
    storage_path: media.storage_path,
    is_uploaded: !media.local_uri,
    created_at: media.created_at,
    display_name: media.caption,
  };
}

// -------------------------------------------------------------------
// createSourceFile
// Uploads the file and records it. Audio needs its place in the
// recording (seq, startMs, durationMs); photos are converted to JPEG.
// Uploading again with the same seq replaces the chunk (safe to retry).
// -------------------------------------------------------------------
export async function createSourceFile(params: {
  userId: string;
  sessionId: string;
  fileType: 'audio' | 'photo' | 'pdf';
  filePath: string;
  fileSizeBytes?: number;
  mimeType?: string;
  retentionPolicy?: string;
  /** Audio only: chunk number from 0, and where it sits in the recording. */
  seq?: number;
  startMs?: number;
  durationMs?: number;
  /** Photos: the picked size, so large images are scaled down. */
  size?: { width: number; height: number };
  /** PDFs: the original file name, kept for display. */
  fileName?: string;
  onProgress?: (fraction: number) => void;
  onRetry?: (retry: number, maxRetries: number) => void;
}): Promise<SourceFile> {
  const { sessionId, onProgress, onRetry } = params;

  if (params.fileType === 'audio') {
    const seq = params.seq ?? 0;
    const { mimeType, ext } = await audioFormat(params.filePath);
    const { path } = await uploadFile({
      bucket: Buckets.audioChunks,
      path: `${sessionId}/${String(seq).padStart(4, '0')}.${ext}`,
      uri: params.filePath,
      contentType: mimeType,
      upsert: true,
      onProgress,
      onRetry,
    });
    const { data, error } = await supabase
      .from('audio_chunks')
      .upsert(
        {
          lecture_id: sessionId,
          seq,
          start_ms: Math.max(0, Math.round(params.startMs ?? 0)),
          duration_ms: Math.max(1, Math.round(params.durationMs ?? 1)),
          storage_path: path,
          status: 'uploaded',
        },
        { onConflict: 'lecture_id,seq' },
      )
      .select('*')
      .single();
    if (error) throw serviceError(error, 'Could not save the recording.');
    return chunkToSourceFile(data, null, params.filePath);
  }

  const id = newId();
  let uri = params.filePath;
  let contentType = params.mimeType ?? 'application/pdf';
  let ext = 'pdf';
  if (params.fileType === 'photo') {
    try {
      ({ uri, mimeType: contentType } = await toJpeg(params.filePath, params.size));
    } catch {
      // e.g. HEIC in a browser that can't decode it.
      throw new Error("This image can't be read. Try a JPEG or PNG.");
    }
    ext = 'jpg';
  }

  const kind = params.fileType === 'photo' ? 'photo' : 'slides';
  if (syncEnabled) {
    return queueMedia({
      id,
      userId: params.userId,
      sessionId,
      kind,
      // A converted photo is ours to move; a picked PDF is the picker's copy.
      uri: await keepPendingFile(sessionId, `${id}.${ext}`, uri, params.fileType === 'pdf'),
      contentType,
      ext,
      sizeBytes: params.fileType === 'photo' ? null : (params.fileSizeBytes ?? null),
      caption: params.fileType === 'pdf' ? (params.fileName ?? null) : null,
    });
  }
  const { path } = await uploadFile({
    bucket: mediaBucket(kind),
    path: `${sessionId}/${id}.${ext}`,
    uri,
    contentType,
    onProgress,
    onRetry,
  });
  const { data, error } = await supabase
    .from('media')
    .insert({
      id,
      lecture_id: sessionId,
      kind,
      storage_path: path,
      mime_type: contentType,
      size_bytes: params.fileType === 'photo' ? null : (params.fileSizeBytes ?? null),
      // Storage paths must be plain ASCII, so the original name (é, à…) lives here.
      caption: params.fileType === 'pdf' ? (params.fileName ?? null) : null,
    })
    .select('*')
    .single();
  if (error) {
    await removeFiles(mediaBucket(kind), [path]).catch(() => {});
    throw serviceError(error, 'Could not save the file.');
  }
  return mediaToSourceFile(data, uri);
}

// -------------------------------------------------------------------
// saveRecordingChunks
// After Stop: uploads every chunk of a recording in order, with overall
// progress. The lecture shows as uploading meanwhile. Throws on the first
// chunk that fails; calling it again re-sends all chunks (upserts).
// -------------------------------------------------------------------
export async function saveRecordingChunks(params: {
  userId: string;
  sessionId: string;
  chunks: { uri: string; durationMs: number }[];
  onProgress?: (fraction: number) => void;
  onRetry?: (retry: number, maxRetries: number) => void;
}): Promise<SourceFile[]> {
  const { error } = await supabase.from('lectures').update({ status: 'uploading' }).eq('id', params.sessionId);
  if (error) throw serviceError(error, 'Could not save the recording.');

  const saved: SourceFile[] = [];
  let startMs = 0;
  const total = params.chunks.length;
  for (let seq = 0; seq < total; seq++) {
    const chunk = params.chunks[seq];
    saved.push(
      await createSourceFile({
        userId: params.userId,
        sessionId: params.sessionId,
        fileType: 'audio',
        filePath: chunk.uri,
        seq,
        startMs,
        durationMs: chunk.durationMs,
        onProgress: (f) => params.onProgress?.((seq + f) / total),
        onRetry: params.onRetry,
      }),
    );
    startMs += chunk.durationMs;
  }
  params.onProgress?.(1);
  return saved;
}

/** Just enough of a lecture file for courseMedia's filter. */
function files(lectures: { id: string }[]): FileRow[] {
  return lectures.map((l) => ({ id: l.id, kind: 'lecture', deleted_at: null }) as FileRow);
}

// -------------------------------------------------------------------
// getProjectSourceFiles
// Returns all photo and PDF files across every lecture in a project,
// ordered newest first. Used for the project-level files section.
// -------------------------------------------------------------------
export async function getProjectSourceFiles(projectId: string): Promise<SourceFile[]> {
  const media = await readThrough(
    async () => {
      const { data: lectures, error } = await supabase
        .from('files')
        .select('id')
        .eq('kind', 'lecture')
        .eq('course_id', projectId)
        .is('deleted_at', null);
      if (error) throw serviceError(error, 'Could not load the project files.');
      if (lectures.length === 0) return [];

      const { data: media, error: mediaError } = await supabase
        .from('media')
        .select('*')
        .in('lecture_id', lectures.map((l) => l.id))
        .in('kind', ['photo', 'slides'])
        .order('created_at', { ascending: false });
      if (mediaError) throw serviceError(mediaError, 'Could not load the project files.');
      remember('media', media);
      const ids = new Set(lectures.map((l) => l.id));
      const withLocal = await withLocalRows('media', media, (m) => m.lecture_id !== null && ids.has(m.lecture_id));
      return withLocal === media ? media : courseMedia(withLocal, files(lectures), projectId);
    },
    async () => {
      const [media, lectureFiles] = await Promise.all([readRows<MediaRow>('media'), readRows<FileRow>('files')]);
      return courseMedia(media, lectureFiles, projectId);
    },
  );

  return Promise.all(
    media.map(async (m) =>
      mediaToSourceFile(m, (m as LocalMediaRow).local_uri ?? (await signed(mediaBucket(m.kind), m.storage_path))),
    ),
  );
}

// -------------------------------------------------------------------
// getSourceFiles
// Returns a lecture's audio chunks (in recording order) and its media.
// Audio deleted by its retention policy is left out. Offline the rows come
// from the cache; their files can't be shown without a connection.
// -------------------------------------------------------------------
export async function getSourceFiles(sessionId: string): Promise<SourceFile[]> {
  type Retention = Pick<LectureRow, 'audio_retention' | 'audio_delete_after'>;
  const { lecture, chunks, media } = await readThrough<{
    lecture: Retention | null;
    chunks: AudioChunkRow[];
    media: MediaRow[];
  }>(
    async () => {
      const [lecture, chunks, media] = await Promise.all([
        supabase.from('lectures').select('audio_retention, audio_delete_after').eq('id', sessionId).maybeSingle(),
        supabase.from('audio_chunks').select('*').eq('lecture_id', sessionId).not('storage_path', 'is', null).order('seq'),
        supabase.from('media').select('*').eq('lecture_id', sessionId).order('created_at'),
      ]);
      const error = lecture.error ?? chunks.error ?? media.error;
      if (error) throw serviceError(error, 'Could not load the files.');
      rememberScope('audio_chunks', chunks.data ?? [], (c) => c.lecture_id === sessionId && c.storage_path !== null);
      rememberScope('media', media.data ?? [], (m) => m.lecture_id === sessionId);
      // Photos and PDFs added on this iPhone that are still uploading.
      const withLocal = await withLocalRows('media', media.data ?? [], (m) => m.lecture_id === sessionId);
      return { lecture: lecture.data, chunks: chunks.data ?? [], media: mediaOf(withLocal, sessionId) };
    },
    async () => {
      const lecture = await readRow<LectureRow>('lectures', sessionId);
      if (!lecture) return null;
      const [chunks, media] = await Promise.all([
        readRows<AudioChunkRow>('audio_chunks', sessionId),
        readRows<MediaRow>('media', sessionId),
      ]);
      return { lecture, chunks: audioOf(chunks, sessionId), media: mediaOf(media, sessionId) };
    },
  );

  return Promise.all([
    ...chunks.map(async (c) => chunkToSourceFile(c, lecture, await signed(Buckets.audioChunks, c.storage_path))),
    ...media.map(async (m) => mediaToSourceFile(m, (m as LocalMediaRow).local_uri ?? (await signed(mediaBucket(m.kind), m.storage_path)))),
  ]);
}

// Alias used throughout the UI for clarity.
export const getActiveSourceFiles = getSourceFiles;

// -------------------------------------------------------------------
// getAudioChunks
// The lecture's uploaded audio chunks in recording order, for
// transcription (audio removed by its retention policy is left out).
// -------------------------------------------------------------------
export async function getAudioChunks(
  sessionId: string,
): Promise<{ seq: number; startMs: number; storagePath: string; transcribed: boolean }[]> {
  const { data, error } = await supabase
    .from('audio_chunks')
    .select('seq, start_ms, storage_path, status')
    .eq('lecture_id', sessionId)
    .not('storage_path', 'is', null)
    .order('seq');
  if (error) throw serviceError(error, 'Could not load the recording.');
  return data.map((c) => ({
    seq: c.seq,
    startMs: c.start_ms,
    storagePath: c.storage_path as string,
    transcribed: c.status === 'transcribed',
  }));
}

// -------------------------------------------------------------------
// getSourceFileCount
// -------------------------------------------------------------------
export async function getSourceFileCount(sessionId: string): Promise<number> {
  const [chunks, media] = await Promise.all([
    supabase.from('audio_chunks').select('id', { count: 'exact', head: true }).eq('lecture_id', sessionId).not('storage_path', 'is', null),
    supabase.from('media').select('id', { count: 'exact', head: true }).eq('lecture_id', sessionId),
  ]);
  const error = chunks.error ?? media.error;
  if (error) throw serviceError(error, 'Could not load the files.');
  return (chunks.count ?? 0) + (media.count ?? 0);
}

// -------------------------------------------------------------------
// getStorageStats — per-type counts of the student's stored files
// -------------------------------------------------------------------
export async function getStorageStats(_userId: string): Promise<{
  audioCount: number;
  photoCount: number;
  pdfCount: number;
}> {
  const [audio, photos, pdfs] = await Promise.all([
    supabase.from('audio_chunks').select('id', { count: 'exact', head: true }).not('storage_path', 'is', null),
    supabase.from('media').select('id', { count: 'exact', head: true }).eq('kind', 'photo'),
    supabase.from('media').select('id', { count: 'exact', head: true }).eq('kind', 'slides'),
  ]);
  const error = audio.error ?? photos.error ?? pdfs.error;
  if (error) throw serviceError(error, 'Could not load your storage.');
  return { audioCount: audio.count ?? 0, photoCount: photos.count ?? 0, pdfCount: pdfs.count ?? 0 };
}

// -------------------------------------------------------------------
// markDeleted
// Removes a photo or PDF (row and file), or the audio of one chunk (the
// chunk row stays so its transcript keeps its place).
// -------------------------------------------------------------------
export async function markDeleted(fileId: string): Promise<void> {
  const { data: media, error } = await supabase.from('media').select('kind, storage_path').eq('id', fileId).maybeSingle();
  if (error) throw serviceError(error, 'Could not remove the file.');

  if (media) {
    const { error: deleteError } = await supabase.from('media').delete().eq('id', fileId);
    if (deleteError) throw serviceError(deleteError, 'Could not remove the file.');
    if (media.storage_path) await removeFiles(mediaBucket(media.kind), [media.storage_path]).catch(() => {});
    return;
  }

  const { data: chunk, error: chunkError } = await supabase
    .from('audio_chunks')
    .select('storage_path')
    .eq('id', fileId)
    .maybeSingle();
  if (chunkError) throw serviceError(chunkError, 'Could not remove the file.');
  if (!chunk?.storage_path) return;
  const { error: clearError } = await supabase.from('audio_chunks').update({ storage_path: null }).eq('id', fileId);
  if (clearError) throw serviceError(clearError, 'Could not remove the file.');
  await removeFiles(Buckets.audioChunks, [chunk.storage_path]).catch(() => {});
}

// -------------------------------------------------------------------
// bulkApplyRetention
// Sets what happens to a lecture's audio.
// delete_now  → the audio files are removed now (transcript stays).
// delete_3_days → removal date set to now + 3 days.
// delete_manually / keep_permanently → just the policy.
// Photos and PDFs are not affected.
// -------------------------------------------------------------------
export async function bulkApplyRetention(
  sessionId: string,
  policy: 'delete_now' | 'delete_3_days' | 'delete_manually' | 'keep_permanently',
): Promise<void> {
  const deleteAfter =
    policy === 'delete_3_days' ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() : null;
  const { error } = await supabase
    .from('lectures')
    .update({ audio_retention: policy, audio_delete_after: deleteAfter })
    .eq('id', sessionId);
  if (error) throw serviceError(error, 'Could not save the audio setting.');

  if (policy !== 'delete_now') return;

  const { data: chunks, error: listError } = await supabase
    .from('audio_chunks')
    .select('id, storage_path')
    .eq('lecture_id', sessionId)
    .not('storage_path', 'is', null);
  if (listError) throw serviceError(listError, 'Could not delete the audio.');
  if (chunks.length === 0) return;

  const { error: clearError } = await supabase
    .from('audio_chunks')
    .update({ storage_path: null })
    .eq('lecture_id', sessionId);
  if (clearError) throw serviceError(clearError, 'Could not delete the audio.');
  await removeFiles(
    Buckets.audioChunks,
    chunks.map((c) => c.storage_path as string),
  ).catch(() => {});
}

// -------------------------------------------------------------------
// The iPhone's upload queue for recordings, photos and PDFs
// -------------------------------------------------------------------

/**
 * Moves a finished recording chunk out of the cache folder (which iOS may
 * empty) into the app's documents folder. Called for each chunk as soon as
 * it is finished. On the web the browser's blob URL is kept as it is.
 */
export async function keepRecordingChunk(sessionId: string, seq: number, uri: string): Promise<string> {
  if (!syncEnabled) return uri;
  const ext = uri.split('.').pop()?.toLowerCase() || 'm4a';
  return keepPendingFile(sessionId, `${String(seq).padStart(4, '0')}.${ext}`, uri);
}

interface UploadChunkPayload {
  lectureId: string;
  seq: number;
  startMs: number;
  durationMs: number;
  uri: string;
}

interface UploadMediaPayload {
  id: string;
  lectureId: string;
  kind: 'photo' | 'slides';
  uri: string;
  contentType: string;
  ext: string;
  sizeBytes: number | null;
  caption: string | null;
}

/**
 * After Stop on the iPhone: the lecture becomes "uploading" with its length,
 * every chunk is queued in recording order, then the lecture moves on to
 * "transcribing". Nothing needs a connection; the queue sends it when it can.
 */
export async function queueRecording(params: {
  sessionId: string;
  chunks: { uri: string; durationMs: number }[];
  durationSeconds: number;
}): Promise<void> {
  const { sessionId } = params;
  // Through updateSession: the lecture may itself still be waiting to be created.
  await enqueueLectureStatus(sessionId, 'uploading', params.durationSeconds);
  let startMs = 0;
  for (let seq = 0; seq < params.chunks.length; seq++) {
    const chunk = params.chunks[seq];
    await enqueue<UploadChunkPayload>({
      kind: 'upload_chunk',
      key: sessionId,
      payload: { lectureId: sessionId, seq, startMs, durationMs: chunk.durationMs, uri: chunk.uri },
    });
    startMs += chunk.durationMs;
  }
  await updateSession(sessionId, { status: 'transcribing' });
}

/** The lecture row as "uploading" (no app status for it), queued in order. */
async function enqueueLectureStatus(sessionId: string, status: 'uploading', durationSeconds: number): Promise<void> {
  const lecture = await readRow<LectureRow>('lectures', sessionId);
  const durationMs = Math.round(durationSeconds * 1000);
  if (lecture) {
    const next: LectureRow = { ...lecture, status, duration_ms: durationMs, updated_at: new Date().toISOString() };
    await saveLocalRow('lectures', next);
  }
  await enqueue({
    kind: 'update_lecture',
    key: sessionId,
    payload: { id: sessionId, file: {}, lecture: { status, duration_ms: durationMs } },
  });
}

async function queueMedia(
  media: Omit<UploadMediaPayload, 'lectureId'> & { sessionId: string; userId: string },
): Promise<SourceFile> {
  const userId = cacheUser() ?? media.userId;
  const at = new Date().toISOString();
  const row: LocalMediaRow = {
    id: media.id,
    user_id: userId,
    lecture_id: media.sessionId,
    file_id: null,
    kind: media.kind,
    // Where uploadFile will put it ({userId}/…).
    storage_path: `${userId}/${media.sessionId}/${media.id}.${media.ext}`,
    url: null,
    mime_type: media.contentType,
    size_bytes: media.sizeBytes,
    t_ms: null,
    page_count: null,
    extracted_text: null,
    caption: media.caption,
    alt_text: null,
    created_at: at,
    updated_at: at,
    local_uri: media.uri,
  };
  await saveLocalRow('media', row);
  const { sessionId, userId: _owner, ...rest } = media;
  await enqueue<UploadMediaPayload>({ kind: 'upload_media', key: sessionId, payload: { ...rest, lectureId: sessionId } });
  return mediaToSourceFile(row, media.uri);
}

registerSyncHandler<UploadChunkPayload>('upload_chunk', {
  run: async (p, ctx) => {
    if (!(await pendingFileExists(p.uri))) {
      // Uploaded just before the app was closed (the file is deleted after).
      const { data, error } = await supabase
        .from('audio_chunks')
        .select('id')
        .eq('lecture_id', p.lectureId)
        .eq('seq', p.seq)
        .not('storage_path', 'is', null)
        .maybeSingle();
      if (error) throw syncError(error, 'Could not save the recording.');
      if (data) return;
      throw new PermanentSyncError('This part of the recording is no longer on this iPhone.');
    }
    await createSourceFile({
      userId: cacheUser() ?? '',
      sessionId: p.lectureId,
      fileType: 'audio',
      filePath: p.uri,
      seq: p.seq,
      startMs: p.startMs,
      durationMs: p.durationMs,
      onProgress: ctx.progress,
    });
    await removePendingFile(p.uri);
  },
});

registerSyncHandler<UploadMediaPayload>('upload_media', {
  run: async (p, ctx) => {
    const bucket = mediaBucket(p.kind);
    const { data: existing, error: readError } = await supabase.from('media').select('*').eq('id', p.id).maybeSingle();
    if (readError) throw syncError(readError, 'Could not save the file.');

    let row = existing;
    if (!row) {
      if (!(await pendingFileExists(p.uri))) {
        throw new PermanentSyncError('This file is no longer on this iPhone.');
      }
      const { path } = await uploadFile({
        bucket,
        path: `${p.lectureId}/${p.id}.${p.ext}`,
        uri: p.uri,
        contentType: p.contentType,
        upsert: true,
        onProgress: ctx.progress,
      });
      const { data, error } = await supabase
        .from('media')
        .insert({
          id: p.id,
          lecture_id: p.lectureId,
          kind: p.kind,
          storage_path: path,
          mime_type: p.contentType,
          size_bytes: p.sizeBytes,
          caption: p.caption,
        })
        .select('*')
        .single();
      if (error) {
        const failure = syncError(error, 'Could not save the file.');
        if (failure instanceof PermanentSyncError) await removeFiles(bucket, [path]).catch(() => {});
        throw failure;
      }
      row = data;
    }
    await markClean('media', p.id, row);
    await removePendingFile(p.uri);
    notifyLibraryUpdated();
  },
});

/**
 * Waits while a lecture's queued work is sent, reporting the share of its
 * operations done. Resolves 'uploaded' when nothing is left, or 'later' as
 * soon as it can't go on now (offline, or an operation must wait or failed);
 * the queue then finishes on its own.
 */
export function awaitLectureUploads(
  sessionId: string,
  onProgress?: (fraction: number) => void,
): Promise<'uploaded' | 'later'> {
  if (!syncEnabled) return Promise.resolve('uploaded');
  return new Promise((resolve) => {
    let total = 0;
    let settled = false;
    const finish = (outcome: 'uploaded' | 'later') => {
      if (settled) return;
      settled = true;
      offEvent();
      resolve(outcome);
    };
    const check = async () => {
      const ops = await pendingSyncFor(sessionId);
      total = Math.max(total, ops.length);
      if (ops.length === 0) return finish('uploaded');
      const blocked = getConnection() === 'offline' || !isSessionLive();
      if (blocked || ops.some((o) => o.status === 'failed' || o.nextAttemptAt)) {
        return finish('later');
      }
      onProgress?.(total === 0 ? 1 : (total - ops.length) / total);
    };
    const offEvent = onSyncEvent((e) => {
      if (e.type === 'progress' && e.op.key === sessionId && total > 0) {
        pendingSyncFor(sessionId).then((ops) => onProgress?.((total - ops.length + e.fraction) / total));
      }
      if (e.type === 'changed' || e.type === 'failed') check().catch(() => finish('later'));
    });
    check().catch(() => finish('later'));
  });
}
