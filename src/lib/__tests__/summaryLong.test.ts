/**
 * @jest-environment node
 */
// Step 7.6: lectures over 60 minutes (supabase/functions/_shared/summary-long.ts and the pipeline's
// long path), Claude faked: the split by topic (≤ 35 min, at segment boundaries; no topics → windows),
// every item in exactly one part, 30 s of context at the edges, the part prompt, the media (slides
// shared and cached, each photo in its own part), the code merge, the wrap-up, and the run (parts in
// parallel, part 1 first with slides, each part retried once on its own, part_failed, refused).
import {
  MAX_LONG_LECTURE_MS,
  PART_MAX_MS,
  assignItems,
  mergeParts,
  parsePart,
  parseWrapUp,
  partMaterial,
  partUserText,
  splitMedia,
  splitParts,
  wrapUpPrompt,
  type PartGenerated,
} from '../../../supabase/functions/_shared/summary-long';
import {
  parseClassify,
  photoBlocks,
  planFor,
  runSummary,
  slidesBlocks,
  summarySystemPrompt,
  type ClaudeMessage,
  type Content,
  type SummaryRequest,
  type SummaryRunDeps,
} from '../../../supabase/functions/_shared/summary-pipeline';
import { SLIDER_DEFAULTS } from '../../../supabase/functions/_shared/summary-plan';
import { lectureMaterial } from '../../test-utils/summaryFixtures';

const MIN = 60_000;
const REQUEST: SummaryRequest = { sliders: SLIDER_DEFAULTS, resources: { slides: true, photos: true, assistant: true } };
const note = (id: string, tMs: number | null) => ({ id, tMs, text: `Nota ${id}`, content: null });

/** 90 minutes, 180 segments of 30 s; notes, marks, photos and a question on both sides of the part edges. */
const long = () =>
  lectureMaterial({
    durationMs: 90 * MIN,
    segments: Array.from({ length: 180 }, (_, i) => ({ startMs: i * 30_000, endMs: (i + 1) * 30_000, text: `Parte ${i}: la neurona transmite señales eléctricas y químicas.` })),
    notes: [note('n1', 4 * MIN), note('edge', 29 * MIN + 50_000), note('after', 30 * MIN + 10_000), note('late', 89 * MIN), note('none', null)],
    marks: [
      { id: 'm-imp', type: 'important', level: 8, tMs: 31 * MIN, note: null },
      { id: 'm-conf', type: 'confused', level: 9, tMs: 18 * MIN + 30_000, note: null },
      { id: 'm-exam', type: 'exam', level: 9, tMs: 6 * MIN + 40_000, note: null },
      { id: 'm-late', type: 'exam', level: 9, tMs: 80 * MIN, note: null },
    ],
    questions: [{ id: 'q1', askedAtMs: 62 * MIN, windowStartMs: 52 * MIN, windowEndMs: 62 * MIN, question: 'Explícame los últimos 10 minutos', answer: 'La sinapsis.' }],
    photos: [
      { id: 'p1', tMs: 12 * MIN + 40_000 },
      { id: 'p2', tMs: 75 * MIN },
    ],
  });

const CLASSIFIED = {
  subjectType: 'science',
  modules: ['process'],
  topics: [
    { title: 'Neurona', start: '0:00', end: '30:00' },
    { title: 'Sinapsis', start: '30:00', end: '1:00:00' },
    { title: 'Plasticidad', start: '1:00:00', end: '1:30:00' },
  ],
  professorExamPhrases: [{ t: '1:05:00', quote: 'Esto entra en el examen' }],
  repeatedConcepts: [],
};
const classified = (over: Partial<typeof CLASSIFIED> = {}) => parseClassify(JSON.stringify({ ...CLASSIFIED, ...over }))!;
const topics = (spans: [string, number, number][]) => classified({ topics: spans.map(([title, a, b]) => ({ title, start: `${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}:00`, end: `${Math.floor(b / 60)}:${String(b % 60).padStart(2, '0')}:00` })) });

