/**
 * Step 7.9: Extend, Merge and Exam pack, the app's side (pure; both devices): the anchors sent with a
 * request (the target document's blocks), and the server's result (supabase/functions/_shared/
 * summary-combine.ts) as documents:
 *
 * - A new Unit summary: the base summary, then each lecture's new sections ("4 · Lecture 2 · …"), the
 *   unit's own takeaways, self-test and flashcards, the glossary without repeats; the comments and
 *   Update callouts on the base's blocks; its notes line counts every lecture's notes. Built with the
 *   7.7 converter under the request's own id, so the base's blocks have the ids the anchors named.
 *   Each lecture added is in the result as written against the existing summary (`addition.summary`).
 * - "Add to this summary": only what is new goes into her Summary tab: the new sections before its
 *   lists, the new glossary terms, questions and exam signals after them, each block `x…`. Her blocks
 *   get comments (a mark: her text never changes) and Update callouts after them (`u…`).
 * - An Exam pack: "Built from the summaries of N lectures (…)" (no notes claim), then per topic its exam
 *   signals, formula cards, key terms and a self-test (answers hidden), then the flashcards line.
 */

import type { StoredSummary } from '../../supabase/functions/_shared/summary-pipeline';
import type { Addition, CommentPlan, ExamPack, UpdatePlan } from '../../supabase/functions/_shared/summary-combine';
import { generatedPath, inline, summaryKey, summaryToDoc, WORDS, type SummaryDocJSON } from './summaryDoc';

type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] };
type Section = { heading: string; timestamp: string; cueQuestion: string; markChips: unknown[]; blocks: { type: string }[]; lecture?: string };

export const COMBINED_FORMAT = 'studiply-combined-v1';
export const EXAM_PACK_FORMAT = 'studiply-exampack-v1';

/** What the server stores for Extend and Merge (summary-combine.ts runCombine). */
export interface CombinedResult {
  format: typeof COMBINED_FORMAT;
  mode: 'extend' | 'merge';
  target: 'unit' | 'add';
  base: { lectureId: string; summaryId: string; number: number | null; title: string };
  additions: Addition[];
  unit: { title: string; takeaways: { text: string; fromMarkIds: string[] }[]; selfTest: Addition['selfTest']; flashcards: Addition['flashcards']; glossary: Addition['glossary'] } | null;
  checks?: { noRepeats: { pass: boolean; checked: number; turnedToComments: number; leftOut: number } };
}
export interface ExamPackResult {
  format: typeof EXAM_PACK_FORMAT;
  mode: 'exam_pack';
  lectures: { lectureId: string; summaryId: string; number: number | null; title: string }[];
  leftOut: string[];
  pack: ExamPack;
}

const textOf = (n: Node): string => (n.text ?? '') + (n.content ?? []).map(textOf).join(n.type === 'bulletList' || n.type === 'orderedList' ? ' ' : '');
/** A block's characters exactly as its text nodes hold them (the offsets a comment's range is in). */
const plainText = (n: Node): string => (n.text ?? '') + (n.content ?? []).map(plainText).join('');
const cut = (t: string, words: number) => t.split(/\s+/).slice(0, words).join(' ');

/** The document's blocks as anchors for the reconcile call: id, the section they're in, their words. */
export function anchorsOf(doc: { content?: Node[] } | null | undefined): { id: string; label: string; text: string }[] {
  let label = '';
  const out: { id: string; label: string; text: string }[] = [];
  for (const b of doc?.content ?? []) {
    const text = textOf(b).replace(/\s+/g, ' ').trim();
    if (b.type === 'heading') label = text;
    const id = b.attrs?.blockId;
    if (typeof id === 'string' && text) out.push({ id, label, text: cut(text, 80) });
  }
  return out;
}

const lectureTag = (n: number | null) => (n ? `Lecture ${n}` : 'Next lecture');

/** A lecture's sections with only what is added (headings of empty sections left out), tagged with it. */
function keptSections(s: StoredSummary, a: Addition): Section[] {
  return ((s.sections ?? []) as Section[]).flatMap((sec, si) => {
    const blocks = sec.blocks.filter((_b, bi) => a.keep.includes(`s${si}-b${bi}`));
    return blocks.length ? [{ ...sec, blocks, lecture: lectureTag(a.number) }] : [];
  });
}

