// A lecture's My notes as note_lines rows: every line with
// something in it, its recording time (or none), its text without the chip,
// its JSON (formatting kept), list items by "<list id>#n".
import { noteLinesOf } from '../noteLines';
import type { DocJSON } from '../types';

const chip = (ms: number) => ({ type: 'timestampChip', attrs: { ms } });
const text = (t: string, marks?: { type: string }[]) => ({ type: 'text', text: t, ...(marks && { marks }) });
const para = (blockId: string, content: unknown[]) => ({ type: 'paragraph', attrs: { blockId }, content });
const item = (content: unknown[]) => ({ type: 'listItem', content });

const doc = {
  type: 'doc',
  content: [
    para('p0', [text('Before the recording')]),
    para('p1', [chip(4000), text(' Def: '), text('conducta', [{ type: 'bold' }])]),
    para('empty', []),
    para('chipOnly', [chip(5000), text(' ')]),
    { type: 'heading', attrs: { blockId: 'h1', level: 2 }, content: [chip(6000), text(' Tema 2')] },
    {
      type: 'bulletList',
      attrs: { blockId: 'l1' },
      content: [
        item([{ type: 'paragraph', content: [chip(7000), text(' first')] }]),
        item([
          { type: 'paragraph', content: [text('second, no time')] },
          { type: 'bulletList', content: [item([{ type: 'paragraph', content: [chip(8000), text(' nested')] }])] },
        ]),
      ],
    },
    { type: 'table', attrs: { blockId: 't1' }, content: [] },
    { type: 'paragraph', content: [text('no id')] },
  ],
} as unknown as DocJSON;

describe('note_lines from My notes', () => {
  it('every line with something in it, in order, with its time and its text without the chip', () => {
    expect(noteLinesOf(doc).map((l) => [l.position, l.block_id, l.t_ms, l.text])).toEqual([
      [0, 'p0', null, 'Before the recording'],
      [1, 'p1', 4000, 'Def: conducta'],
      [2, 'h1', 6000, 'Tema 2'],
      [3, 'l1#0', 7000, 'first'],
      [4, 'l1#1', null, 'second, no time'],
      [5, 'l1#1.0', 8000, 'nested'],
    ]);
  });

  it('keeps the line as JSON, so its formatting (bold) and its chip are kept', () => {
    const line = noteLinesOf(doc).find((l) => l.block_id === 'p1')!;
    expect(line.content).toEqual(para('p1', [chip(4000), text(' Def: '), text('conducta', [{ type: 'bold' }])]));
  });

  it('an empty document has no lines', () => {
    expect(noteLinesOf({ type: 'doc', content: [] } as unknown as DocJSON)).toEqual([]);
  });
});
