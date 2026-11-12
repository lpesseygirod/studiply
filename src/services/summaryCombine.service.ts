/**
 * Extend with next lecture, Merge lectures and Make exam pack, the app's services.
 *
 * - The picker's lectures: a course's (or folder's), in teaching order, each with whether it has a
 *   summary (Merge and Exam pack only take lectures that have one; Extend writes the next lecture's
 *   own summary first when it has none).
 * - The request: one `summaries` row (mode extend / merge / exam_pack, the lectures in order), on the
 *   file it is written into: a new Unit summary or Exam pack file in the course (made now, named from
 *   the lectures; its title gets the unit's topic when written), or the base lecture ("Add to this
 *   summary"). With it the anchors the server compares against: the target document's blocks.
 * - Placing it once done: into that file's document (services/summaryDoc calls this first), with a
 *   version, and the new flashcards saved once.
 * Online only, like the laptop's summary request (a NetworkError offline).
 */

import { NetworkError, serviceError, type SummaryRow } from '../lib/cloudRows';
import { isOffline } from '../lib/connectivity';
import { newId } from '../lib/mappers';
import { remember } from '../lib/cache';
import { supabase } from '../lib/supabase';
import type { Json } from '../types/supabase';
import type { DocJSON } from '../editor/types';
import { addToDoc, anchorsOf, COMBINED_FORMAT, EXAM_PACK_FORMAT, examPackDoc, unitAnchors, unitDoc, type CombinedResult, type ExamPackResult } from '../lib/summaryCombine';
import { hasSummary } from '../lib/summaryDoc';
import { SUMMARY_FORMAT } from '../../supabase/functions/_shared/summary-schema';
import type { StoredSummary } from '../../supabase/functions/_shared/summary-pipeline';
import type { SummaryPlan, Sliders } from '../../supabase/functions/_shared/summary-plan';
import { getDocumentFile, openDocument, saveDocument, saveVersion } from './document.service';
import { saveFlashcards, summaryCardsSaved } from './flashcards.service';
import type { SummarizeResources } from './summarize.service';

export type CombineMode = 'extend' | 'merge' | 'exam_pack';
export type CombineTarget = 'unit' | 'add';

export interface PickLecture {
  id: string;
  title: string;
  createdAt: string;
  /** Its number in the course (as the summaries count it). */
  number: number;
  hasSummary: boolean;
}

/** A course's (or folder's) lectures in teaching order, with whether each has a summary. */
export async function lecturesForPicker(courseId: string | null, folderId: string | null): Promise<PickLecture[]> {
  if (isOffline()) throw new NetworkError();
  let q = supabase.from('files').select('id, title, created_at, folder_id').eq('kind', 'lecture').is('deleted_at', null).order('created_at');
  q = courseId ? q.eq('course_id', courseId) : q.is('course_id', null);
  const { data, error } = await q;
  if (error) throw serviceError(error, 'Could not load the lectures.');
  const all = (data ?? []) as { id: string; title: string; created_at: string; folder_id: string | null }[];
  const ids = all.map((f) => f.id);
  const { data: done } = ids.length ? await supabase.from('summaries').select('file_id, result').in('file_id', ids).eq('status', 'done') : { data: [] };
  const summarized = new Set(((done ?? []) as { file_id: string; result: { format?: unknown } | null }[]).filter((r) => r.result?.format === SUMMARY_FORMAT).map((r) => r.file_id));
  return all
    .map((f, i) => ({ id: f.id, title: f.title, createdAt: f.created_at, number: i + 1, hasSummary: summarized.has(f.id), folderId: f.folder_id }))
    .filter((f) => !folderId || f.folderId === folderId)
    .map(({ folderId: _f, ...f }) => f);
}

/** A lecture's newest finished summary of the new engine. */
async function latestFinished(lectureId: string): Promise<{ id: string; result: StoredSummary } | null> {
  const { data, error } = await supabase.from('summaries').select('id, result, created_at').eq('file_id', lectureId).eq('status', 'done').order('created_at', { ascending: false }).limit(10);
  if (error) throw serviceError(error, 'Could not load the summary.');
  const row = ((data ?? []) as { id: string; result: { format?: unknown } | null }[]).find((r) => r.result?.format === SUMMARY_FORMAT);
  return row ? { id: row.id, result: row.result as unknown as StoredSummary } : null;
}

/** "Psicobiología — Lectures 3–4", "Exam pack · Psicobiología". */
export function combinedTitle(mode: CombineMode, courseName: string | null, numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  const range = !sorted.length ? '' : sorted.length === 1 ? `Lecture ${sorted[0]}` : sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1) ? `Lectures ${sorted[0]}–${sorted.at(-1)}` : `Lectures ${sorted.join(', ')}`;
  if (mode === 'exam_pack') return `Exam pack · ${courseName ?? 'My library'}`;
  return [courseName, range].filter(Boolean).join(' — ') || 'Unit summary';
}

export interface CombineAsk {
  mode: CombineMode;
  target: CombineTarget;
  /** In teaching order; Extend and Merge: the first is the base. */
  lectures: { id: string; number: number }[];
  courseId: string | null;
  folderId: string | null;
  courseName: string | null;
  sliders: Sliders;
  resources: SummarizeResources;
  plan: SummaryPlan;
}

