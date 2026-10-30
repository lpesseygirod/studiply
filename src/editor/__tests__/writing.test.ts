/**
 * @jest-environment jsdom
 */
// The writing tools (step 4.7) on a real editor, as both devices run them:
// find & replace, word and character count, the outline.
import { Editor } from '@tiptap/core';

import { studiplyExtensions } from '../bridges';
import { formatState, runFormat, type FormatCommand } from '../format';
import { countsLine, countText } from '../writing/counts';
import { currentHeading } from '../writing/outline';

const p = (...parts: (string | { text: string; bold?: boolean })[]) => ({
  type: 'paragraph',
  content: parts.map((x) =>
    typeof x === 'string' ? { type: 'text', text: x } : { type: 'text', text: x.text, ...(x.bold ? { marks: [{ type: 'bold' }] } : {}) },
  ),
});
const h = (level: number, text: string) => ({ type: 'heading', attrs: { level }, ...(text ? { content: [{ type: 'text', text }] } : {}) });
let editor: Editor;

function open(...blocks: object[]) {
  editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content: blocks } });
  editor.commands.setTextSelection(1);
  return editor;
}
const run = (cmd: FormatCommand) => runFormat(editor, cmd);
const state = () => formatState(editor);
const search = (query: string, matchCase = false, wholeWords = false) => run({ type: 'find', action: 'search', query, matchCase, wholeWords });
const selected = () => editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to);
const text = () => editor.getText();

afterEach(() => editor?.destroy());

describe('find', () => {
  it('finds every match, case-insensitive by default; Match case narrows it', () => {
    open(p('La tasa de interés. La TASA sube.'), p('Otra tasa.'));
    search('tasa');
    expect(state().find).toEqual({ query: 'tasa', count: 3, current: 0 });
    expect(selected()).toBe('tasa');
    search('tasa', true);
    expect(state().find?.count).toBe(2);
  });

  it('Whole words leaves out words that contain it', () => {
    open(p('tasa, tasación y tasas; la tasa.'));
    search('tasa');
    expect(state().find?.count).toBe(4);
    search('tasa', false, true);
    expect(state().find?.count).toBe(2);
  });

  it('matches across bold inside a paragraph, never across paragraphs', () => {
    open(p('valor ', { text: 'act', bold: true }, 'ual neto'), p('valor'), p('actual'));
    search('valor actual');
    expect(state().find?.count).toBe(1);
    expect(selected()).toBe('valor actual');
  });

  it('next and previous go round, starting after the cursor', () => {
    open(p('uno a, dos a, tres a'));
    editor.commands.setTextSelection(8);
    search('a');
    expect(state().find?.current).toBe(1);
    run({ type: 'find', action: 'next' });
    expect(state().find?.current).toBe(2);
    run({ type: 'find', action: 'next' });
    expect(state().find?.current).toBe(0);
    run({ type: 'find', action: 'previous' });
    expect(state().find?.current).toBe(2);
  });

  it('Replace changes the current match and goes on; the new text may contain the query', () => {
    open(p('gato, gato, gato'));
    search('gato');
    run({ type: 'find', action: 'replace', text: 'gatos' });
    expect(text()).toBe('gatos, gato, gato');
    expect(state().find).toMatchObject({ count: 3, current: 1 });
  });

  it('Replace all is one change: one Undo brings everything back', () => {
    open(p('El VAN y el van; VAN.'), p('VAN otra vez'));
    search('VAN', true);
    run({ type: 'find', action: 'replaceAll', text: 'VPN' });
    expect(text()).toBe('El VPN y el van; VPN.\n\nVPN otra vez');
    expect(state().find?.count).toBe(0);
    editor.commands.undo();
    expect(text()).toBe('El VAN y el van; VAN.\n\nVAN otra vez');
  });

  it('closing takes the highlights away; special characters are found as typed', () => {
    open(p('PMT(B2/12) y (a+b)*2'));
    search('(a+b)*2');
    expect(state().find?.count).toBe(1);
    run({ type: 'find', action: 'close' });
    expect(state().find).toBeNull();
    expect(editor.view.dom.querySelector('.studiply-find')).toBeNull();
  });

  it('keeps counting as the text changes', () => {
    open(p('dato'));
    search('dato');
    editor.chain().setTextSelection(editor.state.doc.content.size - 1).insertContent(' y otro dato').run();
    expect(state().find?.count).toBe(2);
  });
});

describe('word and character count', () => {
  it('counts as Google Docs: words have a letter or digit; hyphens join, dashes split', () => {
    expect(countText('Hola, mundo.')).toEqual({ words: 2, characters: 12, charactersNoSpaces: 11 });
    expect(countText('well-known — 3,5 %')).toMatchObject({ words: 2 });
    expect(countText('   ')).toMatchObject({ words: 0 });
    expect(countText('Línea uno\nLínea dos')).toEqual({ words: 4, characters: 18, charactersNoSpaces: 16 });
  });

  it('gives the document’s count and the selection’s', () => {
    open(h(1, 'Tema 1'), p('El valor actual neto.'));
    expect(state().counts).toMatchObject({ words: 6, selection: null });
    editor.commands.setTextSelection({ from: 9, to: 17 });
    expect(state().counts.selection).toMatchObject({ words: 2 });
    expect(countsLine(state().counts)).toBe('2 of 6 words · 8 of 27 characters');
  });

  it('writes the line with thousands and the singular', () => {
    expect(countsLine({ words: 1234, characters: 6789, charactersNoSpaces: 5000, selection: null })).toBe('1,234 words · 6,789 characters');
    expect(countsLine({ words: 1, characters: 1, charactersNoSpaces: 1, selection: null })).toBe('1 word · 1 character');
  });
});

describe('the outline', () => {
  const doc = () =>
    open({ type: 'title', content: [{ type: 'text', text: 'Finanzas' }] }, h(1, 'Tema 1'), p('Texto.'), h(2, 'El VAN'), p('Más.'), h(3, 'Ejemplo'), h(1, ''), h(1, 'Tema 2'));

  it('lists the headings in order with their level; empty ones are left out', () => {
    doc();
    expect(state().outline.headings.map((x) => [x.level, x.text])).toEqual([
      [0, 'Finanzas'],
      [1, 'Tema 1'],
      [2, 'El VAN'],
      [3, 'Ejemplo'],
      [1, 'Tema 2'],
    ]);
  });

  it('follows the cursor: the section it is in', () => {
    doc();
    const { headings } = state().outline;
    // In "Más." (after El VAN, before Ejemplo).
    const mas = headings[3].pos - 2;
    expect(currentHeading(headings, mas)).toBe(2);
    expect(currentHeading(headings, 0)).toBe(0);
    editor.commands.setTextSelection(headings[4].pos + 2);
    expect(state().outline.current).toBe(4);
  });

  it('jumps to a heading: the cursor at its start', () => {
    doc();
    const target = state().outline.headings[2];
    run({ type: 'outline', pos: target.pos });
    expect(editor.state.selection.from).toBe(target.pos + 1);
    expect(state().outline.current).toBe(2);
  });
});
