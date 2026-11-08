/**
 * @jest-environment node
 */
// Step 7.5: the summary's quality checks (supabase/functions/_shared/summary-checks.ts): numbers as
// written and said (es/en), dates, formulas, the language, the notes and marks put in by code, the
// marks' effects, length, which parts are written again (at most 3, in order), and splicing their
// answers in (the verify call's verdicts: corrected in place, "added" moved under Added context).
// Step 8.2: data chart values checked as numbers (one not said in class taken out, under unclear), the
// photos put at their time.
import {
  MAX_PART_CALLS,
  applyVerdicts,
  chartValues,
  dates,
  detectLanguage,
  digitNumbers,
  faithfulness,
  fixCharts,
  fixMarks,
  fixNotes,
  fixPhotoCharts,
  fixPhotos,
  languageCheck,
  lengthBounds,
  lengthPart,
  missingEffects,
  normalizeLatex,
  numberReadings,
  parseLists,
  parseSection,
  parseVerdicts,
  planParts,
  runChecks,
  sectionAt,
  sectionWindow,
  sourcesOf,
  spliceSection,
  summaryWords,
  verifyPartPrompt,
  verifySegments,
  wordNumbers,
  wordsByPart,
  type CheckReport,
  type Section,
} from '../../../supabase/functions/_shared/summary-checks';
import { FixtureShape, fixtureInput } from '../../../supabase/functions/_shared/summary-fixture';
import { parseClassify, parseSummary, planFor, type StoredSummary, type SummaryRequest } from '../../../supabase/functions/_shared/summary-pipeline';
import { SLIDER_DEFAULTS, type SummaryPlan } from '../../../supabase/functions/_shared/summary-plan';
import { checkBlock } from '../../../supabase/functions/_shared/summary-zod';
import { CHART_EXPECTED, syntheticChartFixture } from '../../../scripts/fixtures/synthetic-chart-lecture';
import { lectureMaterial, packedSummary, validSummary } from '../../test-utils/summaryFixtures';

const MIN = 60_000;
const REQUEST: SummaryRequest = { sliders: SLIDER_DEFAULTS, resources: { slides: true, photos: true, assistant: true } };
const m = lectureMaterial();
const plan = planFor(m, REQUEST, parseClassify(JSON.stringify({ subjectType: 'science', modules: [], topics: [], professorExamPhrases: [], repeatedConcepts: [] }))!);

/** validSummary as stored (parsed and settled), after `edit`. */
function stored(edit: (v: ReturnType<typeof validSummary>) => void = () => {}): StoredSummary {
  const v = validSummary();
  edit(v);
  const parsed = parseSummary(JSON.stringify(packedSummary(v)), m, plan, []);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.summary;
}
const sections = (s: StoredSummary) => s.sections as Section[];
const paragraph = (text: string) => ({ type: 'paragraph', text, keyTerms: [] }) as never;

describe('numbers', () => {
  it.each([
    ['1.440', [1.44, 1440]],
    ['1,5', [1.5]],
    ['1.234,5', [1234.5]],
    ['1,234.5', [1234.5]],
    ['1.234.567', [1234567]],
    ['3.14', [3.14]],
    ['12', [12]],
  ])('%s reads as %j', (token, readings) => {
    expect(numberReadings(token).sort((a, b) => a - b)).toEqual(readings);
  });

  it('digits in text, times left out', () => {
    expect(digitNumbers('A las 12:34 dijo 98765 y 1.440').map((n) => n.token)).toEqual(['98765', '1.440']);
  });

  it('said as words, in Spanish and English', () => {
    expect(wordNumbers('veinticinco alumnos')).toEqual([25]);
    expect(wordNumbers('treinta y dos')).toEqual([32]);
    expect(wordNumbers('en mil novecientos')).toEqual([1900]);
    expect(wordNumbers('twenty-five')).toEqual([25]);
    expect(wordNumbers('two hundred and five')).toEqual([205]);
    expect(wordNumbers('cinco preguntas y tres')).toEqual([5, 3]);
    expect(wordNumbers('la y griega')).toEqual([]);
  });
});

describe('dates and formulas', () => {
  it('day and month, either order, either language', () => {
    expect(dates('El 21 de octubre y el 3 de mayo')).toEqual(['10-21', '5-3']);
    expect(dates('On October 21')).toEqual(['10-21']);
  });

  it('LaTeX compared without spacing, braces of one character, \\frac, \\left/\\right, × and ²', () => {
    expect(normalizeLatex('h^{2} = \\frac{V_G}{V_P}')).toBe(normalizeLatex('h^2=(V_G)/(V_P)'));
    expect(normalizeLatex('\\left( a \\cdot b \\right)')).toBe('(a*b)');
    expect(normalizeLatex('a × b²')).toBe(normalizeLatex('a \\times b^2'));
    expect(normalizeLatex('E = mc^2')).not.toBe(normalizeLatex('E = mc^3'));
  });
});

