/**
 * lecture-content.ts
 * What the notes, clarify and assistant requests read from a lecture, as
 * the student (RLS applies): its language, its transcript, its photos and
 * PDFs, and for the assistant (step 6.1) its notes, marks and earlier
 * questions; also where the assistant saves its questions and answers.
 */

import type Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HISTORY_TURNS, type MarkAt, type MessageRow, type TimedSegment } from './assistant.ts';
import type { LectureReads, MessageStore } from './assistant-answer.ts';
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
  return (await joinedSegments(db, lectureId, maxChars))
    .map((row) => row.text.trim())
    .filter(Boolean)
    .join(' ');
}

/** The transcript so far with its times (the assistant's windows), joined as above. */
export async function lectureSegments(db: SupabaseClient, lectureId: string): Promise<TimedSegment[]> {
  return (await joinedSegments(db, lectureId, Infinity)).map((row) => ({ startMs: row.start_ms, endMs: row.end_ms, text: row.text }));
}

async function joinedSegments(db: SupabaseClient, lectureId: string, maxChars: number) {
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
  if (rows.length === 0) return [];
  // Where each segment's chunk sits in the recording, to join the chunks' overlaps.
  const { data: chunks, error } = await db.from('audio_chunks').select('id, seq, start_ms, duration_ms').eq('lecture_id', lectureId);
  if (error) throw error;
  return joinSegmentRows(placeSegments(rows, chunks ?? []));
}

/** What the study assistant reads of a lecture (step 6.1), as the student. */
export function lectureReads(db: SupabaseClient, lectureId: string): LectureReads {
  return {
    segments: () => lectureSegments(db, lectureId),
    language: () => lectureLanguage(db, lectureId),
    async notes() {
      const { data, error } = await db.from('note_lines').select('t_ms, text').eq('lecture_id', lectureId).order('position').limit(PAGE_SIZE);
      if (error) throw error;
      return (data ?? []).map((n) => ({ tMs: (n.t_ms as number | null) ?? null, text: String(n.text ?? '') }));
    },
    async marks() {
      const { data, error } = await db.from('marks').select('type, level, t_ms, note').eq('lecture_id', lectureId).order('t_ms').limit(PAGE_SIZE);
      if (error) throw error;
      return (data ?? []).map((m) => ({ type: m.type as MarkAt['type'], level: m.level as number, tMs: m.t_ms as number, note: (m.note as string | null) ?? null }));
    },
    async history() {
      const { data, error } = await db
        .from('assistant_messages')
        .select('id, role, content, reply_to, status')
        .eq('lecture_id', lectureId)
        .order('created_at', { ascending: false })
        .limit(4 * HISTORY_TURNS);
      if (error) throw error;
      return ((data ?? []) as MessageRow[]).reverse();
    },
  };
}

/** The lecture's assistant_messages: a question and its answer, each with the window. */
export function messageStore(db: SupabaseClient, lectureId: string): MessageStore {
  return {
    async start({ question, quickPrompt, askedAtMs, window, model }) {
      const common = {
        lecture_id: lectureId,
        quick_prompt: quickPrompt,
        asked_at_ms: askedAtMs,
        window_start_ms: window.startMs,
        window_end_ms: window.endMs,
      };
      const asked = await db.from('assistant_messages').insert({ ...common, role: 'user', content: question, status: 'done' }).select('id').single();
      if (asked.error) throw asked.error;
      const answer = await db
        .from('assistant_messages')
        .insert({ ...common, role: 'assistant', content: '', reply_to: asked.data.id, model, status: 'streaming' })
        .select('id')
        .single();
      if (answer.error) throw answer.error;
      return { questionId: asked.data.id as string, answerId: answer.data.id as string };
    },
    async finish(answerId, { content, status, model }) {
      const { error } = await db.from('assistant_messages').update({ content, status, ...(model && { model }) }).eq('id', answerId);
      if (error) throw error;
    },
  };
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
