/**
 * @jest-environment jsdom
 */
// The formatting tools' commands and state, on a real editor:
// what both toolbars do and show.
import { Editor } from '@tiptap/core';

import { studiplyExtensions } from '../bridges';
import { formatState, plainParagraphs, runFormat, type FormatCommand } from '../format';
import { FONTS } from '../schema/fonts';

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
let editor: Editor;

function open(...blocks: object[]) {
  editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content: blocks } });
  editor.commands.selectAll();
  return editor;
}
const run = (cmd: FormatCommand) => runFormat(editor, cmd);
const state = () => formatState(editor);
const first = () => (editor.getJSON().content ?? [])[0] as { type: string; attrs: Record<string, unknown> };

afterEach(() => editor?.destroy());

describe('text styles', () => {
  it('switches between Title, headings, Subheading, Quote and Normal', () => {
    open(p('Tema 1'));
    expect(state().style).toBe('normal');
    for (const style of ['title', 'h1', 'h2', 'subheading', 'quote', 'normal'] as const) {
      run({ type: 'style', style });
      expect(state().style).toBe(style);
    }
    expect(first().type).toBe('paragraph');
  });

  it('shows the style\'s own size when no size is set', () => {
    open(p('Tema 1'));
    expect(state().size).toBe(15);
    run({ type: 'style', style: 'h1' });
    expect(state().size).toBe(26);
  });
});

describe('font, size, marks, colours', () => {
  it('sets and reads the font and the size, stepping through the list', () => {
    open(p('Hola'));
    run({ type: 'font', font: 'rounded' });
    expect(state().font).toBe('rounded');
    expect(editor.getAttributes('textStyle').fontFamily).toBe(FONTS[1].css);
    run({ type: 'font', font: 'system' });
    expect(state().font).toBe('system');
    run({ type: 'sizeStep', direction: 1 });
    expect(state().size).toBe(16);
    run({ type: 'sizeStep', direction: 1 });
    expect(state().size).toBe(18);
    run({ type: 'size', size: 15 });
    expect(JSON.stringify(editor.getJSON())).not.toContain('fontSize');
  });

  it('toggles B I U S, sets and removes text colour and highlight', () => {
    open(p('Hola'));
    for (const mark of ['bold', 'italic', 'underline', 'strike'] as const) {
      run({ type: 'mark', mark });
      expect(state()[mark]).toBe(true);
    }
    run({ type: 'color', color: '#B42318' });
    run({ type: 'highlight', color: '#FFF3A3' });
    expect(state()).toMatchObject({ color: '#B42318', highlight: '#FFF3A3' });
    run({ type: 'color', color: null });
    run({ type: 'highlight', color: null });
    expect(state()).toMatchObject({ color: null, highlight: null });
  });
});

describe('paragraph tools', () => {
  it('aligns, spaces and indents, and clear formatting resets them and the marks but not the heading or links', () => {
    open({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tema', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://uned.es' } }] }] });
    run({ type: 'align', align: 'center' });
    run({ type: 'lineSpacing', spacing: 2 });
    run({ type: 'indent' });
    expect(state()).toMatchObject({ align: 'center', lineSpacing: 2, indent: 1, bold: true });
    editor.commands.selectAll();
    run({ type: 'clear' });
    expect(state()).toMatchObject({ align: 'left', lineSpacing: 1.5, indent: 0, bold: false, style: 'h2' });
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"link"');
  });

  it('makes lists of each kind and reports them', () => {
    open(p('Uno'));
    run({ type: 'list', list: 'bullet' });
    expect(state().list).toBe('bullet');
    run({ type: 'list', list: 'ordered' });
    expect(state().list).toBe('ordered');
    run({ type: 'list', list: 'task' });
    expect(state().list).toBe('task');
  });

  it('knows when undo, indent and outdent can apply', () => {
    open(p('Uno'));
    expect(state()).toMatchObject({ canUndo: false, canOutdent: false, canIndent: true });
    run({ type: 'indent' });
    expect(state()).toMatchObject({ canUndo: true, canOutdent: true });
    run({ type: 'undo' });
    expect(state().indent).toBe(0);
  });
});

describe('paste without formatting', () => {
  it('turns plain text into paragraphs, one per line', () => {
    expect(plainParagraphs('Uno\r\n\nDos')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Uno' }] },
      { type: 'paragraph' },
      { type: 'paragraph', content: [{ type: 'text', text: 'Dos' }] },
    ]);
    open(p('X'));
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    run({ type: 'insertText', text: 'Uno\nDos' });
    expect(editor.getText()).toContain('Uno');
    expect(editor.getText()).toContain('Dos');
  });
});
