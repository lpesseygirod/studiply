/**
 * Step 7.7: a summary (summaries.result, studiply-summary-v1) as the Summary tab's document, and a
 * summary written again merged into a tab without touching what the student edited. Pure (no editor,
 * no network), so the iPhone converts it in the app's own JS and both devices give the same document.
 *
 * - DESIGN "3. Summary in the same document", docs/design desktop-03 and iphone-06: (the screen's header
 *   gives the title and meta line) the notes check line under the title (on both devices: one
 *   document, one order; iphone-06 has it above), Key
 *   takeaways, each section a heading "n · heading" with its ▶ time and the marks' chips, then its
 *   blocks; exam signals, Your questions during class (each with its Full answer link), the
 *   self-test (each answer hidden), the flashcards line, the glossary, logistics, unclear moments.
 * - Every block is `ai`, except the From your notes boxes (`student`, BUILD-PLAN) and photos (`media`).
 * - Block ids are made from the summary's id and the block's place (`sm<8>-…`): converting the same
 *   summary twice (two devices at once) gives the same document, and a generated block can be told
 *   from one the student added.
 * - Visuals Phase 8 draws (function plots, model graphs; data charts the graph block can't take) are
 *   a placeholder line for now; the summary JSON stays in summaries.result, so 8.2 converts again.
 */

import type { StoredSummary } from '../../supabase/functions/_shared/summary-pipeline';
import { mediaSrc } from '../editor/media/photoSource';
import type { Origin } from '../editor/schema/blockMeta';
import { parseClock } from '../editor/schema/timestampChip';
import { assistantLink, tabLink } from './appLinks';

/** A document node as JSON (the editor's DocJSON: `type` is optional there). */
type Node = { type?: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] };
export type SummaryDocJSON = { type: 'doc'; content: Node[] };

type Block = Record<string, unknown> & { type: string };
type Section = { heading: string; timestamp: string; cueQuestion: string; markChips: { markId: string; type: string; level: number }[]; blocks: Block[] };
type NoteCopy = { id: string; t: string; text: string; content: unknown };

// ---------- the app's own words around the summary ----------

/**
 * The labels and headings the app writes around Claude's text: app UI, so English as the rest of the
 * app (CLAUDE.md: "English UI; study content stays in the lecture's language"), like the callouts'
 * labels (KEY TAKEAWAYS, FROM YOUR NOTES, desktop-03). Claude's own text stays in the lecture's language.
 */
export const WORDS = {
  questions: 'Your questions during class',
  selfTest: 'Self-test',
  glossary: 'Glossary',
  logistics: 'Logistics',
  unclear: 'Unclear in the recording',
  example: 'Example',
  tryIt: 'Try it',
  problem: 'Problem',
  answer: 'Answer',
  whenToUse: 'When to use',
  formula: 'Formula',
  fullAnswer: 'Full answer',
  cards: (n: number) => `${n} flashcard${n === 1 ? '' : 's'} saved for review`,
  notes: (u: number, t: number, mu: number, mt: number) => `${u} of ${t} lines and ${mu} of ${mt} marks used · shown in green as “From your notes”`,
  seeNotes: 'See them in My notes',
  later: 'drawn in a later update',
};
type Words = typeof WORDS;

// ---------- ids ----------

/** A summary's key in its blocks' ids: "sm" and 8 characters of its id. */
export function summaryKey(summaryId: string): string {
  return `sm${summaryId.replace(/[^0-9a-z]/gi, '').toLowerCase().slice(0, 8).padEnd(8, '0')}`;
}
const GENERATED = /^sm[0-9a-z]{8}-(.+)$/;
/** The part of a generated block's id after the summary's key ("s2-b4"), or null for a block the student added. */
export const generatedPath = (blockId: unknown): string | null => (typeof blockId === 'string' ? (GENERATED.exec(blockId)?.[1] ?? null) : null);

/** Whether this document holds the blocks of that summary (converted already). */
export function hasSummary(doc: { content?: Node[] } | null | undefined, summaryId: string): boolean {
  const key = `${summaryKey(summaryId)}-`;
  return !!doc?.content?.some((b) => typeof b.attrs?.blockId === 'string' && (b.attrs.blockId as string).startsWith(key));
}

