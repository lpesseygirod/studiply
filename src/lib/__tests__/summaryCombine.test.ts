/**
 * @jest-environment jsdom
 */
// Step 7.9: Extend with next lecture, Merge lectures and Exam pack.
// - The Extend request (the approved plan, fixed after the first paid run): the lecture added goes
//   through the generate call with the existing summary in its prompt. Built here from the saved
//   fixtures (Tema 1's committed summary, the synthetic Tema 2 lecture): every anchor and all of Tema 2's
//   material are in ONE call, with the planted cases (the definition said again, the exam statement
//   about Tema 1's five questions, the Darwin / Wallace correction); its size per tag is printed.
// - The pipeline in Extend mode (Claude faked): the two lists read, the row not saved as the lecture's
//   summary, no length rewrites.
// - The engine (summary-combine.ts): alreadyCovered → Studiply comments, corrections → Updates, code's
//   no-repeats check and de-duplication; the run for a Unit summary, "Add to this summary", an exam pack.
// - The app's documents (lib/summaryCombine.ts), valid for both editors: anchors match, her text never
//   changes, the Unit summary's notes line counts every lecture, the exam pack claims no notes.
import { Editor, type JSONContent } from '@tiptap/core';

import { studiplyExtensions } from '../../editor/bridges';
import { calloutLabel } from '../../editor/schema/callout';
import { listComments } from '../../editor/schema/comments';
import { applyExtend, combineRequestOf, existingOf, runCombine, similarity, type CombineDeps, type CombineOutcome } from '../../../supabase/functions/_shared/summary-combine';
import { EXISTING_SUMMARY_MAX_WORDS, existingSummaryText, summaryAnchors, takeExtendLists, type ExtendLists } from '../../../supabase/functions/_shared/summary-extend';
import { FixtureShape, fixtureInput } from '../../../supabase/functions/_shared/summary-fixture';
import { runSummary, type ClaudeMessage, type StoredSummary, type SummaryRunDeps } from '../../../supabase/functions/_shared/summary-pipeline';
import { TEMA2_PLANTED, syntheticTema2Fixture } from '../../../scripts/fixtures/synthetic-tema2-lecture.ts';
import { addToDoc, anchorsOf, examPackDoc, quoteRange, unitAnchors, unitDoc, type CombinedResult, type ExamPackResult } from '../summaryCombine';
import { isTouched, mergeRegenerated, summaryKey, summaryToDoc, type SummaryDocJSON } from '../summaryDoc';
import { packedSummary } from '../../test-utils/summaryFixtures';
import short from '../../test-utils/summary-synthetic-30.json';

type N = JSONContent;
const S1 = short.result as unknown as StoredSummary;
const REQ = '5a1d0c3e-7b2f-4e8a-9c41-0d2e6f8a1b37';
const L1 = 'lecture-1';
const L2 = 'lecture-2';
const textOf = (n: N): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('');

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});
/** The document as the editor loads it (the real schema of both editors): throws when it isn't valid. */
function loaded(doc: SummaryDocJSON): Editor {
  editor = new Editor({ extensions: studiplyExtensions(), content: doc });
  editor.state.doc.check();
  return editor;
}

const answer = (value: unknown, stop: string | null = 'end_turn'): ClaudeMessage => ({ model: 'claude-opus-5-5', stop_reason: stop, content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });
const call = (m: ClaudeMessage) => ({ finalMessage: async () => m, currentMessage: undefined }) as unknown as ReturnType<SummaryRunDeps['claude']>;

// The anchors the app sends: a new Unit summary's (Tema 1's section blocks under the request's ids).
const anchors = unitAnchors(S1, REQ);
const target = anchors.find((a) => /-s\d+-b\d+$/.test(a.id) && a.text.split(' ').length > 8)!;
const quote = target.text.split(' ').slice(1, 4).join(' ');
const tema2 = fixtureInput(FixtureShape.parse(syntheticTema2Fixture()), L2);

// ---------- the Extend request (what Claude sees) ----------

