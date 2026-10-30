/**
 * lecture-content.ts
 * What the notes and clarify requests read from a lecture, as the student
 * (RLS applies): its language, its transcript, and its photos and PDFs.
 */

import type Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MAX_MEDIA_BYTES, toBase64 } from './legacy-notes.ts';
import { joinSegmentRows, placeSegments } from './transcriptJoin.ts';

const PAGE_SIZE = 1000;

/** The lecture's language code, or null when Whisper detects it. */
export async function lectureLanguage(db: SupabaseClient, lectureId: string): Promise<string | null> {
  const { data, error } = await db.from('lectures').select('language').eq('id', lectureId).maybeSingle();
  if (error) throw error;
  return (data?.language as string | null) ?? null;
}

interface SegmentRead {
  start_ms: number;
  end_ms: number;
  text: string;
  chunk_id: string | null;
}

/**
 * The transcript as one text, segments in time order, read page by page
 * (a long lecture has more than PostgREST's 1000 rows). Stops once
 * `maxChars` are read, when given. Assembled like the app's
 * (./transcriptJoin): each chunk's segments as stored, the words of the
 * 500 ms overlap between two chunks kept once.
 */
export async function lectureTranscript(db: SupabaseClient, lectureId: string, maxChars = Infinity): Promise<string> {
  const rows: SegmentRead[] = [];
  let length = 0;
  for (let from = 0; length < maxChars; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('transcript_segments')
      .select('start_ms, end_ms, text, chunk_id')
      .eq('lecture_id', lectureId)
      .order('start_ms', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data as SegmentRead[]) {
      rows.push({ ...row, text: String(row.text ?? '') });
      length += row.text ? row.text.trim().length + 1 : 0;
    }
    if (data.length < PAGE_SIZE) break;
  }
  if (rows.length === 0) return '';
  // Where each segment's chunk sits in the recording, to join the chunks' overlaps.
  const { data: chunks, error } = await db.from('audio_chunks').select('id, seq, start_ms, duration_ms').eq('lecture_id', lectureId);
  if (error) throw error;
  return joinSegmentRows(placeSegments(rows, chunks ?? []))
    .map((row) => row.text.trim())
    .filter(Boolean)
    .join(' ');
}

export type MediaResult =
  | { ok: true; blocks: Anthropic.Beta.BetaContentBlockParam[]; photos: number; pdfs: number; bytes: number }
  | { ok: false; reason: 'too_large' | 'not_found' };

/**
 * The lecture's photos (JPEG, `photos` bucket) and PDFs (`slides`) as
 * Claude content blocks, oldest first, downloaded as the student. Fails
 * when they add up to more than MAX_MEDIA_BYTES or a file is missing.
 */
export async function lectureMedia(db: SupabaseClient, lectureId: string): Promise<MediaResult> {
  const { data: media, error } = await db
    .from('media')
    .select('kind, storage_path')
    .eq('lecture_id', lectureId)
    .in('kind', ['photo', 'slides'])
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const images: Anthropic.Beta.BetaContentBlockParam[] = [];
  const documents: Anthropic.Beta.BetaContentBlockParam[] = [];
  let bytes = 0;
  for (const item of media) {
    const photo = item.kind === 'photo';
    const { data: file, error: downloadError } = await db.storage
      .from(photo ? 'photos' : 'slides')
      .download(item.storage_path as string);
    if (downloadError || !file) return { ok: false, reason: 'not_found' };
    bytes += file.size;
    if (bytes > MAX_MEDIA_BYTES) return { ok: false, reason: 'too_large' };

    const data = toBase64(new Uint8Array(await file.arrayBuffer()));
    if (photo) images.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
    else documents.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
  }
  // Photos, then PDFs, as in the old app; the text block follows them.
  return { ok: true, blocks: [...images, ...documents], photos: images.length, pdfs: documents.length, bytes };
}
