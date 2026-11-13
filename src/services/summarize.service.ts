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
import { SUMMARY_FORMAT } from '../../supabase/functions/_shared/summary-schema';
import type { StoredSummary } from '../../supabase/functions/_shared/summary-pipeline';
import { isMockAiForced } from '../lib/aiMode';
import { callFunction, FunctionError } from '../lib/functions';
import { ConsentDeclinedError, ensureConsent, forgetConsent } from './consent.service';
import { Buckets, removeFiles, uploadFile } from './cloud-storage.service';
import { openDocument, getDocumentFile } from './document.service';
import { listTabs } from './document-tabs.service';
import { holdsSummary } from '../lib/summaryDoc';
import { checkUpload, type PickedFile } from './library-upload.service';
import { marksOf } from './marks.service';
import { getProject } from './project.service';
import { getSession, ensureLectureOnServer } from './session.service';
import { getTranscriptBySession } from './transcript.service';
import { studyRemindersOf } from './lectureReview.service';

/**
 * Stop & summarize: what the panel shows and what it saves.
 *
 * - Its starting values are the course's defaults (`course_settings`), else
 *   the spec's (Lea's advisor, 30 Oct: "Course defaults pre-fill everything").
 * - Its counts come from the lecture as saved: My notes (note lines and mark
 *   chips), the assistant's questions, the photos, slides and links, the
 *   transcript's words (for the preview line).
 * - Stop & generate saves a `summaries` row: mode `new`, status `pending`,
 *   the 10 values, and in `applied_settings` the calculator's numbers, the
 *   resources ticked and the preview line. The summary pipeline writes the summary from
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
  /** The lecture has a summary written into it already (the panel asks where the new one goes). */
  hasSummary: boolean;
  /** "Study reminders for this lecture" (Lea): its own switch, else its course's default (on). */
  studyReminders: boolean;
}

/**
 * Where a summary goes when the lecture has one already: a new tab "New summary" (the
 * default: the Summary tab is never touched without her choice), or the Summary tab, written again
 * around everything she edited.
 */
export type SummaryTarget = 'new' | 'summary';

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

/**
 * Save as course default: the course's 10 values, and (Lea) whether its lectures get study
 * reminders. Online only (the button says so offline).
 */