/** Unit summary as one stored summary: the base, then what each lecture adds; the unit's own lists; every lecture's notes counted. */
export function unitSummary(base: StoredSummary, r: CombinedResult): StoredSummary {
  const list = <T>(k: string, s: StoredSummary) => ((s[k] ?? []) as T[]);
  const parts = r.additions.map((a) => ({ a, s: a.summary }));
  const lectures = [r.base.number, ...r.additions.map((a) => a.number)].filter((n): n is number => !!n);
  return {
    ...base,
    header: { ...base.header, title: r.unit?.title || base.header.title, number: 0, durationMin: base.header.durationMin + parts.reduce((n, { s }) => n + (s.header?.durationMin ?? 0), 0) },
    coverage: parts.reduce(
      (c, { s }) => ({ noteLines: c.noteLines + s.coverage.noteLines, noteLinesUsed: c.noteLinesUsed + s.coverage.noteLinesUsed, marks: c.marks + s.coverage.marks, marksUsed: c.marksUsed + s.coverage.marksUsed }),
      base.coverage,
    ),
    lectures,
    takeaways: r.unit?.takeaways ?? list('takeaways', base),
    sections: [...list<Section>('sections', base), ...parts.flatMap(({ a, s }) => keptSections(s, a))],
    glossary: r.unit?.glossary ?? [...list('glossary', base), ...parts.flatMap(({ a }) => a.glossary)],
    examSignals: [...list('examSignals', base), ...parts.flatMap(({ s }) => list('examSignals', s))],
    questionsDuringClass: [...list('questionsDuringClass', base), ...parts.flatMap(({ s }) => list('questionsDuringClass', s))],
    selfTest: r.unit?.selfTest ?? [...list('selfTest', base), ...parts.flatMap(({ a }) => a.selfTest)],
    flashcards: r.unit?.flashcards ?? [...list('flashcards', base), ...parts.flatMap(({ a }) => a.flashcards)],
    logistics: [...list('logistics', base), ...parts.flatMap(({ s }) => list('logistics', s))],
    unclear: [...list('unclear', base), ...parts.flatMap(({ s }) => list('unclear', s))],
  };
}

/** "Lectures 1, 2" (the lectures whose notes a Unit summary holds). */
const lecturesOf = (r: CombinedResult) => {
  const n = [r.base.number, ...r.additions.map((a) => a.number)].filter((x): x is number => !!x);
  return n.length ? `${n.length === 1 ? 'Lecture' : 'Lectures'} ${n.join(', ')}` : 'all its lectures';
};

/** The Unit summary's document (its blocks keyed by the request's id: the anchors' ids). */
export function unitDoc(base: StoredSummary, r: CombinedResult, requestId: string, now = Date.now()): SummaryDocJSON {
  const doc = summaryToDoc({ summary: unitSummary(base, r), summaryId: requestId, notesOf: lecturesOf(r) });
  return withUpdates(withComments(doc, r.additions.flatMap((a) => a.comments), requestId, now), r.additions.flatMap((a) => a.updates), requestId);
}

/**
 * The anchors for a new Unit summary: its base's section blocks as the Unit summary will have them
 * (its takeaways, self-test and flashcards are the unit's own, so they aren't anchors).
 */
export function unitAnchors(base: StoredSummary, requestId: string) {
  return anchorsOf(summaryToDoc({ summary: base, summaryId: requestId })).filter((a) => /^s\d+/.test(generatedPath(a.id) ?? ''));
}

// ---------- added to her summary ----------

const TAIL = /^(exam|questions|selftest|cards|glossary|logistics|unclear)$/;
/** Where a summary's lists start (exam signals, questions, the self-test…): new sections go just before. */
function tailStart(content: Node[]): number {
  const i = content.findIndex((b) => TAIL.test(generatedPath(b.attrs?.blockId) ?? ''));
  return i < 0 ? content.length : i;
}