describe('the Extend request: Tema 1’s summary and Tema 2’s material in ONE generate call (the plan)', () => {
  /** Runs the pipeline in Extend mode with Claude faked; every call as sent. */
  async function sent(extendAnchors = anchors) {
    const calls: { call: string; system: string; user: string; schema: Record<string, unknown> }[] = [];
    const deps: SummaryRunDeps = {
      summaryId: REQ,
      lectureId: L2,
      request: tema2.request,
      material: async () => tema2.material,
      media: async () => ({ blocks: [], photos: 0, pdfs: 0 }),
      claude: (kind, system, content, schema) => {
        calls.push({ call: kind, system, user: content.map((c) => String((c as { text?: string }).text ?? '')).join('\n'), schema });
        return call(answer('{}'));
      },
      logCost: async () => ({ costUsd: 0, tokensInput: 0, tokensOutput: 0 }),
      save: async () => {},
      log: () => {},
      failure: () => ({}),
      extend: { anchors: extendAnchors, lecture: { number: 2, title: 'Tema 2' } },
    };
    await runSummary(deps);
    return calls;
  }
  const tag = (user: string, name: string) => {
    const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(user);
    return m ? m[1] : '';
  };

  it('the generate call holds every anchor (whole) and Tema 2’s transcript, notes and marks; its size per tag', async () => {
    const generate = (await sent()).find((c) => c.call === 'generate')!;
    expect(generate).toBeDefined();
    const existing = tag(generate.user, 'existing-summary');
    for (const a of anchors) expect(existing).toContain(`${a.id} | `);
    // Each block whole (the first run cut them at 60 words and sent none of Tema 2's material).
    const longest = anchors.reduce((x, y) => (y.text.length > x.text.length ? y : x));
    expect(existing).toContain(longest.text.slice(-40));
    const sizes = ['existing-summary', 'transcript', 'notes', 'marks', 'professor-exam-phrases'].map((t) => {
      const body = tag(generate.user, t);
      return { tag: t, chars: body.length, words: body.split(/\s+/).filter(Boolean).length, tokensAbout: Math.round(body.length / 4) };
    });
    const total = { system: generate.system.length, user: generate.user.length, tokensAbout: Math.round((generate.system.length + generate.user.length) / 4) };
    console.log(`The Extend generate request (Tema 1 → Tema 2):\n${sizes.map((s) => `  <${s.tag}>: ${s.words} words, ${s.chars} chars, ≈ ${s.tokensAbout} tokens`).join('\n')}\n  system ${total.system} chars + user ${total.user} chars ≈ ${total.tokensAbout} tokens`);
    // Nothing cut: every anchor's words whole, every one of Tema 2's 40 transcript segments.
    for (const a of anchors) expect(existing).toContain(a.text.replace(/\s+/g, ' '));
    for (const s of tema2.material.segments) expect(tag(generate.user, 'transcript')).toContain(s.text);
  });

  it('the planted cases are in its input: Tema 2 says them, Tema 1’s summary has what they are about', async () => {
    const generate = (await sent()).find((c) => c.call === 'generate')!;
    const transcript = tag(generate.user, 'transcript');
    const existing = tag(generate.user, 'existing-summary');
    // In the same call: what Tema 2 says…
    expect(transcript).toContain(TEMA2_PLANTED.repeated);
    expect(transcript).toContain(TEMA2_PLANTED.examOnTema1);
    expect(transcript).toContain(TEMA2_PLANTED.correction);
    expect(tag(generate.user, 'notes')).toContain('Darwin Y Wallace (1858)');
    // …and the Tema 1 blocks they are about.
    expect(existing).toMatch(/conducta es todo lo que hace un organismo/);
    expect(existing).toMatch(/cinco preguntas/i);
    expect(existing).toMatch(/selección natural/i);
  });

  it('the rules and the schema ask for alreadyCovered and corrections', async () => {
    const generate = (await sent()).find((c) => c.call === 'generate')!;
    expect(generate.system).toContain('NOTHING may be repeated');
    expect(generate.system).toContain('alreadyCovered');
    expect(generate.system).toContain('corrections');
    // One string field holding their JSON (the grammar limit), described in the rules.
    const props = generate.schema.properties as Record<string, unknown>;
    expect(props.extend).toEqual({ type: 'string' });
    expect(generate.schema.required).toEqual(expect.arrayContaining(['sections', 'extend']));
    expect(generate.system).toContain('{"alreadyCovered":[…],"corrections":[…]}');
  });

  it('a long unit stays within the cap: blocks over it are left out, counted', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `a${i}`, label: 's', text: 'palabra '.repeat(100).trim() }));
    const out = existingSummaryText(many);
    expect(out.words).toBeLessThanOrEqual(EXISTING_SUMMARY_MAX_WORDS);
    expect(out.blocks + out.left).toBe(200);
    expect(out.left).toBeGreaterThan(0);
  });

  it('the eval’s anchors (summaryAnchors, by place) carry the same words as the app’s', () => {
    const byPlace = summaryAnchors(S1);
    expect(byPlace.some((a) => /todo lo que hace un organismo/.test(a.text))).toBe(true);
    expect(byPlace.find((a) => a.id === 'exam')?.text).toMatch(/cinco preguntas/i);
  });
});

