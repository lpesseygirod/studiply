/**
 * @jest-environment jsdom
 */
// Studiply's blocks (step 4.6): callouts with their labels, mark chips;
// both in JSON and HTML, put in, changed and taken away, and blocks the
// merge and the origin rule handle like any other.
import { Editor, type JSONContent } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';

import { studiplyExtensions } from '../bridges';
import { formatState, runFormat } from '../format';
import { CALLOUT_KINDS, calloutLabel } from '../schema/callout';
import { markChipLabel } from '../schema/markChip';
import { parseClock } from '../schema/timestampChip';

let editor: Editor;
afterEach(() => editor?.destroy());
const p = (text: string): JSONContent => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
const open = (content: JSONContent[]) => {
  editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content } });
};
const blocks = (): JSONContent[] => editor.getJSON().content ?? [];
const key = (k: string) => editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key: k })));

describe('callouts', () => {
  it('labels: the kind, and for Confused its level and time', () => {
    expect(calloutLabel({ kind: 'definition' })).toBe('Definition');
    expect(calloutLabel({ kind: 'confused', level: 7, ms: 1_110_000 })).toBe('You were confused here · 7/10 · 18:30');
    expect(calloutLabel({ kind: 'fromNotes', ms: 252_000 })).toBe('From your notes · 4:12');
    expect(calloutLabel({ kind: 'addedContext' })).toBe('Added context · not from the lecture');
    expect(calloutLabel({ kind: 'nonsense' })).toBe('Definition');
  });

  it('the selected lines go into a callout, keep their text, and the box has an id and origin', () => {
    open([p('Antes'), p('La sinapsis es la unión entre dos neuronas.'), p('Y su función.'), p('Después')]);
    editor.commands.setTextSelection({ from: 9, to: 60 });
    runFormat(editor, { type: 'callout', action: 'set', kind: 'definition' });
    const b = blocks();
    expect(b.map((n) => n.type)).toEqual(['paragraph', 'callout', 'paragraph']);
    expect(b[1].attrs).toMatchObject({ kind: 'definition', origin: 'student' });
    expect(typeof b[1].attrs?.blockId).toBe('string');
    expect(b[1].content?.map((n) => n.content?.[0]?.text)).toEqual(['La sinapsis es la unión entre dos neuronas.', 'Y su función.']);
    expect(formatState(editor).callout).toEqual({ kind: 'definition', level: null, ms: null });
  });

  it('in a callout: change its kind and level; Remove keeps the text', () => {
    open([{ type: 'callout', attrs: { kind: 'definition' }, content: [p('No entiendo la sinapsis')] }]);
    editor.commands.setTextSelection(4);
    runFormat(editor, { type: 'callout', action: 'set', kind: 'confused', level: 12 });
    expect(blocks()[0].attrs).toMatchObject({ kind: 'confused', level: 10 });
    runFormat(editor, { type: 'callout', action: 'level', level: 7 });
    expect(blocks()[0].attrs?.level).toBe(7);
    runFormat(editor, { type: 'callout', action: 'remove' });
    expect(blocks().map((n) => n.type)).toEqual(['paragraph']);
    expect(blocks()[0].content?.[0]?.text).toBe('No entiendo la sinapsis');
  });

  it('Enter on an empty last line leaves the box; Backspace in an empty box takes it away', () => {
    open([{ type: 'callout', attrs: { kind: 'example' }, content: [p('Un ejemplo'), p('')] }]);
    const end = editor.state.doc.child(0).nodeSize - 2;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, end)));
    key('Enter');
    expect(blocks().map((n) => n.type)).toEqual(['callout', 'paragraph']);
    expect(blocks()[0].content).toHaveLength(1);
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(editor.state.selection.$from.depth).toBe(1);

    open([{ type: 'callout', attrs: { kind: 'warning' }, content: [p('')] }, p('Después')]);
    editor.commands.setTextSelection(2);
    key('Backspace');
    expect(blocks().map((n) => n.type)).toEqual(['paragraph', 'paragraph']);
  });

  it('every one of the seven kinds comes back as itself, in JSON and in HTML', () => {
    const seven = CALLOUT_KINDS.map(({ kind }) => ({ type: 'callout', attrs: { kind, level: kind === 'confused' ? 7 : null }, content: [p(`Texto ${kind}`)] }));
    open(seven);
    const kinds = () => blocks().map((n) => [n.attrs?.kind, n.content?.[0]?.content?.[0]?.text]);
    const expected = CALLOUT_KINDS.map(({ kind }) => [kind, `Texto ${kind}`]);
    expect(kinds()).toEqual(expected);
    const html = editor.getHTML();
    for (const { label } of CALLOUT_KINDS) expect(html).toContain(label);
    editor.commands.setContent(html);
    expect(kinds()).toEqual(expected);
    expect(blocks()[5].attrs?.level).toBe(7);
  });

  it('HTML: what is copied comes back the same', () => {
    open([{ type: 'callout', attrs: { kind: 'confused', level: 7, ms: 1_110_000 }, content: [p('Paso a paso')] }]);
    const html = editor.getHTML();
    expect(html).toContain('data-callout="confused"');
    expect(html).toContain('You were confused here · 7/10 · 18:30');
    editor.commands.setContent(html);
    expect(blocks()[0]).toMatchObject({ type: 'callout', attrs: { kind: 'confused', level: 7, ms: 1_110_000 } });
    expect(blocks()[0].content?.[0]?.content?.[0]?.text).toBe('Paso a paso');
  });
});

describe('mark chips', () => {
  it('"Confused 7/10"; levels stay 1–10', () => {
    expect(markChipLabel({ kind: 'confused', level: 7 })).toBe('Confused 7/10');
    expect(markChipLabel({ kind: 'exam', level: 0 })).toBe('Exam 1/10');
    expect(markChipLabel({ kind: 'important' })).toBe('Important');
  });

  it('put in, changed (kind and level) and removed through the format commands', () => {
    open([p('Tema 1 ')]);
    editor.commands.focus('end');
    runFormat(editor, { type: 'markChip', action: 'insert', kind: 'important', level: 8 });
    let chip = -1;
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'markChip') chip = pos;
    });
    expect(chip).toBeGreaterThan(0);
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, chip)));
    expect(formatState(editor).markChip).toEqual({ kind: 'important', level: 8 });
    runFormat(editor, { type: 'markChip', action: 'update', kind: 'confused', level: 3 });
    expect(editor.getHTML()).toContain('Confused 3/10');
    runFormat(editor, { type: 'markChip', action: 'delete' });
    expect(editor.getHTML()).not.toContain('data-mark');
  });

  it('a timestamp by hand', () => {
    open([p('')]);
    editor.commands.focus('end');
    runFormat(editor, { type: 'timestamp', ms: 252_000 });
    expect(editor.getHTML()).toContain('4:12');
  });
});

describe('a time typed by hand', () => {
  it.each([
    ['4:12', 252_000],
    ['1:04:12', 3_852_000],
    ['75', 75_000],
    [' 0:05 ', 5_000],
  ])('%s → %i ms', (text, ms) => expect(parseClock(text)).toBe(ms));
  it.each(['', '4:75', 'abc', '1:2:3:4', '4,12'])('"%s" is not a time', (text) => expect(parseClock(text)).toBeNull());
});
