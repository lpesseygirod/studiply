import { supabase } from '../lib/supabase';
import { serviceError } from '../lib/cloudRows';
import { Buckets, getSignedUrl } from './cloud-storage.service';
import { isAudioFile, type PlaybackSource } from './recorder/types';

/**
 * A lecture's recording for the mini player: its 30-second chunks
 * in order, each with where it starts, how long it is and a short-lived
 * link. Audio removed by the lecture's keep-or-delete setting has no file
 * left (its chunk rows lose their path), so the player can say so.
 */

export interface PlaybackChunk {
  startMs: number;
  durationMs: number;
  url: string;
}

export interface LecturePlayback {
  chunks: PlaybackChunk[];
  /** Recorded, but the audio was deleted (the lecture's audio setting). */
  deleted: boolean;
}

export async function getLecturePlayback(lectureId: string): Promise<LecturePlayback> {
  const { data, error } = await supabase.from('audio_chunks').select('seq, start_ms, duration_ms, storage_path').eq('lecture_id', lectureId).order('seq');
  if (error) throw serviceError(error, 'Could not load the recording.');
  const kept = data.filter((c) => c.storage_path);
  const chunks = await Promise.all(
    kept.map(async (c) => ({ startMs: c.start_ms, durationMs: c.duration_ms, url: await getSignedUrl(Buckets.audioChunks, c.storage_path as string) })),
  );
  return { chunks, deleted: data.length > 0 && kept.length === 0 };
}

/**
 * While the lecture records: its audio as this device has it (recorder.playback):
 * a chunk not uploaded yet (and on the web the chunk being recorded) plays from the device's own
 * copy (the browser's Blob, the iPhone's file), an uploaded one from Storage. `release` frees
 * the browser copies' links when they're done with.
 */
export async function getLivePlayback(list: PlaybackSource[]): Promise<LecturePlayback & { release: () => void }> {
  const local: string[] = [];
  const chunks = await Promise.all(
    list.map(async (s) => {
      let url = '';
      if (s.blob && isAudioFile(s.blob)) url = s.blob.uri;
      else if (s.blob) {
        url = URL.createObjectURL(s.blob);
        local.push(url);
      } else if (s.storagePath) url = await getSignedUrl(Buckets.audioChunks, s.storagePath);
      return { startMs: s.startMs, durationMs: s.durationMs, url };
    }),
  );
  return { chunks: chunks.filter((c) => c.url), deleted: false, release: () => local.forEach((u) => URL.revokeObjectURL(u)) };
}

/**
 * Where to go on after chunk `index` ends: where it ends in the recording. The web's chunks
 * overlap by 500 ms, so the next one starts that far in instead of repeating it.
 */
export const endOf = (chunks: { startMs: number; durationMs: number }[], index: number) => chunks[index].startMs + chunks[index].durationMs;

/** The chunk with the moment `ms` in it, and how far into it; the last chunk's end for a moment past it; null when none. */
export function chunkAt(chunks: { startMs: number; durationMs: number }[], ms: number): { index: number; offsetMs: number } | null {
  if (!chunks.length) return null;
  const at = Math.max(0, ms);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (at < c.startMs + c.durationMs) return { index: i, offsetMs: Math.max(0, at - c.startMs) };
  }
  const last = chunks.length - 1;
  return { index: last, offsetMs: chunks[last].durationMs };
}

/** The whole recording's length. */
export const recordingLength = (chunks: { startMs: number; durationMs: number }[]) => (chunks.length ? chunks[chunks.length - 1].startMs + chunks[chunks.length - 1].durationMs : 0);