// ---------- the pipeline in Extend mode ----------

describe('the pipeline in Extend mode (Claude faked)', () => {
  const LISTS: ExtendLists = {
    alreadyCovered: [{ anchor: target.id, quote, note: 'la profesora dijo que esto entra en el examen', t: '7:00' }],
    corrections: [{ anchor: target.id, said: 'La selección natural la propusieron a la vez Darwin y Wallace (1858).', t: '11:00' }],
  };
  const deps = (generateAnswer: ClaudeMessage, saved: Record<string, unknown>[], calls: string[]): SummaryRunDeps => ({
    summaryId: REQ,
    lectureId: L2,
    request: tema2.request,
    material: async () => tema2.material,
    media: async () => ({ blocks: [], photos: 0, pdfs: 0 }),
    claude: (kind) => {
      calls.push(kind);
      return call(kind === 'generate' ? generateAnswer : answer('{}'));
    },
    logCost: async () => ({ costUsd: 0, tokensInput: 0, tokensOutput: 0 }),
    save: async (p) => void saved.push(p),
    log: () => {},
    failure: () => ({}),
    extend: { anchors, lecture: { number: 2, title: 'Tema 2' } },
  });

  it('the answer’s two lists come back with the summary; the row is not saved as the lecture’s summary', async () => {
    const saved: Record<string, unknown>[] = [];
    const out = await runSummary(deps(answer({ ...packedSummary(), extend: JSON.stringify(LISTS) }), saved, []));
    expect(out.status).toBe('done');
    if (out.status !== 'done') return;
    expect(out.extend).toEqual(LISTS);
    expect(saved.some((p) => p.status === 'done')).toBe(false);
  });

  it('an answer without the lists is unreadable: asked once more, then failed', async () => {
    const calls: string[] = [];
    const out = await runSummary(deps(answer(packedSummary()), [], calls));
    expect(out).toEqual({ status: 'failed', error: 'unreadable' });
    expect(calls.filter((c) => c === 'generate')).toHaveLength(2);
  });

  it('takeExtendLists: the lists from the `extend` string; the rest is the usual answer', () => {
    const taken = takeExtendLists(JSON.stringify({ title: 't', extend: JSON.stringify(LISTS) }));
    expect(taken?.lists).toEqual(LISTS);
    expect(JSON.parse(taken!.rest)).toEqual({ title: 't' });
    expect(takeExtendLists('nope')).toBeNull();
    // Not a string, not JSON, or not the two lists: unreadable.
    expect(takeExtendLists(JSON.stringify({ title: 't', extend: LISTS }))).toBeNull();
    expect(takeExtendLists(JSON.stringify({ title: 't', extend: '{oops' }))).toBeNull();
    expect(takeExtendLists(JSON.stringify({ title: 't', extend: JSON.stringify({ alreadyCovered: [{ anchor: 1 }], corrections: [] }) }))).toBeNull();
  });
});

// ---------- the engine ----------

