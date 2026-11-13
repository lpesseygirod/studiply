/**
 * @jest-environment jsdom
 */
// The study assistant in the document (schema/suggestion), in the
// shared editor: Ask Claude's range kept and mapped through edits; Accept in
// place (the block becomes the student's, one Undo) or below in an `ai` box;
// a range whose text changed goes below instead (her edit is never
// overwritten); Reject changes nothing; Add to notes' box (question first,
// times as chips, `ai`), also as JSON for My notes saved without the editor,
// and never counted as a note line.
import { Editor, type JSONContent } from '@tiptap/core';

import { studiplyExtensions } from '../bridges';
import { formatState, runFormat } from '../format';
import { noteLinesOf } from '../noteLines';
import { calloutLabel } from '../schema/callout';
import { startSuggestion, suggestionInfo, withAssistantNote, SUGGESTION_CLASS } from '../schema/suggestion';
import type { DocJSON } from '../types';

let editor: Editor;
let host: HTMLElement;
afterEach(() => {
  editor?.destroy();
  host?.remove();
});

const p = (text: string, attrs: Record<string, unknown> = {}): JSONContent => ({ type: 'paragraph', attrs, content: [{ type: 'text', text }] });
const open = (content: JSONContent[]) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  editor = new Editor({ element: host, extensions: studiplyExtensions(), content: { type: 'doc', content } });
};
/** Where `text` starts in the document. */
const at = (text: string) => {
  let pos = -1;
  editor.state.doc.descendants((n, p) => {
    if (pos === -1 && n.isText && n.text!.includes(text)) pos = p + n.text!.indexOf(text);
  });
  return pos;
};
/** The selection bar's "✦ Ask Claude" on `text`. */
const ask = (text: string) => {
  const from = at(text);
  editor.commands.setTextSelection({ from, to: from + text.length });
  editor.view.dispatch(startSuggestion(editor.state.tr, editor.state));
};
const blocks = () => (editor.getJSON().content ?? []) as JSONContent[];
const textOfBlock = (b: JSONContent): string => (b.text ?? '') + (b.content ?? []).map(textOfBlock).join('');

describe('Ask Claude on a selection', () => {
  it('the range is kept, highlighted and mapped through edits before it; what is sent: the text (formulas as $…$) and the paragraph', () => {
    open([p('Antes.'), { type: 'paragraph', content: [{ type: 'text', text: 'La energía es ' }, { type: 'inlineMath', attrs: { latex: 'E=mc^2' } }, { type: 'text', text: ' siempre.' }] }]);
    const from = at('energía');
    editor.commands.setTextSelection({ from, to: at(' siempre') });
    editor.view.dispatch(startSuggestion(editor.state.tr, editor.state));
    expect(suggestionInfo(editor.state)).toMatchObject({ text: 'energía es $E=mc^2$', context: 'La energía es $E=mc^2$ siempre.', stale: false });
    expect(host.querySelector(`.${SUGGESTION_CLASS}`)?.textContent).toContain('energía es');
    // Typing before the range moves it, but its text is the same: not stale.
    editor.commands.insertContentAt(1, 'Muy ');
    expect(suggestionInfo(editor.state)?.stale).toBe(false);
    expect(formatState(editor).suggestion?.text).toBe('energía es $E=mc^2$');
  });

  it('Reject: nothing changes, the highlight goes', () => {
    open([p('La conducta humana es compleja.', { origin: 'ai' })]);
    const before = JSON.stringify(editor.getJSON());
    ask('conducta humana');
    runFormat(editor, { type: 'suggestion', action: 'clear' });
    expect(JSON.stringify(editor.getJSON())).toBe(before);
    expect(suggestionInfo(editor.state)).toBeNull();
    expect(host.querySelector(`.${SUGGESTION_CLASS}`)).toBeNull();
  });

  it('Accept (Explain simpler / Rewrite): the suggestion replaces the range, bold and formulas kept; the block is now hers; one Undo brings it back', () => {
    open([p('Inicio. La conducta humana es compleja. Fin.', { origin: 'ai' })]);
    ask('La conducta humana es compleja.');
    runFormat(editor, { type: 'suggestion', action: 'replace', text: 'La **conducta** sigue $x^2$.' });
    const [b] = blocks();
    expect(textOfBlock(b)).toBe('Inicio. La conducta sigue . Fin.');
    expect(b.content!.find((n) => n.text === 'conducta')?.marks).toEqual([{ type: 'bold' }]);
    expect(b.content!.some((n) => n.type === 'inlineMath' && n.attrs?.latex === 'x^2')).toBe(true);
    expect(b.attrs?.origin).toBe('student');
    expect(suggestionInfo(editor.state)).toBeNull();
    editor.commands.undo();
    expect(textOfBlock(blocks()[0])).toBe('Inicio. La conducta humana es compleja. Fin.');
  });

  it('a replace over several paragraphs keeps the text around it', () => {
    open([p('Uno dos.'), p('Tres cuatro.')]);
    const from = at('dos');
    editor.commands.setTextSelection({ from, to: at('cuatro') });
    editor.view.dispatch(startSuggestion(editor.state.tr, editor.state));
    runFormat(editor, { type: 'suggestion', action: 'replace', text: 'A.\n\nB' });
    expect(blocks().map(textOfBlock)).toEqual(['Uno A.', 'Bcuatro.']);
  });

  it('the asked text changed since: Accept puts it below in a "From the study assistant" box (ai), her edit stays', () => {
    open([p('La conducta humana es compleja.'), p('Después.')]);
    ask('conducta humana');
    editor.commands.insertContentAt(at('humana'), 'muy ');
    expect(suggestionInfo(editor.state)?.stale).toBe(true);
    runFormat(editor, { type: 'suggestion', action: 'replace', text: 'Más simple.' });
    const list = blocks();
    expect(textOfBlock(list[0])).toBe('La conducta muy humana es compleja.');
    expect(list[1]).toMatchObject({ type: 'callout', attrs: { kind: 'fromAssistant', origin: 'ai' } });
    expect(textOfBlock(list[1])).toBe('Más simple.');
    expect(textOfBlock(list[2])).toBe('Después.');
  });

  it('Give an example / Go deeper: a box after the block (Example, Added context), ai until she edits it', () => {
    open([p('La sinapsis une neuronas.'), p('Después.')]);
    ask('sinapsis');
    runFormat(editor, { type: 'suggestion', action: 'below', text: 'Por ejemplo, **al tocar** algo caliente.', kind: 'example' });
    let box = blocks()[1];
    expect(box).toMatchObject({ type: 'callout', attrs: { kind: 'example', origin: 'ai' } });
    expect(textOfBlock(blocks()[0])).toBe('La sinapsis une neuronas.');
    expect(blocks()[0].attrs?.origin).toBe('student');
    // She edits the box: now it's hers.
    editor.commands.insertContentAt(at('caliente') + 'caliente'.length, ' (dolor)');
    box = blocks()[1];
    expect(box.attrs?.origin).toBe('student');

    ask('neuronas');
    runFormat(editor, { type: 'suggestion', action: 'below', text: 'Más allá de la clase.', kind: 'addedContext' });
    expect(blocks()[1]).toMatchObject({ type: 'callout', attrs: { kind: 'addedContext', origin: 'ai' } });
  });

  it('nothing pending: Accept does nothing', () => {
    open([p('Texto.')]);
    const before = JSON.stringify(editor.getJSON());
    expect(runFormat(editor, { type: 'suggestion', action: 'replace', text: 'Otro.' })).toBe(false);
    expect(JSON.stringify(editor.getJSON())).toBe(before);
  });
});