describe('faithfulness', () => {
  it('the example summary: everything found in the lecture', () => {
    const r = faithfulness(stored(), sourcesOf(m));
    expect(r.unverified).toEqual([]);
    expect(r.checked).toBeGreaterThan(0);
  });

  it('a number, a date and a formula the lecture never says: unverified, with where and the sentence', () => {
    const s = stored((v) => {
      v.sections[0].blocks[0] = paragraph('La conducta es biológica. Hubo 98765 casos el 21 de octubre, con $\\alpha = 4217 \\beta$.');
    });
    expect(faithfulness(s, sourcesOf(m)).unverified).toEqual([
      { id: 'u1', kind: 'formula', value: '\\alpha = 4217 \\beta', path: 'sections[0].blocks[0].text', sentence: 'Hubo 98765 casos el 21 de octubre, con $\\alpha = 4217 \\beta$.' },
      { id: 'u2', kind: 'number', value: '98765', path: 'sections[0].blocks[0].text', sentence: 'Hubo 98765 casos el 21 de octubre, con $\\alpha = 4217 \\beta$.' },
      { id: 'u3', kind: 'date', value: '10-21', path: 'sections[0].blocks[0].text', sentence: expect.any(String) },
    ]);
  });

  it('said in words or in another number format: found', () => {
    const lecture = lectureMaterial({ segments: [{ startMs: 0, endMs: 30_000, text: 'Vinieron veinticinco alumnos y la media fue 1.440 puntos el 3 de mayo.' }] });
    const s = stored((v) => {
      v.sections[0].blocks[0] = paragraph('Vinieron 25 alumnos; la media fue 1440 puntos (3 de mayo).');
    });
    expect(faithfulness(s, sourcesOf(lecture)).unverified.filter((u) => u.path === 'sections[0].blocks[0].text')).toEqual([]);
  });

  describe('exercise content: made up on purpose, not checked (advisor decision, 31 Oct)', () => {
    // The 7.4 output's 8 "not found" numbers, all from exercises the spec asks for.
    const exercises = () =>
      stored((v) => {
        Object.assign(v.sections[0].blocks[3], { example: 'Si $V_G = 30$ y V_P = 60 → h² = 0,5.', practiceQuestion: 'Si V_G = 20 y V_P = 80, ¿cuánto vale $h^2 = 20/80$?' });
        v.sections[0].blocks[1] = { type: 'callout', kind: 'example', text: 'Con 1.234 gemelos y $\\alpha = 4217 \\beta$, el 21 de octubre.' } as never;
        v.selfTest[1] = { question: 'Calcula h² con V_G = 20 y V_P = 80.', kind: 'calculate' as never, answer: '0,25', fromMarkId: 'm-exam' };
        v.selfTest[2] = { question: 'Aplica: 3 de 12', kind: 'apply' as never, answer: '0,25 de 9876', fromMarkId: '' };
      });

    it('confusedHere’s example and practice question, example callouts, apply/calculate answers: skipped', () => {
      expect(faithfulness(exercises(), sourcesOf(m)).unverified).toEqual([]);
    });

    it('the same numbers stated as the lecture’s content are still checked', () => {
      const s = stored((v) => {
        Object.assign(v.sections[0].blocks[3], { explanation: 'La heredabilidad fue 0,25 en el estudio.' });
        v.sections[0].blocks[1] = { type: 'callout', kind: 'definition', text: 'Hubo 1.234 gemelos.' } as never;
        v.sections[0].blocks[5] = { type: 'workedExample', problem: 'V_G = 9876', steps: [{ do: 'a', why: 'b' }], answer: '0,25' } as never;
        v.selfTest[0] = { question: '¿Qué estudia?', kind: 'recall' as const, answer: 'Unos 9876 casos.', fromMarkId: 'm-imp' };
        v.flashcards = [{ front: 'h²', back: '0,25' }];
        v.glossary = [{ term: 'h²', definition: 'Vale 0,25 en humanos.' }];
        v.takeaways[1] = { text: 'Responde a 97 preguntas.', fromMarkIds: [] };
        v.examSignals[0] = { ...v.examSignals[0], text: 'El 21 de octubre' };
      });
      const paths = faithfulness(s, sourcesOf(m)).unverified.map((u) => u.path);
      expect(new Set(paths)).toEqual(
        new Set([
          'takeaways[1].text',
          'sections[0].blocks[1].text',
          'sections[0].blocks[3].explanation',
          'sections[0].blocks[5].problem',
          'sections[0].blocks[5].answer',
          'glossary[0].definition',
          'selfTest[0].answer',
          'flashcards[0].back',
          'examSignals[0].text',
        ]),
      );
    });

    it('a formula block is checked wherever it is; a formula inside an exercise field isn’t', () => {
      const s = stored((v) => {
        v.sections[1].blocks.push({ type: 'formula', latex: '\\alpha = 4217 \\beta', variables: [], whenToUse: '' } as never);
      });
      expect(faithfulness(s, sourcesOf(m)).unverified).toEqual([expect.objectContaining({ kind: 'formula', path: `sections[1].blocks[${sections(s)[1].blocks.length - 1}].latex` })]);
    });

    it('still read for the language', () => {
      const s = stored((v) => {
        Object.assign(v.sections[0].blocks[3], { example: 'This example is written in English by mistake, and it is not what the students asked for at all.' });
      });
      expect(languageCheck(s, 'es')).toMatchObject({ pass: false, offBlocks: [{ section: 0, block: 3, detected: 'en' }] });
    });
  });

  it('Added context callouts and the student’s own notes aren’t checked', () => {
    const s = stored((v) => {
      v.sections[0].blocks[1] = { type: 'callout', kind: 'addedContext', text: 'En 2019 hubo 98765 casos.' } as never;
    });
    expect(faithfulness(s, sourcesOf(m)).unverified).toEqual([]);
  });
});

describe('language', () => {
  it('by its function words', () => {
    expect(detectLanguage('La conducta es lo que hace un organismo y que podemos observar en el laboratorio.')).toBe('es');
    expect(detectLanguage('This is what the organism does and what we can observe in the lab.')).toBe('en');
    expect(detectLanguage('Hola')).toBeNull();
  });

  it('a Spanish block close to Catalan stays Spanish (the 7.9 paid run’s false "ca": the confusedHere box of Tema 2)', () => {
    const block = 'Reposo −70 mV Supera el umbral Disparo Periodo refractario Periodo refractario: tras el disparo, la neurona no puede dispararse otra vez. ¿Qué pasa si estimulas la neurona en el periodo refractario?';
    expect(detectLanguage(block)).toBe('es');
    expect(detectLanguage(block, 'es')).toBe('es');
    // A real Catalan sentence is still Catalan, also when Spanish is expected.
    const catalan = 'Els alumnes i les alumnes són a la classe perquè aquesta assignatura és molt important per a ells, però també hi ha exàmens.';
    expect(detectLanguage(catalan, 'es')).toBe('ca');
  });

  it('a long block in another language fails the check, named by section and block', () => {
    const s = stored((v) => {
      v.sections[1].blocks[1] = paragraph('This is the part of the lecture that was written in English by mistake, and it is not what was asked for.');
    });
    expect(languageCheck(s, 'es')).toMatchObject({ pass: false, expected: 'es', offBlocks: [{ section: 1, block: 1, detected: 'en' }] });
    expect(languageCheck(stored(), 'es-ES')).toMatchObject({ pass: true, expected: 'es', offBlocks: [] });
    expect(languageCheck(s, null).pass).toBe(true);
  });
});