/** The lecture added as written against Tema 1: new material only, her notes, one block Claude missed. */
function tema2Written(): StoredSummary {
  const notesBlock = (S1.sections as { blocks: { type: string }[] }[]).flatMap((s) => s.blocks).find((b) => b.type === 'fromNotes')!;
  return {
    ...S1,
    header: { ...S1.header, title: 'La neurona', number: 2, durationMin: 20 },
    coverage: { noteLines: 5, noteLinesUsed: 5, marks: 3, marksUsed: 3 },
    sections: [
      {
        heading: 'La sinapsis',
        timestamp: '2:00',
        cueQuestion: '¿Qué es la sinapsis?',
        markChips: [],
        blocks: [
          { type: 'paragraph', text: 'La sinapsis es la unión funcional entre dos neuronas que transmite el impulso nervioso.', keyTerms: [] },
          notesBlock,
          // Says the same as Tema 1's block (Claude should have left it out): the no-repeats check.
          { type: 'paragraph', text: target.text, keyTerms: [] },
        ],
      },
    ],
    glossary: [...((S1.glossary ?? []) as object[]).slice(0, 1), { term: 'Sinapsis', definition: 'Unión funcional entre dos neuronas.' }],
    selfTest: [...((S1.selfTest ?? []) as object[]).slice(0, 1), { question: '¿Qué es la sinapsis y para qué sirve?', kind: 'recall', answer: 'La unión entre neuronas.', fromMarkId: '' }],
    flashcards: [...((S1.flashcards ?? []) as object[]).slice(0, 1), { front: 'Sinapsis', back: 'Unión funcional entre dos neuronas.' }],
  };
}
const LISTS2: ExtendLists = {
  alreadyCovered: [
    { anchor: target.id, quote, note: 'la profesora dijo que esto entra en el examen', t: '7:00' },
    { anchor: 'not-an-anchor', quote: '', note: 'x', t: '9:00' },
  ],
  corrections: [
    { anchor: target.id, said: 'En realidad la propusieron a la vez Darwin y Wallace.', t: '11:00' },
    { anchor: 'unknown', said: 'Otra corrección.', t: '12:00' },
  ],
};

describe('what is added (applyExtend)', () => {
  const { addition, noRepeats } = applyExtend({ lectureId: L2, summaryId: `${REQ}:1`, number: 2, title: 'La neurona', summary: tema2Written() }, LISTS2, anchors, existingOf(S1));

  it('the new blocks and her notes are added; alreadyCovered → a Studiply comment with the lecture and time', () => {
    expect(addition.keep).toEqual(['s0-b0', 's0-b1']);
    expect(addition.comments[1]).toEqual({ anchor: target.id, quote, text: 'Lecture 2 · 7:00 · la profesora dijo que esto entra en el examen', lectureId: L2, ms: 420_000 });
  });

  it('no repeats: a block saying the same as an existing one becomes a comment on it (code’s check)', () => {
    expect(noRepeats.turnedToComments).toBe(1);
    expect(addition.comments[0].text).toMatch(/^Lecture 2 · 2:00 · said again: /);
  });

  it('a correction → an Update after its block (at the end when the block is unknown); a repeat on an unknown block is left out', () => {
    expect(addition.updates).toEqual([
      { anchor: target.id, text: 'En realidad la propusieron a la vez Darwin y Wallace.', lectureId: L2, lecture: 2, ms: 660_000 },
      { anchor: '', text: 'Otra corrección.', lectureId: L2, lecture: 2, ms: 720_000 },
    ]);
    expect(addition.leftOut).toEqual(['alreadyCovered:not-an-anchor']);
  });

  it('glossary terms, questions and flashcards already there are left out', () => {
    expect(addition.glossary.map((g) => g.term)).toEqual(['Sinapsis']);
    expect(addition.selfTest.map((q) => q.question)).toEqual(['¿Qué es la sinapsis y para qué sirve?']);
    expect(addition.flashcards.map((f) => f.front)).toEqual(['Sinapsis']);
  });

  it('a formula already in the summary is left out', () => {
    const f = (latex: string): StoredSummary => ({ ...S1, sections: [{ heading: 'F', timestamp: '0:00', cueQuestion: '', markChips: [], blocks: [{ type: 'formula', latex, variables: [], whenToUse: '' }] }] });
    const r = applyExtend({ lectureId: L2, summaryId: 'x', number: 2, title: '', summary: f('E=mc^2') }, { alreadyCovered: [], corrections: [] }, anchors, existingOf(f('E = m c^{2}')));
    expect(r.addition.keep).toEqual([]);
    expect(r.addition.leftOut).toEqual(['s0-b0']);
  });

  it('the request row and similarity', () => {
    const row = { mode: 'extend', source_lecture_ids: [L1, L2], applied_settings: { target: 'add', anchors: [{ id: 'a', label: 'h', text: 't' }, { id: 1 }] } };
    expect(combineRequestOf(row)).toEqual({ mode: 'extend', target: 'add', lectureIds: [L1, L2], anchors: [{ id: 'a', label: 'h', text: 't' }] });
    expect(combineRequestOf({ ...row, mode: 'merge' })?.target).toBe('unit');
    expect(combineRequestOf({ ...row, source_lecture_ids: [L1] })).toBeNull();
    expect(similarity('La conducta adaptativa', 'la CONDUCTA adaptativa')).toBe(1);
  });
});

