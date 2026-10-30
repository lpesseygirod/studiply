/**
 * The recorder's two queued jobs (step 5.2), each in its own queue lane so
 * that transcription trouble never holds up the audio:
 *  - upload_chunk: the chunk's audio to Storage and its audio_chunks row,
 *    then the audio is dropped from the device (the server has it);
 *  - transcribe_chunk: transcribe-chunk for a chunk once it is uploaded; the
 *    segments are kept with the chunk for the live transcript.
 * Both read the chunk from the store (the payload is only its number), and
 * both are safe to run twice, as the queue requires.
 */

import { classify, describeError, PermanentSyncError, SyncHttpError, type SyncHandler } from '../../lib/sync/queue';
import type { ChunkRef, RecordingStore, Segment, StoredChunk } from './types';

/** A 20-minute chunk on a slow connection takes a while; longer means it hung (as on the iPhone). */
const UPLOAD_TIMEOUT_MS = 10 * 60_000;

export function uploadChunkHandler(deps: {
  store: RecordingStore;
  /** Uploads the audio and saves its row; returns its Storage path. */
  upload: (chunk: StoredChunk & { blob: Blob }, onProgress: (fraction: number) => void) => Promise<string>;
  /** Whether the server already has the chunk (uploaded just before the device copy went). */
  onServer: (ref: ChunkRef) => Promise<boolean>;
}): SyncHandler<ChunkRef> {
  return {
    timeoutMs: UPLOAD_TIMEOUT_MS,
    run: async (ref, ctx) => {
      const chunk = await deps.store.getChunk(ref.lectureId, ref.seq);
      if (chunk?.storagePath) return;
      if (!chunk?.blob) {
        if (await deps.onServer(ref)) return;
        throw new PermanentSyncError('This part of the recording is no longer on this device.', `${ref.lectureId}/${ref.seq}`);
      }
      const storagePath = await deps.upload({ ...chunk, blob: chunk.blob }, ctx.progress);
      // Only now: until the row exists, the device's copy is the only one.
      await deps.store.updateChunk(ref.lectureId, ref.seq, { storagePath, blob: null });
    },
  };
}

export function transcribeChunkHandler(deps: {
  store: RecordingStore;
  transcribe: (p: { lectureId: string; seq: number; storagePath: string; startMs: number; durationMs: number }) => Promise<Segment[]>;
}): SyncHandler<ChunkRef> {
  return {
    run: async (ref) => {
      const chunk = await deps.store.getChunk(ref.lectureId, ref.seq);
      if (!chunk || chunk.segments || chunk.transcriptError) return;
      // Queued only once uploaded; if not (yet), tried again later like a lost connection.
      if (!chunk.storagePath) throw new SyncHttpError('Waits for the upload.', 503);
      try {
        const segments = await deps.transcribe({
          lectureId: ref.lectureId,
          seq: ref.seq,
          storagePath: chunk.storagePath,
          startMs: chunk.startMs,
          durationMs: chunk.durationMs,
        });
        await deps.store.updateChunk(ref.lectureId, ref.seq, { segments });
      } catch (err) {
        const kind = classify(err);
        if (kind === 'retry' || kind === 'refresh') throw err;
        // Refused (no consent, a file the service can't read): noted, and the next
        // chunks go on; the transcription after Stop tries this one again.
        await deps.store.updateChunk(ref.lectureId, ref.seq, { transcriptError: describeError(err) });
      }
    },
  };
}