describe('Add to notes', () => {
  const note = { ms: 2_052_000, question: 'Explain the last 10 min', answer: 'La profesora explicó **las 5 preguntas**:\n\n1. Estructuras\n2. Procesos\n\nEn el [31:05] dijo que entran.' };

  it('in the editor: a "From the study assistant · 34:12" box at the end, its question first, times as chips, ai; the empty last line stays last', () => {
    open([p('0:01 Mi nota'), { type: 'paragraph' }]);
    runFormat(editor, { type: 'assistantNote', note });
    const list = blocks();
    expect(list).toHaveLength(3);
    const box = list[1];
    expect(box).toMatchObject({ type: 'callout', attrs: { kind: 'fromAssistant', ms: 2_052_000, origin: 'ai' } });
    expect(calloutLabel(box.attrs!)).toBe('From the study assistant · 34:12');
    expect(box.content![0]).toMatchObject({ type: 'paragraph', content: [{ type: 'text', text: 'Explain the last 10 min', marks: [{ type: 'italic' }] }] });
    expect(box.content!.some((b) => b.type === 'orderedList')).toBe(true);
    const chips: number[] = [];
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'timestampChip') chips.push(n.attrs.ms);
    });
    expect(chips).toEqual([1_865_000]);
    expect(list[2]).toEqual({ type: 'paragraph', attrs: expect.anything() });
    // One Undo takes it away.
    editor.commands.undo();
    expect(blocks()).toHaveLength(2);
  });

  it('saved without the editor (My notes not open): the same box, before the empty last line; not a note line (coverage)', () => {
    const doc: DocJSON = { type: 'doc', content: [p('Mi nota', { blockId: 'b1' }), { type: 'paragraph', attrs: { blockId: 'b2' } }] };
    const next = withAssistantNote(doc, note);
    expect(next.content!.map((b) => b.type)).toEqual(['paragraph', 'callout', 'paragraph']);
    expect(next.content![1].attrs).toMatchObject({ kind: 'fromAssistant', ms: 2_052_000, origin: 'ai', blockId: expect.any(String) });
    expect(noteLinesOf(next).map((l) => l.text)).toEqual(['Mi nota']);
    // Without an empty last line, one is added after the box to type on.
    const ended = withAssistantNote({ type: 'doc', content: [p('Mi nota')] }, { ...note, ms: null });
    expect(ended.content!.map((b) => b.type)).toEqual(['paragraph', 'callout', 'paragraph']);
    expect(calloutLabel(ended.content![1].attrs!)).toBe('From the study assistant');
  });
});
