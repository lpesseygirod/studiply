/**
 * @jest-environment jsdom
 */
// The selection bar (after test B): for selected words only (not an empty
// cursor, cells, a photo or a formula); its Comment and Link reach the
// device (an event on the laptop, the format state on the iPhone). After
// 4.6: Callout ▸, Mark ▸ and Time ▸ after Link, the same way.
import { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';

import { studiplyExtensions } from '../bridges';
import { formatState, runFormat } from '../format';
import { ASK_CLAUDE_EVENT, SELECTION_BAR_CLASS, SELECTION_MENU_EVENT, selectionBarKey, showsSelectionBar, visibleBox } from '../format/selectionBar';
import { SUGGESTION_CLASS } from '../schema/suggestion';

let editor: Editor;
afterEach(() => editor?.destroy());

const open = () => {
  editor = new Editor({
    extensions: studiplyExtensions(),
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'La conducta humana' }, { type: 'inlineMath', attrs: { latex: 'x^2' } }] },
        { type: 'image', attrs: { src: 'https://example.com/a.png' } },
        { type: 'paragraph' },
      ],
    },
  });
};

describe('selection bar', () => {
  it('shows for selected words; not for a cursor, spaces, a photo or a formula', () => {
    open();
    editor.commands.setTextSelection({ from: 4, to: 12 });
    expect(showsSelectionBar(editor)).toBe(true);
    editor.commands.setTextSelection(4);
    expect(showsSelectionBar(editor)).toBe(false);
    let photo = -1;
    let formula = -1;
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'image') photo = pos;
      if (n.type.name === 'inlineMath') formula = pos;
    });
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, photo)));
    expect(showsSelectionBar(editor)).toBe(false);
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, formula)));
    expect(showsSelectionBar(editor)).toBe(false);
  });

  it('not for cells selected in a table (the table bar is there)', () => {
    open();
    editor.commands.setTextSelection(1);
    runFormat(editor, { type: 'table', action: 'insert', rows: 2, cols: 2 });
    let first = -1;
    let last = -1;
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'tableCell') {
        if (first < 0) first = pos;
        last = pos;
      }
    });
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, first, last)));
    expect(showsSelectionBar(editor)).toBe(false);
  });

  it('a press on Comment or Link is in the format state for the iPhone (a new id each time)', () => {
    open();
    expect(formatState(editor).selectionRequest).toBeNull();
    editor.view.dispatch(editor.state.tr.setMeta(selectionBarKey, { id: 1, button: 'comment' }));
    expect(formatState(editor).selectionRequest).toEqual({ id: 1, button: 'comment' });
    editor.view.dispatch(editor.state.tr.setMeta(selectionBarKey, { id: 2, button: 'link' }));
    expect(formatState(editor).selectionRequest).toEqual({ id: 2, button: 'link' });
  });

  describe('its buttons (shown in a page)', () => {
    let host: HTMLElement;
    const mount = (content: object[]) => {
      host = document.createElement('div');
      document.body.appendChild(host);
      editor = new Editor({ element: host, extensions: studiplyExtensions(), content: { type: 'doc', content } });
      // jsdom never focuses the editor; the bar only shows with the focus.
      editor.view.hasFocus = () => true;
      // Nor measures text; where the bar sits is checked in Chrome (inserting.mjs).
      editor.view.coordsAtPos = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
    };
    afterEach(() => host?.remove());
    const bar = () => host.querySelector<HTMLElement>(`.${SELECTION_BAR_CLASS}`)!;
    const button = (label: string) => bar().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

    it('Comment, B, I, Highlight, Link, then Callout ▸, Mark ▸ and Time ▸ with a picture and a word, then ✦ Ask Claude ▸ (6.3)', () => {
      mount([p('La conducta humana')]);
      editor.commands.setTextSelection({ from: 4, to: 12 });
      expect(bar().style.display).toBe('flex');
      expect([...bar().querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
        'Comment on the selection',
        'Bold selection',
        'Italic selection',
        'Highlight selection',
        'Link selection',
        'Callout from the selection',
        'Mark after the selection',
        'Time after the selection',
        'Ask Claude about the selection',
      ]);
      expect(button('Ask Claude about the selection').querySelector('svg')).not.toBeNull();
      expect(button('Ask Claude about the selection').textContent).toBe('Ask Claude▸');
      for (const [label, word] of [['Callout from the selection', 'Callout'], ['Mark after the selection', 'Mark'], ['Time after the selection', 'Time']]) {
        expect(button(label).querySelector('svg')).not.toBeNull();
        expect(button(label).textContent).toBe(`${word}▸`);
      }
    });

    it('no Callout in a table (it would take the whole table)', () => {
      mount([{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [p('Celda uno')] }] }] }, p('Fuera de la tabla')]);
      let cell = -1;
      editor.state.doc.descendants((n, pos) => {
        if (n.type.name === 'text' && n.text === 'Celda uno') cell = pos;
      });
      editor.commands.setTextSelection({ from: cell, to: cell + 5 });
      expect(button('Callout from the selection').style.display).toBe('none');
      expect(button('Mark after the selection').style.display).toBe('');
      const out = editor.state.doc.content.size - 8;
      editor.commands.setTextSelection({ from: out, to: out + 4 });
      expect(button('Callout from the selection').style.display).toBe('');
    });

    it('a press reaches the laptop (an event with where its menu opens) and the iPhone (the format state)', () => {
      mount([p('La conducta humana')]);
      editor.commands.setTextSelection({ from: 4, to: 12 });
      const seen: string[] = [];
      editor.view.dom.addEventListener(SELECTION_MENU_EVENT, (e) => seen.push((e as CustomEvent).detail.button));
      for (const [label, name] of [['Callout from the selection', 'callout'], ['Mark after the selection', 'mark'], ['Time after the selection', 'time']]) {
        button(label).click();
        expect(formatState(editor).selectionRequest?.button).toBe(name);
      }
      expect(seen).toEqual(['callout', 'mark', 'time']);
    });

    it('✦ Ask Claude (6.3): the selection is kept as the suggestion’s range, highlighted; the laptop gets an event at the button, the iPhone the press and the text', () => {
      mount([p('La conducta humana')]);
      editor.commands.setTextSelection({ from: 4, to: 12 });
      const anchors: unknown[] = [];
      editor.view.dom.addEventListener(ASK_CLAUDE_EVENT, (e) => anchors.push((e as CustomEvent).detail));
      button('Ask Claude about the selection').click();
      expect(anchors).toHaveLength(1);
      expect(anchors[0]).toMatchObject({ x: expect.any(Number), y: expect.any(Number), above: expect.any(Number), bounds: expect.any(Object) });
      const s = formatState(editor);
      expect(s.selectionRequest?.button).toBe('ask');
      expect(s.suggestion).toMatchObject({ text: 'conducta', context: 'La conducta humana', stale: false });
      expect(host.querySelector(`.${SUGGESTION_CLASS}`)?.textContent).toBe('conducta');
    });
  });

  it('the editor as seen: the page cut by the pane that scrolls around it and by the window (the bar and the card stay inside)', () => {
    const rect = (left: number, top: number, width: number, height: number) => () => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    const pane = document.createElement('div');
    pane.style.overflowY = 'auto';
    const page = document.createElement('div');
    pane.appendChild(page);
    document.body.appendChild(pane);
    // The pane: 264–950 (the panel to its right), 56–900; the page wider than it and above its top.
    pane.getBoundingClientRect = rect(264, 56, 686, 844);
    page.getBoundingClientRect = rect(290, 20, 820, 1100);
    // jsdom's window is 1024 × 768.
    expect(visibleBox(page)).toEqual({ left: 290, right: 950, top: 56, bottom: 768 });
    pane.remove();
  });
});