/** "Add to this summary": only what each lecture adds, into her document; her blocks are never changed. */
export function addToDoc(current: { content?: Node[] }, r: CombinedResult, requestId: string, now = Date.now()): SummaryDocJSON {
  const key = summaryKey(requestId);
  let content = [...(current.content ?? [])];
  r.additions.forEach((a, n) => {
    const s = a.summary;
    // Her sections and those added before (by an earlier Extend too), so numbering goes on.
    const sections = content.filter((b) => /^(x\d+-)?s\d+$/.test(generatedPath(b.attrs?.blockId) ?? '')).length;
    const part = summaryToDoc({
      summary: {
        ...s,
        takeaways: [],
        sections: keptSections(s, a),
        glossary: a.glossary,
        selfTest: a.selfTest,
        flashcards: a.flashcards,
        logistics: [],
      },
      summaryId: requestId,
      check: false,
      firstSection: sections + 1,
      tag: lectureTag(a.number),
    });
    // Its own ids (`x<n>-…`): kept when the summary is written again (7.7's merge), never mixed with hers.
    const rekeyed = part.content.map((b) => ({ ...b, attrs: { ...b.attrs, blockId: `${key}-x${n}-${generatedPath(b.attrs?.blockId)}` } }));
    const isSection = (b: Node) => /^x\d+-s\d+/.test(generatedPath(b.attrs?.blockId) ?? '');
    const at = tailStart(content);
    content = [...content.slice(0, at), ...rekeyed.filter(isSection), ...content.slice(at), ...rekeyed.filter((b) => !isSection(b))];
  });
  const doc: SummaryDocJSON = { type: 'doc', content };
  return withUpdates(withComments(doc, r.additions.flatMap((a) => a.comments), requestId, now), r.additions.flatMap((a) => a.updates), requestId);
}

// ---------- Studiply's comments and Update callouts ----------

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Where the comment goes in a block's words: the quote as written, else the same words with case,
 * accents and spaces aside, else the block's first sentence. Character offsets in its text.
 */
export function quoteRange(text: string, quote: string): [number, number] {
  const q = quote.trim();
  if (q) {
    const exact = text.indexOf(q);
    if (exact >= 0) return [exact, exact + q.length];
    // Loose: map each kept character of the text back to its place.
    const keep: number[] = [];
    let loose = '';
    for (let i = 0; i < text.length; i++) {
      const c = norm(text[i]);
      if (/\s/.test(text[i])) {
        if (!loose.endsWith(' ')) {
          loose += ' ';
          keep.push(i);
        }
      } else {
        loose += c;
        for (let k = 0; k < c.length; k++) keep.push(i);
      }
    }
    const lq = norm(q).replace(/\s+/g, ' ');
    const at = loose.indexOf(lq);
    if (at >= 0) return [keep[at], keep[at + lq.length - 1] + 1];
  }
  const end = /[.!?](\s|$)/.exec(text);
  return [0, end ? end.index + 1 : text.length];
}

/** The comment mark put on [from, to) of a block's text, splitting its text nodes; nothing else changes. */
function markRange(block: Node, from: number, to: number, mark: { type: string; attrs: Record<string, unknown> }): Node {
  let at = 0;
  // Text nodes are split by their parent (below); `at` counts characters as plainText does.
  const walk = (n: Node): Node => {
    if (!n.content) return n;
    const out: Node[] = [];
    for (const c of n.content) {
      if (c.type === 'text' && typeof c.text === 'string') {
        const start = at;
        const end = at + c.text.length;
        at = end;
        if (end <= from || start >= to) {
          out.push(c);
          continue;
        }
        const a = Math.max(from, start) - start;
        const b = Math.min(to, end) - start;
        if (a > 0) out.push({ ...c, text: c.text.slice(0, a) });
        out.push({ ...c, text: c.text.slice(a, b), marks: [...(c.marks ?? []), mark] });
        if (b < c.text.length) out.push({ ...c, text: c.text.slice(b) });
      } else out.push(walk(c));
    }
    return { ...n, content: out };
  };
  return walk(block);
}

/** Studiply's comments on the blocks they're about (author 'studiply', the lecture and time kept). Her text never changes. */
export function withComments(doc: SummaryDocJSON, plans: CommentPlan[], requestId: string, now = Date.now()): SummaryDocJSON {
  const key = summaryKey(requestId);
  const content = [...doc.content];
  plans.forEach((p, k) => {
    const i = content.findIndex((b) => b.attrs?.blockId === p.anchor);
    if (i < 0) return;
    const [from, to] = quoteRange(plainText(content[i]), p.quote);
    if (to <= from) return;
    content[i] = markRange(content[i], from, to, {
      type: 'comment',
      attrs: { id: `${key}-c${k}`, text: p.text, createdAt: now, resolved: false, author: 'studiply', source: { lectureId: p.lectureId, ms: p.ms } },
    });
  });
  return { ...doc, content };
}

