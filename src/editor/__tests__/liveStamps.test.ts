/**
 * @jest-environment jsdom
 */
// Step 5.4: live notes. While the lecture records, a line's first character
// puts the recording time in front of it (a timestamp chip); earlier lines,
// stamped lines and empty lines get none; "- " and "# " still work on a
// stamped line; paste stamps each new line; Undo takes the stamp away.
import { Editor } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';

import { studiplyExtensions } from '../bridges';
import { setRecordingClock } from '../schema/liveStamps';
import { CHIP_TAP, TIMESTAMP_CHIP } from '../schema/timestampChip';

let editor: Editor;
let now: number | null = null;
afterEach(() => editor?.destroy());

const open = (paragraphs: string[] = ['']) => {
  editor = new Editor({
    extensions: studiplyExtensions(),
    content: {
      type: 'doc',
      content: paragraphs.map((text, i) => ({ type: 'paragraph', attrs: { blockId: `b${i}` }, content: text ? [{ type: 'text', text }] : [] })),
    },
  });
  setRecordingClock(editor, () => now);
  editor.commands.focus('end');
};
// Typing as the keyboard does: each character through the text handlers, else inserted.
const type = (text: string) => {
  for (const ch of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp('handleTextInput', (f) => f(editor.view, from, to, ch, () => editor.state.tr.insertText(ch, from, to)));
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
  }
};
const enter = () => editor.commands.enter();
/** Each block as "[4:12] text", a chip shown by its time in seconds. */
const lines = () =>
  (editor.getJSON().content ?? []).map((b) => {
    const show = (node: { type?: string; attrs?: Record<string, unknown>; text?: string; content?: unknown[] }): string =>
      node.type === TIMESTAMP_CHIP ? `[${Number(node.attrs?.ms) / 1000}]` : node.type === 'text' ? (node.text ?? '') : ((node.content ?? []) as never[]).map(show).join('');
    return `${b.type}: ${show(b as never)}`;
  });

describe('live notes: stamping lines while recording', () => {
  it('the first character of an empty line puts the recording time in front of it', () => {
    open();
    now = 4000;
    type('Def');
    now = 9000;
    type(' and more');
    expect(lines()).toEqual(['paragraph: [4] Def and more']);
  });

  it('each new line gets its own time; empty lines get none', () => {
    open();
    now = 1000;
    type('One');
    enter();
    enter();
    now = 12500;
    type('Two');
    expect(lines()).toEqual(['paragraph: [1] One', 'paragraph: ', 'paragraph: [12.5] Two']);
  });

  it('no stamp before Start, after Stop, or on a line written earlier', () => {
    open(['Written before']);
    now = null;
    enter();
    type('Not recording');
    now = 3000;
    editor.commands.focus('start');
    type('x');
    setRecordingClock(editor, null);
    editor.commands.focus('end');
    enter();
    type('After stop');
    expect(lines()).toEqual(['paragraph: xWritten before', 'paragraph: Not recording', 'paragraph: After stop']);
  });

  it('a stamped line keeps its time when edited', () => {
    open();
    now = 2000;
    type('Line');
    now = 60000;
    editor.commands.focus('end');
    type('!');
    expect(lines()).toEqual(['paragraph: [2] Line!']);
  });

  it('"- " and "# " still make a list and a heading, the stamp kept inside', () => {
    open();
    now = 5000;
    type('- item');
    enter();
    now = 7000;
    type('next');
    expect(editor.getJSON().content?.[0].type).toBe('bulletList');
    expect(lines()).toEqual(['bulletList: [5] item[7] next']);
    editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] });
    editor.commands.focus('end');
    now = 8000;
    type('# Title');
    expect(lines()).toEqual(['heading: [8] Title']);
  });

  it('Undo right after takes the stamp away with the character', () => {
    open();
    now = 4000;
    type('A');
    editor.commands.undo();
    expect(lines()).toEqual(['paragraph: ']);
  });

  it('a tap on a chip counts every time, also on the chip already selected (it plays again)', () => {
    open();
    now = 4000;
    type('Line');
    const taps: number[] = [];
    editor.on('transaction', ({ transaction }) => {
      const tap = transaction.getMeta(CHIP_TAP) as { ms: number; n: number } | undefined;
      if (tap) taps.push(tap.n * 100000 + tap.ms);
    });
    const chipPos = 1;
    const chip = editor.state.doc.nodeAt(chipPos)!;
    const tapIt = () =>
      editor.view.someProp('handleClickOn', (f) => f(editor.view, chipPos, chip, chipPos, new MouseEvent('click'), true));
    tapIt();
    editor.commands.setNodeSelection(chipPos);
    tapIt();
    expect(taps).toEqual([100000 + 4000, 200000 + 4000]);
  });

  it('a paste of several lines stamps each new one with the paste’s time; the first joins a line with text unstamped', () => {
    const paste = () => {
      const { schema } = editor;
      const slice = new Slice(Fragment.from([schema.nodes.paragraph.create(null, schema.text('first')), schema.nodes.paragraph.create(null, schema.text('second'))]), 1, 1);
      return editor.view.someProp('transformPasted', (f) => f(slice, editor.view, false)) as Slice;
    };
    open();
    now = 30000;
    const intoEmpty = paste();
    const shown = (s: Slice) => s.content.content.map((p) => (p.firstChild?.type.name === TIMESTAMP_CHIP ? `[${p.firstChild.attrs.ms / 1000}]` : '') + p.textContent);
    expect(shown(intoEmpty)).toEqual(['[30] first', '[30] second']);
    editor.destroy();
    open(['some text']);
    now = 31000;
    expect(shown(paste())).toEqual(['first', '[31] second']);
  });
});
