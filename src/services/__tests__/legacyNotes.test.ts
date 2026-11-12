/**
 * @jest-environment jsdom
 */
// An earlier note (legacy-note-v1) as the lecture's Summary tab.
import { Editor } from '@tiptap/core';

import { studiplyExtensions } from '../../editor/bridges';
import { LEGACY_NOTE_FORMAT, type LegacyNoteResult } from '../../lib/cloudRows';
import type { DocJSON } from '../../editor/types';
import { headingsFor, inline, legacyNoteToDoc, type LegacyAttachment } from '../legacyNotes/convert';
import { clarificationsOf, convertEarlierNote, type ConvertDeps } from '../legacyNotes/run';

type Json = { type: string; attrs?: Record<string, unknown>; content?: Json[]; text?: string; marks?: { type: string }[] };

const note = (over: Partial<LegacyNoteResult> = {}): LegacyNoteResult => ({
  format: LEGACY_NOTE_FORMAT,
  title: 'Tema 3: la sinapsis',
  summaryLevel: 'standard',
  recordingMode: 'lecture',
  summary: 'La **sinapsis** es la unión entre *dos* neuronas.\n\n## Tipos\n- Química\n- Eléctrica\n\n1. Llega el potencial\n2. Se liberan neurotransmisores',
  keyConcepts: [{ term: 'Sinapsis', explanation: 'unión funcional' }, { term: 'Axón' }],
  formulas: [
    { name: 'Ecuación de Nernst', expression: 'E = \\frac{RT}{zF} \\ln \\frac{[X]_o}{[X]_i}', description: 'El potencial de equilibrio.' },
    { name: 'Rota', expression: '\\frac{a' },
  ],
  definitions: [{ term: 'Neurona', definition: 'Célula del sistema nervioso.' }],
  tags: ['psicobiología', 'tema 3'],
  unclearParts: [{ excerpt: 'el canal de… algo', reason: 'Se oye mal en la grabación.' }],
  manualAnnotations: JSON.stringify({ clarifications: [{ highlightedParts: ['potencial de acción'], response: 'Un cambio rápido del voltaje de la membrana.', createdAt: '2026-10-01T10:00:00Z' }] }),
  isConfirmed: true,
  blocks: { summary: { origin: 'ai', editedAt: '2026-10-01T09:00:00.000Z', device: 'd1' } },
  ...over,
});
const attachments: LegacyAttachment[] = [
  { id: 'm-photo', kind: 'photo' },
  { id: 'm-pdf', kind: 'pdf', name: 'Tema 3.pdf' },
];
const convert = (over: Partial<LegacyNoteResult> = {}, language: string | null = 'es', att = attachments) => {
  const n = note(over);
  return legacyNoteToDoc({ note: n, clarifications: clarificationsOf(n), attachments: att, language }).content as Json[];
};
const text = (b: Json): string => (b.text ?? '') + (b.content ?? []).map(text).join('');
const find = (blocks: Json[], type: string, attr?: [string, unknown]) => blocks.filter((b) => b.type === type && (!attr || b.attrs?.[attr[0]] === attr[1]));

