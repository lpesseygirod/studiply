import { supabase } from '../lib/supabase';
import {
  SEGMENT_COLUMNS,
  segmentsToTranscript,
  serviceError,
  withChunkPlaces,
  type LectureRow,
  type SegmentRow,
} from '../lib/cloudRows';
import { readRow, readSegments, readThrough, saveSegments } from '../lib/cache';
import type { Transcript } from '../types/database';

/**
 * A lecture's transcript is its rows in `transcript_segments` (times in ms
 * from the start of the recording), written by the transcribe-chunk Edge Function.
 *
 * A transcript that was read once (or downloaded by the library pull) is
 * kept on the iPhone and opens offline.
 */

/** PostgREST returns at most 1000 rows per request; a long lecture has more. */
const PAGE = 1000;

// -------------------------------------------------------------------
// getTranscriptBySession
// Returns null if no transcript exists yet.
// -------------------------------------------------------------------
export async function getTranscriptBySession(sessionId: string): Promise<Transcript | null> {
  // Wrapped, so "no transcript yet" isn't mistaken for "nothing cached".
  const found = await readThrough<{ transcript: Transcript | null }>(
    async () => {
      const { data: lecture, error } = await supabase
        .from('lectures')
        .select('id, user_id, language, created_at')
        .eq('id', sessionId)
        .maybeSingle();
      if (error) throw serviceError(error, 'Could not load the transcript.');
      if (!lecture) return { transcript: null };

      const read: (SegmentRow & { chunk_id: string | null })[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error: pageError } = await supabase
          .from('transcript_segments')
          .select(SEGMENT_COLUMNS)
          .eq('lecture_id', sessionId)
          .order('start_ms', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (pageError) throw serviceError(pageError, 'Could not load the transcript.');
        read.push(...data);
        if (data.length < PAGE) break;
      }
      // Where each segment's chunk sits, so the chunks' overlaps are joined (cached with them).
      const { data: chunks, error: chunkError } = await supabase
        .from('audio_chunks')
        .select('id, seq, start_ms, duration_ms')
        .eq('lecture_id', sessionId);
      if (chunkError) throw serviceError(chunkError, 'Could not load the transcript.');
      const segments = withChunkPlaces(read, chunks);

      saveSegments(sessionId, lecture.user_id, segments).catch(() => {});
      return { transcript: segmentsToTranscript(lecture, segments) };
    },
    async () => {
      const [lecture, segments] = await Promise.all([
        readRow<LectureRow>('lectures', sessionId),
        readSegments(sessionId),
      ]);
      if (!lecture) return null;
      // Segments never downloaded for a lecture that has them: not available offline.
      if (!segments) return lecture.status === 'ready' ? null : { transcript: null };
      return { transcript: segmentsToTranscript(lecture, segments) };
    },
  );
  return found.transcript;
}
