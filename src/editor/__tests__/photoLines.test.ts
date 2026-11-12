/**
 * @jest-environment jsdom
 */
// A board photo taken while recording goes into My notes as a
// thumbnail on a line of its own, with its time: after the line the student
// was writing (an empty line is used), or a new last line when they hadn't
// been in the notes; the same line saved from outside the editor.
import { Editor, type JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

import { studiplyExtensions } from '../bridges';
import { runFormat } from '../format';
import { BOARD_PHOTO_WIDTH, withPhotoLine } from '../schema/photo';

let editor: Editor;
afterEach(() => editor?.destroy());
const p = (text: string): JSONContent => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
const open = (content: JSONContent[]) => {
  editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content } });
};
const blocks = (): JSONContent[] => editor.getJSON().content ?? [];
/** A block's inline nodes: text, the time chip's ms, the photo's src and width. */
const line = (i: number) =>
  (blocks()[i].content ?? []).map((n) =>
    n.type === 'text' ? n.text : n.type === 'timestampChip' ? `@${n.attrs?.ms}` : n.type === 'inlineImage' ? `${n.attrs?.src} ${n.attrs?.width}%` : n.type,
  );
const touch = () => editor.view.dom.dispatchEvent(new FocusEvent('focus'));
const place = (mediaId: string, ms: number) => runFormat(editor, { type: 'photoLine', mediaId, ms });

describe('board photos in My notes', () => {
  it('not in the notes yet: a new last line with its time and the thumbnail', () => {
    open([p('Tema 3')]);
    place('m1', 754_000);
    expect(blocks()).toHaveLength(2);
    expect(line(1)).toEqual(['@754000', ' ', `media:m1 ${BOARD_PHOTO_WIDTH}%`]);
    expect(line(0)).toEqual(['Tema 3']);
  });

  it('an empty last line is used', () => {
    open([p('Tema 3'), p('')]);
    place('m1', 5000);
    expect(blocks()).toHaveLength(2);
    expect(line(1)).toEqual(['@5000', ' ', 'media:m1 35%']);
  });

  it('writing in the notes: a line of its own right after the line being written; an empty line is used', () => {
    open([p('La sinapsis es'), p('Otra línea')]);
    touch();
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 4)));
    place('m1', 9000);
    expect(blocks().map((b) => b.content?.[0]?.text ?? b.content?.[0]?.type)).toEqual(['La sinapsis es', 'timestampChip', 'Otra línea']);
    expect(line(1)).toEqual(['@9000', ' ', 'media:m1 35%']);

    open([p('Uno'), p(''), p('Tres')]);
    touch();
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 6)));
    place('m2', 1000);
    expect(blocks()).toHaveLength(3);
    expect(line(1)).toEqual(['@1000', ' ', 'media:m2 35%']);
  });

  it('two photos at the same moment: one line each, in order (also while writing a line)', () => {
    open([p('Uno')]);
    place('a', 1000);
    place('b', 1000);
    expect([line(1), line(2)]).toEqual([
      ['@1000', ' ', 'media:a 35%'],
      ['@1000', ' ', 'media:b 35%'],
    ]);

    open([p('La sinapsis'), p('Después')]);
    touch();
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 4)));
    place('a', 2000);
    place('b', 2000);
    expect([line(0), line(1), line(2), line(3)]).toEqual([['La sinapsis'], ['@2000', ' ', 'media:a 35%'], ['@2000', ' ', 'media:b 35%'], ['Después']]);
  });

  it('saved from outside the editor: the same new last line', () => {
    const next = withPhotoLine({ type: 'doc', content: [p('Uno')] }, 'media:m9', 3000, 1000);
    expect(next.content?.[1]).toMatchObject({
      type: 'paragraph',
      attrs: { origin: 'student', editedAt: 1000, blockId: expect.any(String) },
      content: [
        { type: 'timestampChip', attrs: { ms: 3000 } },
        { type: 'text', text: ' ' },
        { type: 'inlineImage', attrs: { src: 'media:m9', width: 35 } },
      ],
    });
    expect(withPhotoLine({ type: 'doc', content: [p('Uno'), p('')] }, 'media:m9', 3000).content).toHaveLength(2);
    open(next.content!);
    expect(line(1)).toEqual(['@3000', ' ', 'media:m9 35%']);
  });
});