export async function saveCourseDefaults(courseId: string, s: Sliders, studyReminders?: boolean): Promise<void> {
  if (isOffline()) throw new NetworkError();
  const { error } = await supabase
    .from('course_settings')
    .update({
      ...(studyReminders !== undefined && { study_reminders: studyReminders }),
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
  const [defaults, course, notes, session, transcript, assistant, media, summaryTab, tabs, reminders] = await Promise.all([
    courseDefaults(file.course_id),
    file.course_id ? getProject(file.course_id).catch(() => null) : null,
    openDocument(lectureId, 'notes').catch(() => null),
    durationMs === undefined ? getSession(lectureId).catch(() => null) : null,
    getTranscriptBySession(lectureId).catch(() => null),
    assistantOf(lectureId),
    mediaOf(lectureId),
    openDocument(lectureId, 'summary').catch(() => null),
    listTabs(lectureId, true).catch(() => []),
    studyRemindersOf(lectureId, file.course_id).catch(() => null),
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
    hasSummary: holdsSummary(summaryTab?.content) || tabs.some((t) => t.kind === 'summary'),
    studyReminders: reminders?.on ?? true,
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

/** What `applied_settings` holds for a request: the calculator's numbers, the resources, the preview line, and where it goes. */
export type RequestSettings = SummaryPlan['appliedSettings'] & { resources: SummarizeResources; preview: string; target?: SummaryTarget };

type RequestRow = Pick<SummaryRow, 'id' | 'file_id' | 'mode' | 'source_lecture_ids' | 'sliders' | 'status' | 'applied_settings'>;

/** A summary request of the summarize panel (not an earlier note): no result yet, the 10 sliders. */
export function isSummaryRequest(row: Pick<SummaryRow, 'result' | 'sliders' | 'mode'>): boolean {
  // An earlier note (legacy-note-v1) always has its result; a request has none until the summary pipeline writes it.
  if (row.result != null) return false;
  const s = row.sliders as Record<string, unknown> | null;
  // Extend, Merge and Exam pack are requests too (on the file they are written into).
  return ['new', 'extend', 'merge', 'exam_pack'].includes(row.mode) && !!s && typeof s === 'object' && SLIDER_KEYS.every((k) => typeof s[k] === 'number');
}

/** The formats of what the new engine stores (a summary; Extend / Merge and Exam pack). */
const NEW_FORMATS: unknown[] = [SUMMARY_FORMAT, 'studiply-combined-v1', 'studiply-exampack-v1'];

export function requestRow(lectureId: string, sliders: Sliders, resources: SummarizeResources, plan: SummaryPlan, id = newId(), target?: SummaryTarget): RequestRow {
  const settings: RequestSettings = { ...plan.appliedSettings, resources, preview: plan.preview, ...(target && { target }) };
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
 * Stop & generate summary: the request for the summary pipeline. The iPhone keeps it and queues it (offline too);
 * the laptop sends it now (a NetworkError when offline).
 */
export async function requestSummary(lectureId: string, sliders: Sliders, resources: SummarizeResources, plan: SummaryPlan, target?: SummaryTarget): Promise<string> {
  const row = requestRow(lectureId, sliders, resources, plan, newId(), target);
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
    // On the server now, so the summary can start (consent was asked at Stop; no dialog here).
    // If it can't (no consent yet, the daily limit), the row stays pending and the Summary tab offers it.
    if (data?.status === 'pending' && !isMockAiForced()) {
      await callFunction('summarize', { lectureId: row.file_id, summaryId: row.id }).catch(() => {});
    }
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

// -------------------------------------------------------------------
// The summary: started on the server, read back by status
// -------------------------------------------------------------------

export type SummaryStatus = 'pending' | 'generating' | 'checking' | 'done' | 'failed';

export interface LectureSummary {
  id: string;
  status: SummaryStatus;
  /** Why it failed (the server's code), when it did. */
  error: string | null;
  settings: RequestSettings | null;
  /** The summary as stored (then written into the Summary tab), when done. */
  result: StoredSummary | null;
  createdAt: string;
}

/** A summary of the new engine (done) or a request for one (no result yet); never an earlier note. */
function isNewSummary(row: SummaryRow): boolean {
  if (isSummaryRequest(row)) return true;
  const r = row.result as { format?: unknown } | null;
  return !!r && typeof r === 'object' && NEW_FORMATS.includes(r.format);
}

/** The lecture's newest summary or request (the Summary tab's card), or null. */
export async function latestSummary(lectureId: string): Promise<LectureSummary | null> {
  const rows = await readThrough<SummaryRow[]>(
    async () => {
      const { data, error } = await supabase.from('summaries').select('*').eq('file_id', lectureId).order('created_at', { ascending: false }).limit(20);
      if (error) throw serviceError(error, 'Could not load the summary.');
      remember('summaries', data);
      return data;
    },
    () => readRows<SummaryRow>('summaries', lectureId),
  ).catch((err) => {
    if (isNetworkError(err)) return [] as SummaryRow[];
    throw err;
  });
  const row = (rows ?? []).filter(isNewSummary).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!row) return null;
  const s = row.applied_settings as Record<string, unknown> | null;
  return {
    id: row.id,
    status: row.status as SummaryStatus,
    error: row.error,
    settings: s && typeof s.preview === 'string' ? (s as unknown as RequestSettings) : null,
    result: row.result ? (row.result as unknown as StoredSummary) : null,
    createdAt: row.created_at,
  };
}

/**
 * Starts writing the summary of a pending request (the summarize function answers at once and works in
 * the background; the row's status follows). Asks for consent first; photos and slides only go with
 * the images consent (declining it still writes the summary, without them).
 */
export async function startSummary(lectureId: string, summaryId: string, { media = false }: { media?: boolean } = {}): Promise<void> {
  if (isMockAiForced()) return;
  await ensureConsent('assistant_summary');
  if (media) await ensureConsent('images').catch((err) => {
    if (!(err instanceof ConsentDeclinedError)) throw err;
  });
  try {
    await callFunction('summarize', { lectureId, summaryId });
  } catch (err) {
    // Withdrawn on another device: asked again next time.
    if (err instanceof FunctionError && err.code === 'consent_required') forgetConsent();
    // Already started (another device, or twice): the card follows the row.
    if (err instanceof FunctionError && err.code === 'already_started') return;
    throw err;
  }
}

/** Try again after a failure: a new request with the same settings, started at once. */
export async function retrySummary(lectureId: string, failed: LectureSummary): Promise<void> {
  const s = failed.settings;
  const { data: row, error } = await supabase.from('summaries').select('sliders, mode, source_lecture_ids, applied_settings').eq('id', failed.id).single();
  if (error) throw serviceError(error, 'Could not read the summary settings.');
  const id = newId();
  // The same request again (an Extend / Merge / Exam pack keeps its lectures and anchors).
  const { error: insertError } = await supabase.from('summaries').insert({
    id,
    file_id: lectureId,
    mode: row.mode ?? 'new',
    source_lecture_ids: row.source_lecture_ids?.length ? row.source_lecture_ids : [lectureId],
    sliders: row.sliders as RequestRow['sliders'],
    status: 'pending',
    applied_settings: (row.applied_settings ?? s ?? null) as unknown as Json,
  });
  if (insertError) throw serviceError(insertError, 'Could not save the summary settings.');
  await startSummary(lectureId, id, { media: !!(s?.resources.photos || s?.resources.slides) });
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
 * and text are read by the summary pipeline. Online only.
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

/** + Link: a URL kept with the lecture (Logistics in the summary). Online only. */
export async function addLink(lectureId: string, url: string): Promise<void> {
  const clean = url.trim();
  if (!/^https?:\/\/\S+\.\S+/i.test(clean)) throw new Error('Type a web address starting with http:// or https://.');
  if (isOffline()) throw new NetworkError();
  const { data, error } = await supabase.from('media').insert({ lecture_id: lectureId, kind: 'link', url: clean, caption: clean }).select('*');
  if (error) throw serviceError(error, 'Could not add the link.');
  remember('media', data ?? []);
}
