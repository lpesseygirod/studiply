/**
 * Test material for summaries: a summary as Claude answers it (every block type once, the spec's shape)
 * and a small Spanish lecture to summarize (notes with formatting, the three kinds of mark, a photo
 * and a question to the assistant).
 */
import type { LectureMaterial } from '../../supabase/functions/_shared/summary-pipeline';

const block = <T extends string>(type: T, rest: Record<string, unknown>) => ({ type, ...rest });

/** A full answer in the summary schema (a fresh copy each time). */
export function validSummary() {
  return {
    subjectType: 'science' as const,
    modulesUsed: ['process', 'conceptMap'],
    title: 'La Psicobiología',
    takeaways: [
      { text: 'La Psicobiología estudia la conducta como proceso biológico.', fromMarkIds: ['m-imp'] },
      { text: 'Responde a cinco preguntas.', fromMarkIds: [] },
      { text: 'La conducta es adaptativa.', fromMarkIds: [] },
      { text: 'Integra psicología y neurociencia.', fromMarkIds: [] },
    ],
    sections: [
      {
        heading: 'Qué estudia',
        timestamp: '0:00',
        cueQuestion: '¿Qué estudia la Psicobiología?',
        markChips: [
          { markId: 'm-imp', type: 'important', level: 8 },
          { markId: 'm-conf', type: 'confused', level: 9 },
          { markId: 'm-exam', type: 'exam', level: 9 },
          { markId: 'ghost', type: 'exam', level: 5 },
        ],
        blocks: [
          block('paragraph', { text: 'La **conducta** es un proceso biológico.', keyTerms: ['conducta'] }),
          block('callout', { kind: 'definition', text: 'Conducta: lo que hace un ser vivo.' }),
          block('fromNotes', { noteIds: ['n1', 'n2', 'nope'], t: '4:12' }),
          block('confusedHere', { markId: 'm-conf', level: 9, t: '18:30', explanation: 'Filogenia es la historia evolutiva.', steps: ['Uno', 'Dos'], example: 'Las aves.', practiceQuestion: '¿Qué es la filogenia?' }),
          block('formula', { latex: 'E = mc^2', variables: [{ symbol: 'E', meaning: 'energía' }], whenToUse: 'Nunca en biología.' }),
          block('workedExample', { problem: 'p', steps: [{ do: 'a', why: 'b' }], answer: 'c' }),
          block('timeline', { events: [{ date: '1900', title: 't', detail: 'd', importance: 'i' }] }),
          block('causeEffect', { causes: ['c'], event: 'e', effects: ['f'] }),
          block('keyFigures', { people: [{ name: 'Darwin', role: 'naturalista', did: 'evolución', why: 'base' }] }),
          block('comparison', { items: ['a', 'b'], criteria: [{ name: 'n', values: ['1', '2'] }] }),
          block('conceptMap', { center: 'conducta', links: [{ from: 'a', to: 'b', label: 'l' }] }),
        ],
      },
      {
        heading: 'Las cinco preguntas',
        timestamp: '31:05',
        cueQuestion: '¿Cuáles son?',
        markChips: [],
        blocks: [
          block('fromNotes', { noteIds: ['n1', 'n3'], t: '31:05' }),
          block('process', { steps: [{ name: 's', input: 'i', output: 'o' }] }),
          block('framework', { name: 'SWOT', cells: [{ label: 'S', content: 'c' }] }),
          block('theoryCard', { author: 'Tinbergen', year: 1963, claim: 'c', method: 'm', finding: 'f', critique: 'k' }),
          block('caseCard', { facts: 'f', question: 'q', decision: 'd', reasoning: 'r', lesson: 'l' }),
          block('argument', { claim: 'c', premises: ['p'], objections: [{ objection: 'o', reply: 'r' }] }),
          block('code', { language: 'c', code: 'int x;', output: '' }),
          block('vocabulary', { entries: [{ term: 't', meaning: 'm', example: 'e' }] }),
          block('functionPlot', { expression: 'x^2 - 4', xRange: [-5, 5], mark: ['roots'], title: 't' }),
          block('modelGraph', { template: 'supplyDemand', shifts: [{ curve: 'D', direction: 'right' }], title: 't' }),
          block('dataChart', { chart: 'bar', title: 't', xLabel: 'x', yLabel: 'y', series: [{ name: 's', points: [{ x: 'a', y: 1 }] }], timestamp: '12:00' }),
          block('capturedImage', { imageId: 'p1', timestamp: '12:40', caption: 'Fig. 1.1' }),
        ],
      },
    ],
    glossary: [{ term: 'Conducta', definition: 'Lo que hace un ser vivo.' }],
    examSignals: [
      { text: 'Las cinco preguntas', timestamp: '31:05', source: 'professor' as const, markId: '', level: 0 },
      { text: 'Fig. 1.1', timestamp: '6:40', source: 'studentMark' as const, markId: 'm-exam', level: 9 },
    ],
    questionsDuringClass: [{ t: '34:20', question: 'Explícame los últimos 10 minutos', shortAnswer: 'Las cinco preguntas.' }],
    selfTest: [
      { question: '¿Qué estudia?', kind: 'recall' as const, answer: 'La conducta.', fromMarkId: 'm-imp' },
      { question: '¿Por qué?', kind: 'why' as const, answer: 'Porque…', fromMarkId: 'm-exam' },
      { question: '¿Quién?', kind: 'recall' as const, answer: 'x', fromMarkId: 'ghost' },
    ],
    flashcards: [{ front: 'Fig. 1.1', back: 'Las cinco preguntas' }],
    logistics: ['Leer el tema 1'],
    unclear: [{ timestamp: '22:10', note: 'Ruido' }],
  };
}

