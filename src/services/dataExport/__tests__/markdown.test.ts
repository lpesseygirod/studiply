// Step 10.1b-4: a document tab as Markdown in "Export my data".
import type { JSONContent } from '@tiptap/core';

import { chipLabel } from '../../../editor/schema/timestampChip';
import { docToMarkdown as toMarkdown, type MarkdownOptions } from '../markdown';

// The fixtures are plain objects; the editor's type is checked by the app's own code.
const docToMarkdown = (doc: object | null, opts?: MarkdownOptions) => toMarkdown(doc as JSONContent | null, opts);

const p = (...content: object[]) => ({ type: 'paragraph', content });
const t = (text: string, marks?: object[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });

describe('docToMarkdown', () => {
  it('headings, paragraphs with bold / italic / links, and an empty tab', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [t('Tema 2')] },
        p(t('La '), t('sinapsis', [{ type: 'bold' }]), t(' es '), t('química', [{ type: 'italic' }]), t(' — '), t('ver', [{ type: 'link', attrs: { href: 'https://es.wikipedia.org' } }])),
      ],
    };
    expect(docToMarkdown(doc)).toBe('## Tema 2\n\nLa **sinapsis** es *química* — [ver](https://es.wikipedia.org)\n');
    expect(docToMarkdown({ type: 'doc', content: [] })).toBe('');
    expect(docToMarkdown(null)).toBe('');
  });

  it('lists, task lists and nested lists', () => {
    const li = (...content: object[]) => ({ type: 'listItem', content });
    const doc = {
      type: 'doc',
      content: [
        { type: 'bulletList', content: [li(p(t('Uno')), { type: 'orderedList', content: [li(p(t('a'))), li(p(t('b')))] }), li(p(t('Dos')))] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('Hecho'))] }, { type: 'taskItem', attrs: { checked: false }, content: [p(t('Pendiente'))] }] },
      ],
    };
    expect(docToMarkdown(doc)).toBe('- Uno\n\n  1. a\n  2. b\n- Dos\n\n- [x] Hecho\n- [ ] Pendiente\n');
  });

  it('formulas as LaTeX, mark and timestamp chips, tables, boxes', () => {
    const cell = (type: string, s: string) => ({ type, content: [p(t(s))] });
    const doc = {
      type: 'doc',
      content: [
        p(t('Energía '), { type: 'inlineMath', attrs: { latex: 'E=mc^2' } }, t(' '), { type: 'markChip', attrs: { kind: 'exam', level: 9 } }, t(' '), { type: 'timestampChip', attrs: { ms: 400000 } }),
        { type: 'blockMath', attrs: { latex: '\\frac{a}{b}' } },
        { type: 'table', content: [{ type: 'tableRow', content: [cell('tableHeader', 'Término'), cell('tableHeader', 'Definición')] }, { type: 'tableRow', content: [cell('tableCell', 'Axón'), cell('tableCell', 'Lleva | señal')] }] },
        { type: 'callout', attrs: { kind: 'definition', title: 'Definition' }, content: [p(t('Una neurona.'))] },
      ],
    };
    const md = docToMarkdown(doc);
    expect(md).toContain(`Energía $E=mc^2$ [Exam 9/10] [${chipLabel(400000)}]`);
    expect(md).toContain('$$\n\\frac{a}{b}\n$$');
    expect(md).toContain('| Término | Definición |\n| --- | --- |\n| Axón | Lleva \\| señal |');
    expect(md).toContain('> **Definition**\n>\n> Una neurona.');
  });

  it('a photo links to its file in the export when it is there, else its name', () => {
    const doc = { type: 'doc', content: [{ type: 'image', attrs: { src: 'media:m1', alt: 'Pizarra' } }, { type: 'image', attrs: { src: 'media:gone' } }] };
    const md = docToMarkdown(doc, { photoPath: (src) => (src === 'media:m1' ? 'Photos/Pizarra 1.jpg' : null) });
    expect(md).toBe('![Pizarra](Photos/Pizarra%201.jpg)\n\n[Photo]\n');
  });
});
