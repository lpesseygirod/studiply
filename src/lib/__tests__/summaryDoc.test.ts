/**
 * @jest-environment jsdom
 */
// A summary as the Summary tab's document (lib/summaryDoc), on the two summaries of the
// synthetic lectures (copies of the paid runs' outputs, no call) and on the example with every block
// type; a summary written again merged around what she edited; where a finished summary goes
// (services/summaryDoc/run, with its services faked).
import { Editor, type JSONContent } from '@tiptap/core';

import { studiplyExtensions } from '../../editor/bridges';
import { summaryCards } from '../review/cards';
import { hasSummary, holdsSummary, inline, isEmptyDoc, isTouched, mergeRegenerated, summaryKey, summaryToDoc, type SummaryDocJSON } from '../summaryDoc';
import { placeSummary, questionLinks, type DoneSummary, type PlaceDeps } from '../../services/summaryDoc/run';
import { parseClassify, parseSummary, planFor, type StoredSummary, type SummaryRequest } from '../../../supabase/functions/_shared/summary-pipeline';
import { SLIDER_DEFAULTS } from '../../../supabase/functions/_shared/summary-plan';
import { lectureMaterial, packedSummary } from '../../test-utils/summaryFixtures';
import short from '../../test-utils/summary-synthetic-30.json';
import long from '../../test-utils/summary-synthetic-90.json';

const S30 = short.result as unknown as StoredSummary;
const S90 = long.result as unknown as StoredSummary;
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ID2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
type N = JSONContent;

const textOf = (n: N): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('');
const find = (doc: SummaryDocJSON, path: string) => doc.content.find((b) => b.attrs?.blockId === `${summaryKey(ID)}-${path}`) as N;
const ofKind = (doc: SummaryDocJSON, kind: string) => doc.content.filter((b) => b.type === 'callout' && b.attrs?.kind === kind) as N[];

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});
/** The document as the editor loads it (the real schema of both editors): throws when it isn't valid. */
function loaded(doc: SummaryDocJSON): N {
  editor = new Editor({ extensions: studiplyExtensions(), content: doc });
  editor.state.doc.check();
  return editor.getJSON();
}