describe('notes and marks: put in by code', () => {
  it('the section at a time (the last one starting before it; no time: the last section)', () => {
    const secs = sections(stored());
    expect([sectionAt(secs, 5 * MIN), sectionAt(secs, 40 * MIN), sectionAt(secs, null), sectionAt([], 0)]).toEqual([0, 1, 1, -1]);
  });

  it('a note left out goes into the fromNotes block of its section, or a new one', () => {
    const s = stored((v) => {
      v.sections[1].blocks[0] = { type: 'fromNotes', noteIds: [], t: '' } as never;
    });
    const fixed = fixNotes(s, m);
    expect(fixed.fixed).toEqual(['n3']);
    expect(sections(fixed.summary)[1].blocks[0]).toMatchObject({ type: 'fromNotes', noteIds: ['n3'] });

    const none = stored((v) => {
      v.sections[1].blocks.shift();
    });
    const added = fixNotes(none, m);
    expect(sections(added.summary)[1].blocks.at(-1)).toEqual({ type: 'fromNotes', noteIds: ['n3'], t: '' });
    // The input is left as it was.
    expect(sections(none)[1].blocks.some((b) => b.type === 'fromNotes')).toBe(false);
  });

  it('a mark never mentioned gets a chip on the section at its time', () => {
    const lecture = lectureMaterial({ marks: [...m.marks, { id: 'm-new', type: 'important', level: 3, tMs: 35 * MIN, note: null }] });
    const fixed = fixMarks(stored(), lecture);
    expect(fixed.fixed).toEqual(['m-new']);
    expect(sections(fixed.summary)[1].markChips).toEqual([{ markId: 'm-new', type: 'important', level: 3 }]);
    expect(fixMarks(stored(), m).fixed).toEqual([]);
  });

  it('the marks’ effects not carried out', () => {
    const p = {
      marks: [
        { id: 'm-imp', source: 'student', effects: { takeaway: true, selfTest: false, flashcard: false, clarify: 'none' } },
        { id: 'm-exam', source: 'student', effects: { takeaway: false, selfTest: true, flashcard: true, clarify: 'none' } },
        { id: 'm-conf', source: 'student', effects: { takeaway: false, selfTest: false, flashcard: false, clarify: 'stepByStep' } },
        { id: 'q1', source: 'assistant', effects: { takeaway: false, selfTest: false, flashcard: false, clarify: 'block' } },
      ],
    } as unknown as SummaryPlan;
    expect(missingEffects(stored(), p)).toEqual([]);
    const bare = stored((v) => {
      v.takeaways.forEach((t) => (t.fromMarkIds = []));
      v.selfTest = [];
      v.flashcards = [];
      v.sections[0].blocks.splice(3, 1);
    });
    expect(missingEffects(bare, p)).toEqual([
      { markId: 'm-imp', need: 'takeaway' },
      { markId: 'm-exam', need: 'selfTest' },
      { markId: 'm-conf', need: 'confusedHere' },
      { markId: 'm-exam', need: 'flashcard' },
    ]);
  });
});

describe('length', () => {
  it('85–115 % of the target, 120 % with a high-band mark', () => {
    expect(lengthBounds(1440, false)).toEqual({ target: 1440, min: 1224, max: 1656 });
    expect(lengthBounds(1440, true)).toEqual({ target: 1440, min: 1224, max: 1728 });
  });

  it('counts takeaways, sections and glossary; not the notes, self-test or flashcards', () => {
    const s = stored();
    const more = { ...s, selfTest: [...(s.selfTest as unknown[]), { question: 'una dos tres cuatro', kind: 'recall', answer: 'cinco seis', fromMarkId: '' }], flashcards: [{ front: 'a b c', back: 'd e f' }] };
    expect(summaryWords(more)).toBe(summaryWords(s));
    const longer = { ...s, glossary: [...(s.glossary as unknown[]), { term: 'Filogenia', definition: 'historia evolutiva de una especie' }] };
    expect(summaryWords(longer)).toBe(summaryWords(s) + 6);
  });
});

describe('the report', () => {
  it('the example summary: schema, notes and marks pass; it is far too short for the target', () => {
    const r = runChecks(stored(), m, plan, { targetWords: 1440, hasHighMarks: false });
    expect(r.schema).toEqual({ pass: true, errors: [] });
    expect(r.notes).toMatchObject({ pass: true, total: 3, used: 3, missing: [] });
    expect(r.marks).toMatchObject({ total: 3, used: 3, missing: [] });
    expect(r.length).toMatchObject({ pass: false, target: 1440, min: 1224, max: 1656 });
    expect(r.faithfulness.pass).toBe(true);
    expect(r.language.pass).toBe(true);
  });

  it('an output saved before stable mark ids: marks not compared', () => {
    const r = runChecks(stored(), lectureMaterial({ marks: [{ id: 'other', type: 'exam', level: 9, tMs: 0, note: null }] }), plan, { hasHighMarks: false, marksComparable: false });
    expect(r.marks).toMatchObject({ pass: true, missing: [], effects: [] });
  });

  it('not the stored shape: the schema check fails, with why', () => {
    const r = runChecks({ ...stored(), header: null } as unknown as StoredSummary, m, plan, { hasHighMarks: false });
    expect(r.schema.pass).toBe(false);
    expect(r.schema.errors[0]).toMatch(/^\$\.header/);
  });
});