/** Makes the request (and its Unit summary or Exam pack file); its row id and the file it is written into. */
export async function requestCombine(a: CombineAsk): Promise<{ summaryId: string; fileId: string }> {
  if (isOffline()) throw new NetworkError();
  const summaryId = newId();
  const base = a.mode === 'exam_pack' ? null : await latestFinished(a.lectures[0].id);
  if (a.mode !== 'exam_pack' && !base) throw new Error('This lecture has no summary to extend yet. Summarize it first.');

  let fileId = a.lectures[0].id;
  let anchors: { id: string; label: string; text: string }[] = [];
  if (a.mode === 'exam_pack' || a.target === 'unit') {
    fileId = newId();
    const kind = a.mode === 'exam_pack' ? 'exam_pack' : 'unit_summary';
    const { data, error } = await supabase
      .from('files')
      .insert({ id: fileId, kind, title: combinedTitle(a.mode, a.courseName, a.lectures.map((l) => l.number)), course_id: a.courseId, folder_id: a.folderId })
      .select('*');
    if (error) throw serviceError(error, 'Could not make the new document.');
    remember('files', data ?? []);
    if (base) anchors = unitAnchors(base.result, summaryId);
  } else {
    // Add to this summary: her Summary tab as it is now, her edits included.
    anchors = anchorsOf((await openDocument(fileId, 'summary')).content);
  }
  const { error } = await supabase.from('summaries').insert({
    id: summaryId,
    file_id: fileId,
    mode: a.mode,
    source_lecture_ids: a.lectures.map((l) => l.id),
    sliders: { ...a.sliders } as unknown as SummaryRow['sliders'],
    status: 'pending',
    applied_settings: { ...a.plan.appliedSettings, resources: a.resources, preview: a.plan.preview, target: a.target, anchors } as unknown as Json,
  });
  if (error) throw serviceError(error, 'Could not save the request.');
  return { summaryId, fileId };
}

// ---------------------------------------------------------------------------
// Placing a finished one
// ---------------------------------------------------------------------------

const EMPTY: DocJSON = { type: 'doc', content: [] };

/** The file's newest finished Extend / Merge / Exam pack, or null. */
async function latestCombined(fileId: string): Promise<{ id: string; result: CombinedResult | ExamPackResult; fileKind: string } | null> {
  const { data } = await supabase.from('summaries').select('id, result, created_at').eq('file_id', fileId).eq('status', 'done').order('created_at', { ascending: false }).limit(5);
  const newest = ((data ?? []) as SummaryRow[])[0];
  const format = (newest?.result as { format?: unknown } | null)?.format;
  if (!newest || (format !== COMBINED_FORMAT && format !== EXAM_PACK_FORMAT)) return null;
  const file = await getDocumentFile(fileId);
  return { id: newest.id, result: newest.result as unknown as CombinedResult | ExamPackResult, fileKind: file.kind };
}

/** The summaries the result names (the base and each lecture added). */
async function summariesById(ids: string[]): Promise<Map<string, StoredSummary>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from('summaries').select('id, result').in('id', ids);
  if (error) throw serviceError(error, 'Could not load the summaries.');
  return new Map(((data ?? []) as { id: string; result: unknown }[]).map((r) => [r.id, r.result as StoredSummary]));
}

/**
 * The file's newest finished Extend / Merge / Exam pack into its document, once: a Unit summary or
 * Exam pack file's first tab, or the base lecture's Summary tab ("Add to this summary", a version before).
 * Null when there is none (or it is in already).
 */
export async function placeCombined(fileId: string): Promise<{ tab: string; written: boolean } | null> {
  const found = await latestCombined(fileId).catch(() => null);
  if (!found) return null;
  const { id, result } = found;
  const tab = result.format === COMBINED_FORMAT && result.target === 'add' ? 'summary' : 'notes';
  const opened = await openDocument(fileId, tab);
  const current = opened.id ? opened.content : null;
  if (hasSummary(current, id)) return { tab, written: false };

  let next: DocJSON;
  let cards: { front: string; back: string }[] = [];
  if (result.format === EXAM_PACK_FORMAT) {
    next = examPackDoc(result, id) as DocJSON;
    cards = result.pack.flashcards;
  } else {
    if (result.target === 'add') {
      if (current) await saveVersion(fileId, tab, current, 'ai_generation', 'Before the next lecture was added');
      next = addToDoc(current ?? EMPTY, result, id) as DocJSON;
      cards = result.additions.flatMap((a) => a.flashcards);
    } else {
      // The base lecture's summary (each lecture added is in the result itself).
      const base = (await summariesById([result.base.summaryId])).get(result.base.summaryId);
      if (!base) return null;
      next = unitDoc(base, result, id) as DocJSON;
      cards = result.unit?.flashcards ?? [];
      // Its topic in its name, once ("Psicobiología — Lectures 3–4: La sinapsis").
      const file = await getDocumentFile(fileId).catch(() => null);
      if (file && result.unit?.title && !file.title.includes(':')) {
        await supabase.from('files').update({ title: `${file.title}: ${result.unit.title}` }).eq('id', fileId);
      }
    }
  }
  await saveDocument({ fileId, tab, base: current ?? EMPTY, next });
  await saveVersion(fileId, tab, next, 'ai_generation');
  const usable = cards.filter((c) => c.front.trim() && c.back.trim());
  if (usable.length && !(await summaryCardsSaved(id).catch(() => true))) {
    const file = await getDocumentFile(fileId).catch(() => null);
    await saveFlashcards(usable, { fileId, courseId: file?.course_id ?? null, source: 'summary', sourceRef: id }).catch(() => {});
  }
  return { tab, written: true };
}
