/**
 * @jest-environment jsdom
 */
// The page view's settings (step 4.5b): one change can set several (the
// iPhone sends Print layout, its zoom and fit together), they are in the
// format state the app reads, and they never touch the document or Undo.
import { Editor } from '@tiptap/core';

import { studiplyExtensions } from '../../bridges';
import { formatState, runFormat } from '../../format';
import { pageViewOf, shownZoom } from '../pageView';

let editor: Editor;
afterEach(() => editor?.destroy());

it('Pages, zoom and fit in one change; the document and Undo untouched', () => {
  editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hola' }] }] } });
  const before = editor.getJSON();
  expect(formatState(editor).view).toEqual({ pages: false, zoom: 1, pageCount: 1 });
  runFormat(editor, { type: 'view', fit: true, pages: true, zoom: 1.5 });
  const s = pageViewOf(editor.state)!;
  expect({ pages: s.pages, zoom: s.zoom, fit: s.fit }).toEqual({ pages: true, zoom: 1.5, fit: true });
  expect(formatState(editor).view).toEqual({ pages: true, zoom: 1.5, pageCount: 1 });
  expect(editor.getJSON()).toEqual(before);
  expect(editor.can().undo()).toBe(false);
});

it('zoom stays within 25–200 % (below 50 % only for Fit at phone width); fit multiplies it only in Pages', () => {
  editor = new Editor({ extensions: studiplyExtensions() });
  runFormat(editor, { type: 'view', zoom: 5 });
  expect(pageViewOf(editor.state)!.zoom).toBe(2);
  runFormat(editor, { type: 'view', zoom: 0.38 });
  expect(pageViewOf(editor.state)!.zoom).toBe(0.38);
  runFormat(editor, { type: 'view', zoom: 0.1 });
  expect(pageViewOf(editor.state)!.zoom).toBe(0.25);
  const s = { ...pageViewOf(editor.state)!, zoom: 1, fit: true, factor: 0.47 };
  expect(shownZoom({ ...s, pages: true })).toBeCloseTo(0.47);
  expect(shownZoom({ ...s, pages: false })).toBe(1);
});

it("a page setup through the view command: the sheet's size and margins, and the document untouched", () => {
  editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hola' }] }] } });
  const before = editor.getJSON();
  runFormat(editor, { type: 'view', pages: true, setup: { size: 'letter', orientation: 'landscape', margins: { top: 1.27, bottom: 1.27, left: 2.54, right: 2.54 }, numbers: 'top-right', gap: 48 } });
  expect(pageViewOf(editor.state)!.sheet).toEqual({ width: 1056, height: 816, marginTop: 48, marginBottom: 48, marginLeft: 96, marginRight: 96, gap: 48, numbers: 'top-right' });
  const style = editor.view.dom.getAttribute('style') ?? '';
  expect(style).toContain('width: 1056px');
  expect(style).toContain('padding: 48px 96px 48px 96px');
  expect(editor.getJSON()).toEqual(before);
});