describe('which parts are written again', () => {
  const base = (): CheckReport => runChecks(stored(), m, plan, { targetWords: summaryWords(stored()), hasHighMarks: false });

  it('nothing failed: none', () => {
    expect(planParts(base(), stored(), m)).toEqual([]);
  });

  it('in order (language, verify, marks, length), one section once for several reasons, at most 3', () => {
    const r = base();
    r.language = { ...r.language, pass: false, offBlocks: [{ section: 0, block: 0, detected: 'en' }, { section: 1, block: 1, detected: 'en' }] };
    r.faithfulness = { ...r.faithfulness, pass: false, unverified: [{ id: 'u1', kind: 'number', value: '98765', path: 'sections[0].blocks[0].text', sentence: 'x' }] };
    r.marks = { ...r.marks, pass: false, effects: [{ markId: 'm-conf', need: 'confusedHere' }, { markId: 'm-imp', need: 'takeaway' }] };
    r.length = { ...r.length, pass: false, words: r.length.max + 500 };
    const all = planParts(r, stored(), m, 10);
    expect(all.map((p) => p.kind)).toEqual(['section', 'section', 'verify', 'lists']);
    // Section 0 is the longest: written again once, for all three reasons.
    expect(all[0]).toMatchObject({ index: 0, markIds: ['m-conf'], reasons: ['write it in es', 'add the "You were confused here" block for mark m-conf', 'shorten it'] });
    expect(all[3]).toEqual({ kind: 'lists', reasons: ['takeaway for mark m-imp'], markIds: ['m-imp'] });
    // At most 3 calls: the last one is left out.
    expect(planParts(r, stored(), m)).toEqual(all.slice(0, MAX_PART_CALLS));
  });

  it('too long: the longest section shortened; too short: the shortest expanded, with a word target', () => {
    const r = base();
    const s = stored();
    const long = planParts({ ...r, length: { ...r.length, pass: false, words: r.length.target + 100 } }, s, m);
    expect(long).toEqual([expect.objectContaining({ kind: 'section', reasons: ['shorten it'], targetWords: expect.any(Number) })]);
    const short = planParts({ ...r, length: { ...r.length, pass: false, words: r.length.target - 100 } }, s, m);
    expect(short).toEqual([expect.objectContaining({ kind: 'section', reasons: ['expand it with what the lecture says'] })]);
    expect(short[0].kind === 'section' && long[0].kind === 'section' && short[0].index !== long[0].index).toBe(true);
  });

  describe('length: the gap shared across sections, one per call', () => {
    const filler = (n: number) => Array.from({ length: n }, (_, i) => ['la', 'conducta', 'es', 'biológica'][i % 4]).join(' ');
    // Three sections of 100, 60 and 40 words (one-word headings and the paragraph only).
    const three = (): StoredSummary => ({
      ...stored(),
      sections: [100, 60, 40].map((n, i) => ({ heading: `S${i}`, timestamp: `${i * 10}:00`, cueQuestion: '', markChips: [], blocks: [{ type: 'paragraph', text: filler(n - 1), keyTerms: [] }] })),
    });
    const report = (words: number, target: number): CheckReport => ({ ...base(), length: { pass: false, words, ...lengthBounds(target, false) } });

    it('too long: the largest section takes its share of the excess among the sections the calls left can reach', () => {
      // Excess 100 over 3 calls: section 0 has 100 of their 200 words → cut 50.
      expect(lengthPart(report(300, 200), three(), new Set(), 3)).toEqual({ kind: 'section', index: 0, reasons: ['shorten it'], markIds: [], targetWords: 50 });
      // One call left: it takes the whole excess (never below 40 % of the section).
      expect(lengthPart(report(300, 200), three(), new Set(), 1)?.targetWords).toBe(40);
      // Section 0 done: the next largest, its share of what's left.
      expect(lengthPart(report(250, 200), three(), new Set([0]), 2)).toMatchObject({ index: 1, targetWords: 30 });
    });

    it('too short: the smallest section expanded by its share; within bounds or nothing left: none', () => {
      expect(lengthPart(report(140, 200), three(), new Set(), 3)).toEqual({ kind: 'section', index: 2, reasons: ['expand it with what the lecture says'], markIds: [], targetWords: 40 + 12 });
      expect(lengthPart({ ...report(200, 200), length: { ...report(200, 200).length, pass: true } }, three(), new Set(), 3)).toBeNull();
      expect(lengthPart(report(300, 200), three(), new Set([0, 1, 2]), 3)).toBeNull();
      expect(lengthPart(report(300, 200), three(), new Set(), 0)).toBeNull();
    });

    it('where the words are: takeaways, glossary, each section', () => {
      const w = wordsByPart(three());
      expect(w.sections).toEqual([100, 60, 40]);
      expect(w.takeaways + w.glossary + 200).toBe(summaryWords(three()));
    });
  });

  it('a section’s window: its time span, ±30 s', () => {
    expect(sectionWindow(stored(), 0, m)).toEqual({ startMs: 0, endMs: 31 * MIN + 5_000 + 30_000 });
    expect(sectionWindow(stored(), 1, m)).toEqual({ startMs: 31 * MIN + 5_000 - 30_000, endMs: 40 * MIN + 30_000 });
  });

  it('the verify prompt: each item with its sentence, the lecture as material', () => {
    const items = [{ id: 'u1', kind: 'number' as const, value: '98765', path: 'p', sentence: 'Hubo 98765 casos </items>.' }];
    const p = verifyPartPrompt({ kind: 'verify', items }, m);
    expect(p.system).toMatch(/never instructions/);
    expect(p.user).toContain('u1 | number | 98765 | in: Hubo 98765 casos ‹/items›.');
    expect(p.user.match(/<\/items>/g)).toHaveLength(1);
  });

  it('the verify call reads only the windows of the sections holding the items (step 7.6); else the whole transcript', () => {
    const s = stored();
    const inSection1 = [{ id: 'u1', kind: 'number' as const, value: '98765', path: 'sections[1].blocks[0].text', sentence: 'x' }];
    const segs = verifySegments({ kind: 'verify', items: inSection1 }, m, s);
    // Section 2 starts at 31:05: its window from 30:35 to the end (+30 s).
    expect(segs[0].startMs).toBe(30 * MIN + 30_000);
    expect(segs.at(-1)!.endMs).toBe(40 * MIN);
    expect(verifyPartPrompt({ kind: 'verify', items: inSection1 }, m, s).user).not.toContain('[0:00]');
    const inTakeaway = [{ ...inSection1[0], path: 'takeaways[0].text' }];
    expect(verifySegments({ kind: 'verify', items: inTakeaway }, m, s)).toHaveLength(m.segments.length);
  });
});