describe('the 30-min synthetic lecture’s summary as the Summary tab', () => {
  const doc = summaryToDoc({ summary: S30, summaryId: ID, questionLinks: ['msg-q1'] });

  it('a valid document for both editors, its attributes kept through loading', () => {
    const json = loaded(doc);
    expect(json.content).toHaveLength(doc.content.length);
    const heading = json.content!.find((b) => b.type === 'heading');
    expect(heading?.attrs?.cue).toBe('¿Qué estudia la Psicobiología y qué órgano produce la conducta?');
    const box = json.content!.find((b) => b.attrs?.kind === 'fromNotes');
    expect(box?.attrs).toMatchObject({ noteIds: 'h1', ms: 45_000, origin: 'student' });
  });

  it('first, under the page’s title: the notes check line, then Key takeaways (desktop-03)', () => {
    expect(doc.content.slice(0, 2).map((b) => b.attrs?.kind)).toEqual(['notesCheck', 'takeaways']);
    const check = doc.content[0];
    expect(textOf(check)).toBe('6 of 6 lines and 6 of 6 marks used · shown in green as “From your notes” · See them in My notes');
    const link = check.content![0].content!.at(-1)!;
    expect(link.marks).toEqual([{ type: 'link', attrs: { href: 'studiply:tab/notes' } }]);
    const takeaways = doc.content[1].content![0];
    expect(takeaways.type).toBe('bulletList');
    expect(takeaways.content).toHaveLength(4);
    expect(takeaways.content![0].content![0].content![1]).toEqual({ type: 'text', text: 'Psicobiología', marks: [{ type: 'bold' }] });
  });

  it('each section: "n · heading", its ▶ time and HER marks as chips (not linked to the marks table; no chip for an implicit signal)', () => {
    const headings = doc.content.filter((b) => b.type === 'heading' && /^s\d+$/.test(String(b.attrs?.blockId).split('-')[1])) as N[];
    expect(headings.map((h) => h.content![0].text)).toEqual(['1 · Qué es la Psicobiología', '2 · Las cinco preguntas', '3 · Filogenia, ontogenia, heredabilidad y selección natural']);
    const first = headings[0].content!;
    expect(first.find((n) => n.type === 'timestampChip')?.attrs).toEqual({ ms: 0 });
    // The section's two repetitions (Important 6/10, "explained 3+ times") shaped it but aren't her marks.
    expect(first.filter((n) => n.type === 'markChip').map((n) => n.attrs)).toEqual([
      { kind: 'important', level: 3 },
      { kind: 'exam', level: 2 },
    ]);
    expect(headings[1].content!.find((n) => n.type === 'timestampChip')?.attrs).toEqual({ ms: 600_000 });
  });

  it('From your notes: one box per line (its own time), a list’s lines together, her formatting kept, `student`', () => {
    const boxes = ofKind(doc, 'fromNotes');
    expect(boxes.map((b) => [b.attrs?.noteIds, b.attrs?.ms])).toEqual([
      ['h1', 45_000],
      ['p1', 130_000],
      ['l1#0,l1#1', 660_000],
      ['p2', 1_440_000],
      ['p3', null],
    ]);
    expect(boxes.every((b) => b.attrs?.origin === 'student' && b.attrs?.editedAt === null)).toBe(true);
    expect(boxes[0].content![0]).toEqual({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Psicobiología: definición' }] });
    expect(boxes[1].content![0].content![0]).toEqual({ type: 'text', text: 'Conducta', marks: [{ type: 'bold' }] });
    const list = boxes[2].content![0];
    expect(list.type).toBe('bulletList');
    expect(list.content!.map((li) => textOf(li))).toEqual(['estructuras', 'procesos y regulación']);
    expect(boxes[3].content![0].content![1]).toEqual({ type: 'inlineMath', attrs: { latex: 'h^2 = V_G / V_P' } });
  });

  it('You were confused here: its level and time, the steps as a list, "Example:"', () => {
    const [mid, high] = ofKind(doc, 'confused');
    expect(mid.attrs).toMatchObject({ level: 5, ms: 1_230_000 });
    expect(mid.content).toHaveLength(1);
    expect(high.attrs).toMatchObject({ level: 9, ms: 1_450_000 });
    expect(high.content!.map((n) => n.type)).toEqual(['paragraph', 'orderedList', 'paragraph']);
    expect(high.content![2].content![0]).toEqual({ type: 'text', text: 'Example: ', marks: [{ type: 'bold' }] });
  });

  it('the formula card, the concept map as a list, the board photo (`media`), the exam signals', () => {
    const card = doc.content.find((b) => b.type === 'formulaCard')!;
    expect(card.attrs?.title).toBe('Formula');
    expect(card.content![0]).toEqual({ type: 'blockMath', attrs: { latex: 'h^2 = V_G / V_P' } });
    expect(card.content![1].content![0]).toEqual({ type: 'inlineMath', attrs: { latex: 'h^2' } });
    expect(textOf(card.content![2])).toBe('When to use: Estimar qué parte de la variación es genética.');
    const map = doc.content.find((b) => b.type === 'bulletList' && textOf(b).includes('Conducta → Estructuras (1)'));
    expect(map?.content).toHaveLength(5);
    const photo = doc.content.find((b) => b.type === 'image')!;
    expect(photo.attrs).toMatchObject({ src: 'media:photo-board', origin: 'media' });
    const signals = find(doc, 'exam');
    expect(signals.attrs?.kind).toBe('exam');
    expect(signals.content![0].content).toHaveLength(3);
    expect(signals.content![0].content![1].content![0].content!.find((n) => n.type === 'markChip')?.attrs).toEqual({ kind: 'exam', level: 9 });
  });

  it('Your questions during class (the Full answer link), the self-test with each answer hidden, the flashcards line, glossary, logistics, unclear', () => {
    expect(textOf(find(doc, 'questions'))).toBe('Your questions during class');
    const q = find(doc, 'questions-list').content![0].content![0].content!;
    expect(q[0]).toEqual({ type: 'timestampChip', attrs: { ms: 1_680_000 } });
    expect(q.find((n) => n.text === 'Full answer')?.marks).toEqual([{ type: 'link', attrs: { href: 'studiply:assistant/msg-q1' } }]);
    expect(textOf(find(doc, 'selftest'))).toBe('Self-test');
    expect(textOf(find(doc, 'q0'))).toBe('1. Enumera las cinco preguntas de la Psicobiología.');
    expect(ofKind(doc, 'answer')).toHaveLength(7);
    expect(textOf(find(doc, 'q4-answer'))).toBe('0,25.');
    expect(textOf(find(doc, 'cards'))).toBe('2 flashcards saved for review');
    expect(find(doc, 'glossary-list').content).toHaveLength(4);
    expect(find(doc, 'logistics-list').content).toHaveLength(1);
    expect(find(doc, 'unclear-list').content![0].content![0].content![0]).toEqual({ type: 'timestampChip', attrs: { ms: 1_410_000 } });
  });

  it('origins and ids: `ai` but her notes and the photo; every id the summary’s own; the same summary, the same document', () => {
    const origins = new Set(doc.content.map((b) => `${b.type}:${b.attrs?.origin}`));
    expect([...origins].filter((o) => !o.endsWith(':ai')).sort()).toEqual(['callout:student', 'image:media']);
    expect(doc.content.every((b) => String(b.attrs?.blockId).startsWith(`${summaryKey(ID)}-`) && b.attrs?.editedAt === null)).toBe(true);
    expect(new Set(doc.content.map((b) => b.attrs?.blockId)).size).toBe(doc.content.length);
    expect(summaryToDoc({ summary: S30, summaryId: ID, questionLinks: ['msg-q1'] })).toEqual(doc);
    expect(hasSummary(doc, ID)).toBe(true);
    expect(hasSummary(doc, ID2)).toBe(false);
    expect(holdsSummary(doc)).toBe(true);
    expect(holdsSummary({ content: [{ type: 'paragraph' }] })).toBe(false);
  });

  it('the app’s own words are English (the app’s UI); Claude’s text stays in the lecture’s language', () => {
    expect(textOf(find(doc, 's0-b0'))).toMatch(/^La Psicobiología estudia/);
    expect(textOf(find(doc, 'glossary'))).toBe('Glossary');
    expect(textOf(find(doc, 'unclear'))).toBe('Unclear in the recording');
  });
});

describe('the 90-min synthetic lecture’s summary', () => {
  const doc = summaryToDoc({ summary: S90, summaryId: ID });

  it('valid for the editor; 6 sections; every note line in a box; chips only for her 10 marks (not the assistant questions’ or repetitions’)', () => {
    loaded(doc);
    const headings = doc.content.filter((b) => b.type === 'heading' && /-s\d+$/.test(String(b.attrs?.blockId)));
    expect(headings).toHaveLength(6);
    const chips = headings.flatMap((h) => (h.content ?? []).filter((n) => n.type === 'markChip').map((n) => `${n.attrs?.kind} ${n.attrs?.level}`));
    expect(chips.sort()).toEqual(['confused 5', 'confused 8', 'confused 9', 'exam 2', 'exam 8', 'exam 9', 'exam 9', 'important 3', 'important 5', 'important 8']);
    expect(ofKind(doc, 'fromNotes').flatMap((b) => String(b.attrs?.noteIds).split(','))).toHaveLength(15);
  });

  it('its text modules: comparison, key figures and vocabulary tables with a header row, process steps, a case card; a time range’s start', () => {
    const modules = doc.content.filter((b) => b.type === 'studyModule') as N[];
    const count = (kind: string) => modules.filter((m) => m.attrs?.kind === kind).length;
    expect({ comparison: count('comparison'), keyFigures: count('keyFigures'), vocabulary: count('vocabulary'), process: count('process'), caseCard: count('caseCard') }).toEqual({ comparison: 4, keyFigures: 3, vocabulary: 2, process: 2, caseCard: 1 });
    // One block each, the stored block's place as its id, written by the AI.
    expect(modules.every((m) => /^sm[0-9a-z]{8}-s\d+-b\d+$/.test(String(m.attrs?.blockId)) && m.attrs?.origin === 'ai')).toBe(true);
    const comparison = modules.find((m) => m.attrs?.kind === 'comparison')!.content![0];
    expect(comparison.type).toBe('table');
    expect(comparison.content![0].content!.map((c) => c.type)).toEqual(['tableHeader', 'tableHeader', 'tableHeader']);
    expect(comparison.content![0].content!.map((c) => textOf(c))).toEqual(['', 'SNC', 'SNP']);
    expect(comparison.content![1].content![0].content![0].content![0].marks).toEqual([{ type: 'bold' }]);
    const vocabulary = modules.find((m) => m.attrs?.kind === 'vocabulary' && textOf(m).includes('Glutamato'))!.content![0];
    expect(vocabulary.content![0].content!.map((c) => textOf(c))).toEqual(['Term', 'Meaning', 'Example']);
    expect(vocabulary.content).toHaveLength(8);
    const figures = modules.find((m) => m.attrs?.kind === 'keyFigures')!.content![0];
    expect(figures.content![0].content!.map((c) => textOf(c))).toEqual(['Person', 'Role', 'What they did', 'Why it matters']);
    const process = modules.find((m) => m.attrs?.kind === 'process' && textOf(m).startsWith('Dendritas'))!.content![0];
    expect(process.type).toBe('orderedList');
    expect(process.content![0].content!.map(textOf)).toEqual(['Dendritas', 'In: Señales de otras neuronas → Out: Señal hacia el soma']);
    const assistantConfused = ofKind(doc, 'confused').find((b) => b.attrs?.level === 6)!;
    expect(assistantConfused.attrs?.ms).toBe(1_800_000);
  });
});

describe('every block type (the example)', () => {
  const m = lectureMaterial();
  const plan = planFor(m, { sliders: SLIDER_DEFAULTS, resources: { slides: true, photos: true, assistant: true } } as SummaryRequest, parseClassify(JSON.stringify({ subjectType: 'science', modules: [], topics: [], professorExamPhrases: [], repeatedConcepts: [] }))!);
  const parsed = parseSummary(JSON.stringify(packedSummary()), m, plan, ['notes', 'audio']);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  const doc = summaryToDoc({ summary: parsed.summary, summaryId: ID });

  it('a valid document', () => {
    loaded(doc);
  });

  it('the function plot, the model graph and the data chart are graph blocks of their own kind', () => {
    const graphs = doc.content.filter((b) => b.type === 'graph');
    expect(graphs.map((b) => b.attrs?.kind)).toEqual(['function', 'model', 'bar']);
    expect(graphs[0].attrs).toMatchObject({ title: 't', func: { expression: 'x^2 - 4', xRange: [-5, 5], marks: ['roots'] } });
    expect(graphs[1].attrs).toMatchObject({ title: 't', model: { template: 'supplyDemand', shifts: [{ curve: 'D', direction: 'right' }] } });
    expect(graphs[2].attrs).toMatchObject({ kind: 'bar', series: ['s'], rows: [['a', '1']] });
    // All Claude's (`ai`); no placeholder paragraph left.
    expect(graphs.map((b) => b.attrs?.origin)).toEqual(['ai', 'ai', 'ai']);
    expect(doc.content.some((b) => b.type === 'paragraph' && textOf(b).includes('drawn in a later update'))).toBe(false);
  });

  it('the twelve text modules, each one block, in the stored order', () => {
    const modules = doc.content.filter((b) => b.type === 'studyModule') as N[];
    expect(modules.map((m) => m.attrs?.kind)).toEqual(['workedExample', 'timeline', 'causeEffect', 'keyFigures', 'comparison', 'process', 'framework', 'theoryCard', 'caseCard', 'argument', 'code', 'vocabulary']);
    const of = (kind: string) => modules.find((m) => m.attrs?.kind === kind)!;
    const parts = (kind: string) => of(kind).content!.map((c) => c.type);
    // A worked example: its problem, its steps (each "do", then "why"), its answer.
    expect(parts('workedExample')).toEqual(['paragraph', 'orderedList', 'paragraph']);
    expect(of('workedExample').content!.map(textOf)).toEqual(['Problem: p', 'ab', 'Answer: c']);
    expect(of('workedExample').content![1].content![0].content!.map(textOf)).toEqual(['a', 'b']);
    // A timeline: an event per item: "date · title", the detail, its importance (italic, no longer lost).
    expect(of('timeline').content![0].content![0].content!.map(textOf)).toEqual(['1900 · t', 'd', 'i']);
    expect(parts('causeEffect')).toEqual(['bulletList', 'paragraph', 'bulletList']);
    expect(of('causeEffect').content!.map(textOf)).toEqual(['c', 'e', 'f']);
    expect(of('framework').attrs?.title).toBe('SWOT');
    expect(of('framework').content![0].content![0].content![0].content!.map(textOf)).toEqual(['S', 'c']);
    expect(of('theoryCard').content!.map(textOf)).toEqual(['Tinbergen (1963)', 'Claim: c', 'Method: m', 'Finding: f', 'Critique: k']);
    expect(of('caseCard').content!.map(textOf)).toEqual(['Facts: f', 'Question: q', 'Decision: d', 'Reasoning: r', 'Lesson: l']);
    expect(of('argument').content!.map(textOf)).toEqual(['c', 'Supporting premises', 'p', 'Objections', 'oReply: r']);
    // Code: its lines in the code mark, the language in the label; no output, no Output line.
    expect(of('code').attrs?.title).toBe('c');
    expect(of('code').content!.map((c) => [textOf(c), c.content?.[0]?.marks])).toEqual([['int x;', [{ type: 'code' }]]]);
    expect(of('vocabulary').content![0].content![1].content!.map(textOf)).toEqual(['t', 'm', 'e']);
  });
});

describe('Claude’s inline markup', () => {
  it('**bold** and $formulas$; nothing else', () => {
    expect(inline('La **conducta** y $E = mc^2$ y *no*')).toEqual([
      { type: 'text', text: 'La ' },
      { type: 'text', text: 'conducta', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' y ' },
      { type: 'inlineMath', attrs: { latex: 'E = mc^2' } },
      { type: 'text', text: ' y *no*' },
    ]);
  });
});

describe('written again: her edits stay', () => {
  const first = summaryToDoc({ summary: S30, summaryId: ID });
  /** The second summary: the same lecture, other words. */
  const second = (() => {
    const s = JSON.parse(JSON.stringify(S30)) as { sections: { blocks: { type: string; text?: string }[] }[] };
    s.sections.forEach((sec, i) => sec.blocks.forEach((b) => b.type === 'paragraph' && (b.text = `Nuevo texto de la sección ${i + 1}.`)));
    return summaryToDoc({ summary: s as unknown as StoredSummary, summaryId: ID2 });
  })();
  const edited = (doc: SummaryDocJSON, path: string, text: string) => {
    const i = doc.content.findIndex((b) => b.attrs?.blockId === `${summaryKey(ID)}-${path}`);
    doc.content[i] = { ...doc.content[i], attrs: { ...doc.content[i].attrs, origin: 'student', editedAt: 1_000 }, content: [{ type: 'text', text }] };
    return doc.content[i];
  };

  it('her two edited paragraphs, in their sections; the untouched blocks give way to the new summary’s', () => {
    const current = JSON.parse(JSON.stringify(first)) as SummaryDocJSON;
    const a = edited(current, 's0-b0', 'Mi versión de la sección 1.');
    const b = edited(current, 's2-b0', 'Mi versión de la sección 3.');
    const merged = mergeRegenerated(current, second);
    const ids = merged.content.map((x) => String(x.attrs?.blockId));
    // The earlier summary's untouched blocks are gone; the new one's are all there.
    expect(ids.filter((id) => id.startsWith(summaryKey(ID)))).toEqual([a.attrs!.blockId, b.attrs!.blockId]);
    expect(second.content.every((x) => ids.includes(String(x.attrs?.blockId)))).toBe(true);
    // Each at the end of its section: before the next section's heading.
    const at = (id: unknown) => ids.indexOf(String(id));
    expect(at(a.attrs!.blockId)).toBe(at(`${summaryKey(ID2)}-s1`) - 1);
    expect(at(b.attrs!.blockId)).toBe(at(`${summaryKey(ID2)}-exam`) - 1);
    expect(merged.content.find((x) => x.attrs?.blockId === a.attrs!.blockId)).toEqual(a);
    loaded(merged);
  });

  it('a block she added stays where she put it; one in a section the new summary doesn’t have goes to the one before', () => {
    const current = JSON.parse(JSON.stringify(first)) as SummaryDocJSON;
    const mine = { type: 'paragraph', attrs: { blockId: 'b-mine', origin: 'student', editedAt: 5 }, content: [{ type: 'text', text: 'Mi apunte' }] };
    const s2 = current.content.findIndex((x) => x.attrs?.blockId === `${summaryKey(ID)}-s2`);
    current.content.splice(s2 + 1, 0, mine);
    // The new summary without its third section.
    const fewer = { ...second, content: second.content.filter((x) => !/-s2(-|$)/.test(String(x.attrs?.blockId))) };
    const merged = mergeRegenerated(current, fewer);
    const ids = merged.content.map((x) => String(x.attrs?.blockId));
    expect(ids.indexOf('b-mine')).toBe(ids.indexOf(`${summaryKey(ID2)}-exam`) - 1);
    expect(isTouched(mine)).toBe(true);
  });

  it('a From your notes box she edited keeps its lines: the new summary’s box for them is left out (no line twice, none lost)', () => {
    const current = JSON.parse(JSON.stringify(first)) as SummaryDocJSON;
    const i = current.content.findIndex((x) => x.attrs?.noteIds === 'p1');
    current.content[i] = { ...current.content[i], attrs: { ...current.content[i].attrs, editedAt: 7 } };
    const merged = mergeRegenerated(current, second);
    const boxes = merged.content.filter((x) => x.attrs?.kind === 'fromNotes');
    expect(boxes.filter((x) => x.attrs?.noteIds === 'p1')).toHaveLength(1);
    expect(boxes.find((x) => x.attrs?.noteIds === 'p1')?.attrs?.blockId).toBe(current.content[i].attrs?.blockId);
    expect(boxes.flatMap((x) => String(x.attrs?.noteIds).split(',')).sort()).toEqual(['h1', 'l1#0', 'l1#1', 'p1', 'p2', 'p3']);
  });

  it('nothing edited: exactly the new summary', () => {
    expect(mergeRegenerated(first, second)).toEqual(second);
  });

  it('an empty tab is one a summary may be written into', () => {
    expect(isEmptyDoc(null)).toBe(true);
    expect(isEmptyDoc({ content: [{ type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: '  ' }] }] })).toBe(true);
    expect(isEmptyDoc({ content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mis cosas' }] }] })).toBe(false);
  });
});

describe('each question’s Full answer: her message', () => {
  const s = { questionsDuringClass: [{ t: '28:00', question: 'Explícame los últimos 10 minutos' }, { t: '35:00', question: 'Otra cosa' }, { t: '50:00', question: '¿Y esto?' }] } as unknown as StoredSummary;
  it('the same words (accents and case aside), else the closest in time within 2 minutes, each once', () => {
    const messages = [
      { id: 'm1', question: 'explicame los ultimos 10 minutos', askedAtMs: 1_000 },
      { id: 'm2', question: '¿Qué significa?', askedAtMs: 35 * 60_000 + 90_000 },
      { id: 'm3', question: 'Lejos', askedAtMs: 40 * 60_000 },
    ];
    expect(questionLinks(s, messages)).toEqual(['m1', 'm2', null]);
  });
});

describe('where a finished summary goes', () => {
  const done = (over: Partial<DoneSummary> = {}): DoneSummary => ({ id: ID, result: S30, target: null, courseId: 'c1', ...over });
  /** The 30-min summary's cards: its flashcards, key terms and self-test, each once. */
  const CARDS = summaryCards(S30).length;
  function fake(tabs: Record<string, SummaryDocJSON | null>, d: DoneSummary | null = done(), { cards = false } = {}) {
    const calls: string[] = [];
    const docs = { ...tabs };
    const deps: PlaceDeps = {
      latestDone: async () => d,
      readTab: async (_l, tab) => docs[tab] ?? null,
      summaryTabs: async () => Object.keys(docs).filter((t) => t.startsWith('t-')).map((tab) => ({ tab, title: 'New summary' })),
      addSummaryTab: async () => {
        calls.push('addTab');
        docs['t-new'] = { type: 'doc', content: [{ type: 'paragraph' }] };
        return 't-new';
      },
      save: async (_l, tab, _base, next) => {
        calls.push(`save:${tab}`);
        docs[tab] = next as SummaryDocJSON;
      },
      version: async (_l, tab, _doc, name) => {
        calls.push(`version:${tab}${name ? `:${name}` : ''}`);
      },
      questions: async () => [{ id: 'msg-q1', question: 'Explícame los últimos 10 minutos', askedAtMs: 28 * 60_000 }],
      // The lecture's cards saved already (all of this summary's, when `cards`).
      cardFronts: async () => (cards && d ? summaryCards(d.result).map((c) => c.front) : []),
      saveCards: async (list, from) => {
        calls.push(`cards:${list.length}:${from.summaryId}:${from.courseId}`);
      },
    };
    return { deps, calls, docs };
  }

  it('the Summary tab when it has nothing yet: written, a version, its flashcards; then never again', async () => {
    const t = fake({ summary: null });
    expect(await placeSummary('lec', t.deps)).toEqual({ tab: 'summary', written: true, summaryId: ID });
    // Its flashcards with its key terms and self-test, each once.
    expect(t.calls).toEqual([`cards:${CARDS}:${ID}:c1`, 'save:summary', 'version:summary']);
    expect(hasSummary(t.docs.summary, ID)).toBe(true);
    expect(JSON.stringify(t.docs.summary)).toContain('studiply:assistant/msg-q1');
    const again = fake({ summary: t.docs.summary }, done(), { cards: true });
    expect(await placeSummary('lec', again.deps)).toEqual({ tab: 'summary', written: false, summaryId: ID });
    expect(again.calls).toEqual([]);
  });

  it('the Summary tab holding something (an earlier summary, her own text): a new "New summary" tab; the Summary tab untouched', async () => {
    const earlier = summaryToDoc({ summary: S30, summaryId: ID2 });
    const t = fake({ summary: earlier });
    expect(await placeSummary('lec', t.deps)).toEqual({ tab: 't-new', written: true, summaryId: ID });
    expect(t.calls).toEqual([`cards:${CARDS}:${ID}:c1`, 'addTab', 'save:t-new', 'version:t-new']);
    expect(t.docs.summary).toBe(earlier);
  });

  it('“Update the Summary tab” chosen: a version before, merged around her edits, a version after', async () => {
    const earlier = summaryToDoc({ summary: S30, summaryId: ID2 });
    earlier.content[3] = { ...earlier.content[3], attrs: { ...earlier.content[3].attrs, editedAt: 9 } };
    const t = fake({ summary: earlier }, done({ target: 'summary' }), { cards: true });
    expect(await placeSummary('lec', t.deps)).toMatchObject({ tab: 'summary', written: true });
    expect(t.calls).toEqual(['version:summary:Before the summary was written again', 'save:summary', 'version:summary']);
    expect(t.docs.summary!.content.some((b) => b.attrs?.blockId === earlier.content[3].attrs?.blockId)).toBe(true);
    expect(hasSummary(t.docs.summary, ID)).toBe(true);
  });

  it('already in a summary tab: nothing; no finished summary: nothing; flashcards that can’t be saved don’t stop it', async () => {
    const there = fake({ summary: summaryToDoc({ summary: S30, summaryId: ID2 }), 't-1': summaryToDoc({ summary: S30, summaryId: ID }) }, done(), { cards: true });
    expect(await placeSummary('lec', there.deps)).toEqual({ tab: 't-1', written: false, summaryId: ID });
    expect(await placeSummary('lec', fake({ summary: null }, null).deps)).toBeNull();
    const offline = fake({ summary: null });
    offline.deps.cardFronts = async () => {
      throw new Error('offline');
    };
    expect(await placeSummary('lec', offline.deps)).toMatchObject({ written: true });
  });
});