// ---------- the run ----------

const UNIT_LISTS = {
  title: 'Las bases de la Psicobiología',
  takeaways: [{ text: 'La conducta tiene bases biológicas.', fromMarkIds: [] }],
  selfTest: [{ question: '¿Qué une la sinapsis?', kind: 'recall', answer: 'Dos neuronas.', fromMarkId: '' }],
  flashcards: [{ front: 'Sinapsis', back: 'Unión entre neuronas' }],
};
const PACK = {
  title: 'Psicobiología',
  topics: [
    {
      heading: 'La conducta',
      examSignals: [{ text: 'Las cinco preguntas entran en el examen', lecture: 1, t: '31:05' }],
      formulas: [{ name: 'Energía', latex: 'E = mc^2', legend: 'E energía · m masa' }],
      keyTerms: [{ term: 'Conducta', definition: 'Lo que hace un ser vivo.' }],
      selfTest: [{ question: '¿Qué estudia?', kind: 'recall', answer: 'La conducta.', fromMarkId: '' }],
    },
  ],
  flashcards: [{ front: 'Conducta', back: 'Lo que hace un ser vivo' }],
};

function resultOf<T>(out: CombineOutcome): T {
  if (out.status !== 'done') throw new Error(out.error);
  return out.result as unknown as T;
}

function combineDeps(over: Partial<CombineDeps> & { request: CombineDeps['request'] }) {
  const calls: string[] = [];
  const extended: { id: string; anchors: number }[] = [];
  const saved: Record<string, unknown>[] = [];
  const d: CombineDeps = {
    summaryId: REQ,
    claude: (kind) => {
      calls.push(kind);
      return call(kind === 'unitLists' ? answer(UNIT_LISTS) : answer(PACK));
    },
    logCost: async () => ({ costUsd: 0, tokensInput: 0, tokensOutput: 0 }),
    save: async (p) => void saved.push(p),
    log: () => {},
    failure: () => ({}),
    summaryOf: async (id) => (id === L1 ? { summaryId: 'sum-1', result: S1 } : id === L2 ? { summaryId: 'sum-2', result: tema2Written() } : null),
    extendWith: async (id, context) => {
      extended.push({ id, anchors: context.anchors.length });
      return { status: 'done', summary: tema2Written(), extend: LISTS2 };
    },
    lectureInfo: async (id) => (id === L1 ? { number: 1, title: 'Tema 1' } : { number: 2, title: 'La neurona' }),
    ...over,
  };
  return { d, calls, extended, saved };
}

