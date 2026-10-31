/**
 * summary-long.ts
 * Lectures over 60 minutes (step 7.6; SUMMARY-SPEC "long transcripts are split by topic, summarized
 * in parts, then merged"), the pure pieces (the run is in summary-pipeline.ts):
 *
 *  - split: the classify call's topics grouped into parts of at most PART_MAX_MS, cut at segment
 *    boundaries (no usable topics: equal windows);
 *  - assign: every note line, mark, photo and question to exactly ONE part, the part holding its
 *    aligned segment (±30 s, alignTo); a question's window by its middle; no time → the last part;
 *  - the part's material: its segments plus 30 s of each neighbour, marked as context;
 *  - the part prompt (<part>: k of N, its topics and word share, the other parts' topics);
 *  - the media: slides shared by every part (a cached prefix), each photo only in its own part;
 *  - merge by code (sections in order, glossary without repeats), then the wrap-up call (title,
 *    takeaways, self-test, flashcards for the whole lecture).
 */

import { stamp, type TimedSegment } from './assistant.ts';
import {
  ALIGN_WINDOW_MS,
  alignTo,
  noteMarkdown,
  summaryUserText,
  tagSafe,
  wordBudgets,
  type Classification,
  type Content,
  type Generated,
  type LectureMaterial,
  type SummaryRequest,
} from './summary-pipeline.ts';
import { proseOf } from './summary-checks.ts';
import type { SummaryPlan } from './summary-plan.ts';
import { PartAnswer, WrapUpAnswer, issueLines } from './summary-zod.ts';

/** A part's longest span (advisor's plan, 31 Oct): 90 min → 3 parts, 120 min → 4. */
export const PART_MAX_MS = 35 * 60_000;
/** Without usable topics: windows of about this length. */
export const FALLBACK_WINDOW_MS = 30 * 60_000;
/** Lectures over this aren't summarized yet (advisor decision for Lea, 31 Oct). */
export const MAX_LONG_LECTURE_MS = 3 * 60 * 60_000 + 30_000;
export const PART_MAX_TOKENS = 12_000;
export const WRAPUP_MAX_TOKENS = 4_000;