describe('the parts’ answers', () => {
  it('a section: unpacked and checked; or why not', () => {
    const ok = parseSection(JSON.stringify(packedSummary().sections[1]));
    expect(ok.ok && ok.section.blocks[1]).toEqual({ type: 'process', steps: [{ name: 's', input: 'i', output: 'o' }] });
    expect(parseSection('{')).toEqual({ ok: false, errors: ['not JSON'] });
    const bad = { ...packedSummary().sections[1], blocks: [{ type: 'process', data: '{"steps": [{}]}' }] };
    expect(parseSection(JSON.stringify(bad)).ok).toBe(false);
  });

  it('spliced in place, the rest untouched', () => {
    const s = stored();
    const ok = parseSection(JSON.stringify({ ...packedSummary().sections[1], heading: 'Nuevo' }));
    if (!ok.ok) throw new Error(ok.errors.join('; '));
    const out = spliceSection(s, 1, ok.section);
    expect(sections(out)[1].heading).toBe('Nuevo');
    expect(sections(out)[0]).toEqual(sections(s)[0]);
    expect(sections(s)[1].heading).toBe('Las cinco preguntas');
  });

  it('the lists and the verdicts', () => {
    const v = validSummary();
    const lists = { takeaways: v.takeaways, selfTest: v.selfTest, flashcards: v.flashcards };
    expect(parseLists(JSON.stringify(lists))).toEqual(lists);
    expect(parseLists('{"takeaways": []}')).toBeNull();
    expect(parseVerdicts('{"items":[{"id":"u1","verdict":"found","replacement":""}]}')).toEqual([{ id: 'u1', verdict: 'found', replacement: '' }]);
    expect(parseVerdicts('{"items":[{"id":"u1","verdict":"maybe","replacement":""}]}')).toBeNull();
  });
});

describe('the verdicts applied (nothing deleted)', () => {
  const planted = () =>
    stored((v) => {
      v.sections[0].blocks[0] = paragraph('La conducta es biológica. Hubo 98765 casos. Fin del tema.');
      v.takeaways[1] = { text: 'Responde a 97 preguntas.', fromMarkIds: [] };
    });
  const items = (s: StoredSummary) => faithfulness(s, sourcesOf(m)).unverified;

  it('added: its sentence moved into an Added context callout right after its paragraph', () => {
    const s = planted();
    const u = items(s).find((x) => x.value === '98765')!;
    const out = applyVerdicts(s, items(s), [{ id: u.id, verdict: 'added', replacement: '' }]);
    expect(out.labelled).toBe(1);
    expect(sections(out.summary)[0].blocks.slice(0, 2)).toEqual([
      { type: 'paragraph', text: 'La conducta es biológica. Fin del tema.', keyTerms: [] },
      { type: 'callout', kind: 'addedContext', text: 'Hubo 98765 casos.' },
    ]);
  });

  it('corrected: the item replaced in its text; found: unchanged', () => {
    const s = planted();
    const seven = items(s).find((x) => x.value === '97')!;
    const other = items(s).find((x) => x.value === '98765')!;
    const out = applyVerdicts(s, items(s), [
      { id: seven.id, verdict: 'corrected', replacement: '5' },
      { id: other.id, verdict: 'found', replacement: '' },
    ]);
    expect(out.corrected).toBe(1);
    expect((out.summary.takeaways as { text: string }[])[1].text).toBe('Responde a 5 preguntas.');
    expect(sections(out.summary)[0].blocks[0]).toEqual(sections(s)[0].blocks[0]);
  });

  it('a whole paragraph not from the lecture becomes the callout; a sentence no longer there isn’t moved', () => {
    const s = stored((v) => {
      v.sections[0].blocks[0] = paragraph('Hubo 98765 casos.');
    });
    const u = items(s)[0];
    const whole = applyVerdicts(s, [u], [{ id: u.id, verdict: 'added', replacement: '' }]);
    expect(sections(whole.summary)[0].blocks[0]).toEqual({ type: 'callout', kind: 'addedContext', text: 'Hubo 98765 casos.' });
    expect(sections(whole.summary)[0].blocks).toHaveLength(sections(s)[0].blocks.length);
    const stale = applyVerdicts(stored(), [u], [{ id: u.id, verdict: 'added', replacement: '' }]);
    expect(stale.labelled).toBe(0);
    expect(stale.summary.sections).toEqual(stored().sections);
  });
});