describe('every Claude call has exactly one cost row (ai_usage), in every mode', () => {
  /** A request's fakes: each call billed, each cost row "inserted", one meter for the request (as summarize does). */
  function metered(failLogAt?: number) {
    const calls: string[] = [];
    const rows: string[] = [];
    const events: string[] = [];
    const meter = { calls: 0, logged: 0 };
    let n = 0;
    const generate = answer({ ...packedSummary(), extend: JSON.stringify(LISTS2) });
    const shared = {
      claude: ((kind: string) => {
        calls.push(kind);
        return call(kind === 'generate' ? generate : kind === 'unitLists' ? answer(UNIT_LISTS) : kind === 'examPack' ? answer(PACK) : answer('{}'));
      }) as SummaryRunDeps['claude'],
      logCost: async () => {
        n += 1;
        if (n === failLogAt) throw new Error('insert or update on table "ai_usage" violates foreign key constraint');
        rows.push('row');
        return { costUsd: 0.01, tokensInput: 1, tokensOutput: 1 };
      },
      log: (event: string) => void events.push(event),
      failure: () => ({}),
      meter,
    };
    const run = (request: CombineDeps['request']) =>
      runCombine({
        ...shared,
        summaryId: REQ,
        request,
        save: async () => {},
        summaryOf: async (id) => (id === L1 ? { summaryId: 'sum-1', result: S1 } : id === L2 ? { summaryId: 'sum-2', result: tema2Written() } : null),
        lectureInfo: async (id) => (id === L1 ? { number: 1, title: 'Tema 1' } : { number: 2, title: 'La neurona' }),
        // The lecture added through the real pipeline (classify, generate, the checks), sharing the meter.
        extendWith: (id, context) =>
          runSummary({ ...shared, summaryId: REQ, lectureId: id, request: tema2.request, material: async () => tema2.material, media: async () => ({ blocks: [], photos: 0, pdfs: 0 }), save: async () => {}, extend: context }),
      });
    return { run, calls, rows, events, meter };
  }

  it.each([
    ['Extend → a new Unit summary', { mode: 'extend', target: 'unit', lectureIds: [L1, L2], anchors }],
    ['Extend → Add to this summary', { mode: 'extend', target: 'add', lectureIds: [L1, L2], anchors }],
    ['Merge (two lectures added)', { mode: 'merge', target: 'unit', lectureIds: [L1, L2, L2], anchors }],
    ['Exam pack', { mode: 'exam_pack', target: 'unit', lectureIds: [L1, L2], anchors: [] }],
  ] as const)('%s: calls = cost rows = the result’s costLog', async (_name, request) => {
    const m = metered();
    const out = await m.run({ ...request, lectureIds: [...request.lectureIds], anchors: [...request.anchors] });
    const result = resultOf<{ costLog: { calls: number; logged: number } }>(out);
    expect(m.calls.length).toBeGreaterThan(0);
    expect(m.rows).toHaveLength(m.calls.length);
    expect(result.costLog).toEqual({ calls: m.calls.length, logged: m.calls.length });
    expect(m.events).not.toContain('usage_log_failed');
  });

  it('a plain summary (7.4): calls = cost rows = its costLog', async () => {
    const m = metered();
    let saved: Record<string, unknown> | null = null;
    const out = await runSummary({
      summaryId: REQ,
      lectureId: L2,
      request: tema2.request,
      material: async () => tema2.material,
      media: async () => ({ blocks: [], photos: 0, pdfs: 0 }),
      claude: (kind) => {
        m.calls.push(kind);
        return call(kind === 'generate' ? answer(packedSummary()) : answer('{}'));
      },
      logCost: async () => {
        m.rows.push('row');
        return { costUsd: 0.01, tokensInput: 1, tokensOutput: 1 };
      },
      save: async (p) => {
        if (p.status === 'done') saved = p;
      },
      log: () => {},
      failure: () => ({}),
      meter: m.meter,
    });
    expect(out.status).toBe('done');
    expect(m.rows).toHaveLength(m.calls.length);
    expect((saved!.result as { costLog: unknown }).costLog).toEqual({ calls: m.calls.length, logged: m.calls.length });
  });

  it('a cost row that fails to insert is not silent: logged as usage_log_failed, and the costLog shows it', async () => {
    const m = metered(1);
    const result = resultOf<{ costLog: { calls: number; logged: number } }>(await m.run({ mode: 'exam_pack', target: 'unit', lectureIds: [L1, L2], anchors: [] }));
    expect(result.costLog).toEqual({ calls: 1, logged: 0 });
    expect(m.events).toContain('usage_log_failed');
  });
});

describe('the run (Claude faked)', () => {
  it('Extend → a new Unit summary: the lecture written against all the anchors, then the unit’s lists', async () => {
    const { d, calls, extended, saved } = combineDeps({ request: { mode: 'extend', target: 'unit', lectureIds: [L1, L2], anchors } });
    const result = resultOf<CombinedResult>(await runCombine(d));
    expect(extended).toEqual([{ id: L2, anchors: anchors.length }]);
    expect(calls).toEqual(['unitLists']);
    expect(result).toMatchObject({ format: 'studiply-combined-v1', target: 'unit', base: { lectureId: L1, summaryId: 'sum-1', number: 1 } });
    expect(result.additions[0].summary.header.title).toBe('La neurona');
    expect(result.additions[0].comments).toHaveLength(2);
    expect(result.unit?.title).toBe('Las bases de la Psicobiología');
    expect(saved.at(-1)).toMatchObject({ status: 'done', error: null });
  });

  it('"Add to this summary": no unit call', async () => {
    const { d, calls } = combineDeps({ request: { mode: 'extend', target: 'add', lectureIds: [L1, L2], anchors } });
    expect(resultOf<CombinedResult>(await runCombine(d)).unit).toBeNull();
    expect(calls).toEqual([]);
  });

  it('no base summary: failed, nothing asked; a lecture that can’t be written: failed', async () => {
    const none = combineDeps({ request: { mode: 'extend', target: 'unit', lectureIds: ['none', L2], anchors } });
    expect(await runCombine(none.d)).toEqual({ status: 'failed', error: 'no_base_summary' });
    expect(none.extended).toEqual([]);
    const broken = combineDeps({ request: { mode: 'extend', target: 'add', lectureIds: [L1, L2], anchors }, extendWith: async () => ({ status: 'failed', error: 'no_transcript' }) });
    expect(await runCombine(broken.d)).toEqual({ status: 'failed', error: 'no_transcript' });
  });

  it('Exam pack: from the stored summaries (lectures without one left out), one call', async () => {
    const { d, calls } = combineDeps({ request: { mode: 'exam_pack', target: 'unit', lectureIds: [L1, L2, 'none'], anchors: [] } });
    const result = resultOf<ExamPackResult>(await runCombine(d));
    expect(calls).toEqual(['examPack']);
    expect(result.lectures.map((l) => l.lectureId)).toEqual([L1, L2]);
    expect(result.leftOut).toEqual(['none']);
    const empty = combineDeps({ request: { mode: 'exam_pack', target: 'unit', lectureIds: ['none'], anchors: [] } });
    expect(await runCombine(empty.d)).toEqual({ status: 'failed', error: 'no_summaries' });
  });
});