export interface LecturePart {
  index: number;
  /** Its segments: [from, to). */
  from: number;
  to: number;
  startMs: number;
  endMs: number;
  topics: { title: string; startMs: number; endMs: number }[];
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** The topics as spans covering the lecture: in order, each up to the next one's start, too-long ones halved. */
function topicSpans(c: Classification, durationMs: number) {
  const sorted = c.topics.filter((t) => t.startMs < durationMs && t.endMs > t.startMs).sort((a, b) => a.startMs - b.startMs);
  const spans = sorted.map((t, i) => ({ title: t.title, startMs: i === 0 ? 0 : Math.max(t.startMs, 0), endMs: i + 1 < sorted.length ? sorted[i + 1].startMs : durationMs }));
  const out: typeof spans = [];
  for (const s of spans) {
    const n = Math.ceil((s.endMs - s.startMs) / PART_MAX_MS);
    const len = (s.endMs - s.startMs) / Math.max(1, n);
    for (let k = 0; k < Math.max(1, n); k++) out.push({ title: s.title, startMs: Math.round(s.startMs + k * len), endMs: Math.round(k + 1 === n ? s.endMs : s.startMs + (k + 1) * len) });
  }
  return out.filter((s) => s.endMs > s.startMs);
}

/** The segment boundary nearest `ms` (a segment index: where the next part starts). */
function boundaryAt(segments: TimedSegment[], ms: number): number {
  let best = 1;
  for (let i = 1; i < segments.length; i++) if (Math.abs(segments[i].startMs - ms) < Math.abs(segments[best].startMs - ms)) best = i;
  return best;
}

/**
 * The lecture split into parts: N = ceil(duration / 35 min), cut at the topic boundaries nearest the
 * even split (none over 35 min; else topics grouped in order), then at segment boundaries. Two topics
 * at least, covering half the lecture, else equal windows of about 30 min.
 */
export function splitParts(m: LectureMaterial, c: Classification): LecturePart[] {
  const duration = Math.max(m.durationMs, m.segments.at(-1)?.endMs ?? 0);
  const spans = topicSpans(c, duration);
  const covered = c.topics.reduce((n, t) => n + Math.max(0, Math.min(t.endMs, duration) - t.startMs), 0);
  const byTopic = spans.length >= 2 && covered >= duration / 2;
  let cuts: number[];
  if (byTopic) {
    const n = Math.max(2, Math.ceil(duration / PART_MAX_MS));
    const starts = spans.map((s) => s.startMs).slice(1);
    // Even cuts, each at the nearest topic boundary (in order, never the same one twice).
    const even: number[] = [];
    for (let k = 1; k < n; k++) {
      const ideal = (k * duration) / n;
      const options = starts.filter((s) => s > (even.at(-1) ?? 0));
      if (options.length) even.push(options.reduce((a, b) => (Math.abs(b - ideal) < Math.abs(a - ideal) ? b : a)));
    }
    const fits = (cs: number[]) => [0, ...cs, duration].every((t, i, all) => i === 0 || t - all[i - 1] <= PART_MAX_MS);
    if (fits(even)) cuts = even;
    else {
      // Greedy: topics in order while the part stays within 35 min.
      cuts = [];
      let from = 0;
      for (const s of spans) if (s.endMs - from > PART_MAX_MS && s.startMs > from) cuts.push((from = s.startMs));
    }
  } else {
    const n = Math.max(2, Math.round(duration / FALLBACK_WINDOW_MS));
    cuts = Array.from({ length: n - 1 }, (_, k) => ((k + 1) * duration) / n);
  }
  // At segment boundaries, each part non-empty.
  const bounds: number[] = [];
  for (const t of cuts) {
    const b = boundaryAt(m.segments, t);
    if (b > (bounds.at(-1) ?? 0) && b < m.segments.length) bounds.push(b);
  }
  const edges = [0, ...bounds, m.segments.length];
  return edges.slice(0, -1).map((from, i) => {
    const to = edges[i + 1];
    const startMs = i === 0 ? 0 : m.segments[from].startMs;
    const endMs = i + 2 === edges.length ? duration : m.segments[to].startMs;
    // The topics whose start is in this part (by time: a cut moved to a segment boundary keeps them).
    const topics = byTopic ? spans.filter((s) => s.startMs >= startMs && s.startMs < endMs) : [];
    return { index: i, from, to, startMs, endMs, topics };
  });
}

/** The part holding time `tMs` (its aligned segment's part); no time → the last part. */
export function partAt(parts: LecturePart[], segments: TimedSegment[], tMs: number | null): number {
  const seg = alignTo(tMs, segments).segment;
  if (seg === null) return parts.length - 1;
  return parts.findIndex((p) => seg >= p.from && seg < p.to);
}

const middle = (a: number | null, b: number | null) => (a !== null && b !== null ? Math.round((a + b) / 2) : (a ?? b));

export interface PartItems {
  notes: LectureMaterial['notes'];
  marks: LectureMaterial['marks'];
  questions: LectureMaterial['questions'];
  photos: LectureMaterial['photos'];
  /** The plan's marks (the student's, the assistant's windows, repetitions). */
  planMarkIds: Set<string>;
}

/** Every item in exactly one part. */
export function assignItems(m: LectureMaterial, plan: SummaryPlan, parts: LecturePart[]): PartItems[] {
  const out = parts.map((): PartItems => ({ notes: [], marks: [], questions: [], photos: [], planMarkIds: new Set() }));
  const at = (t: number | null) => out[partAt(parts, m.segments, t)];
  m.notes.forEach((n) => at(n.tMs).notes.push(n));
  m.marks.forEach((k) => at(k.tMs).marks.push(k));
  m.photos.forEach((ph) => at(ph.tMs).photos.push(ph));
  m.questions.forEach((q) => at(q.windowStartMs !== null || q.windowEndMs !== null ? middle(q.windowStartMs, q.windowEndMs) : q.askedAtMs).questions.push(q));
  for (const k of plan.marks) {
    // The student's own marks by their time (as above); an assistant question by its window's middle.
    const own = m.marks.find((x) => x.id === k.id);
    at(own ? own.tMs : middle(k.startMs, k.endMs)).planMarkIds.add(k.id);
  }
  return out;
}

const CONTEXT = '(context: summarized in the neighbouring part)';

/** A part's material: its own items, its segments plus 30 s of each neighbour marked as context. */
export function partMaterial(m: LectureMaterial, part: LecturePart, items: PartItems): LectureMaterial {
  const before = m.segments.slice(0, part.from).filter((s) => s.endMs > part.startMs - ALIGN_WINDOW_MS);
  const after = m.segments.slice(part.to).filter((s) => s.startMs < part.endMs + ALIGN_WINDOW_MS);
  const ctx = (s: TimedSegment) => ({ ...s, text: `${CONTEXT} ${s.text}` });
  return {
    ...m,
    segments: [...before.map(ctx), ...m.segments.slice(part.from, part.to), ...after.map(ctx)],
    notes: items.notes,
    marks: items.marks,
    questions: items.questions,
    photos: items.photos,
  };
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The part's share of the sections' words, by its transcript words; inside it, by each topic's time. */
export function partBudget(m: LectureMaterial, plan: SummaryPlan, c: Classification, part: LecturePart) {
  const sections = wordBudgets(plan, c).sections;
  const total = m.segments.reduce((n, s) => n + words(s.text), 0);
  const own = m.segments.slice(part.from, part.to).reduce((n, s) => n + words(s.text), 0);
  const budget = Math.max(20, Math.round(total > 0 ? (sections * own) / total : sections));
  const span = part.topics.reduce((n, t) => n + Math.min(t.endMs, part.endMs) - t.startMs, 0);
  const topics = part.topics.map((t) => ({ ...t, words: Math.max(10, Math.round(span > 0 ? (budget * (Math.min(t.endMs, part.endMs) - t.startMs)) / span : budget / part.topics.length)) }));
  return { words: budget, topics };
}

/** The part call's user text: the <part> tag, then the part's material as the one-call prompt shows it. */
export function partUserText(m: LectureMaterial, plan: SummaryPlan, c: Classification, request: SummaryRequest, parts: LecturePart[], k: number, items: PartItems): string {
  const part = parts[k];
  const b = partBudget(m, plan, c, part);
  const others = parts.filter((p) => p.index !== k);
  const topicList = (p: LecturePart) => (p.topics.length ? p.topics.map((t) => `"${tagSafe(t.title)}"`).join(', ') : `${stamp(p.startMs)}–${stamp(p.endMs)}`);
  const tag = [
    '<part>',
    `Part ${k + 1} of ${parts.length}: ${stamp(part.startMs)}–${stamp(part.endMs)}.`,
    `Its sections: about ${b.words} words together${b.topics.length ? `, by topic: ${b.topics.map((t) => `"${tagSafe(t.title)}" ≈ ${t.words}`).join('; ')}` : ''}.`,
    `The other parts, written separately (don't write their topics): ${others.map((p) => `part ${p.index + 1} ${topicList(p)}`).join('; ')}.`,
    `Transcript lines marked ${CONTEXT} belong to a neighbouring part: use them only to understand this part's start and end.`,
    `This part has ${plural(items.notes.length, 'note line')} and ${plural(items.marks.length, 'mark')}: every one of them goes in this part's sections.`,
    '</part>',
  ].join('\n');
  const own = partMaterial(m, part, items);
  const subPlan = { ...plan, marks: plan.marks.filter((x) => items.planMarkIds.has(x.id)) };
  const subC = { ...c, topics: part.topics, professorSignals: c.professorSignals.filter((s) => partAt(parts, m.segments, s.atMs) === k) };
  return `${tag}\n${summaryUserText(own, subPlan, subC, request)}`;
}

/**
 * The media as the parts get them: the slides shared by all (the last of them marked as the cached
 * prefix's end), each photo with its own part. The blocks are photoBlocks / slidesBlocks' (a line
 * naming the photo, then its image; "Slides:", then the PDF).
 */
export function splitMedia(blocks: Content): { shared: Content; photos: Map<string, Content> } {
  const shared: Content = [];
  const photos = new Map<string, Content>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const id = b.type === 'text' ? /^Photo (\S+) \(/.exec(String(b.text ?? ''))?.[1] : undefined;
    if (id && blocks[i + 1]) {
      photos.set(id, [b, blocks[i + 1]]);
      i += 1;
    } else shared.push(b);
  }
  if (shared.length) shared[shared.length - 1] = { ...shared[shared.length - 1], cache_control: { type: 'ephemeral' } };
  return { shared, photos };
}

// ---------- the answers ----------

export type PartGenerated = Pick<Generated, 'modulesUsed' | 'sections'> & {
  glossary: { term: string; definition: string }[];
  examSignals: { text: string; timestamp: string; source: string; markId: string; level: number }[];
  questionsDuringClass: { t: string; question: string; shortAnswer: string }[];
  logistics: string[];
  unclear: { timestamp: string; note: string }[];
};

export function parsePart(text: string): { ok: true; part: PartGenerated } | { ok: false; errors: string[] } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['not JSON'] };
  }
  const parsed = PartAnswer.safeParse(value);
  return parsed.success ? { ok: true, part: parsed.data as unknown as PartGenerated } : { ok: false, errors: issueLines(parsed.error).slice(0, 10) };
}

