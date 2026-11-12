/**
 * @jest-environment jsdom
 */
// Links: the address rule and the link command on a real editor.
import { Editor } from '@tiptap/core';

import { studiplyExtensions } from '../bridges';
import { cleanUrl, formatState, runFormat } from '../format';

describe('cleanUrl', () => {
  it('completes what a student types', () => {
    expect(cleanUrl('uned.es')).toBe('https://uned.es');
    expect(cleanUrl(' www.uned.es/grados?x=1 ')).toBe('https://www.uned.es/grados?x=1');
    expect(cleanUrl('https://uned.es/a b')).toBeNull();
    expect(cleanUrl('http://localhost:8081/x')).toBe('http://localhost:8081/x');
    expect(cleanUrl('student@example.edu')).toBe('mailto:student@example.edu');
    expect(cleanUrl('mailto:student@example.edu')).toBe('mailto:student@example.edu');
    expect(cleanUrl('tel:+34600000000')).toBe('tel:+34600000000');
  });

  it('refuses what a link must never open', () => {
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'vbscript:x', 'hola', '', '   ']) {
      expect(cleanUrl(bad)).toBeNull();
    }
  });
});

describe('the link command', () => {
  let editor: Editor;
  afterEach(() => editor?.destroy());
  const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
  const linkOf = () => JSON.stringify(editor.getJSON());

  it('links the selection, shows it, edits it and removes it', () => {
    editor = new Editor({ extensions: studiplyExtensions(), content: doc('Ver la web de la UNED') });
    editor.commands.setTextSelection({ from: 15, to: 22 });
    runFormat(editor, { type: 'link', href: 'https://uned.es' });
    expect(linkOf()).toContain('"href":"https://uned.es"');
    editor.commands.setTextSelection(17);
    expect(formatState(editor).link).toBe('https://uned.es');
    // Edit with the cursor inside: the whole link changes.
    runFormat(editor, { type: 'link', href: 'https://www.uned.es' });
    expect(linkOf()).toContain('"href":"https://www.uned.es"');
    expect(linkOf()).not.toContain('"href":"https://uned.es"');
    runFormat(editor, { type: 'link', href: null });
    expect(linkOf()).not.toContain('"link"');
    expect(formatState(editor).link).toBeNull();
  });

  it('inserts the text (or the address) linked when nothing is selected', () => {
    editor = new Editor({ extensions: studiplyExtensions(), content: doc('Fuente: ') });
    editor.commands.setTextSelection(9);
    runFormat(editor, { type: 'link', href: 'https://uned.es', text: 'UNED' });
    expect(editor.getText()).toBe('Fuente: UNED');
    runFormat(editor, { type: 'link', href: 'mailto:student@example.edu' });
    expect(editor.getText()).toContain('student@example.edu');
  });
});