// ---------- the documents ----------

async function combined(t: 'unit' | 'add'): Promise<CombinedResult> {
  const { d } = combineDeps({ request: { mode: 'extend', target: t, lectureIds: [L1, L2], anchors: t === 'unit' ? anchors : anchorsOf(summaryToDoc({ summary: S1, summaryId: 'sum-1' })) } });
  return resultOf<CombinedResult>(await runCombine(d));
}
const NOW = Date.UTC(2026, 9, 31, 10);

describe('a new Unit summary', () => {
  it('its base blocks have the ids the anchors named; the lecture added tagged; its notes line counts both lectures (no link to itself)', async () => {
    const doc = unitDoc(S1, await combined('unit'), REQ, NOW);
    const ids = new Set(doc.content.map((b) => b.attrs?.blockId));
    expect(anchors.length).toBeGreaterThan(5);
    expect(anchors.every((a) => ids.has(a.id))).toBe(true);
    const headings = doc.content.filter((b) => b.type === 'heading' && /^\d+ · /.test(textOf(b))).map((b) => textOf(b).trim());
    expect(headings.at(-1)).toMatch(/^\d+ · Lecture 2 · La sinapsis$/);
    const c = S1.coverage;
    const check = doc.content[0];
    expect(check.attrs?.kind).toBe('notesCheck');
    expect(textOf(check)).toBe(`${c.noteLinesUsed + 5} of ${c.noteLines + 5} lines and ${c.marksUsed + 3} of ${c.marks + 3} marks used · shown in green as “From your notes” · Lectures 1, 2`);
    expect(JSON.stringify(check)).not.toContain('"link"');
  });

  it('valid for both editors; Studiply comments (author, lecture and time kept) and an Update callout', async () => {
    const e = loaded(unitDoc(S1, await combined('unit'), REQ, NOW));
    const comments = listComments(e.state.doc);
    const repeat = comments.find((x) => x.text.includes('la profesora'))!;
    expect(repeat).toMatchObject({ author: 'studiply', source: { lectureId: L2, ms: 420_000 }, text: 'Lecture 2 · 7:00 · la profesora dijo que esto entra en el examen', resolved: false });
    expect(repeat.quote).toContain(quote);
    const json = e.getJSON();
    const at = json.content!.findIndex((b) => b.attrs?.blockId === target.id);
    expect(json.content![at + 1].attrs).toMatchObject({ kind: 'update', lecture: 2, ms: 660_000, blockId: `${summaryKey(REQ)}-u0` });
    expect(calloutLabel(json.content![at + 1].attrs!)).toBe('Update · Lecture 2 · 11:00');
    // The correction without a known block: at the end.
    expect(json.content!.at(-1)?.attrs).toMatchObject({ kind: 'update', blockId: `${summaryKey(REQ)}-u1` });
  });
});

