/**
 * @jest-environment jsdom
 */
// Step 5.5: a mark made while recording goes into My notes as a linked chip
// (its mark id, time and note): at the end of the line the student was
// writing; on a new last line with its time when they hadn't been in the
// notes (an empty last line is used); an empty line gets the time first.
// Changing its level and note from its panel, removing it, and putting it
// back where it was (Undo); in HTML too; and the same line saved from
// outside the editor (the laptop's strip on another screen).
import { Editor, type JSONContent } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';

import { studiplyExtensions } from '../bridges';
import { formatState, linkedMarkOf, runFormat } from '../format';
import { withMarkLine, type LinkedMark } from '../schema/markChip';

let editor: Editor;
afterEach(() => editor?.destroy());
const p = (text: string): JSONContent => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
const open = (content: JSONContent[]) => {
  editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content } });
};
const blocks = (): JSONContent[] => editor.getJSON().content ?? [];
const inline = (i: number) => (blocks()[i].content ?? []).map((n) => n.text ?? `${n.type}${n.attrs?.ms !== undefined && n.type === 'timestampChip' ? `@${n.attrs.ms}` : ''}`);
const M = (over: Partial<LinkedMark> = {}): LinkedMark => ({ markId: 'm-1', kind: 'confused', level: 7, ms: 754_000, note: null, ...over });
const place = (mark: LinkedMark, at?: { blockId: string | null; offset: number }) => runFormat(editor, { type: 'markChip', action: 'place', mark, at });
const selectChip = () => {
  let at = -1;
  editor.state.doc.descendants((n, pos) => {
    if (n.type.name === 'markChip' && at < 0) at = pos;
  });
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, at)));
};
/** The student clicks into the notes (the editor's focus event). */
const touch = () => editor.view.dom.dispatchEvent(new FocusEvent('focus'));

describe('marks made while recording', () => {
  it('not in the notes yet: a new last line with its time, then the chip', () => {
    open([p('Tema 3: sinapsis')]);
    place(M());
    expect(blocks()).toHaveLength(2);
    expect(inline(1)).toEqual(['timestampChip@754000', ' ', 'markChip']);
    expect(blocks()[1].content?.[2].attrs).toMatchObject({ markId: 'm-1', kind: 'confused', level: 7, ms: 754_000 });
    expect(editor.getHTML()).toContain('Confused 7/10');
  });

  it('an empty last line is used', () => {
    open([p('Tema 3'), p('')]);
    place(M({ kind: 'exam', level: 9 }));
    expect(blocks()).toHaveLength(2);
    expect(inline(1)).toEqual(['timestampChip@754000', ' ', 'markChip']);
  });

  it('writing in the notes: at the end of the line, after a space; an empty line gets the time first', () => {
    open([p('La sinapsis es'), p('Otra línea')]);
    touch();
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 4)));
    place(M({ kind: 'important', level: 8 }));
    expect(inline(0)).toEqual(['La sinapsis es ', 'markChip']);
    expect(inline(1)).toEqual(['Otra línea']);

    open([p('Uno'), p('')]);
    touch();
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    place(M({ ms: 5000 }));
    expect(inline(1)).toEqual(['timestampChip@5000', ' ', 'markChip']);
  });

  it('its panel changes the level and the note; the chip says so; HTML keeps the mark', () => {
    open([p('Uno')]);
    place(M({ note: 'paso 2' }));
    selectChip();
    expect(linkedMarkOf(formatState(editor).markChip)).toEqual(M({ note: 'paso 2' }));
    runFormat(editor, { type: 'markChip', action: 'update', level: 3, note: '  No entiendo el paso 2  ' });
    expect(editor.getHTML()).toContain('Confused 3/10');
    expect(linkedMarkOf(formatState(editor).markChip)).toEqual(M({ level: 3, note: 'No entiendo el paso 2' }));
    const html = editor.getHTML();
    editor.commands.setContent(html);
    selectChip();
    expect(linkedMarkOf(formatState(editor).markChip)).toEqual(M({ level: 3, note: 'No entiendo el paso 2' }));
  });

  it('Remove mark, then Undo: back where it was', () => {
    open([p('La sinapsis es la unión')]);
    touch();
    editor.commands.setTextSelection(5);
    place(M());
    selectChip();
    const at = formatState(editor).markChip!.at;
    expect(at).toEqual({ blockId: expect.any(String), offset: 24 });
    runFormat(editor, { type: 'markChip', action: 'delete' });
    expect(editor.getHTML()).not.toContain('data-mark');
    // The student went on writing on the next line meanwhile: the chip still comes back on its own line.
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    place(M(), at);
    expect(inline(0)).toEqual(['La sinapsis es la unión ', 'markChip']);
  });

  it('a chip put in by hand (Insert → Mark) is not a recorded mark', () => {
    open([p('Uno ')]);
    editor.commands.focus('end');
    runFormat(editor, { type: 'markChip', action: 'insert', kind: 'exam', level: 9 });
    selectChip();
    expect(formatState(editor).markChip).toMatchObject({ kind: 'exam', level: 9, markId: null });
    expect(linkedMarkOf(formatState(editor).markChip)).toBeNull();
  });

  it('saved from outside the editor: the same new last line', () => {
    const next = withMarkLine({ type: 'doc', content: [p('Uno')] }, M({ note: 'x' }), 1000);
    expect(next.content).toHaveLength(2);
    expect(next.content?.[1]).toMatchObject({
      type: 'paragraph',
      attrs: { origin: 'student', editedAt: 1000, blockId: expect.any(String) },
      content: [
        { type: 'timestampChip', attrs: { ms: 754_000 } },
        { type: 'text', text: ' ' },
        { type: 'markChip', attrs: { markId: 'm-1', kind: 'confused', level: 7, ms: 754_000, note: 'x' } },
      ],
    });
    const empty = withMarkLine({ type: 'doc', content: [p('Uno'), p('')] }, M());
    expect(empty.content).toHaveLength(2);
    open(next.content!);
    expect(inline(1)).toEqual(['timestampChip@754000', ' ', 'markChip']);
  });
});