describe('a fixture (the evaluation’s lectures)', () => {
  const fixture = {
    lecture: { title: 'T', language: 'es', durationMs: 60_000, date: '2026-10-31', courseName: null, lectureNumber: null, professor: null },
    courseSettings: { subjectType: 'science', examFormat: null, summaryLanguage: null, sliders: null },
    transcript: [
      { startMs: 30_000, endMs: 90_000, text: 'dos' },
      { startMs: 0, endMs: 30_000, text: 'uno' },
    ],
    notes: [{ id: 'n1', tMs: 1000, text: 'nota', content: null }],
    marks: [{ id: 'k1', type: 'exam', level: 9, tMs: 2000, note: null }],
    assistant: [],
    media: [
      { id: 'ph', kind: 'photo', tMs: 5000, file: 'ph.jpg' },
      { id: 'sl', kind: 'slides', tMs: null, file: 'sl.pdf', name: 'Tema 1' },
    ],
  };

  it('read as the server reads a lecture; without request.json, the course’s sliders and everything ticked', () => {
    const { material, request } = fixtureInput(FixtureShape.parse(fixture));
    expect(material.segments.map((x) => x.text)).toEqual(['uno', 'dos']);
    expect(material.durationMs).toBe(90_000);
    expect(material.photos).toEqual([{ id: 'ph', tMs: 5000 }]);
    expect(material.slides).toEqual([{ id: 'sl', name: 'Tema 1' }]);
    expect(material.marks).toEqual([{ id: 'k1', type: 'exam', level: 9, tMs: 2000, note: null }]);
    expect(request).toEqual({ sliders: SLIDER_DEFAULTS, resources: { slides: true, photos: true, assistant: true } });
  });

  it('a file that isn’t the format is refused', () => {
    expect(FixtureShape.safeParse({ ...fixture, marks: [{ id: 'k1', type: 'other', level: 11, tMs: 0, note: null }] }).success).toBe(false);
  });
});

describe('step 8.2: data charts only from numbers in the lecture', () => {
  /** validSummary with its data chart's values replaced. */
  const withChart = (points: { x: string; y: number }[], more: { x: string; y: number }[] = []) =>
    stored((v) => {
      const chart = v.sections[1].blocks.find((b) => (b as { type: string }).type === 'dataChart') as unknown as { series: { name: string; points: { x: string; y: number }[] }[] };
      chart.series = [{ name: 's', points }, ...(more.length ? [{ name: 'otra', points: more }] : [])];
    });
  const chartOf = (s: StoredSummary) => sections(s)[1].blocks.find((b) => b.type === 'dataChart') as { series: { name: string; points: { x: string; y: number }[] }[] } | undefined;
  const src = sourcesOf(m);

  it('each value is a number for faithfulness, with its place and a line the verify call reads', () => {
    const s = withChart([{ x: '2019', y: 1 }, { x: '2020', y: 2 }, { x: '2021', y: 98765 }]);
    expect(chartValues(s).map((v) => [v.path.replace(/^sections\[1\]\.blocks\[\d+\]/, '…'), v.sentence])).toEqual([
      ['….series[0].points[0].y', 'Chart “t”: s, 2019: 1'],
      ['….series[0].points[1].y', 'Chart “t”: s, 2020: 2'],
      ['….series[0].points[2].y', 'Chart “t”: s, 2021: 98765'],
    ]);
    const f = faithfulness(s, src);
    expect(f.unverified.filter((u) => u.path.includes('.points['))).toEqual([expect.objectContaining({ kind: 'number', value: '98765', sentence: 'Chart “t”: s, 2021: 98765' })]);
    expect(runChecks(s, m, plan, { hasHighMarks: false }).charts).toEqual({ values: 3, removed: [], chartsRemoved: 0 });
  });

  it('a value not found nor confirmed: out of its chart, listed under unclear at the chart’s time; the rest kept', () => {
    const s = withChart([{ x: '2019', y: 1 }, { x: '2020', y: 2 }, { x: '2021', y: 98765 }]);
    const out = fixCharts(s, src, new Set());
    expect(chartOf(out.summary)!.series[0].points.map((p) => p.y)).toEqual([1, 2]);
    expect(out.removed).toEqual(['s, 2021: 98765']);
    expect(out.chartsRemoved).toBe(0);
    expect((out.summary.unclear as { timestamp: string; note: string }[]).at(-1)).toEqual({ timestamp: '12:00', note: "A value the lecture doesn't give, left out of the chart “t”: s, 2021: 98765" });
    // Confirmed by the verify call (found, or the number it corrected): kept.
    expect(fixCharts(s, src, new Set(['number:98765'])).removed).toEqual([]);
  });

  it('a chart left with fewer than 2 values goes, and so does one written with 1; a series left empty goes', () => {
    const one = fixCharts(withChart([{ x: '2019', y: 1 }, { x: '2020', y: 98765 }]), src, new Set());
    expect(chartOf(one.summary)).toBeUndefined();
    expect(one).toMatchObject({ removed: ['s, 2020: 98765'], chartsRemoved: 1 });
    const written = fixCharts(withChart([{ x: 'a', y: 1 }]), src, new Set());
    expect(chartOf(written.summary)).toBeUndefined();
    expect(written).toMatchObject({ removed: [], chartsRemoved: 1 });
    const series = fixCharts(withChart([{ x: 'a', y: 1 }, { x: 'b', y: 2 }], [{ x: 'a', y: 98765 }]), src, new Set());
    expect(chartOf(series.summary)!.series.map((x) => x.name)).toEqual(['s']);
  });

  it('nothing to take out: the summary as it was (the same object)', () => {
    const s = withChart([{ x: 'a', y: 1 }, { x: 'b', y: 2 }]);
    expect(fixCharts(s, src, new Set()).summary).toBe(s);
  });

  it('the verify call: "corrected" writes the lecture’s number (and confirms it), "added" is left to the chart fix', () => {
    const s = withChart([{ x: 'a', y: 1 }, { x: 'b', y: 98765 }, { x: 'c', y: 4321 }]);
    const items = faithfulness(s, src).unverified.filter((u) => u.path.includes('.points['));
    const done = applyVerdicts(s, items, [
      { id: items[0].id, verdict: 'corrected', replacement: '3' },
      { id: items[1].id, verdict: 'added', replacement: '' },
    ]);
    expect(chartOf(done.summary)!.series[0].points.map((p) => p.y)).toEqual([1, 3, 4321]);
    expect(done).toMatchObject({ corrected: 1, labelled: 0, confirmed: ['number:3'] });
    expect(fixCharts(done.summary, src, new Set(done.confirmed)).removed).toEqual(['s, c: 4321']);
  });
});