describe('"Add to this summary"', () => {
  const mine = summaryToDoc({ summary: S1, summaryId: 'sum-1' });
  const edited = mine.content.findIndex((b) => b.type === 'paragraph' && /-s\d+-b\d+$/.test(String(b.attrs?.blockId)) && textOf(b).split(' ').length > 8);
  const herDoc: SummaryDocJSON = {
    ...mine,
    content: mine.content.map((b, i) => (i === edited ? { ...b, attrs: { ...b.attrs, editedAt: NOW - 1000 }, content: [{ type: 'text', text: 'Mi propia frase sobre la conducta y sus bases.' }] } : b)),
  };

  it('only what’s new is added (ids x…), before the lists; her blocks keep their text and edit dates', async () => {
    const doc = addToDoc(herDoc, await combined('add'), REQ, NOW);
    const key = summaryKey(REQ);
    const firstExtra = doc.content.findIndex((b) => String(b.attrs?.blockId).startsWith(`${key}-x0-s`));
    const lists = doc.content.findIndex((b) => /-(exam|questions|selftest|glossary)$/.test(String(b.attrs?.blockId)) && String(b.attrs?.blockId).startsWith('sm'));
    expect(firstExtra).toBeGreaterThan(0);
    expect(firstExtra).toBeLessThan(lists);
    const hers = doc.content.find((b) => b.attrs?.blockId === herDoc.content[edited].attrs?.blockId)!;
    expect(textOf(hers)).toBe('Mi propia frase sobre la conducta y sus bases.');
    expect(hers.attrs?.editedAt).toBe(NOW - 1000);
    const sections = herDoc.content.filter((b) => /-s\d+$/.test(String(b.attrs?.blockId))).length;
    expect(textOf(doc.content[firstExtra]).trim()).toBe(`${sections + 1} · Lecture 2 · La sinapsis`);
    loaded(doc);
  });

  it('what Extend added is kept when Tema 1’s summary is written again (7.7’s merge); a commented block too', async () => {
    const doc = addToDoc(herDoc, await combined('add'), REQ, NOW);
    const key = summaryKey(REQ);
    const ours = doc.content.filter((b) => String(b.attrs?.blockId).startsWith(`${key}-`));
    expect(ours.every((b) => isTouched(b))).toBe(true);
    const again = mergeRegenerated(doc, summaryToDoc({ summary: S1, summaryId: 'sum-1b' }));
    expect(again.content.filter((b) => String(b.attrs?.blockId).startsWith(`${key}-`))).toHaveLength(ours.length);
    const block: N = { type: 'paragraph', attrs: { blockId: `${summaryKey('sum-1')}-s0-b0`, editedAt: null }, content: [{ type: 'text', text: 'x', marks: [{ type: 'comment', attrs: { id: 'c' } }] }] };
    expect(isTouched(block as never)).toBe(true);
    expect(isTouched({ ...block, content: [{ type: 'text', text: 'x' }] } as never)).toBe(false);
  });
});

describe('where a comment goes in the words', () => {
  it('the quote as written; else with case, accents and spaces aside; else the first sentence', () => {
    const t = 'La Conducta  adaptativa es clave. Y algo más.';
    expect(quoteRange(t, 'adaptativa')).toEqual([13, 23]);
    expect(t.slice(...quoteRange(t, 'la conducta adaptativa'))).toBe('La Conducta  adaptativa');
    expect(t.slice(...quoteRange(t, 'conducta ADAPTATÍVA'))).toBe('Conducta  adaptativa');
    expect(t.slice(...quoteRange(t, 'no está'))).toBe('La Conducta  adaptativa es clave.');
    expect(t.slice(...quoteRange(t, ''))).toBe('La Conducta  adaptativa es clave.');
  });
});

describe('the exam pack’s document', () => {
  it('"Built from the summaries of N lectures" (no notes claim), then per topic its signals, formulas, terms, self-test; valid', async () => {
    const { d } = combineDeps({ request: { mode: 'exam_pack', target: 'unit', lectureIds: [L1, L2], anchors: [] } });
    const doc = examPackDoc(resultOf<ExamPackResult>(await runCombine(d)), REQ);
    expect(doc.content[0]).toMatchObject({ type: 'paragraph', attrs: { blockId: `${summaryKey(REQ)}-built` } });
    expect(textOf(doc.content[0])).toBe('Built from the summaries of 2 lectures (1, 2)');
    expect(doc.content.some((b) => b.attrs?.kind === 'notesCheck')).toBe(false);
    expect(textOf(doc.content[1])).toBe('1 · La conducta');
    expect(doc.content.map((b) => b.type)).toEqual(['paragraph', 'heading', 'callout', 'formulaCard', 'bulletList', 'paragraph', 'callout', 'paragraph']);
    expect(JSON.stringify(doc.content[2])).toContain('"ms":1865000');
    expect(doc.content[6].attrs?.kind).toBe('answer');
    loaded(doc);
  });
});