describe('the split by topic', () => {
  it('three 30-min topics: three parts, cut at the topics, at segment boundaries', () => {
    const parts = splitParts(long(), classified());
    expect(parts.map((p) => [p.from, p.to, p.startMs / MIN, p.endMs / MIN, p.topics.map((t) => t.title)])).toEqual([
      [0, 60, 0, 30, ['Neurona']],
      [60, 120, 30, 60, ['Sinapsis']],
      [120, 180, 60, 90, ['Plasticidad']],
    ]);
  });

  it('a topic over 35 min is halved; no part over 35 min', () => {
    const parts = splitParts(long(), topics([['A', 0, 50], ['B', 50, 90]]));
    expect(parts.every((p) => p.endMs - p.startMs <= PART_MAX_MS)).toBe(true);
    expect(parts.flatMap((p) => p.topics.map((t) => t.title))).toEqual(['A', 'A', 'B', 'B']);
    // Contiguous: every segment in one part.
    expect(parts.map((p) => [p.from, p.to]).flat()).toEqual([0, ...parts.slice(1).flatMap((p) => [p.from, p.from]), 180]);
  });

  it('120 min in four 30-min topics: four parts', () => {
    const m = { ...long(), durationMs: 120 * MIN, segments: Array.from({ length: 240 }, (_, i) => ({ startMs: i * 30_000, endMs: (i + 1) * 30_000, text: 'x' })) };
    expect(splitParts(m, topics([['A', 0, 30], ['B', 30, 60], ['C', 60, 90], ['D', 90, 120]])).map((p) => p.startMs / MIN)).toEqual([0, 30, 60, 90]);
  });

  it('no topics (classify unreadable): windows of about 30 min', () => {
    const parts = splitParts(long(), classified({ topics: [] }));
    expect(parts.map((p) => p.startMs / MIN)).toEqual([0, 30, 60]);
    expect(parts.every((p) => p.topics.length === 0)).toBe(true);
  });

  it('one 90-min topic: halved like any topic over 35 min, its pieces keeping its title', () => {
    const parts = splitParts(long(), topics([['Todo', 0, 90]]));
    expect(parts.map((p) => [p.startMs / MIN, p.topics.map((t) => t.title)])).toEqual([
      [0, ['Todo']],
      [30, ['Todo']],
      [60, ['Todo']],
    ]);
  });
});