/** Whether a document holds a converted summary (the Summary tab's banner and bottom buttons). */
export function holdsSummary(doc: { content?: Node[] } | null | undefined): boolean {
  return !!doc?.content?.some((b) => generatedPath(b.attrs?.blockId) === 'check');
}

// ---------- inline text ----------

const text = (t: string, marks?: Node['marks']): Node => ({ type: 'text', text: t, ...(marks?.length && { marks }) });
const bold = (t: string) => text(t, [{ type: 'bold' }]);
const chip = (ms: number): Node => ({ type: 'timestampChip', attrs: { ms } });
const markChip = (kind: string, level: number): Node => ({ type: 'markChip', attrs: { kind, level } });
/** The 7.2 plan's implicit signals (summary-plan.ts): a question to the assistant, a concept explained 3+ times. */
export const isImplicitMark = (markId: string) => markId.startsWith('assistant:') || markId.startsWith('repetition:');

/** Claude's text: `**bold**` as bold, `$…$` as a formula; nothing else is read as markup. */
export function inline(value: string): Node[] {
  const out: Node[] = [];
  const re = /\*\*([^*]+)\*\*|\$([^$]+)\$/g;
  let last = 0;
  for (let m = re.exec(value); m; m = re.exec(value)) {
    if (m.index > last) out.push(text(value.slice(last, m.index)));
    out.push(m[1] !== undefined ? bold(m[1]) : { type: 'inlineMath', attrs: { latex: m[2].trim() } });
    last = m.index + m[0].length;
  }
  if (last < value.length) out.push(text(value.slice(last)));
  return out.filter((n) => n.type !== 'text' || n.text);
}

const para = (content: Node[]): Node => ({ type: 'paragraph', ...(content.length && { content }) });
const p = (value: string) => para(inline(value));
const list = (items: Node[][], ordered = false): Node => ({ type: ordered ? 'orderedList' : 'bulletList', content: items.map((c) => ({ type: 'listItem', content: [para(c)] })) });
/** "4:12", "1:02:03", or a range's start ("30:00–40:00", a question's window) → ms; null when it isn't a time. */
const ms = (t: string | null | undefined): number | null => (t ? parseClock(t.replace(/[[\]]/g, '').split(/\s*[–-]\s*/)[0]) : null);
const spaced = (nodes: Node[]) => nodes.flatMap((n, i) => (i ? [text(' '), n] : [n]));

// ---------- the notes, as she wrote them ----------

/** A note line's block without its chips (the box's label gives the time and the mark) and without My notes' ids. */
function noteBlock(note: NoteCopy): { block: Node; mark: { kind: string; level: number } | null } {
  let mark: { kind: string; level: number } | null = null;
  const clean = (n: Node): Node | null => {
    if (n.type === 'timestampChip') return null;
    if (n.type === 'markChip') {
      if (!mark && typeof n.attrs?.kind === 'string') mark = { kind: n.attrs.kind, level: Number(n.attrs.level) || 0 };
      return null;
    }
    const content = n.content?.map(clean).filter((c): c is Node => !!c);
    const { blockId: _id, origin: _origin, editedAt: _edited, ...attrs } = n.attrs ?? {};
    return { ...n, ...(n.attrs && { attrs }), ...(n.content && { content }) };
  };
  const source = note.content as Node | null;
  const ok = source && typeof source === 'object' && typeof source.type === 'string';
  const block = (ok && clean(source)) || para(note.text ? [text(note.text)] : []);
  // The chips' spaces gone: no leading space left at the start of the line.
  const first = block.content?.[0];
  if (first?.type === 'text' && first.text) first.text = first.text.replace(/^\s+/, '');
  if (block.content) block.content = block.content.filter((n) => n.type !== 'text' || n.text);
  return { block, mark };
}

