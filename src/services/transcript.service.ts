import { supabase } from '../lib/supabase';
import { segmentsToTranscript, serviceError, type SegmentRow } from '../lib/cloudRows';
import type { Transcript } from '../types/database';

/**
 * A lecture's transcript is its rows in `transcript_segments` (times in ms
 * from the start of the recording). The transcribe-chunk Edge Function
 * writes them for real recordings; createTranscript is only for text the
 * app makes itself (the development mock pipeline).
 */

/** PostgREST returns at most 1000 rows per request; a long lecture has more. */
const PAGE = 1000;

interface WhisperLikeSegment {
  start: number;
  end: number;
  text: string;
}

function isSegment(value: unknown): value is WhisperLikeSegment {
  const s = value as WhisperLikeSegment;
  return typeof s?.start === 'number' && typeof s?.end === 'number' && typeof s?.text === 'string';
}

// -------------------------------------------------------------------
// createTranscript
// Segments in the Whisper shape (seconds); without them the full text is
// stored as one segment.
// -------------------------------------------------------------------
export async function createTranscript(params: {
  userId: string;
  sessionId: string;
  language: string;
  fullText: string;
  segments?: unknown;
  confidenceScore?: number;
}): Promise<Transcript> {
  const given = Array.isArray(params.segments) ? params.segments.filter(isSegment) : [];
  const segments = given.length > 0 ? given : [{ start: 0, end: 0, text: params.fullText }];

  const rows = segments.map((s) => ({
    lecture_id: params.sessionId,
    start_ms: Math.max(0, Math.round(s.start * 1000)),
    end_ms: Math.max(0, Math.round(Math.max(s.start, s.end) * 1000)),
    text: s.text,
    confidence: params.confidenceScore ?? null,
  }));
  const { error } = await supabase.from('transcript_segments').insert(rows);
  if (error) throw serviceError(error, 'Could not save the transcript.');

  const transcript = await getTranscriptBySession(params.sessionId);
  if (!transcript) throw new Error('Failed to create transcript.');
  return transcript;
}

// -------------------------------------------------------------------
// getTranscriptBySession
// Returns null if no transcript exists yet.
// -------------------------------------------------------------------
export async function getTranscriptBySession(sessionId: string): Promise<Transcript | null> {
  const { data: lecture, error } = await supabase
    .from('lectures')
    .select('id, user_id, language, created_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw serviceError(error, 'Could not load the transcript.');
  if (!lecture) return null;

  const segments: SegmentRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error: pageError } = await supabase
      .from('transcript_segments')
      .select('start_ms, end_ms, text, confidence')
      .eq('lecture_id', sessionId)
      .order('start_ms', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (pageError) throw serviceError(pageError, 'Could not load the transcript.');
    segments.push(...data);
    if (data.length < PAGE) break;
  }

  return segmentsToTranscript(lecture, segments);
}
