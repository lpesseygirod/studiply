import { isNetworkError, serviceError, type SummaryRow } from '../../lib/cloudRows';
import { readRows, readThrough, remember } from '../../lib/cache';
import { supabase } from '../../lib/supabase';
import { SUMMARY_FORMAT } from '../../../supabase/functions/_shared/summary-schema';
import type { StoredSummary } from '../../../supabase/functions/_shared/summary-pipeline';
import { getDocumentFile, openDocument, saveDocument, saveVersion } from '../document.service';
import { addTab, listTabs } from '../document-tabs.service';
import { saveFlashcards, summaryCardsSaved } from '../flashcards.service';
import { placeSummary, type DoneSummary, type PlaceDeps, type PlaceOutcome } from './run';

export type { PlaceOutcome };

/** The lecture's newest finished summary of the new engine (an earlier note or a request isn't one). */
async function latestDone(lectureId: string): Promise<DoneSummary | null> {
  const rows = await readThrough<SummaryRow[]>(
    async () => {
      const { data, error } = await supabase.from('summaries').select('*').eq('file_id', lectureId).eq('status', 'done').order('created_at', { ascending: false }).limit(10);
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
    .filter((r) => r.status === 'done' && (r.result as { format?: unknown } | null)?.format === SUMMARY_FORMAT)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!row) return null;
  const target = (row.applied_settings as { target?: unknown } | null)?.target;
  const file = await getDocumentFile(lectureId).catch(() => null);
  return { id: row.id, result: row.result as unknown as StoredSummary, target: target === 'summary' || target === 'new' ? target : null, courseId: file?.course_id ?? null };
}

/** The app's services (online, or the iPhone's cache and queue offline). */
const appDeps: PlaceDeps = {
  latestDone,
  readTab: async (lectureId, tab) => {
    const opened = await openDocument(lectureId, tab);
    return opened.id ? opened.content : null;
  },
  summaryTabs: async (lectureId) => (await listTabs(lectureId, true)).filter((t) => t.kind === 'summary').map((t) => ({ tab: t.tab, title: t.title })),
  addSummaryTab: async (lectureId) => (await addTab(lectureId, { isLecture: true, kind: 'summary' })).tab,
  save: async (lectureId, tab, base, next) => {
    await saveDocument({ fileId: lectureId, tab, base, next });
  },
  version: async (lectureId, tab, doc, name) => {
    await saveVersion(lectureId, tab, doc, 'ai_generation', name);
  },
  questions: async (lectureId) => {
    const { data, error } = await supabase.from('assistant_messages').select('id, content, asked_at_ms').eq('lecture_id', lectureId).eq('role', 'user');
    if (error) throw serviceError(error, 'Could not load the questions.');
    return (data ?? []).map((m) => ({ id: m.id as string, question: String(m.content ?? ''), askedAtMs: (m.asked_at_ms as number | null) ?? null }));
  },
  hasCards: summaryCardsSaved,
  saveCards: async (cards, from) => {
    await saveFlashcards(cards, { fileId: from.lectureId, courseId: from.courseId, source: 'summary', sourceRef: from.summaryId });
  },
};

/** One placement at a time per lecture on this device (two at once could add two "New summary" tabs). */
const running = new Map<string, Promise<PlaceOutcome>>();

/** Step 7.7: the lecture's newest finished summary written into its document (once); where it is. */
export function placeSummaryOf(lectureId: string): Promise<PlaceOutcome> {
  const busy = running.get(lectureId);
  if (busy) return busy;
  const run = placeSummary(lectureId, appDeps).finally(() => running.delete(lectureId));
  running.set(lectureId, run);
  return run;
}
