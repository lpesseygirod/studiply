import { supabase } from '../lib/supabase';
import { NetworkError, isNetworkError, serviceError, type SummaryRow } from '../lib/cloudRows';
import { cacheUser, markClean, readRows, readThrough, remember, saveLocalRow } from '../lib/cache';
import { isOffline } from '../lib/connectivity';
import { newId } from '../lib/mappers';
import { enqueue, registerSyncHandler, syncEnabled } from '../lib/sync';
import { syncError } from '../lib/sync/errors';
import type { Json } from '../types/supabase';
import { noteLinesOf } from '../editor/noteLines';
import type { DocJSON } from '../editor/types';
import { fromCourseSettings, SLIDER_DEFAULTS, SLIDER_KEYS, type PlanInput, type Sliders, type SummaryPlan } from '../../supabase/functions/_shared/summary-plan';
import { Buckets, removeFiles, uploadFile } from './cloud-storage.service';
import { openDocument, getDocumentFile } from './document.service';
import { checkUpload, type PickedFile } from './library-upload.service';
import { marksOf } from './marks.service';
import { getProject } from './project.service';
import { getSession, ensureLectureOnServer } from './session.service';
import { getTranscriptBySession } from './transcript.service';

/**
 * Stop & summarize (step 7.3): what the panel shows and what it saves.
 *
 * - Its starting values are the course's defaults (`course_settings`), else
 *   the spec's (Lea's advisor, 30 Oct: "Course defaults pre-fill everything").
 * - Its counts come from the lecture as saved: My notes (note lines and mark
 *   chips), the assistant's questions, the photos, slides and links, the
 *   transcript's words (for the preview line).
 * - Stop & generate saves a `summaries` row: mode `new`, status `pending`,
 *   the 10 values, and in `applied_settings` the calculator's numbers, the
 *   resources ticked and the preview line. Step 7.4 writes the summary from
 *   it. Its `result` stays empty, so the earlier notes (legacy-note-v1 rows
 *   of the same table, read only where `result.format` says so) never take
 *   it for one.
 * - The iPhone saves it on the phone and queues it (`request_summary`), so
 *   Stop works offline; the laptop sends it at once.
 */

export interface SummarizeResources {
  slides: boolean;
  photos: boolean;
  assistant: boolean;
  /** My notes and marks: always (they can't be unticked). */
  notes: true;
}

export interface SummarizeInfo {
  lectureId: string;
  courseId: string | null;
  courseName: string | null;
  /** The course's defaults, else the spec's. */
  defaults: Sliders;
  durationMs: number;
  transcriptWords: number;
  noteLines: PlanInput['noteLines'];
  marks: PlanInput['marks'];
  questions: PlanInput['assistant'];
  answers: number;
  photos: { id: string; tMs: number | null }[];
  slides: { id: string; name: string; pages: number | null }[];
  links: { id: string; url: string }[];
}

type MediaRow = { id: string; kind: string; t_ms: number | null; caption: string | null; page_count: number | null; url: string | null; storage_path: string | null };