export type WrapUp = { title: string; takeaways: { text: string; fromMarkIds: string[] }[]; selfTest: { question: string; kind: string; answer: string; fromMarkId: string }[]; flashcards: { front: string; back: string }[] };

export function parseWrapUp(text: string): WrapUp | null {
  try {
    const parsed = WrapUpAnswer.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const timeOf = (t: string) => {
  const m = /^(?:(\d+):)?(\d{1,3}):(\d{2})$/.exec(t.trim());
  return m ? (Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3]) : Infinity;
};

/**
 * The parts merged by code: sections in order; the glossary without repeats (by its term, the fuller
 * definition kept); exam signals, questions and unclear moments in time order; logistics once each;
 * modules once. Title and lists come from the wrap-up.
 */
export function mergeParts(parts: PartGenerated[], c: Classification): Generated {
  const glossary = new Map<string, { term: string; definition: string }>();
  for (const g of parts.flatMap((p) => p.glossary)) {
    const key = norm(g.term);
    const had = glossary.get(key);
    if (!had || g.definition.length > had.definition.length) glossary.set(key, had ? { term: had.term, definition: g.definition } : g);
  }
  const once = <T>(list: T[], key: (x: T) => string) => [...new Map(list.map((x) => [key(x), x])).values()];
  const byTime = <T>(list: T[], t: (x: T) => string) => [...list].sort((a, b) => timeOf(t(a)) - timeOf(t(b)));
  return {
    subjectType: c.subjectType,
    modulesUsed: [...new Set(parts.flatMap((p) => p.modulesUsed))],
    title: '',
    takeaways: [],
    sections: parts.flatMap((p) => p.sections),
    glossary: [...glossary.values()],
    examSignals: byTime(once(parts.flatMap((p) => p.examSignals), (e) => `${e.timestamp}|${e.markId}|${norm(e.text)}`), (e) => e.timestamp),
    questionsDuringClass: byTime(parts.flatMap((p) => p.questionsDuringClass), (q) => q.t),
    selfTest: [],
    flashcards: [],
    logistics: once(parts.flatMap((p) => p.logistics), norm),
    unclear: byTime(parts.flatMap((p) => p.unclear), (u) => u.timestamp),
  };
}

/** The wrap-up call: the merged sections as prose, the whole summary's numbers (7.2), the marks that need a list item. */
export function wrapUpPrompt(baseSystem: string, merged: { sections: { heading: string; timestamp: string; blocks: Record<string, unknown>[] }[] }, plan: SummaryPlan) {
  const text = merged.sections.map((x) => `## ${x.heading} [${x.timestamp}]\n${x.blocks.filter((b) => b.type !== 'fromNotes').flatMap((b) => proseOf(b)).join(' ')}`).join('\n\n');
  const p = plan;
  const needs = p.marks.filter((k) => k.effects.takeaway || k.effects.selfTest || k.effects.flashcard);
  const system = [
    baseSystem,
    '',
    'This time the sections are written (in parts, merged below). Write only the whole lecture\'s title, takeaways, self-test and flashcards, in the wrap-up schema, from the summary below:',
    `- Key takeaways: exactly ${p.takeaways.count} one-sentence bullets covering the whole lecture${p.takeaways.markIds.length ? `; these marks must each be in a takeaway's fromMarkIds: ${p.takeaways.markIds.join(', ')}` : ''}.`,
    p.selfTest.count === 0
      ? '- Self-test: none (an empty list).'
      : `- Self-test: exactly ${p.selfTest.count} questions across the whole lecture, ${p.selfTest.whyHow} of them "why"/"how" (kind why), kinds from: ${p.selfTest.kinds.join(', ')}${p.selfTest.requiredMarkIds.length ? `; one question for each of these marks (fromMarkId): ${p.selfTest.requiredMarkIds.join(', ')}` : ''}. fromMarkId is "" otherwise.`,
    '- Flashcards: one for each mark below that asks for one, and the key terms.',
  ].join('\n');
  const marks = needs.map((k) => `${k.id} | ${k.type} → effective ${k.effective}/10 (${k.band}) | ${stamp(k.startMs)} | ${[k.effects.takeaway && 'a takeaway', k.effects.selfTest && 'a self-test question', k.effects.flashcard && 'a flashcard'].filter(Boolean).join(', ')}`);
  const user = ['<summary>', tagSafe(text), '</summary>', '<marks>', marks.join('\n') || '(none)', '</marks>'].join('\n');
  return { system, user, maxTokens: WRAPUP_MAX_TOKENS };
}

/** A note line as the part prompt shows it (re-exported for the tests). */
export { noteMarkdown };