/** An Update callout ("UPDATE · LECTURE 4 · 18:30") right after each block a correction is about. */
export function withUpdates(doc: SummaryDocJSON, plans: UpdatePlan[], requestId: string): SummaryDocJSON {
  const key = summaryKey(requestId);
  let content = [...doc.content];
  plans.forEach((p, k) => {
    const i = content.findIndex((b) => b.attrs?.blockId === p.anchor);
    const box: Node = { type: 'callout', attrs: { kind: 'update', lecture: p.lecture, ms: p.ms, blockId: `${key}-u${k}`, origin: 'ai', editedAt: null }, content: [{ type: 'paragraph', content: inline(p.text) }] };
    content = i < 0 ? [...content, box] : [...content.slice(0, i + 1), box, ...content.slice(i + 1)];
  });
  return { ...doc, content };
}

// ---------- the exam pack ----------

const clock = (t: string): number | null => {
  const m = /^(?:(\d+):)?(\d{1,3}):(\d{2})$/.exec(t.trim());
  return m ? ((Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 : null;
};

/** An Exam pack as its document: per topic its exam signals, formulas, key terms and self-test; then the flashcards line. */
export function examPackDoc(r: ExamPackResult, requestId: string): SummaryDocJSON {
  const key = summaryKey(requestId);
  const out: Node[] = [];
  const add = (path: string, n: Node) => out.push({ ...n, attrs: { ...n.attrs, blockId: `${key}-${path}`, origin: 'ai', editedAt: null } });
  const p = (nodes: Node[]): Node => ({ type: 'paragraph', ...(nodes.length && { content: nodes }) });
  const list = (items: Node[][]): Node => ({ type: 'bulletList', content: items.map((c) => ({ type: 'listItem', content: [p(c)] })) });
  const lectures = r.lectures.map((l) => l.number ?? '').filter(Boolean).join(', ');
  // Not the notes check box ("All your notes are in this summary"): a pack is built from summaries, not her notes.
  add('built', p([{ type: 'text', text: `Built from the summaries of ${r.lectures.length} lecture${r.lectures.length === 1 ? '' : 's'}${lectures ? ` (${lectures})` : ''}${r.leftOut.length ? ` · ${r.leftOut.length} without a summary left out` : ''}`, marks: [{ type: 'italic' }] }]));
  r.pack.topics.forEach((t, ti) => {
    add(`t${ti}`, { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: `${ti + 1} · ${t.heading}` }] });
    if (t.examSignals.length) {
      add(`t${ti}-exam`, {
        type: 'callout',
        attrs: { kind: 'exam' },
        content: [list(t.examSignals.map((e) => [...inline(e.text), { type: 'text', text: ` · Lecture ${e.lecture}` }, ...(clock(e.t) !== null ? [{ type: 'text', text: ' ' }, { type: 'timestampChip', attrs: { ms: clock(e.t) } }] : [])]))],
      });
    }
    t.formulas.forEach((f, fi) => add(`t${ti}-f${fi}`, { type: 'formulaCard', attrs: { title: f.name || WORDS.formula }, content: [{ type: 'blockMath', attrs: { latex: f.latex } }, p(inline(f.legend))] }));
    if (t.keyTerms.length) add(`t${ti}-terms`, list(t.keyTerms.map((k) => [{ type: 'text', text: k.term, marks: [{ type: 'bold' }] }, { type: 'text', text: ' — ' }, ...inline(k.definition)])));
    t.selfTest.forEach((q, qi) => {
      add(`t${ti}-q${qi}`, p([{ type: 'text', text: `${qi + 1}. `, marks: [{ type: 'bold' }] }, ...inline(q.question)]));
      add(`t${ti}-q${qi}-answer`, { type: 'callout', attrs: { kind: 'answer' }, content: [p(inline(q.answer))] });
    });
  });
  if (r.pack.flashcards.length) add('cards', p([{ type: 'text', text: WORDS.cards(r.pack.flashcards.length), marks: [{ type: 'italic' }] }]));
  return { type: 'doc', content: out };
}