const wordsIn = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** The course's slider defaults, else the spec's (also offline or when the row can't be read). */
export async function courseDefaults(courseId: string | null): Promise<Sliders> {
  if (!courseId) return SLIDER_DEFAULTS;
  try {
    const { data, error } = await supabase
      .from('course_settings')
      .select('slider_starting_point, slider_length, slider_depth, slider_examples, slider_visuals, slider_exam_focus, slider_self_test, slider_language, slider_extra_resources, slider_follow_marks')
      .eq('course_id', courseId)
      .maybeSingle();
    return !error && data ? fromCourseSettings(data) : SLIDER_DEFAULTS;
  } catch {
    return SLIDER_DEFAULTS;
  }
}

/** Save as course default: the course's 10 values. Online only (the button says so offline). */
export async function saveCourseDefaults(courseId: string, s: Sliders): Promise<void> {
  if (isOffline()) throw new NetworkError();
  const { error } = await supabase
    .from('course_settings')
    .update({
      slider_starting_point: s.startingPoint,
      slider_length: s.length,
      slider_depth: s.depth,
      slider_examples: s.examples,
      slider_visuals: s.visuals,
      slider_exam_focus: s.examFocus,
      slider_self_test: s.selfTest,
      slider_language: s.language,
      slider_extra_resources: s.extraResources,
      slider_follow_marks: s.followMarks,
    })
    .eq('course_id', courseId);
  if (error) throw serviceError(error, 'Could not save the course’s defaults.');
}

/** Everything the panel shows for a lecture. `durationMs`: the recording's clock while it records. */
export async function loadSummarizeInfo(lectureId: string, { durationMs }: { durationMs?: number } = {}): Promise<SummarizeInfo> {
  const file = await getDocumentFile(lectureId);
  const [defaults, course, notes, session, transcript, assistant, media] = await Promise.all([
    courseDefaults(file.course_id),
    file.course_id ? getProject(file.course_id).catch(() => null) : null,
    openDocument(lectureId, 'notes').catch(() => null),
    durationMs === undefined ? getSession(lectureId).catch(() => null) : null,
    getTranscriptBySession(lectureId).catch(() => null),
    assistantOf(lectureId),
    mediaOf(lectureId),
  ]);
  const doc = (notes?.content ?? { type: 'doc', content: [] }) as DocJSON;
  const segments = Array.isArray(transcript?.segments) ? (transcript.segments as unknown as { text?: string }[]) : [];
  return {
    lectureId,
    courseId: file.course_id,
    courseName: course?.name ?? null,
    defaults,
    durationMs: durationMs ?? (session?.duration_seconds ?? 0) * 1000,
    transcriptWords: segments.reduce((n, s) => n + wordsIn(s.text ?? ''), 0),
    noteLines: noteLinesOf(doc)
      .filter((l) => l.text.trim())
      .map((l) => ({ id: l.block_id, atMs: l.t_ms })),
    marks: marksOf(doc).map((m) => ({ id: m.id, type: m.type, level: m.level, atMs: m.t_ms })),
    ...assistant,
    photos: media.filter((m) => m.kind === 'photo').map((m) => ({ id: m.id, tMs: m.t_ms })),
    slides: media.filter((m) => m.kind === 'slides').map((m) => ({ id: m.id, name: m.caption ?? 'Slides', pages: m.page_count })),
    links: media.filter((m) => m.kind === 'link' && m.url).map((m) => ({ id: m.id, url: m.url as string })),
  };
}

/** The student's questions to the assistant (with their windows) and the answers saved. Online only; none offline. */
async function assistantOf(lectureId: string): Promise<{ questions: PlanInput['assistant']; answers: number }> {
  try {
    const { data, error } = await supabase
      .from('assistant_messages')
      .select('id, role, status, asked_at_ms, window_start_ms, window_end_ms')
      .eq('lecture_id', lectureId);
    if (error || !data) return { questions: [], answers: 0 };
    return {
      questions: data
        .filter((m) => m.role === 'user')
        .map((m) => ({ id: m.id, askedAtMs: m.asked_at_ms, windowStartMs: m.window_start_ms, windowEndMs: m.window_end_ms })),
      answers: data.filter((m) => m.role === 'assistant' && m.status === 'done').length,
    };
  } catch {
    return { questions: [], answers: 0 };
  }
}

async function mediaOf(lectureId: string): Promise<MediaRow[]> {
  const rows = await readThrough<MediaRow[]>(
    async () => {
      const { data, error } = await supabase.from('media').select('*').or(`lecture_id.eq.${lectureId},file_id.eq.${lectureId}`);
      if (error) throw serviceError(error, 'Could not load the lecture’s files.');
      remember('media', data);
      return data;
    },
    () => readRows<MediaRow>('media', lectureId),
  ).catch(() => null);
  return rows ?? [];
}

// -------------------------------------------------------------------
// The request (a pending `summaries` row)
// -------------------------------------------------------------------

/** What `applied_settings` holds for a request: the calculator's numbers, the resources and the preview line. */
export type RequestSettings = SummaryPlan['appliedSettings'] & { resources: SummarizeResources; preview: string };

type RequestRow = Pick<SummaryRow, 'id' | 'file_id' | 'mode' | 'source_lecture_ids' | 'sliders' | 'status' | 'applied_settings'>;

/** A summary request of the summarize panel (not an earlier note): no result yet, the 10 sliders. */
export function isSummaryRequest(row: Pick<SummaryRow, 'result' | 'sliders' | 'mode'>): boolean {
  // An earlier note (legacy-note-v1) always has its result; a request has none until 7.4 writes it.
  if (row.result != null) return false;
  const s = row.sliders as Record<string, unknown> | null;
  return row.mode === 'new' && !!s && typeof s === 'object' && SLIDER_KEYS.every((k) => typeof s[k] === 'number');
}

export function requestRow(lectureId: string, sliders: Sliders, resources: SummarizeResources, plan: SummaryPlan, id = newId()): RequestRow {
  const settings: RequestSettings = { ...plan.appliedSettings, resources, preview: plan.preview };
  return {
    id,
    file_id: lectureId,
    mode: 'new',
    source_lecture_ids: [lectureId],
    sliders: { ...sliders } as unknown as RequestRow['sliders'],
    status: 'pending',
    applied_settings: settings as unknown as Json,
  };
}

/**
 * Stop & generate summary: the request for step 7.4. The iPhone keeps it and queues it (offline too);
 * the laptop sends it now (a NetworkError when offline).
 */
export async function requestSummary(lectureId: string, sliders: Sliders, resources: SummarizeResources, plan: SummaryPlan): Promise<string> {
  const row = requestRow(lectureId, sliders, resources, plan);
  if (syncEnabled) {
    const userId = cacheUser();
    if (!userId) throw new Error('Could not save the summary settings.');
    const at = new Date().toISOString();
    const local: SummaryRow = {
      ...row,
      user_id: userId,
      result: null,
      note_lines_total: null,
      note_lines_used: null,
      marks_total: null,
      marks_used: null,
      model: null,
      error: null,
      created_at: at,
      updated_at: at,
    };
    await saveLocalRow('summaries', local);
    // Keyed by the lecture: it waits behind the lecture's own creation if that is still queued.
    await enqueue<RequestRow>({ kind: 'request_summary', key: lectureId, payload: row });
    return row.id;
  }
  if (isOffline()) throw new NetworkError();
  const { data, error } = await supabase.from('summaries').insert(row).select('*');
  if (error) throw serviceError(error, 'Could not save the summary settings.');
  remember('summaries', data ?? []);
  return row.id;
}

registerSyncHandler<RequestRow>('request_summary', {
  run: async (row) => {
    await ensureLectureOnServer(row.file_id);
    // Sent twice (a retry after the answer was lost): the row is there already.
    const { error } = await supabase.from('summaries').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw syncError(error, 'Could not save the summary settings.');
    const { data } = await supabase.from('summaries').select('*').eq('id', row.id).maybeSingle();
    if (data) await markClean('summaries', row.id, data);
  },
});

/** The lecture's newest summary request (for the Summary tab's card), or null. */
export async function latestSummaryRequest(lectureId: string): Promise<{ id: string; status: string; settings: RequestSettings | null; createdAt: string } | null> {
  const rows = await readThrough<SummaryRow[]>(
    async () => {
      const { data, error } = await supabase.from('summaries').select('*').eq('file_id', lectureId).is('result', null).order('created_at', { ascending: false });
      if (error) throw serviceError(error, 'Could not load the summary.');
      remember('summaries', data);
      return data;
    },
    () => readRows<SummaryRow>('summaries', lectureId),
  ).catch((err) => {
    if (isNetworkError(err)) return [] as SummaryRow[];
    throw err;
  });
  const row = (rows ?? [])
    .filter(isSummaryRequest)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!row) return null;
  const s = row.applied_settings as Record<string, unknown> | null;
  return { id: row.id, status: row.status, settings: s && typeof s.preview === 'string' ? (s as unknown as RequestSettings) : null, createdAt: row.created_at };
}

