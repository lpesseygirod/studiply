import { hasSummary, isEmptyDoc, mergeRegenerated, summaryToDoc, type SummaryDocJSON } from '../../lib/summaryDoc';
import type { StoredSummary } from '../../../supabase/functions/_shared/summary-pipeline';
import type { DocJSON } from '../../editor/types';

/**
 * Step 7.7: a lecture's newest finished summary written into its document, once:
 *
 * - The Summary tab when it has nothing in it yet (the card, or empty).
 * - Otherwise a new tab "New summary" ("New summary 2"…, kind `summary`, 4.7b): the Summary tab is
 *   never touched by a summary she didn't choose to add to it.
 * - Only when she chose "Update the Summary tab" (the panel's `target: 'summary'`): merged into it,
 *   keeping every block she edited or added (lib/summaryDoc mergeRegenerated), with a version before.
 * - A version after (`ai_generation`); its flashcards saved once (`source: 'summary'`).
 * - Converted already (its blocks in the Summary tab or a summary tab): nothing. The same summary
 *   gives the same blocks on every device, so two converting at once merge into one document.
 * - Older finished summaries of the lecture (one written again since) are left as they are.
 */

export interface DoneSummary {
  id: string;
  result: StoredSummary;
  /** The panel's choice when the lecture already had a summary (absent: a new tab). */
  target: 'summary' | 'new' | null;
  courseId: string | null;
}

export interface PlaceDeps {
  /** The lecture's newest summary of the new engine that is done, or null. */
  latestDone: (lectureId: string) => Promise<DoneSummary | null>;
  /** A tab's document (null: nothing written in it yet). */
  readTab: (lectureId: string, tab: string) => Promise<DocJSON | null>;
  /** The lecture's added summary tabs ("New summary"…), in order. */
  summaryTabs: (lectureId: string) => Promise<{ tab: string; title: string }[]>;
  /** A new summary tab at the end; its id. */
  addSummaryTab: (lectureId: string) => Promise<string>;
  save: (lectureId: string, tab: string, base: DocJSON, next: DocJSON) => Promise<void>;
  version: (lectureId: string, tab: string, doc: DocJSON, name?: string) => Promise<void>;
  /** The lecture's questions to the assistant (the Full answer links). */
  questions: (lectureId: string) => Promise<{ id: string; question: string; askedAtMs: number | null }[]>;
  /** Whether this summary's flashcards are saved. */
  hasCards: (summaryId: string) => Promise<boolean>;
  saveCards: (cards: { front: string; back: string }[], from: { lectureId: string; courseId: string | null; summaryId: string }) => Promise<void>;
}

export type PlaceOutcome = { tab: string; written: boolean; summaryId: string } | null;

const EMPTY: DocJSON = { type: 'doc', content: [] };
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const clock = (t: string): number | null => {
  const m = /^(?:(\d+):)?(\d{1,3}):(\d{2})$/.exec(t.trim());
  return m ? ((Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 : null;
};

/**
 * Each question during class's assistant message: the same words, else the question asked closest
 * to its time (within 2 minutes); each message once.
 */
export function questionLinks(summary: StoredSummary, messages: { id: string; question: string; askedAtMs: number | null }[]): (string | null)[] {
  const used = new Set<string>();
  return ((summary.questionsDuringClass ?? []) as { t: string; question: string }[]).map((q) => {
    const free = messages.filter((m) => !used.has(m.id));
    let hit = free.find((m) => norm(m.question) === norm(q.question));
    const at = clock(q.t);
    if (!hit && at !== null) {
      hit = free
        .filter((m) => m.askedAtMs !== null && Math.abs(m.askedAtMs - at) <= 120_000)
        .sort((a, b) => Math.abs(a.askedAtMs! - at) - Math.abs(b.askedAtMs! - at))[0];
    }
    if (!hit) return null;
    used.add(hit.id);
    return hit.id;
  });
}

/** The lecture's newest finished summary in its document (see above); where it is, or null without one. */
export async function placeSummary(lectureId: string, deps: PlaceDeps): Promise<PlaceOutcome> {
  const done = await deps.latestDone(lectureId);
  if (!done) return null;
  // Its flashcards, once (online; when they can't be saved now, the next time the lecture is opened).
  await saveCardsOnce(lectureId, done, deps).catch(() => {});

  const summaryTab = await deps.readTab(lectureId, 'summary');
  if (hasSummary(summaryTab, done.id)) return { tab: 'summary', written: false, summaryId: done.id };
  const extra = await deps.summaryTabs(lectureId);
  for (const t of extra) if (hasSummary(await deps.readTab(lectureId, t.tab), done.id)) return { tab: t.tab, written: false, summaryId: done.id };

  const messages = await deps.questions(lectureId).catch(() => []);
  const doc: SummaryDocJSON = summaryToDoc({ summary: done.result, summaryId: done.id, questionLinks: questionLinks(done.result, messages) });

  if (!summaryTab || isEmptyDoc(summaryTab)) {
    await deps.save(lectureId, 'summary', summaryTab ?? EMPTY, doc as DocJSON);
    await deps.version(lectureId, 'summary', doc as DocJSON);
    return { tab: 'summary', written: true, summaryId: done.id };
  }
  if (done.target === 'summary') {
    await deps.version(lectureId, 'summary', summaryTab, 'Before the summary was written again');
    const merged = mergeRegenerated(summaryTab as SummaryDocJSON, doc) as DocJSON;
    await deps.save(lectureId, 'summary', summaryTab, merged);
    await deps.version(lectureId, 'summary', merged);
    return { tab: 'summary', written: true, summaryId: done.id };
  }
  const tab = await deps.addSummaryTab(lectureId);
  const blank = (await deps.readTab(lectureId, tab)) ?? EMPTY;
  await deps.save(lectureId, tab, blank, doc as DocJSON);
  await deps.version(lectureId, tab, doc as DocJSON);
  return { tab, written: true, summaryId: done.id };
}

async function saveCardsOnce(lectureId: string, done: DoneSummary, deps: PlaceDeps): Promise<void> {
  const cards = ((done.result.flashcards ?? []) as { front: string; back: string }[]).filter((c) => c.front.trim() && c.back.trim());
  if (!cards.length || (await deps.hasCards(done.id))) return;
  await deps.saveCards(cards, { lectureId, courseId: done.courseId, summaryId: done.id });
}
