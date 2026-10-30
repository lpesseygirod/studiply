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
import { photoBlocks, slidesBlocks, type LectureMaterial } from './summary-pipeline.ts';
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

/**
 * A finished answer of this lecture and its question (step 6.3, Flashcards from an answer), as the
 * student; null when there is no such answer.
 */
export async function savedAnswer(db: SupabaseClient, lectureId: string, answerId: string): Promise<{ question: string; answer: string } | null> {
  const { data, error } = await db
    .from('assistant_messages')
    .select('content, reply_to, role, status')
    .eq('id', answerId)
    .eq('lecture_id', lectureId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.role !== 'assistant' || data.status !== 'done' || !String(data.content ?? '').trim()) return null;
  let question = '';
  if (data.reply_to) {
    const asked = await db.from('assistant_messages').select('content').eq('id', data.reply_to).maybeSingle();
    if (asked.error) throw asked.error;
    question = String(asked.data?.content ?? '');
  }
  return { question, answer: String(data.content) };
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

/**
 * Everything the summary reads of a lecture (step 7.4), as the student: the file, its course and the
 * course's settings, the transcript with times, My notes' lines (with their formatting), the marks,
 * the questions to the assistant with their answers, the photos and the slides.
 */
export async function summaryMaterial(db: SupabaseClient, lectureId: string): Promise<LectureMaterial> {
  const { data: file, error: fileError } = await db.from('files').select('title, course_id, created_at').eq('id', lectureId).single();
  if (fileError) throw fileError;
  const { data: lecture, error: lectureError } = await db.from('lectures').select('language, duration_ms').eq('id', lectureId).single();
  if (lectureError) throw lectureError;

  let courseName: string | null = null;
  let settings: { subject_type: string | null; exam_format: string | null; summary_language: string | null; professor: string | null } | null = null;
  let lectureNumber: number | null = null;
  if (file.course_id) {
    const [course, courseSettings, earlier] = await Promise.all([
      db.from('courses').select('name').eq('id', file.course_id).maybeSingle(),
      db.from('course_settings').select('subject_type, exam_format, summary_language, professor').eq('course_id', file.course_id).maybeSingle(),
      db.from('files').select('id', { count: 'exact', head: true }).eq('course_id', file.course_id).eq('kind', 'lecture').is('deleted_at', null).lte('created_at', file.created_at),
    ]);
    if (course.error) throw course.error;
    if (courseSettings.error) throw courseSettings.error;
    courseName = (course.data?.name as string | undefined) ?? null;
    settings = courseSettings.data;
    lectureNumber = earlier.count ?? null;
  }

  const [segments, notes, marks, messages, media] = await Promise.all([
    lectureSegments(db, lectureId),
    db.from('note_lines').select('block_id, t_ms, text, content').eq('lecture_id', lectureId).order('position').limit(PAGE_SIZE),
    db.from('marks').select('id, type, level, t_ms, note').eq('lecture_id', lectureId).order('t_ms').limit(PAGE_SIZE),
    db.from('assistant_messages').select('id, role, content, reply_to, status, asked_at_ms, window_start_ms, window_end_ms').eq('lecture_id', lectureId).order('created_at').limit(PAGE_SIZE),
    db.from('media').select('id, kind, t_ms, caption').or(`lecture_id.eq.${lectureId},file_id.eq.${lectureId}`).in('kind', ['photo', 'slides']).order('created_at'),
  ]);
  for (const r of [notes, marks, messages, media]) if (r.error) throw r.error;

  const rows = (messages.data ?? []) as { id: string; role: string; content: string; reply_to: string | null; status: string; asked_at_ms: number | null; window_start_ms: number | null; window_end_ms: number | null }[];
  const questions = rows
    .filter((q) => q.role === 'user')
    .map((q) => ({
      id: q.id,
      askedAtMs: q.asked_at_ms,
      windowStartMs: q.window_start_ms,
      windowEndMs: q.window_end_ms,
      question: String(q.content ?? ''),
      answer: String(rows.find((a) => a.role === 'assistant' && a.reply_to === q.id && a.status === 'done')?.content ?? ''),
    }));
  const end = segments.reduce((t, s) => Math.max(t, s.endMs), 0);
  return {
    lectureId,
    title: String(file.title ?? ''),
    courseName,
    lectureNumber,
    date: String(file.created_at ?? '').slice(0, 10),
    professor: settings?.professor ?? null,
    language: (lecture.language as string | null) ?? null,
    summaryLanguage: settings?.summary_language ?? null,
    subjectType: (settings?.subject_type as LectureMaterial['subjectType']) ?? null,
    examFormat: (settings?.exam_format as LectureMaterial['examFormat']) ?? null,
    durationMs: Math.max((lecture.duration_ms as number | null) ?? 0, end),
    segments,
    notes: (notes.data ?? []).map((n) => ({ id: String(n.block_id), tMs: (n.t_ms as number | null) ?? null, text: String(n.text ?? ''), content: n.content })),
    marks: (marks.data ?? []).map((k) => ({ id: String(k.id), type: k.type as MarkAt['type'], level: k.level as number, tMs: k.t_ms as number, note: (k.note as string | null) ?? null })),
    questions,
    photos: (media.data ?? []).filter((x) => x.kind === 'photo').map((x) => ({ id: String(x.id), tMs: (x.t_ms as number | null) ?? null })),
    slides: (media.data ?? []).filter((x) => x.kind === 'slides').map((x) => ({ id: String(x.id), name: String(x.caption ?? 'Slides') })),
  };
}

/** SUMMARY-SPEC's caps per summary. */
export const MAX_SUMMARY_PHOTOS = 20;
export const MAX_SUMMARY_PDFS = 3;

/**
 * The ticked photos and slides as Claude content (step 7.4), each photo after a line naming it (its id
 * and time, for capturedImage). Called only with images consent. Over the caps or MAX_MEDIA_BYTES,
 * the rest is left out (the summary still goes on, built from fewer sources).
 */
export async function summaryMedia(
  db: SupabaseClient,
  lectureId: string,
  want: { photos: boolean; slides: boolean },
): Promise<{ blocks: Anthropic.Beta.BetaContentBlockParam[]; photos: number; pdfs: number; bytes: number }> {
  const kinds = [...(want.photos ? ['photo'] : []), ...(want.slides ? ['slides'] : [])];
  if (!kinds.length) return { blocks: [], photos: 0, pdfs: 0, bytes: 0 };
  const { data: media, error } = await db
    .from('media')
    .select('id, kind, storage_path, t_ms')
    .or(`lecture_id.eq.${lectureId},file_id.eq.${lectureId}`)
    .in('kind', kinds)
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  let photos = 0;
  let pdfs = 0;
  let bytes = 0;
  for (const item of media) {
    const photo = item.kind === 'photo';
    if (photo ? photos >= MAX_SUMMARY_PHOTOS : pdfs >= MAX_SUMMARY_PDFS) continue;
    const { data: file, error: downloadError } = await db.storage.from(photo ? 'photos' : 'slides').download(item.storage_path as string);
    if (downloadError || !file) continue;
    if (bytes + file.size > MAX_MEDIA_BYTES) continue;
    bytes += file.size;
    const data = toBase64(new Uint8Array(await file.arrayBuffer()));
    // The blocks as summary-pipeline.ts builds them (and Jest checks them).
    if (photo) {
      blocks.push(...(photoBlocks(String(item.id), typeof item.t_ms === 'number' ? item.t_ms : null, data) as unknown as Anthropic.Beta.BetaContentBlockParam[]));
      photos += 1;
    } else {
      blocks.push(...(slidesBlocks(data) as unknown as Anthropic.Beta.BetaContentBlockParam[]));
      pdfs += 1;
    }
  }
  return { blocks, photos, pdfs, bytes };
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