/** Whether the lecture was recorded in the new way (chunks transcribed while recording): it summarizes with the panel. */
export async function recordedInChunks(lectureId: string): Promise<boolean> {
  const rows = await readThrough<{ id: string }[]>(
    async () => {
      const { data, error } = await supabase.from('audio_chunks').select('id').eq('lecture_id', lectureId).limit(1);
      if (error) throw serviceError(error, 'Could not load the recording.');
      return data;
    },
    () => readRows<{ id: string }>('audio_chunks', lectureId),
  ).catch(() => null);
  return (rows ?? []).length > 0;
}

// -------------------------------------------------------------------
// The add buttons
// -------------------------------------------------------------------

/**
 * + Slides or PDF: the PDF kept with the lecture (a `slides` media row and its Storage file). Its pages
 * and text are read by the summary pipeline (step 7.4). Online only.
 */
export async function addSlides(lectureId: string, picked: PickedFile): Promise<void> {
  const check = checkUpload(picked);
  if (!check.ok) throw new Error(check.reason);
  if (check.kind !== 'pdf') throw new Error('Choose a PDF. Photos go in with + Photos.');
  if (isOffline()) throw new NetworkError();
  const mediaId = newId();
  const { path } = await uploadFile({ bucket: Buckets.slides, path: `${lectureId}/${mediaId}.pdf`, uri: picked.uri, contentType: 'application/pdf' });
  const { data, error } = await supabase
    .from('media')
    .insert({ id: mediaId, lecture_id: lectureId, kind: 'slides', storage_path: path, mime_type: 'application/pdf', size_bytes: picked.sizeBytes, caption: picked.name ?? 'Slides.pdf' })
    .select('*');
  if (error) {
    await removeFiles(Buckets.slides, [path]).catch(() => {});
    throw serviceError(error, 'Could not add the slides.');
  }
  remember('media', data ?? []);
}

/** + Link: a URL kept with the lecture (Logistics in the summary, step 7.4). Online only. */
export async function addLink(lectureId: string, url: string): Promise<void> {
  const clean = url.trim();
  if (!/^https?:\/\/\S+\.\S+/i.test(clean)) throw new Error('Type a web address starting with http:// or https://.');
  if (isOffline()) throw new NetworkError();
  const { data, error } = await supabase.from('media').insert({ lecture_id: lectureId, kind: 'link', url: clean, caption: clean }).select('*');
  if (error) throw serviceError(error, 'Could not add the link.');
  remember('media', data ?? []);
}