describe('step 8.2: the photos at their time', () => {
  const photoBlocks = (s: StoredSummary) => sections(s).map((x) => x.blocks.filter((b) => b.type === 'capturedImage').map((b) => [b.imageId, b.timestamp, b.caption]));

  it('a photo in another section’s time: moved to the end of its own, with its caption and its time', () => {
    // validSummary has p1 (12:40) in the section from 31:05.
    const s = stored();
    expect(photoBlocks(s)).toEqual([[], [['p1', '12:40', 'Fig. 1.1']]]);
    const out = fixPhotos(s, m);
    expect(out.fixed).toEqual(['p1']);
    expect(photoBlocks(out.summary)).toEqual([[['p1', '12:40', 'Fig. 1.1']], []]);
    expect(sections(out.summary)[0].blocks.at(-1)).toMatchObject({ type: 'capturedImage', imageId: 'p1' });
  });

  it('one given but not in the summary: added in its section, no caption; a second copy and an id not given left out', () => {
    const material = lectureMaterial({ photos: [{ id: 'p1', tMs: 12 * MIN + 40_000 }, { id: 'p2', tMs: 40 * MIN }] });
    const s = stored((v) => {
      v.sections[0].blocks.push({ type: 'capturedImage', imageId: 'p1', timestamp: '12:40', caption: '' } as never, { type: 'capturedImage', imageId: 'invented', timestamp: '1:00', caption: 'x' } as never);
    });
    const out = fixPhotos(s, material);
    expect(out.fixed.sort()).toEqual(['p1', 'p2']);
    expect(photoBlocks(out.summary)).toEqual([[['p1', '12:40', '']], [['p2', '40:00', '']]]);
  });

  it('each once in its section already: nothing changed (the same object); the report counts what is off', () => {
    const fine = fixPhotos(stored(), m).summary;
    expect(fixPhotos(fine, m)).toEqual({ summary: fine, fixed: [] });
    expect(runChecks(stored(), m, plan, { hasHighMarks: false, photos: true }).photos).toEqual({ pass: false, total: 1, misplaced: ['p1'], fixedByCode: [] });
    expect(runChecks(fine, m, plan, { hasHighMarks: false, photos: true }).photos).toMatchObject({ pass: true, misplaced: [] });
    // Photos not ticked: nothing asked of them.
    expect(runChecks(stored(), m, plan, { hasHighMarks: false }).photos).toEqual({ pass: true, total: 0, misplaced: [], fixedByCode: [] });
  });
});