describe('every item in exactly one part (±30 s at the edges)', () => {
  const m = long();
  const c = classified();
  const plan = planFor(m, REQUEST, c);
  const parts = splitParts(m, c);
  const items = assignItems(m, plan, parts);

  it('notes, marks, photos, the question: by their aligned segment; no time → the last part', () => {
    expect(items.map((x) => x.notes.map((n) => n.id))).toEqual([['n1', 'edge'], ['after'], ['late', 'none']]);
    expect(items.map((x) => x.marks.map((k) => k.id))).toEqual([['m-conf', 'm-exam'], ['m-imp'], ['m-late']]);
    expect(items.map((x) => x.photos.map((p) => p.id))).toEqual([['p1'], [], ['p2']]);
    // Its window 52–62 min: the middle, 57 min.
    expect(items.map((x) => x.questions.map((q) => q.id))).toEqual([[], ['q1'], []]);
  });

  it('each of the plan’s marks once (the assistant question’s with its window)', () => {
    const all = items.flatMap((x) => [...x.planMarkIds]);
    expect(all.sort()).toEqual(plan.marks.map((k) => k.id).sort());
    expect(items[1].planMarkIds.has('assistant:q1')).toBe(true);
  });

  it('a part’s transcript: its segments and 30 s of each neighbour, marked as context', () => {
    const own = partMaterial(m, parts[1], items[1]);
    expect(own.segments).toHaveLength(62);
    expect(own.segments[0].text).toMatch(/^\(context: summarized in the neighbouring part\) Parte 59:/);
    expect(own.segments[1].text).toMatch(/^Parte 60:/);
    expect(own.segments.at(-1)!.text).toMatch(/^\(context.*Parte 120:/);
  });

  it('the part prompt: k of N, its share of the words by topic, the other parts’ topics, only its own items', () => {
    const text = partUserText(m, plan, c, REQUEST, parts, 1, items[1]);
    expect(text).toContain('Part 2 of 3: 30:00–1:00:00.');
    expect(text).toMatch(/Its sections: about \d+ words together, by topic: "Sinapsis" ≈ \d+\./);
    expect(text).toContain('part 1 "Neurona"; part 3 "Plasticidad"');
    expect(text).toContain('This part has 1 note line and 1 mark');
    expect(text).toContain('after | 30:10');
    expect(text).not.toContain('edge |');
    expect(text).toContain('<topics>\n[30:00–1:00:00] Sinapsis\n</topics>');
    expect(text).not.toContain('<professor-exam-phrases>');
    expect(text).toMatch(/q1 \| confused/);
    const last = partUserText(m, plan, c, REQUEST, parts, 2, items[2]);
    expect(last).toContain('<professor-exam-phrases>\n1:05:00 | Esto entra en el examen');
    expect(last).toContain('<photos>\np2 | 1:15:00\n</photos>');
  });

  it('the shares of the words add up to the sections’ budget (by transcript words)', () => {
    const shares = parts.map((_, k) => Number(/about (\d+) words together/.exec(partUserText(m, plan, c, REQUEST, parts, k, items[k]))![1]));
    expect(Math.abs(shares.reduce((a, b) => a + b, 0) - shares[0] * 3)).toBeLessThanOrEqual(3);
  });

  it('the part rules: the same text for every part (cached once), no takeaways or self-test numbers', () => {
    const system = summarySystemPrompt(m, plan, c, 'part');
    expect(system).toContain('write ONE part');
    expect(system).toContain("this part's sections get the words given in <part>");
    expect(system).not.toContain('Key takeaways: exactly');
    expect(system).not.toContain('Self-test: exactly');
    expect(system).toContain('Every note line id appears in exactly one fromNotes block');
  });
});

describe('the media', () => {
  it('slides shared (the last block marked as the cached prefix’s end); each photo on its own', () => {
    const { shared, photos } = splitMedia([...slidesBlocks('PDF'), ...photoBlocks('p1', 12 * MIN, 'J1'), ...photoBlocks('p2', 75 * MIN, 'J2')]);
    expect(shared.map((b) => b.type)).toEqual(['text', 'document']);
    expect(shared[1].cache_control).toEqual({ type: 'ephemeral' });
    expect([...photos.keys()]).toEqual(['p1', 'p2']);
    expect(photos.get('p2')!.map((b) => b.type)).toEqual(['text', 'image']);
    expect(splitMedia(photoBlocks('p1', 0, 'J')).shared).toEqual([]);
  });
});

describe('the merge (code) and the wrap-up', () => {
  const part = (over: Partial<PartGenerated>): PartGenerated => ({ modulesUsed: [], sections: [], glossary: [], examSignals: [], questionsDuringClass: [], logistics: [], unclear: [], ...over });
  const sec = (heading: string) => ({ heading, timestamp: '0:00', cueQuestion: '', markChips: [], blocks: [] });

  it('sections in order, the glossary once per term (the fuller definition), lists in time order, logistics once', () => {
    const merged = mergeParts(
      [
        part({ modulesUsed: ['process'], sections: [sec('A'), sec('B')], glossary: [{ term: 'Neurona', definition: 'célula' }], examSignals: [{ text: 'x', timestamp: '1:05:00', source: 'professor', markId: '', level: 0 }], logistics: ['Leer el tema 1'] }),
        part({ modulesUsed: ['process', 'timeline'], sections: [sec('C')], glossary: [{ term: 'neurona', definition: 'célula del sistema nervioso' }], examSignals: [{ text: 'y', timestamp: '12:00', source: 'professor', markId: '', level: 0 }], logistics: ['leer el tema 1.'] }),
      ],
      classified(),
    );
    expect(merged.sections.map((s) => s.heading)).toEqual(['A', 'B', 'C']);
    expect(merged.glossary).toEqual([{ term: 'Neurona', definition: 'célula del sistema nervioso' }]);
    expect((merged.examSignals as unknown as { timestamp: string }[]).map((e) => e.timestamp)).toEqual(['12:00', '1:05:00']);
    expect(merged.logistics).toHaveLength(1);
    expect(merged.modulesUsed).toEqual(['process', 'timeline']);
    expect(merged.subjectType).toBe('science');
  });

  it('the wrap-up prompt: the whole summary’s numbers and the marks that need a list item', () => {
    const m = long();
    const plan = planFor(m, REQUEST, classified());
    const w = wrapUpPrompt('RULES', { sections: [{ heading: 'A', timestamp: '0:00', blocks: [{ type: 'paragraph', text: 'La neurona.' }] }] }, plan);
    expect(w.system.startsWith('RULES')).toBe(true);
    expect(w.system).toContain(`exactly ${plan.takeaways.count} one-sentence bullets covering the whole lecture`);
    expect(w.user).toContain('## A [0:00]\nLa neurona.');
    expect(w.user).toMatch(/m-late \| exam/);
    expect(parseWrapUp('{"title":"T","takeaways":[],"selfTest":[],"flashcards":[]}')).toEqual({ title: 'T', takeaways: [], selfTest: [], flashcards: [] });
    expect(parseWrapUp('{"title":"T"}')).toBeNull();
    expect(parsePart('{').ok).toBe(false);
  });
});

describe('the run (Claude faked)', () => {
  const answer = (value: unknown, stop: string | null = 'end_turn'): ClaudeMessage => ({ model: 'claude-opus-5-5', stop_reason: stop, content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });
  const packed = (type: string, fields: Record<string, unknown>) => ({ type, data: JSON.stringify(fields) });

  /** A part's answer: one section at its start, its own notes in a fromNotes block. */
  const partAnswer = (user: string) => {
    const k = Number(/Part (\d+) of/.exec(user)![1]);
    const start = /Part \d+ of \d+: (\S+)–/.exec(user)![1];
    const notes = user.split('<notes>\n')[1].split('\n</notes>')[0];
    const ids = notes === '(no notes)' ? [] : notes.split('\n').map((l) => l.split(' | ')[0]);
    return answer({
      modulesUsed: ['process'],
      sections: [{ heading: `Parte ${k}`, timestamp: start, cueQuestion: '¿Qué?', markChips: [], blocks: [packed('paragraph', { text: `La neurona en la parte ${k}.`, keyTerms: [] }), packed('fromNotes', { noteIds: ids, t: start })] }],
      glossary: [{ term: 'Neurona', definition: k === 1 ? 'célula' : 'célula nerviosa' }],
      examSignals: [],
      questionsDuringClass: [],
      logistics: [],
      unclear: [],
    });
  };
  const WRAP = { title: 'Neurociencia', takeaways: [{ text: 'La neurona transmite señales.', fromMarkIds: ['m-imp'] }], selfTest: [{ question: '¿Qué?', kind: 'recall', answer: 'La neurona.', fromMarkId: 'm-exam' }], flashcards: [{ front: 'Neurona', back: 'célula' }] };

  type Call = { call: string; system: string; content: Content; user: string; part: number | null; partOneDone: boolean };
  function setup({ slides = true, respond }: { slides?: boolean; respond?: (call: string, user: string, nth: number) => ClaudeMessage | Error | undefined } = {}) {
    const calls: Call[] = [];
    const saved: Record<string, unknown>[] = [];
    let partOneDone = false;
    const media: Content = [...(slides ? slidesBlocks('PDF') : []), ...photoBlocks('p1', 12 * MIN + 40_000, 'J1'), ...photoBlocks('p2', 75 * MIN, 'J2')];
    const deps: SummaryRunDeps = {
      summaryId: 's1',
      lectureId: 'lec-1',
      request: REQUEST,
      material: async () => long(),
      media: async () => ({ blocks: media, photos: 2, pdfs: slides ? 1 : 0 }),
      claude: (call, system, content) => {
        const user = content.filter((b) => b.type === 'text').map((b) => String(b.text)).join('\n');
        const part = call === 'longPart' ? Number(/Part (\d+) of/.exec(user)![1]) : null;
        calls.push({ call, system, content, user, part, partOneDone });
        const nth = calls.filter((x) => x.call === call && x.part === part).length;
        const next =
          respond?.(call, user, nth) ??
          (call === 'classify' ? answer(CLASSIFIED) : call === 'longPart' ? partAnswer(user) : call === 'wrapUp' ? answer(WRAP) : answer('{}'));
        return {
          finalMessage: async () => {
            // Answered a moment later (not when asked), as a real call.
            await Promise.resolve();
            if (part === 1) partOneDone = true;
            if (next instanceof Error) throw next;
            return next;
          },
        };
      },
      logCost: async () => ({ costUsd: 0, tokensInput: 0, tokensOutput: 0 }),
      save: async (patch) => {
        saved.push(patch);
      },
      log: () => {},
      failure: (err) => ({ code: 'test', status: (err as { status?: number }).status ?? 0 }),
    };
    return { deps, calls, saved };
  }

  it('classify, three parts, the wrap-up, then the checks: one summary, sections in order, every note in it', async () => {
    const t = setup();
    const out = await runSummary(t.deps);
    if (out.status !== 'done') throw new Error(out.error);
    expect(t.calls.slice(0, 5).map((c) => c.call)).toEqual(['classify', 'longPart', 'longPart', 'longPart', 'wrapUp']);
    expect(t.calls.slice(5).every((c) => c.call === 'part')).toBe(true);
    const s = out.summary as unknown as { header: { title: string; durationMin: number }; sections: { heading: string }[]; glossary: unknown[]; takeaways: unknown[]; coverage: Record<string, number>; checks: { notes: { pass: boolean } } };
    expect(s.sections.map((x) => x.heading)).toEqual(['Parte 1', 'Parte 2', 'Parte 3']);
    expect(s.header).toMatchObject({ title: 'Neurociencia', durationMin: 90 });
    expect(s.glossary).toEqual([{ term: 'Neurona', definition: 'célula nerviosa' }]);
    expect(s.takeaways).toEqual(WRAP.takeaways);
    expect(s.coverage).toMatchObject({ noteLines: 5, noteLinesUsed: 5, marks: 4, marksUsed: 4 });
    expect(s.checks.notes.pass).toBe(true);
    expect(t.saved.map((p) => p.status)).toEqual(['checking', 'done']);
  });

  it('the parts: the same rules (cached), the slides first and cached, each photo only in its own part', async () => {
    const t = setup();
    await runSummary(t.deps);
    const parts = t.calls.filter((c) => c.call === 'longPart');
    expect(new Set(parts.map((c) => c.system)).size).toBe(1);
    for (const p of parts) expect(p.content.slice(0, 2)).toEqual([slidesBlocks('PDF')[0], { ...slidesBlocks('PDF')[1], cache_control: { type: 'ephemeral' } }]);
    expect(parts.map((p) => ['p1', 'p2'].filter((id) => p.user.includes(`Photo ${id} (`)))).toEqual([['p1'], [], ['p2']]);
  });

  it('with slides, part 1 first (the others read the cache); without, all three at once', async () => {
    const withSlides = setup();
    await runSummary(withSlides.deps);
    expect(withSlides.calls.filter((c) => c.part === 2 || c.part === 3).every((c) => c.partOneDone)).toBe(true);
    const without = setup({ slides: false });
    await runSummary(without.deps);
    expect(without.calls.filter((c) => c.part === 2 || c.part === 3).every((c) => !c.partOneDone)).toBe(true);
  });

  it('a part that fails is tried once more on its own; the summary is still written', async () => {
    const t = setup({ respond: (call, _u, nth) => (call === 'longPart' && /Part 2 of/.test(_u) && nth === 1 ? Object.assign(new Error('overloaded'), { status: 429 }) : undefined) });
    expect((await runSummary(t.deps)).status).toBe('done');
    expect(t.calls.filter((c) => c.part === 2)).toHaveLength(2);
    expect(t.calls.filter((c) => c.part === 1 || c.part === 3)).toHaveLength(2);
  });

  it('a part unreadable twice: failed, part_failed (nothing stored)', async () => {
    const t = setup({ respond: (call, u) => (call === 'longPart' && /Part 3 of/.test(u) ? answer('{"sections": 1}') : undefined) });
    expect(await runSummary(t.deps)).toEqual({ status: 'failed', error: 'part_failed' });
    expect(t.calls.filter((c) => c.part === 3)).toHaveLength(2);
    expect(t.saved.some((p) => 'result' in p)).toBe(false);
  });

  it('a refusal is final; the API refusing the request (4xx): claude_rejected; the wrap-up unreadable twice: part_failed', async () => {
    const refused = setup({ respond: (call, u) => (call === 'longPart' && /Part 2 of/.test(u) ? answer('', 'refusal') : undefined) });
    expect(await runSummary(refused.deps)).toEqual({ status: 'failed', error: 'refused' });
    const rejected = setup({ respond: (call) => (call === 'longPart' ? Object.assign(new Error('bad'), { status: 400 }) : undefined) });
    expect(await runSummary(rejected.deps)).toEqual({ status: 'failed', error: 'claude_rejected' });
    expect(rejected.calls.filter((c) => c.call === 'longPart')).toHaveLength(1);
    const wrap = setup({ respond: (call) => (call === 'wrapUp' ? answer('{}') : undefined) });
    expect(await runSummary(wrap.deps)).toEqual({ status: 'failed', error: 'part_failed' });
    expect(wrap.calls.filter((c) => c.call === 'wrapUp')).toHaveLength(2);
  });

  it('3 hours is the limit', () => {
    expect(MAX_LONG_LECTURE_MS).toBe(3 * 60 * MIN + 30_000);
  });
});