describe('an earlier note as the Summary tab', () => {
  it('title, summary (paragraphs, heading, lists, bold and italic) in order', () => {
    const blocks = convert();
    expect(blocks[0]).toMatchObject({ type: 'title', content: [{ type: 'text', text: 'Tema 3: la sinapsis' }] });
    expect(blocks[1].content).toEqual([
      { type: 'text', text: 'La ' },
      { type: 'text', text: 'sinapsis', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' es la unión entre ' },
      { type: 'text', text: 'dos', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' neuronas.' },
    ]);
    expect(blocks[2]).toMatchObject({ type: 'heading', attrs: { level: 2 }, content: [{ text: 'Tipos' }] });
    expect(blocks[3].type).toBe('bulletList');
    expect(blocks[3].content!.map(text)).toEqual(['Química', 'Eléctrica']);
    expect(blocks[4].type).toBe('orderedList');
    expect(blocks[4].content).toHaveLength(2);
  });

  it('section headings in the lecture’s language (English when there are none for it)', () => {
    const es = find(convert(), 'heading').map(text);
    expect(es).toEqual(['Tipos', 'Conceptos clave', 'Fórmulas', 'Definiciones', 'Partes poco claras', 'Aclaraciones', 'Adjuntos']);
    expect(find(convert({}, 'en-GB'), 'heading').map(text)).toContain('Key concepts');
    expect(headingsFor('xx')).toEqual(headingsFor('en'));
    expect(headingsFor(null).attachments).toBe('Attachments');
  });

  it('key concepts: the term in bold — its explanation', () => {
    const list = convert().find((b) => b.type === 'bulletList' && text(b).startsWith('Sinapsis'))!;
    expect(list.content![0].content![0].content).toEqual([
      { type: 'text', text: 'Sinapsis', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' — unión funcional' },
    ]);
    expect(text(list.content![1])).toBe('Axón');
  });

  it('formulas: a display formula KaTeX can draw, else the expression as text', () => {
    const blocks = convert();
    expect(find(blocks, 'blockMath')).toHaveLength(1);
    expect(find(blocks, 'blockMath')[0].attrs?.latex).toContain('\\frac{RT}{zF}');
    expect(blocks.some((b) => b.type === 'paragraph' && text(b) === '\\frac{a')).toBe(true);
    expect(blocks.some((b) => text(b) === 'El potencial de equilibrio.')).toBe(true);
  });

  it('definitions are Definition callouts; unclear parts a quote and the reason', () => {
    const blocks = convert();
    const def = find(blocks, 'callout', ['kind', 'definition']);
    expect(def).toHaveLength(1);
    expect(def[0].content!.map(text)).toEqual(['Neurona', 'Célula del sistema nervioso.']);
    const quoteAt = blocks.findIndex((b) => b.type === 'blockquote' && text(b) === 'el canal de… algo');
    expect(quoteAt).toBeGreaterThan(0);
    expect(text(blocks[quoteAt + 1])).toBe('Se oye mal en la grabación.');
  });

  it('highlights: the words as a quote, the answer in an Added context callout', () => {
    const blocks = convert();
    const at = blocks.findIndex((b) => b.type === 'blockquote' && text(b) === 'potencial de acción');
    expect(at).toBeGreaterThan(0);
    expect(blocks[at + 1]).toMatchObject({ type: 'callout', attrs: { kind: 'addedContext' } });
    expect(text(blocks[at + 1])).toBe('Un cambio rápido del voltaje de la membrana.');
  });

  it('tags as a last line; attachments: the photo shown (media:<id>, the same file), the PDF by name', () => {
    const blocks = convert();
    expect(blocks.some((b) => text(b) === 'Etiquetas: psicobiología, tema 3')).toBe(true);
    const at = blocks.findIndex((b) => b.type === 'heading' && text(b) === 'Adjuntos');
    expect(blocks[at + 1]).toMatchObject({ type: 'image', attrs: { src: 'media:m-photo', origin: 'media' } });
    expect(text(blocks[at + 2])).toBe('PDF: Tema 3.pdf');
    expect(convert({}, 'es', []).some((b) => text(b) === 'Adjuntos')).toBe(false);
  });

  it('each block keeps its section’s origin and time; without one, the student’s', () => {
    const blocks = convert();
    const summary = blocks[1];
    expect(summary.attrs).toMatchObject({ origin: 'ai', editedAt: Date.parse('2026-10-01T09:00:00.000Z') });
    expect(blocks[0].attrs).toMatchObject({ origin: 'student', editedAt: null });
    expect(find(blocks, 'callout', ['kind', 'definition'])[0].attrs?.origin).toBe('student');
  });

  it('the same note gives the same document (ids from section and place, all different)', () => {
    expect(convert()).toEqual(convert());
    const ids = convert().map((b) => b.attrs?.blockId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => typeof id === 'string' && id.startsWith('legacy-'))).toBe(true);
  });

  it('loose old JSON doesn’t break it; an empty note is one empty line', () => {
    const loose = convert({ keyConcepts: 'x' as never, formulas: [null, 3, { name: '' }] as never, definitions: [['a']] as never, tags: [1, '', 'ok'] as never, unclearParts: [{ reason: 'no excerpt' }] as never, manualAnnotations: '{not json' });
    expect(loose.some((b) => text(b) === 'Etiquetas: 1, ok')).toBe(true);
    expect(loose.some((b) => text(b) === 'Partes poco claras')).toBe(false);
    const empty = legacyNoteToDoc({ note: note({ title: '', summary: null, keyConcepts: [], formulas: [], definitions: [], tags: [], unclearParts: [], manualAnnotations: null }), clarifications: [], attachments: [], language: 'es' });
    expect(empty.content).toHaveLength(1);
    expect((empty.content as Json[])[0].type).toBe('paragraph');
  });

  it('inline marks: plain text stays plain; an unmatched star is kept', () => {
    expect(inline('2 * 3 = 6')).toEqual([{ type: 'text', text: '2 * 3 = 6' }]);
    expect(inline('_sí_ y no')).toEqual([{ type: 'text', text: 'sí', marks: [{ type: 'italic' }] }, { type: 'text', text: ' y no' }]);
  });

  it('the editor takes it as it is: every block, callout and formula kept', () => {
    const doc = legacyNoteToDoc({ note: note(), clarifications: clarificationsOf(note()), attachments, language: 'es' });
    const editor = new Editor({ extensions: studiplyExtensions(), content: doc });
    const back = editor.getJSON() as DocJSON;
    editor.destroy();
    const types = (d: DocJSON) => (d.content as Json[]).map((b) => [b.type, b.attrs?.kind ?? null, b.attrs?.blockId, b.attrs?.origin]);
    expect(types(back)).toEqual(types(doc));
  });
});