describe('Lea, 6 Nov: graphs redrawn from photos', () => {
  type Pt = { x: string; y: number; approx?: boolean };
  /** A bar chart redrawn from `photo` (values not in the lecture), in section `at` (p1 is 12:40: section 0's). */
  const withPhotoChart = (o: { photo?: string; at?: number; points?: Pt[]; type?: string; more?: number } = {}) =>
    stored((v) => {
      const points = o.points ?? [{ x: '2019', y: 12 }, { x: '2020', y: 98765, approx: true }];
      const block =
        o.type === 'functionPlot'
          ? { type: 'functionPlot', expression: 'x^2', xRange: [-2, 2], mark: [], title: 'Parábola de la foto', fromPhoto: o.photo ?? 'p1' }
          : { type: 'dataChart', chart: 'bar', title: 'Leído de la foto', xLabel: 'Año', yLabel: 'M€', series: [{ name: 'Ventas', points }], timestamp: '12:40', fromPhoto: o.photo ?? 'p1' };
      for (let i = 0; i <= (o.more ?? 0); i++) v.sections[o.at ?? 0].blocks.push({ ...block, title: `${block.title}${i ? ` ${i}` : ''}` } as never);
    });
  const photoCharts = (s: StoredSummary) => sections(s).map((x) => x.blocks.filter((b) => b.fromPhoto).map((b) => String(b.title)));
  const src = sourcesOf(m);

  it('the calculator: from Visuals 5 (mid and high), never below', () => {
    const at = (visuals: number) => planFor(m, { ...REQUEST, sliders: { ...SLIDER_DEFAULTS, visuals } }, parseClassify(JSON.stringify({ subjectType: 'science', modules: [], topics: [], professorExamPhrases: [], repeatedConcepts: [] }))!).visualsFromPhotos;
    expect([1, 4, 5, 7, 8, 10].map(at)).toEqual([false, false, true, true, true, true]);
  });

  it('its values are read off the photo: not checked against the transcript (nor its title), and fixCharts leaves it', () => {
    const s = withPhotoChart();
    expect(chartValues(s, src.photos).some((v) => v.value === '98765')).toBe(false);
    expect(faithfulness(s, src).unverified.filter((u) => u.value === '98765' || u.path.includes(`blocks[${sections(s)[0].blocks.length - 1}]`))).toEqual([]);
    // (validSummary's own one-value chart goes; the photo's stays whole.)
    const left = sections(fixCharts(s, src, new Set()).summary)[0].blocks.at(-1)!;
    expect(left).toMatchObject({ fromPhoto: 'p1', series: [{ points: [{ y: 12 }, { y: 98765, approx: true }] }] });
    // Without the photos known (an older caller), it is an ordinary chart.
    expect(chartValues(s).some((v) => v.value === '98765')).toBe(true);
  });

  it('allowed and in its photo’s section: kept as it is (the same object), its ≈ values counted', () => {
    const s = withPhotoChart();
    const out = fixPhotoCharts(s, m, true);
    expect(out).toMatchObject({ kept: 1, approxValues: 1, removed: [], moved: [], cleared: [] });
    expect(out.summary).toBe(s);
    expect(runChecks(s, m, plan, { hasHighMarks: false, photos: true, photoCharts: true }).photoCharts).toEqual({ pass: true, kept: 1, approxValues: 1, removed: [], moved: [], cleared: [] });
  });

  it('below Visuals 5, or the photos not included: taken out', () => {
    const out = fixPhotoCharts(withPhotoChart(), m, false);
    expect(photoCharts(out.summary)).toEqual([[], []]);
    expect(out.removed).toEqual(['dataChart “Leído de la foto” (photo p1): graphs from photos need Visuals 5 or more and the photos included']);
    // The report's default: the photos ticked and the plan's Visuals (4 here).
    expect(runChecks(withPhotoChart(), m, plan, { hasHighMarks: false, photos: true }).photoCharts).toMatchObject({ pass: false, kept: 0, removed: [expect.stringContaining('Visuals 5')] });
  });

  it('naming a photo it wasn’t given: a data chart becomes an ordinary one (then the numbers rule), a function plot goes', () => {
    const out = fixPhotoCharts(withPhotoChart({ photo: 'invented' }), m, true);
    const chart = sections(out.summary)[0].blocks.find((b) => b.title === 'Leído de la foto')!;
    expect(chart.fromPhoto).toBe('');
    expect((chart.series as { points: Pt[] }[])[0].points).toEqual([{ x: '2019', y: 12 }, { x: '2020', y: 98765 }]);
    expect(out).toMatchObject({ kept: 0, cleared: ['dataChart “Leído de la foto” (photo invented)'], removed: [] });
    // Its values are checked again: 98765 isn't in the lecture.
    expect(faithfulness(withPhotoChart({ photo: 'invented' }), src).unverified.some((u) => u.value === '98765')).toBe(true);
    const fn = fixPhotoCharts(withPhotoChart({ photo: 'invented', type: 'functionPlot' }), m, true);
    expect(photoCharts(fn.summary)).toEqual([[], []]);
    expect(fn.removed).toEqual(['functionPlot “Parábola de la foto” (photo invented): not one of the photos given']);
  });

  it('a data chart from a photo with 1 value goes; a third one from the same photo goes', () => {
    const one = fixPhotoCharts(withPhotoChart({ points: [{ x: '2019', y: 12 }] }), m, true);
    expect(photoCharts(one.summary)).toEqual([[], []]);
    expect(one.removed).toEqual([expect.stringContaining('fewer than 2 values')]);
    const three = fixPhotoCharts(withPhotoChart({ more: 2 }), m, true);
    expect(photoCharts(three.summary)).toEqual([['Leído de la foto', 'Leído de la foto 1'], []]);
    expect(three.removed).toEqual(['dataChart “Leído de la foto 2” (photo p1): more than 2 graphs from one photo']);
  });

  it('in another section than its photo: moved to the photo’s, just before the photo when it is there', () => {
    // validSummary has p1 in section 1 (31:05) although it is 12:40: fixPhotos moves it after.
    const out = fixPhotoCharts(withPhotoChart({ at: 1 }), m, true);
    expect(photoCharts(out.summary)).toEqual([['Leído de la foto'], []]);
    expect(out.moved).toEqual(['dataChart “Leído de la foto” (photo p1)']);
    const placed = fixPhotos(out.summary, m).summary;
    expect(sections(placed)[0].blocks.slice(-2).map((b) => b.type)).toEqual(['dataChart', 'capturedImage']);
    // The photo already in its section: the chart goes just before it.
    const there = stored((v) => {
      v.sections[0].blocks.push({ type: 'capturedImage', imageId: 'p1', timestamp: '12:40', caption: '' } as never, paragraph('Después de la foto.'));
      v.sections[1].blocks.push({ type: 'dataChart', chart: 'bar', title: 'Leído', xLabel: '', yLabel: '', series: [{ name: 's', points: [{ x: 'a', y: 1 }, { x: 'b', y: 2 }] }], timestamp: '', fromPhoto: 'p1' } as never);
    });
    const moved = sections(fixPhotoCharts(there, m, true).summary)[0].blocks.map((b) => b.type).slice(-3);
    expect(moved).toEqual(['dataChart', 'capturedImage', 'paragraph']);
  });

  it('pie and scatter are data charts too; a value read between gridlines is marked approx', () => {
    for (const chart of ['pie', 'scatter']) {
      const checked = checkBlock('dataChart', { chart, title: '', xLabel: '', yLabel: '', series: [{ name: 's', points: [{ x: '1', y: 2, approx: true }] }], timestamp: '', fromPhoto: 'p1' }, '$');
      expect(checked.ok).toBe(true);
    }
    // Stored before (no fromPhoto, no approx): still valid.
    expect(checkBlock('dataChart', { chart: 'bar', title: '', xLabel: '', yLabel: '', series: [], timestamp: '' }, '$').ok).toBe(true);
    expect(checkBlock('functionPlot', { expression: 'x', xRange: [0, 1], mark: [], title: '' }, '$').ok).toBe(true);
  });

  it('the synthetic-chart fixture: the photo’s values are nowhere in the lecture, so only a graph read off the photo has them', () => {
    const { material, request } = fixtureInput(FixtureShape.parse(syntheticChartFixture()));
    const numbers = sourcesOf(material).numbers;
    expect(CHART_EXPECTED.values.filter((v) => numbers.has(v.y))).toEqual([]);
    expect(material.photos).toEqual([{ id: CHART_EXPECTED.photoId, tMs: CHART_EXPECTED.tMs }]);
    expect(request.resources.photos && request.sliders.visuals >= 5).toBe(true);
  });
});