const listLine = (id: string) => /#\d+$/.test(id);
const listOf = (id: string) => id.replace(/#\d+$/, '');

/** A From your notes block as boxes: one per note line (its own time and mark, desktop-03), a list's lines together. */
function noteBoxes(notes: NoteCopy[]): { notes: NoteCopy[] }[] {
  const boxes: { notes: NoteCopy[] }[] = [];
  for (const n of notes) {
    const prev = boxes.at(-1);
    if (prev && listLine(n.id) && listLine(prev.notes[0].id) && listOf(prev.notes[0].id) === listOf(n.id)) prev.notes.push(n);
    else boxes.push({ notes: [n] });
  }
  return boxes;
}

function fromNotesBox(box: { notes: NoteCopy[] }): Node {
  const copies = box.notes.map(noteBlock);
  const mark = copies.find((c) => c.mark)?.mark ?? null;
  const body = listLine(box.notes[0].id)
    ? [{ type: 'bulletList', content: copies.map((c) => ({ type: 'listItem', content: [c.block.type === 'paragraph' ? c.block : para(c.block.content ?? [])] })) }]
    : copies.map((c) => c.block);
  return {
    type: 'callout',
    attrs: { kind: 'fromNotes', ms: ms(box.notes[0].t), mark: mark?.kind ?? null, level: mark && mark.level ? mark.level : null, noteIds: box.notes.map((n) => n.id).join(',') },
    content: body,
  };
}

// ---------- a section's blocks ----------

/** One stored block as editor blocks (empty when there's nothing to show); `origin`: of each node, else of all. */
function convertBlock(b: Block, w: Words): { nodes: Node[]; origin?: Origin | Origin[] } {
  const s = (k: string) => String(b[k] ?? '');
  const arr = <T>(k: string) => (Array.isArray(b[k]) ? (b[k] as T[]) : []);
  switch (b.type) {
    case 'paragraph':
      return { nodes: s('text') ? [p(s('text'))] : [] };
    case 'callout':
      return { nodes: [{ type: 'callout', attrs: { kind: s('kind') || 'definition' }, content: [p(s('text'))] }] };
    case 'fromNotes':
      return { nodes: noteBoxes(arr<NoteCopy>('notes')).map(fromNotesBox), origin: 'student' };
    case 'confusedHere': {
      const content = [p(s('explanation'))];
      if (arr<string>('steps').length) content.push(list(arr<string>('steps').map(inline), true));
      if (s('example')) content.push(para([bold(`${w.example}: `), ...inline(s('example'))]));
      if (s('practiceQuestion')) content.push(para([bold(`${w.tryIt}: `), ...inline(s('practiceQuestion'))]));
      return { nodes: [{ type: 'callout', attrs: { kind: 'confused', level: Number(b.level) || null, ms: ms(s('t')) }, content }] };
    }
    case 'formula': {
      const legend: Node[] = [];
      arr<{ symbol: string; meaning: string }>('variables').forEach((v, i, all) => legend.push({ type: 'inlineMath', attrs: { latex: v.symbol } }, text(` ${v.meaning}${i < all.length - 1 ? ' · ' : ''}`)));
      const content: Node[] = [{ type: 'blockMath', attrs: { latex: s('latex') } }, para(legend)];
      if (s('whenToUse')) content.push(para([bold(`${w.whenToUse}: `), ...inline(s('whenToUse'))]));
      return { nodes: [{ type: 'formulaCard', attrs: { title: w.formula }, content }] };
    }
    case 'workedExample': {
      const content = [para([bold(`${w.problem}: `), ...inline(s('problem'))])];
      const steps = arr<{ do: string; why: string }>('steps');
      if (steps.length) content.push(list(steps.map((x) => [...inline(x.do), ...(x.why ? [text(' — '), ...inline(x.why)] : [])]), true));
      if (s('answer')) content.push(para([bold(`${w.answer}: `), ...inline(s('answer'))]));
      return { nodes: [{ type: 'callout', attrs: { kind: 'example' }, content }] };
    }
    case 'timeline':
      return { nodes: some(table(arr<{ date: string; title: string; detail: string }>('events').map((e) => [`**${e.date}**`, e.title, e.detail]), false)) };
    case 'keyFigures':
      return { nodes: some(table(arr<{ name: string; role: string; did: string; why: string }>('people').map((x) => [`**${x.name}**`, x.role, x.did, x.why]), false)) };
    case 'comparison': {
      const items = arr<string>('items');
      return { nodes: some(table([['', ...items], ...arr<{ name: string; values: string[] }>('criteria').map((c) => [`**${c.name}**`, ...items.map((_, i) => c.values[i] ?? '')])], true)) };
    }
    case 'vocabulary':
      return { nodes: some(table(arr<{ term: string; meaning: string; example: string }>('entries').map((e) => [`**${e.term}**`, e.meaning, e.example]), false)) };
    case 'process':
      return { nodes: [list(arr<{ name: string; input: string; output: string }>('steps').map((x) => [bold(x.name), text(x.input || x.output ? ` (${[x.input, x.output].filter(Boolean).join(' → ')})` : '')]), true)] };
    case 'causeEffect':
      return { nodes: [list([...arr<string>('causes').map(inline), [bold('→ '), ...inline(s('event'))], ...arr<string>('effects').map((e) => [text('→ '), ...inline(e)])])] };
    case 'argument':
      return {
        nodes: [p(`**${s('claim')}**`), list([...arr<string>('premises').map(inline), ...arr<{ objection: string; reply: string }>('objections').map((o) => [text('✗ '), ...inline(o.objection), text(' — '), ...inline(o.reply)])])],
      };
    case 'theoryCard':
      return { nodes: [para([bold(`${s('author')}${b.year ? ` (${b.year})` : ''}`)]), list(['claim', 'method', 'finding', 'critique'].filter((k) => s(k)).map((k) => inline(s(k))))] };
    case 'caseCard':
      return { nodes: [list(['facts', 'question', 'decision', 'reasoning', 'lesson'].filter((k) => s(k)).map((k) => inline(s(k))))] };
    case 'framework':
      return { nodes: [para([bold(s('name'))]), list(arr<{ label: string; content: string }>('cells').map((c) => [bold(`${c.label}: `), ...inline(c.content)]))] };
    case 'conceptMap':
      return { nodes: [para([bold(s('center'))]), list(arr<{ from: string; to: string; label: string }>('links').map((l) => [text(`${l.from} → ${l.to}${l.label ? ` (${l.label})` : ''}`)]))] };
    case 'code':
      return {
        nodes: [...s('code').split('\n').map((line) => para(line ? [text(line, [{ type: 'code' }])] : [])), ...(s('output') ? [para([text(s('output'), [{ type: 'code' }])])] : [])],
      };
    case 'dataChart':
      return { nodes: [dataChart(b) ?? placeholder(`${s('title') || 'Chart'}`, w)] };
    case 'functionPlot': {
      const range = arr<number>('xRange');
      return { nodes: [para([text(`${s('title') || 'Graph'}: `, [{ type: 'italic' }]), { type: 'inlineMath', attrs: { latex: `y = ${s('expression')}` } }, text(`${range.length === 2 ? ` on [${range[0]}, ${range[1]}]` : ''} · ${w.later}`, [{ type: 'italic' }])])] };
    }
    case 'modelGraph':
      return { nodes: [placeholder(`${s('title') || s('template')}${arr<{ curve: string; direction: string }>('shifts').map((x) => ` (${x.curve} → ${x.direction})`).join('')}`, w)] };
    case 'capturedImage':
      // The photo is `media`; its caption is Claude's words (`ai`).
      return { nodes: [{ type: 'image', attrs: { src: mediaSrc(s('imageId')), alt: s('caption') || null } }, ...(s('caption') ? [para([text(s('caption'), [{ type: 'italic' }])])] : [])], origin: ['media', 'ai'] };
    default:
      return { nodes: [] };
  }
}

const placeholder = (what: string, w: Words) => para([text(`${what} · ${w.later}`, [{ type: 'italic' }])]);

/** A table of text cells (4.x tables); `header`: the first row is the header row. Rows with nothing in them are left out. */
function table(rows: string[][], header: boolean): Node | null {
  const kept = rows.filter((r, i) => (header && i === 0) || r.some((cell) => cell.trim()));
  if (!kept.length || (header && kept.length < 2)) return null;
  const width = Math.max(1, ...kept.map((r) => r.length));
  return {
    type: 'table',
    content: kept.map((r, i) => ({
      type: 'tableRow',
      content: Array.from({ length: width }, (_, c) => ({ type: header && i === 0 ? 'tableHeader' : 'tableCell', content: [para(inline(r[c] ?? ''))] })),
    })),
  };
}
const some = (n: Node | null): Node[] => (n ? [n] : []);

/** A data chart as the graph block (4.7d) when it can take it: line, or bars. */
function dataChart(b: Block): Node | null {
  const series = (Array.isArray(b.series) ? b.series : []) as { name: string; points: { x: string; y: number }[] }[];
  if (!series.length) return null;
  const kind = b.chart === 'line' ? 'line' : b.chart === 'bar' || b.chart === 'stackedBar' || b.chart === 'histogram' ? 'bar' : null;
  if (!kind) return null;
  const labels = [...new Set(series.flatMap((s) => s.points.map((pt) => pt.x)))];
  const rows = labels.map((x) => [x, ...series.slice(0, 3).map((s) => String(s.points.find((pt) => pt.x === x)?.y ?? ''))]);
  return { type: 'graph', attrs: { kind, title: String(b.title ?? ''), xLabel: String(b.xLabel ?? ''), yLabel: String(b.yLabel ?? ''), series: series.slice(0, 3).map((s) => s.name), rows } };
}

// ---------- the whole summary ----------

export interface SummaryDocInput {
  summary: StoredSummary;
  summaryId: string;
  /** Each question during class's assistant message (its Full answer link), by place; null when not found. */
  questionLinks?: (string | null)[];
  /** Step 7.9 (what a lecture adds to a summary): no notes check line, the first section's number, a tag on the lists' headings. */
  check?: boolean;
  firstSection?: number;
  tag?: string;
  /**
   * Step 7.9, a Unit summary: whose notes the line counts ("Lectures 1, 2"), in place of the link to My
   * notes (a Unit summary's own first tab isn't her notes).
   */
  notesOf?: string;
}

/** The summary as the Summary tab's document. */
export function summaryToDoc({ summary: s, summaryId, questionLinks = [], check = true, firstSection = 1, tag, notesOf }: SummaryDocInput): SummaryDocJSON {
  const w = WORDS;
  const tagged = (heading: string) => (tag ? `${heading} · ${tag}` : heading);
  const key = summaryKey(summaryId);
  const out: Node[] = [];
  const add = (path: string, node: Node, origin: Origin = 'ai') => out.push({ ...node, attrs: { ...node.attrs, blockId: `${key}-${path}`, origin, editedAt: null } });
  // The page's header (the gradient line, the title, the meta line) is the screen's (DocumentHeader), on
  // every tab: the summary starts with the notes check line, under the title (desktop-03).
  const c = s.coverage;
  if (check) add('check', {
    type: 'callout',
    attrs: { kind: 'notesCheck' },
    content: [
      para(
        notesOf
          ? [text(`${w.notes(c.noteLinesUsed, c.noteLines, c.marksUsed, c.marks)} · ${notesOf}`)]
          : [text(`${w.notes(c.noteLinesUsed, c.noteLines, c.marksUsed, c.marks)} · `), text(w.seeNotes, [{ type: 'link', attrs: { href: tabLink('notes') } }])],
      ),
    ],
  });
  const takeaways = (s.takeaways ?? []) as { text: string }[];
  if (takeaways.length) add('takeaways', { type: 'callout', attrs: { kind: 'takeaways' }, content: [list(takeaways.map((t) => inline(t.text)))] });

  ((s.sections ?? []) as (Section & { lecture?: string })[]).forEach((sec, si) => {
    const at = ms(sec.timestamp);
    // Chips are her own marks only: the implicit signals (a question to the assistant, a concept
    // explained 3+ times) shaped the section's content but must not look like marks she set.
    const chips = sec.markChips.filter((k) => !isImplicitMark(k.markId)).map((k) => markChip(k.type, k.level));
    // Step 7.9: a section a lecture added is tagged with it ("4 · Lecture 2 · La sinapsis").
    add(`s${si}`, { type: 'heading', attrs: { level: 2, cue: sec.cueQuestion || null }, content: [text(`${si + firstSection} · ${sec.lecture ? `${sec.lecture} · ` : ''}${sec.heading}`), ...(at !== null ? [text(' '), chip(at)] : []), ...(chips.length ? [text(' '), ...spaced(chips)] : [])] });
    sec.blocks.forEach((b, bi) => {
      const { nodes, origin } = convertBlock(b, w);
      nodes.forEach((n, ni) => add(`s${si}-b${bi}${nodes.length > 1 ? `-${ni}` : ''}`, n, Array.isArray(origin) ? origin[ni] : origin));
    });
  });

  const signals = (s.examSignals ?? []) as { text: string; timestamp: string; source: string; level: number }[];
  if (signals.length) {
    add('exam', {
      type: 'callout',
      attrs: { kind: 'exam' },
      content: [list(signals.map((e) => [...inline(e.text), ...(ms(e.timestamp) !== null ? [text(' '), chip(ms(e.timestamp)!)] : []), ...(e.source === 'studentMark' && e.level ? [text(' '), markChip('exam', e.level)] : [])]))],
    });
  }
  const questions = (s.questionsDuringClass ?? []) as { t: string; question: string; shortAnswer: string }[];
  if (questions.length) {
    add('questions', { type: 'heading', attrs: { level: 2 }, content: [text(tagged(w.questions))] });
    add(
      'questions-list',
      list(
        questions.map((q, i) => [
          ...(ms(q.t) !== null ? [chip(ms(q.t)!), text(' ')] : []),
          bold(q.question),
          ...(q.shortAnswer ? [text(' — '), ...inline(q.shortAnswer)] : []),
          ...(questionLinks[i] ? [text(' · '), text(w.fullAnswer, [{ type: 'link', attrs: { href: assistantLink(questionLinks[i]!) } }])] : []),
        ]),
      ),
    );
  }
  const selfTest = (s.selfTest ?? []) as { question: string; answer: string }[];
  if (selfTest.length) {
    add('selftest', { type: 'heading', attrs: { level: 2 }, content: [text(tagged(w.selfTest))] });
    selfTest.forEach((q, i) => {
      add(`q${i}`, para([bold(`${i + 1}. `), ...inline(q.question)]));
      add(`q${i}-answer`, { type: 'callout', attrs: { kind: 'answer' }, content: [p(q.answer)] });
    });
  }
  const cards = ((s.flashcards ?? []) as unknown[]).length;
  if (cards) add('cards', para([text(w.cards(cards), [{ type: 'italic' }])]));
  const glossary = (s.glossary ?? []) as { term: string; definition: string }[];
  if (glossary.length) {
    add('glossary', { type: 'heading', attrs: { level: 2 }, content: [text(tagged(w.glossary))] });
    add('glossary-list', list(glossary.map((g) => [bold(g.term), text(' — '), ...inline(g.definition)])));
  }
  const logistics = (s.logistics ?? []) as string[];
  if (logistics.length) {
    add('logistics', { type: 'heading', attrs: { level: 2 }, content: [text(tagged(w.logistics))] });
    add('logistics-list', list(logistics.map(inline)));
  }
  const unclear = (s.unclear ?? []) as { timestamp: string; note: string }[];
  if (unclear.length) {
    add('unclear', { type: 'heading', attrs: { level: 2 }, content: [text(tagged(w.unclear))] });
    add('unclear-list', list(unclear.map((u) => [...(ms(u.timestamp) !== null ? [chip(ms(u.timestamp)!), text(' ')] : []), ...inline(u.note)])));
  }
  return { type: 'doc', content: out };
}

// ---------- written again: merged around what she edited ----------

const idOf = (b: Node) => (typeof b.attrs?.blockId === 'string' ? (b.attrs.blockId as string) : null);
/** Whether a block carries a comment (hers, or Studiply's from a lecture added, 7.9) anywhere in it. */
const hasComment = (n: Node): boolean => !!n.marks?.some((m) => m.type === 'comment') || !!n.content?.some(hasComment);
/** What Extend added to a summary (7.9): its blocks (`x…`) and Update callouts (`u…`). */
const EXTENDED = /^(x\d+-|u\d+$)/;

/**
 * Kept when a summary is written again: a block she added (not generated) or changed (blockMeta dates
 * every edit, 4.3); a block carrying a comment (7.9: Studiply's comments are never lost); and what a
 * lecture added with Extend put there (7.9).
 */
export const isTouched = (b: Node) => {
  const path = generatedPath(idOf(b));
  return path === null || (b.attrs?.editedAt !== null && b.attrs?.editedAt !== undefined) || hasComment(b) || EXTENDED.test(path);
};

/**
 * Where a part of the summary starts (a block of its own level: a section's heading, the exam signals,
 * the self-test's heading, each question…; not a block inside a section): a section by its time (else
 * its words), the rest by its part ("exam", "selftest", "q3"…). Her blocks stay with the part above them.
 */
function anchorOf(b: Node): string | null {
  const path = generatedPath(idOf(b));
  if (!path || path.includes('-')) return null;
  if (!/^s\d+$/.test(path)) return `p:${path}`;
  const at = b.content?.find((n) => n.type === 'timestampChip')?.attrs?.ms;
  if (typeof at === 'number') return `t:${at}`;
  return `h:${(b.content ?? []).map((n) => n.text ?? '').join('').replace(/^\d+ · /, '').trim().toLowerCase()}`;
}

const noteIdsOf = (b: Node) => (b.type === 'callout' && b.attrs?.kind === 'fromNotes' && typeof b.attrs.noteIds === 'string' ? (b.attrs.noteIds as string).split(',').filter(Boolean) : []);

/**
 * A summary written again into a tab that holds an earlier one (BUILD-PLAN 7.7: "Regenerating never
 * overwrites blocks I edited"): the earlier summary's untouched blocks give way to the new one's;
 * every block she edited or added stays, at the end of the section it was in (matched by the
 * section's time, else its title; a section gone: the nearest earlier one that's still there). A
 * From your notes box she edited keeps its notes: the new summary's box for the same lines is left out.
 */
export function mergeRegenerated(current: { content?: Node[] }, next: SummaryDocJSON): SummaryDocJSON {
  const blocks = current.content ?? [];
  // Hers, each with the section (anchor) it sits in; "head" before the first.
  const kept: { block: Node; anchor: string }[] = [];
  const order: string[] = ['head'];
  let anchor = 'head';
  for (const b of blocks) {
    const a = anchorOf(b);
    if (a) {
      anchor = a;
      order.push(a);
    }
    if (isTouched(b)) kept.push({ block: b, anchor });
  }
  const covered = new Set(kept.flatMap((k) => noteIdsOf(k.block)));
  const nextBlocks = next.content.filter((b) => {
    const ids = noteIdsOf(b);
    return !ids.length || !ids.every((id) => covered.has(id));
  });
  const present = new Set(['head', ...nextBlocks.map(anchorOf).filter((a): a is string => !!a)]);
  // An anchor the new summary doesn't have: the nearest earlier one by time, else the nearest before it in her document.
  const times = [...present].filter((a) => a.startsWith('t:')).map((a) => Number(a.slice(2))).sort((x, y) => x - y);
  const placeOf = (a: string): string => {
    if (present.has(a)) return a;
    if (a.startsWith('t:') && times.length) {
      const t = Number(a.slice(2));
      const before = times.filter((x) => x <= t);
      return `t:${before.length ? before.at(-1) : times[0]}`;
    }
    for (let i = order.indexOf(a) - 1; i >= 0; i--) if (present.has(order[i])) return order[i];
    return 'head';
  };
  const byAnchor = new Map<string, Node[]>();
  for (const k of kept) {
    const at = placeOf(k.anchor);
    byAnchor.set(at, [...(byAnchor.get(at) ?? []), k.block]);
  }
  // The new summary, each group (head, then each heading's run) followed by her blocks of that group.
  const out: Node[] = [];
  let group = 'head';
  const flush = () => {
    out.push(...(byAnchor.get(group) ?? []));
    byAnchor.delete(group);
  };
  for (const b of nextBlocks) {
    const a = anchorOf(b);
    if (a) {
      flush();
      group = a;
    }
    out.push(b);
  }
  flush();
  for (const rest of byAnchor.values()) out.push(...rest);
  // Never two blocks with one id (a kept block can't share one with the new summary's: other key).
  const seen = new Set<string>();
  return { type: 'doc', content: out.filter((b) => !idOf(b) || (!seen.has(idOf(b)!) && !!seen.add(idOf(b)!))) };
}

/** A document with nothing in it yet (no blocks, or only empty lines): a summary may be written into it. */
export function isEmptyDoc(doc: { content?: Node[] } | null | undefined): boolean {
  const blank = (n: Node): boolean => (n.type === 'paragraph' || n.type === 'title') && !(n.content ?? []).some((c) => c.type !== 'text' || (c.text ?? '').trim());
  return !doc?.content?.length || doc.content.every(blank);
}
