/**
 * @jest-environment jsdom
 */
// Cancel recording (Lea, 6 Nov), recorded inside a document: My notes keeps every word; only this
// recording's time chips go (with the space after them) and its mark chips become words. Earlier chips
// stay. The same in saved JSON (unstampDoc) and in the open editor (the `unstamp` command).
import { Editor, type JSONContent } from '@tiptap/core';

import { studiplyExtensions } from '../bridges';
import { markWords, unstampDoc } from '../discardRecording';
import { runFormat } from '../format';
import type { DocJSON } from '../types';

const ts = (ms: number): JSONContent => ({ type: 'timestampChip', attrs: { ms } });
const t = (text: string): JSONContent => ({ type: 'text', text });
const mark = (kind: string, level: number, ms: number, note: string | null = null, markId: string | null = `m-${ms}`): JSONContent => ({
  type: 'markChip',
  attrs: { kind, level, markId, ms, note },
});
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const doc = (...content: JSONContent[]): DocJSON => ({ type: 'doc', content }) as DocJSON;

/** A block's inline nodes: text, @ms for a time chip, [kind level] for a mark chip. */
const inline = (block: JSONContent | undefined) =>
  (block?.content ?? []).map((n) => (n.type === 'text' ? n.text : n.type === 'timestampChip' ? `@${n.attrs?.ms}` : n.type === 'markChip' ? `[${n.attrs?.kind} ${n.attrs?.level}]` : n.type));

const notes = doc(
  p(t('Written before the recording')),
  p(ts(30_000), t(' Primera línea de la grabación anterior')),
  p(ts(125_000), t(' Línea de esta grabación '), mark('exam', 9, 130_000, 'entra seguro')),
  p(ts(140_000), t(' '), mark('confused', 7, 140_000)),
  { type: 'bulletList', content: [{ type: 'listItem', content: [p(ts(150_000), t(' En una lista'))] }] },
  p(t('Una marca puesta a mano '), mark('important', 5, 0, null, null)),
);

describe('unstampDoc', () => {
  it('this recording’s time chips go with their space; its marks become words; the rest is untouched', () => {
    const out = unstampDoc(notes, 120_000);
    const blocks = out.content as JSONContent[];
    expect(inline(blocks[0])).toEqual(['Written before the recording']);
    // An earlier recording's line keeps its time.
    expect(inline(blocks[1])).toEqual(['@30000', ' Primera línea de la grabación anterior']);
    expect(inline(blocks[2])).toEqual(['Línea de esta grabación ', 'Exam 9/10 · entra seguro']);
    expect(inline(blocks[3])).toEqual(['Confused 7/10']);
    expect(inline(blocks[4].content?.[0].content?.[0])).toEqual(['En una lista']);
    // A chip put in by hand (no mark id) isn't a recording's mark.
    expect(inline(blocks[5])).toEqual(['Una marca puesta a mano ', '[important 5]']);
  });

  it('from 0 (a document that became a lecture): every stamp and every linked mark', () => {
    const blocks = unstampDoc(notes, 0).content as JSONContent[];
    expect(inline(blocks[1])).toEqual(['Primera línea de la grabación anterior']);
    expect(inline(blocks[2])).toEqual(['Línea de esta grabación ', 'Exam 9/10 · entra seguro']);
  });

  it('nothing of this recording: the same document (nothing saved)', () => {
    const plain = doc(p(t('Notas')), p(ts(10_000), t(' antes')));
    expect(unstampDoc(plain, 60_000)).toBe(plain);
  });

  it('a mark’s words', () => {
    expect(markWords({ kind: 'important', level: 8, note: null })).toBe('Important 8/10');
    expect(markWords({ kind: 'exam', level: 9, note: '  capítulo 3  ' })).toBe('Exam 9/10 · capítulo 3');
  });
});

describe('the open editor (format command `unstamp`)', () => {
  let editor: Editor;
  afterEach(() => editor?.destroy());

  it('does the same in one step, and Undo brings it all back', () => {
    editor = new Editor({ extensions: studiplyExtensions(), content: notes as JSONContent });
    const before = editor.getJSON();
    expect(runFormat(editor, { type: 'unstamp', fromMs: 120_000 })).toBe(true);
    const blocks = editor.getJSON().content ?? [];
    expect(inline(blocks[1])).toEqual(['@30000', ' Primera línea de la grabación anterior']);
    expect(inline(blocks[2])).toEqual(['Línea de esta grabación Exam 9/10 · entra seguro']);
    expect(inline(blocks[3])).toEqual(['Confused 7/10']);
    expect(inline((blocks[4] as JSONContent).content?.[0].content?.[0])).toEqual(['En una lista']);
    expect(inline(blocks[5])).toEqual(['Una marca puesta a mano ', '[important 5]']);
    // The same words as the saved JSON's.
    expect(editor.state.doc.textContent).toBe(editor.schema.nodeFromJSON(unstampDoc(notes, 120_000) as JSONContent).textContent);
    editor.commands.undo();
    // The blocks' own ids and edit times are given by the editor; the content is what came back.
    const content = (j: JSONContent): unknown => JSON.parse(JSON.stringify(j, (k, v) => (k === 'blockId' || k === 'editedAt' ? undefined : v)));
    expect(content(editor.getJSON())).toEqual(content(before));
  });

  it('nothing to take off: false, nothing changes', () => {
    editor = new Editor({ extensions: studiplyExtensions(), content: doc(p(t('Notas'))) as JSONContent });
    expect(runFormat(editor, { type: 'unstamp', fromMs: 0 })).toBe(false);
  });
});
