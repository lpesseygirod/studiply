/**
 * @jest-environment jsdom
 */
// Pasting from Google Docs and Word into a real editor: what the
// paste spike found lost (Docs' highlights, Word's lists and highlights) is
// kept now, in Studiply's styles. The fixtures are clipboard HTML shaped
// like what each app copies (also used by the Chrome check); Lea's real
// paste is the final check.
import { Editor, type JSONContent } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';

import { DocColors } from '../../../constants/colors';
import { studiplyExtensions } from '../../bridges';
import { countHtml, countSlice, pasteLosses } from '../../pasteReport';
import { PASTE_RULES } from '../extension';
import { isPlainText, nearestHighlight, rgbOf, transformPastedHTML } from '../rules';
import clipboard from './clipboard.json';
import '../../../test-utils/clipboardEvent';

let editor: Editor;
afterEach(() => editor?.destroy());

/** Pastes `html` into an empty editor as the browser would; returns the document. */
function paste(html: string): JSONContent[] {
  editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content: [{ type: 'paragraph' }] } });
  editor.commands.focus('start');
  editor.view.pasteHTML(html);
  return editor.getJSON().content ?? [];
}

const losses = (html: string, doc: JSONContent[]) =>
  pasteLosses({ had: countHtml(new DOMParser().parseFromString(html, 'text/html').body), kept: countSlice(doc) });

function find(nodes: JSONContent[] | undefined, pred: (n: JSONContent) => boolean): JSONContent | undefined {
  for (const n of nodes ?? []) {
    if (pred(n)) return n;
    const inner = find(n.content, pred);
    if (inner) return inner;
  }
  return undefined;
}
const marksOf = (doc: JSONContent[], text: string) => find(doc, (n) => n.type === 'text' && (n.text ?? '').includes(text))?.marks ?? [];

describe('Google Docs', () => {
  it('keeps everything, highlights included (lost in the spike)', () => {
    const doc = paste(clipboard.googleDocs);
    expect(losses(clipboard.googleDocs, doc)).toEqual([]);
    const highlight = marksOf(doc, 'resaltado').find((m) => m.type === 'highlight');
    expect(highlight?.attrs?.color).toBe(DocColors.highlight[0].value);
    // Red stays red; black and the fonts and sizes go.
    expect(marksOf(doc, 'rojo').find((m) => m.type === 'textStyle')?.attrs).toMatchObject({ color: '#CC0000' });
    expect(JSON.stringify(doc)).not.toMatch(/Arial|11pt|#000000/);
  });
});

describe('Word', () => {
  it('keeps everything, lists and highlights included (lost in the spike)', () => {
    const doc = paste(clipboard.word);
    expect(losses(clipboard.word, doc)).toEqual([]);
    const list = find(doc, (n) => n.type === 'bulletList');
    expect(list?.content?.map((li) => JSON.stringify(li).includes('sinapsis') || JSON.stringify(li).includes('neurona'))).toEqual([true, true]);
    expect(JSON.stringify(doc)).not.toContain('·');
  });

  it('makes Title, Subheading, numbered and nested lists, highlights, colours and a page break', () => {
    const doc = paste(clipboard.wordNested);
    expect(doc.map((b) => b.type)).toEqual(['title', 'heading', 'orderedList', 'paragraph', 'pageBreak', 'paragraph']);
    expect(doc[1].attrs?.level).toBe(3);
    // 1. Estructuras / a. Sistema nervioso (nested) / 2. Procesos
    const list = doc[2];
    expect(list.content).toHaveLength(2);
    expect(find(list.content?.[0].content, (n) => n.type === 'orderedList')).toBeDefined();
    expect(JSON.stringify(list)).not.toMatch(/1\.|a\.|2\./);
    expect(marksOf(doc, 'Repasar').find((m) => m.type === 'highlight')?.attrs?.color).toBe(DocColors.highlight[0].value);
    expect(marksOf(doc, 'verde').find((m) => m.type === 'textStyle')?.attrs?.color).toBe('#00B050');
    expect(marksOf(doc, 'normal')).toEqual([]);
  });
});

describe('colours', () => {
  it('reads CSS and Word colours, and snaps highlights by hue', () => {
    expect(rgbOf('yellow')).toEqual([255, 255, 0]);
    expect(rgbOf('rgba(1, 2, 3, 0)')).toBeNull();
    expect(rgbOf('transparent')).toBeNull();
    expect(isPlainText(rgbOf('windowtext')!)).toBe(true);
    expect(nearestHighlight([255, 255, 0])).toBe(DocColors.highlight[0].value);
    expect(nearestHighlight([0, 255, 255])).toBe(DocColors.highlight.find((h) => h.key === 'blue')!.value);
    expect(nearestHighlight([255, 0, 255])).toBe(DocColors.highlight.find((h) => h.key === 'pink')!.value);
  });

  it('leaves other HTML as it is', () => {
    expect(transformPastedHTML('<p><b>Hola</b> <a href="https://uned.es">UNED</a></p>')).toBe('<p><b>Hola</b> <a href="https://uned.es">UNED</a></p>');
  });
});

describe('paste without formatting', () => {
  it('after ⌘⇧V the next paste inserts the text alone and is taken from the browser', () => {
    paste('');
    const storage = (editor.storage as unknown as Record<string, { plainUntil: number }>)[PASTE_RULES];
    storage.plainUntil = Date.now() + 1000; // what ⌘⇧V does
    const event = { clipboardData: { getData: (t: string) => (t === 'text/plain' ? 'Uno\nDos' : '<b>Uno</b>') } } as unknown as ClipboardEvent;
    const handled = editor.view.someProp('handlePaste', (f) => f(editor.view, event, Slice.empty));
    expect(handled).toBe(true);
    expect(JSON.stringify(editor.getJSON())).not.toContain('bold');
    expect(editor.getText()).toContain('Dos');
    // Only that one paste.
    expect(editor.view.someProp('handlePaste', (f) => f(editor.view, event, Slice.empty))).toBeFalsy();
  });

  it('a ⌘⇧V that pasted nothing ends when the keys are released: the next paste keeps its formatting', () => {
    paste('');
    const storage = (editor.storage as unknown as Record<string, { plainUntil: number }>)[PASTE_RULES];
    storage.plainUntil = Date.now() + 1000; // ⌘⇧V with an empty clipboard: no paste came
    editor.view.dom.dispatchEvent(new KeyboardEvent('keyup', { key: 'v', bubbles: true }));
    expect(storage.plainUntil).toBe(0);
    const event = { clipboardData: { getData: () => 'Uno' } } as unknown as ClipboardEvent;
    expect(editor.view.someProp('handlePaste', (f) => f(editor.view, event, Slice.empty))).toBeFalsy();
  });
});
