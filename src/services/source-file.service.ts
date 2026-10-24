import { Platform } from 'react-native';

import { supabase } from '../lib/supabase';
import { newId } from '../lib/mappers';
import { serviceError } from '../lib/cloudRows';
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
  if (!path) return '';
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

function mediaToSourceFile(media: MediaRow, url: string): SourceFile {
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
    is_uploaded: true,
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

// -------------------------------------------------------------------
// getProjectSourceFiles
// Returns all photo and PDF files across every lecture in a project,
// ordered newest first. Used for the project-level files section.
// -------------------------------------------------------------------
export async function getProjectSourceFiles(projectId: string): Promise<SourceFile[]> {
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

  return Promise.all(media.map(async (m) => mediaToSourceFile(m, await signed(mediaBucket(m.kind), m.storage_path))));
}

// -------------------------------------------------------------------
// getSourceFiles
// Returns a lecture's audio chunks (in recording order) and its media.
// Audio deleted by its retention policy is left out.
// -------------------------------------------------------------------
export async function getSourceFiles(sessionId: string): Promise<SourceFile[]> {
  const [lecture, chunks, media] = await Promise.all([
    supabase.from('lectures').select('audio_retention, audio_delete_after').eq('id', sessionId).maybeSingle(),
    supabase.from('audio_chunks').select('*').eq('lecture_id', sessionId).not('storage_path', 'is', null).order('seq'),
    supabase.from('media').select('*').eq('lecture_id', sessionId).order('created_at'),
  ]);
  const error = lecture.error ?? chunks.error ?? media.error;
  if (error) throw serviceError(error, 'Could not load the files.');

  return Promise.all([
    ...(chunks.data ?? []).map(async (c) =>
      chunkToSourceFile(c, lecture.data, await signed(Buckets.audioChunks, c.storage_path)),
    ),
    ...(media.data ?? []).map(async (m) => mediaToSourceFile(m, await signed(mediaBucket(m.kind), m.storage_path))),
  ]);
}

// Alias used throughout the UI for clarity.
export const getActiveSourceFiles = getSourceFiles;

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