/** The same answer as Claude writes it since the fallback shape: each block { type, data } with its fields as JSON. */
export function packedSummary(summary = validSummary()) {
  return {
    ...summary,
    sections: summary.sections.map((s) => ({
      ...s,
      blocks: s.blocks.map(({ type, ...fields }) => ({ type, data: JSON.stringify(fields) })),
    })),
  };
}

const MIN = 60_000;

/** A 40-minute Spanish lecture with everything the summary reads. */
export function lectureMaterial(over: Partial<LectureMaterial> = {}): LectureMaterial {
  return {
    lectureId: 'lec-1',
    title: 'Tema 1',
    courseName: 'Psicobiología',
    lectureNumber: 1,
    date: '2026-10-30',
    professor: 'Dra. Ruiz',
    language: 'es',
    summaryLanguage: null,
    subjectType: 'science',
    examFormat: 'multiple_choice',
    durationMs: 40 * MIN,
    segments: Array.from({ length: 80 }, (_, i) => ({ startMs: i * 30_000, endMs: (i + 1) * 30_000, text: `La conducta humana es biológica, parte ${i}.` })),
    notes: [
      { id: 'n1', tMs: 4 * MIN + 12_000, text: 'Def: estudia la conducta', content: { type: 'paragraph', attrs: { blockId: 'n1' }, content: [{ type: 'text', text: 'Def:', marks: [{ type: 'bold' }] }, { type: 'text', text: ' estudia la conducta' }] } },
      { id: 'n2', tMs: 18 * MIN, text: 'E = mc2', content: { type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex: 'E = mc^2' } }] } },
      { id: 'n3', tMs: null, text: 'Leer el tema', content: { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Leer el tema' }] } },
    ],
    marks: [
      { id: 'm-imp', type: 'important', level: 8, tMs: 31 * MIN, note: null },
      { id: 'm-conf', type: 'confused', level: 9, tMs: 18 * MIN + 30_000, note: 'filogenético??' },
      { id: 'm-exam', type: 'exam', level: 9, tMs: 6 * MIN + 40_000, note: 'Fig. 1.1' },
    ],
    questions: [{ id: 'q1', askedAtMs: 34 * MIN + 20_000, windowStartMs: 24 * MIN, windowEndMs: 34 * MIN, question: 'Explícame los últimos 10 minutos', answer: 'Las cinco preguntas.' }],
    photos: [{ id: 'p1', tMs: 12 * MIN + 40_000 }],
    slides: [],
    ...over,
  };
}
