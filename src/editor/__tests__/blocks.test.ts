/**
 * @jest-environment jsdom
 */
// The formatting blocks on a real editor (jsdom): Title, page breaks, line
// spacing and indent, fonts and alignment, as both editors have them.
import { Editor } from '@tiptap/core';

import { studiplyExtensions } from '../bridges';
import type { DocJSON } from '../types';

const p = (text: string, attrs: Record<string, unknown> = {}) => ({ type: 'paragraph', attrs, content: text ? [{ type: 'text', text }] : [] });
let editor: Editor;

function open(doc: DocJSON) {
  editor = new Editor({ extensions: studiplyExtensions(), content: doc });
  return editor;
}
const top = () => (editor.getJSON().content ?? []) as { type: string; attrs: Record<string, unknown>; content?: unknown[] }[];

afterEach(() => editor?.destroy());

describe('indent', () => {
  it('steps a paragraph in and out, from 0 to 8', () => {
    open({ type: 'doc', content: [p('Uno')] });
    editor.commands.setTextSelection(2);
    editor.commands.indent();
    editor.commands.indent();
    expect(top()[0].attrs.indent).toBe(2);
    editor.commands.outdent();
    expect(top()[0].attrs.indent).toBe(1);
    for (let i = 0; i < 12; i++) editor.commands.indent();
    expect(top()[0].attrs.indent).toBe(8);
    expect(editor.getHTML()).toContain('margin-left: 16em');
  });

  it('nests a list item instead, and un-nests it', () => {
    open({
      type: 'doc',
      content: [{ type: 'bulletList', content: ['Uno', 'Dos'].map((t) => ({ type: 'listItem', content: [p(t)] })) }],
    });
    const second = editor.state.doc.textContent.indexOf('Dos');
    editor.commands.setTextSelection(second + 7);
    expect(editor.commands.indent()).toBe(true);
    const list = top()[0] as { content: { content: { type: string }[] }[] };
    expect(list.content).toHaveLength(1);
    expect(list.content[0].content.map((c) => c.type)).toEqual(['paragraph', 'bulletList']);
    editor.commands.outdent();
    expect((top()[0] as { content: unknown[] }).content).toHaveLength(2);
  });
});

describe('line spacing, title, page break, fonts, align', () => {
  it('sets line spacing (only the known values) and keeps it through HTML', () => {
    open({ type: 'doc', content: [p('Uno')] });
    editor.commands.setTextSelection(2);
    editor.commands.setLineSpacing(2);
    expect(top()[0].attrs.lineSpacing).toBe(2);
    const html = editor.getHTML();
    expect(html).toContain('line-height: 2');
    editor.commands.setLineSpacing(3);
    expect(top()[0].attrs.lineSpacing).toBeNull();
    editor.commands.setContent(html);
    expect(top()[0].attrs.lineSpacing).toBe(2);
  });

  it('makes a Title and puts a page break with a line after it at the end', () => {
    open({ type: 'doc', content: [p('Tema 1')] });
    editor.commands.setTextSelection(2);
    editor.commands.setTitle();
    expect(top()[0].type).toBe('title');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.setPageBreak();
    expect(top().map((b) => b.type)).toEqual(['title', 'pageBreak', 'paragraph']);
    // Both new blocks get their ids.
    expect(top().every((b) => typeof b.attrs.blockId === 'string')).toBe(true);
    expect(editor.getHTML()).toContain('data-page-break');
  });

  it('stores font and size in the text style, and alignment on the block', () => {
    open({ type: 'doc', content: [p('Uno')] });
    editor.commands.selectAll();
    editor.chain().setFontFamily('ui-serif, Georgia, serif').setFontSize('18px').setTextAlign('center').run();
    const json = JSON.stringify(editor.getJSON());
    expect(json).toContain('"fontFamily":"ui-serif, Georgia, serif"');
    expect(json).toContain('"fontSize":"18px"');
    expect(top()[0].attrs.textAlign).toBe('center');
  });
});