describe('when it runs', () => {
  const make = (over: Partial<ConvertDeps> = {}) => {
    const saved: DocJSON[] = [];
    let exists = false;
    const result = Object.freeze(note());
    const deps: ConvertDeps = {
      summaryExists: async () => exists,
      latestNote: async () => ({ id: 's1', result }),
      attachments: async () => attachments,
      language: async () => 'es',
      save: async (_id, doc) => {
        saved.push(doc);
        exists = true;
      },
      ...over,
    };
    return { deps, saved, result, setExists: (v: boolean) => (exists = v) };
  };

  it('converts when the Summary tab has no document, once', async () => {
    const t = make();
    expect(await convertEarlierNote('L1', t.deps)).toBe('converted');
    expect(t.saved).toHaveLength(1);
    expect(await convertEarlierNote('L1', t.deps)).toBe('exists');
    expect(t.saved).toHaveLength(1);
  });

  it('never over a document that is there (converted before, or the student’s)', async () => {
    const t = make();
    t.setExists(true);
    expect(await convertEarlierNote('L1', t.deps)).toBe('exists');
    expect(t.saved).toHaveLength(0);
  });

  it('a note generated again after the tab exists doesn’t reach it', async () => {
    const t = make();
    await convertEarlierNote('L1', t.deps);
    const first = JSON.stringify(t.saved[0]);
    t.deps.latestNote = async () => ({ id: 's2', result: note({ summary: 'Un resumen nuevo, generado otra vez.' }) });
    expect(await convertEarlierNote('L1', t.deps)).toBe('exists');
    expect(t.saved).toHaveLength(1);
    expect(JSON.stringify(t.saved[0])).toBe(first);
    expect(first).not.toContain('generado otra vez');
  });

  it('no note: nothing written', async () => {
    const t = make({ latestNote: async () => null });
    expect(await convertEarlierNote('L1', t.deps)).toBe('none');
    expect(t.saved).toHaveLength(0);
  });

  it('the old note is only read (left as it was)', async () => {
    const t = make();
    const before = JSON.stringify(t.result);
    await convertEarlierNote('L1', t.deps);
    expect(JSON.stringify(t.result)).toBe(before);
  });

  it('made meanwhile on the other device: not written again', async () => {
    let asks = 0;
    const t = make({ summaryExists: async () => ++asks > 1 });
    expect(await convertEarlierNote('L1', t.deps)).toBe('exists');
    expect(t.saved).toHaveLength(0);
  });

  it('a failure (e.g. the files can’t be read now) writes nothing; the next opening tries again', async () => {
    const t = make({ attachments: async () => Promise.reject(new Error('offline')) });
    await expect(convertEarlierNote('L1', t.deps)).rejects.toThrow('offline');
    expect(t.saved).toHaveLength(0);
    t.deps.attachments = async () => attachments;
    expect(await convertEarlierNote('L1', t.deps)).toBe('converted');
  });

  it('highlights are read from the note’s annotations (loose JSON gives none)', () => {
    expect(clarificationsOf(note())).toEqual([{ highlightedParts: ['potencial de acción'], response: 'Un cambio rápido del voltaje de la membrana.' }]);
    expect(clarificationsOf(note({ manualAnnotations: 'nope' }))).toEqual([]);
    expect(clarificationsOf(note({ manualAnnotations: JSON.stringify({ clarifications: [null, { response: 3 }] }) }))).toEqual([{ highlightedParts: [], response: '' }]);
  });
});
