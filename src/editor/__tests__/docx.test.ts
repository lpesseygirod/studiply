/**
 * @jest-environment jsdom
 */
// The Word export and import (step 4.8b), without a browser's drawing: the
// .docx built from our JSON and read back from its XML (JSZip), a .docx
// made here with the docx library read into a document (mammoth, the paste
// rules, the schema), and a round trip. The pictures are stubbed (a 1 × 1
// PNG each); drawing them is checked in Chrome (docx.mjs).
import { Document, HeadingLevel, ImageRun, LevelFormat, Packer, PageBreak, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, UnderlineType } from 'docx';
import JSZip from 'jszip';
import type { JSONContent } from '@tiptap/core';

import { buildDocx, type WordOptions } from '../export/docxBuild';
import { drawRequests, formulaKey, photoKey, photoRequests, pictureRequests, textWidthPx, type Picture } from '../export/docxPictures';
import { IMPORT_PICTURE, wordHtmlToDoc, wordPasteHtml } from '../export/wordImport';
import { sheetTableDoc } from '../export/sheetTable';
import { NEW_GRAPH } from '../graph/data';
import { DEFAULT_PAGE_SETUP, type PageSetup } from '../page/pageSetup';
import { DEFAULT_SIZE } from '../schema/fonts';
import type { DocJSON } from '../types';
import { importDocx, importNote, notKeptIn, readDocx } from '../../services/docx-import.service';
import { cropBox, faceKey, fontType, srcUrls } from '../export/pictures';
import { createDocument, saveDocument } from '../../services/document.service';
import { addDocPhoto } from '../../services/doc-photo.service';
import * as FileSystem from 'expo-file-system/legacy';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

// jsdom has neither; browsers have both, and the app too (Hermes' TextEncoder, Expo's TextDecoder).
Object.assign(globalThis, { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder });

// What the bundlers do with mammoth's "browser" field (the app reads an ArrayBuffer on both devices).
jest.mock('mammoth/lib/unzip', () => jest.requireActual('mammoth/browser/unzip'));
jest.mock('../../services/document.service', () => ({ createDocument: jest.fn(async () => 'file-1'), saveDocument: jest.fn(async () => ({})) }));
jest.mock('../../services/doc-photo.service', () => ({ addDocPhoto: jest.fn(async () => 'media-1') }));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));

/** A 1 × 1 PNG. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const t = (text: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });
const li = (text: string, ...more: JSONContent[]): JSONContent => ({ type: 'listItem', content: [p(t(text)), ...more] });
const cell = (text: string, backgroundColor: string | null = null): JSONContent => ({ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, backgroundColor }, content: [p(t(text))] });
const doc = (...content: JSONContent[]): DocJSON => ({ type: 'doc', content });

const graph = { ...NEW_GRAPH, title: 'Ventas', blockId: 'g1' };
const lesson = doc(
  { type: 'title', content: [t('Tema 3')] },
  { type: 'heading', attrs: { level: 1 }, content: [t('Introducción')] },
  { type: 'heading', attrs: { level: 2 }, content: [t('Parte A')] },
  {
    type: 'paragraph',
    attrs: { textAlign: 'center', lineSpacing: 2, indent: 1 },
    content: [
      t('Bold', [{ type: 'bold' }]),
      t(' italic', [{ type: 'italic' }]),
      t(' under', [{ type: 'underline' }]),
      t(' red', [{ type: 'textStyle', attrs: { color: '#DC2626' } }]),
      t(' marked', [{ type: 'highlight', attrs: { color: '#FFF3A3' } }]),
      t(' web', [{ type: 'link', attrs: { href: 'https://example.com/a' } }]),
    ],
  },
  { type: 'bulletList', content: [li('one'), li('two', { type: 'bulletList', content: [li('two and a half')] })] },
  { type: 'orderedList', attrs: { start: 1 }, content: [li('first'), li('second')] },
  { type: 'orderedList', attrs: { start: 1 }, content: [li('again first')] },
  { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('done'))] }, { type: 'taskItem', attrs: { checked: false }, content: [p(t('to do'))] }] },
  { type: 'table', content: [{ type: 'tableRow', content: [cell('A1', '#D3F5DB'), cell('B1')] }, { type: 'tableRow', content: [cell('A2'), cell('B2')] }] },
  { type: 'pageBreak' },
  p(t('Area '), { type: 'inlineMath', attrs: { latex: '\\frac{a}{b}' } }),
  { type: 'blockMath', attrs: { latex: 'E = mc^2' } },
  { type: 'graph', attrs: graph },
  { type: 'callout', attrs: { kind: 'exam' }, content: [p(t('This is in the exam.'))] },
  p({ type: 'markChip', attrs: { kind: 'confused', level: 7 } }, t(' and '), { type: 'timestampChip', attrs: { ms: 252000 } }),
  { type: 'image', attrs: { src: 'media:photo-1', width: 50 } },
);

const setup: PageSetup = { ...DEFAULT_PAGE_SETUP };
const options = (over: Partial<WordOptions> = {}): WordOptions => ({ setup, numbers: true, tabHeadings: false, title: 'Tema 3', language: 'es', ...over });

/** Every picture the tabs ask for, as a 1 × 1 PNG (an inline formula reaching 4 px below the line). */
function stubPictures(docs: DocJSON[], skip: string[] = []): Picture[] {
  return pictureRequests(docs, textWidthPx(setup), 'es')
    .filter((r) => !skip.includes(r.id))
    .map((r) => ({ id: r.id, type: 'png', data: PNG, width: r.kind === 'graph' ? 600 : 80, height: r.kind === 'graph' ? 360 : 30, ...(r.kind === 'formula' && !r.display ? { depth: 4 } : {}) }));
}

async function unzip(file: Document): Promise<{ zip: JSZip; xml: string; part: (name: string) => Promise<string> }> {
  const zip = await JSZip.loadAsync(await Packer.toArrayBuffer(file));
  const part = async (name: string) => (await zip.file(name)?.async('string')) ?? '';
  return { zip, xml: await part('word/document.xml'), part };
}

const count = (xml: string, re: RegExp) => xml.match(new RegExp(re.source, 'g'))?.length ?? 0;

describe('the pictures the export asks for', () => {
  it('each formula, graph and photo once, formulas at their text size', () => {
    const twice = doc(...(lesson.content ?? []), p({ type: 'inlineMath', attrs: { latex: '\\frac{a}{b}' } }), { type: 'heading', attrs: { level: 1 }, content: [{ type: 'inlineMath', attrs: { latex: 'x' } }] });
    const requests = pictureRequests([twice], 600, 'es');
    expect(drawRequests(requests).map((r) => r.id)).toEqual([formulaKey('\\frac{a}{b}', false, DEFAULT_SIZE), formulaKey('E = mc^2', true, DEFAULT_SIZE), expect.stringMatching(/^g:600:es:g1:/), formulaKey('x', false, DEFAULT_SIZE * 1.75)]);
    expect(photoRequests(requests)).toEqual([{ id: photoKey('media:photo-1'), kind: 'photo', src: 'media:photo-1' }]);
  });

  it('the text width is the paper less the margins', () => {
    // A4, 2.54 cm margins: 15.92 cm at 96 px an inch.
    expect(textWidthPx(setup)).toBeCloseTo(601.7, 1);
    expect(textWidthPx({ ...setup, orientation: 'landscape' })).toBeGreaterThan(900);
  });
});

describe('the .docx', () => {
  it('Title and headings as Word styles; bold, italic, underline, colour, highlight, link; alignment, spacing, indent', async () => {
    const { xml, part } = await unzip(buildDocx([{ title: 'Notes', content: lesson }], options(), stubPictures([lesson])));
    expect(xml).toContain('<w:pStyle w:val="Title"/>');
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(xml).toContain('<w:pStyle w:val="Heading2"/>');
    expect(xml).toMatch(/<w:b\/>.*?Bold/);
    expect(xml).toMatch(/<w:i\/>.*? italic/);
    expect(xml).toMatch(/<w:u w:val="single"\/>.*? under/);
    expect(xml).toMatch(/<w:color w:val="DC2626"\/>.*? red/);
    expect(xml).toMatch(/w:fill="FFF3A3".*? marked/);
    expect(xml).toMatch(/<w:hyperlink [^>]*r:id="[^"]+"/);
    expect(await part('word/_rels/document.xml.rels')).toContain('https://example.com/a');
    expect(xml).toContain('<w:jc w:val="center"/>');
    expect(xml).toMatch(/<w:spacing [^>]*w:line="480"/);
    // One indent step: 2 em of 15 px = 30 px = 450 twips.
    expect(xml).toMatch(/<w:ind w:left="450"\/>/);
    const styles = await part('word/styles.xml');
    expect(styles).toContain('w:styleId="Heading1"');
    expect(styles).toContain('w:styleId="Title"');
  });

  it('lists as Word lists, each numbered list from 1; checklists as ☑ / ☐', async () => {
    const { xml, part } = await unzip(buildDocx([{ title: 'Notes', content: lesson }], options(), stubPictures([lesson])));
    expect(count(xml, /<w:numPr>/)).toBe(6);
    // The nested bullet one level in.
    expect(xml).toMatch(/<w:ilvl w:val="1"\/>.*?two and a half/);
    const numbering = await part('word/numbering.xml');
    expect(numbering).toContain('<w:numFmt w:val="bullet"/>');
    expect(numbering).toContain('<w:numFmt w:val="decimal"/>');
    // The two numbered lists are two instances (Word numbers each from its start).
    const numIds = Array.from(xml.matchAll(/<w:numId w:val="(\d+)"\/>/g), (m) => m[1]);
    expect(new Set(numIds).size).toBe(3);
    expect(xml).toContain('☑ ');
    expect(xml).toContain('☐ ');
    expect(LevelFormat.BULLET).toBe('bullet');
  });

  it('a table with its cell colour, a page break, a callout shaded with its label, chips as text on their colour', async () => {
    const { xml } = await unzip(buildDocx([{ title: 'Notes', content: lesson }], options(), stubPictures([lesson])));
    expect(count(xml, /<w:tbl>/)).toBe(1);
    expect(xml).toMatch(/<w:tcPr>.*?w:fill="D3F5DB".*?<\/w:tcPr>.*?A1/);
    expect(xml).toContain('<w:br w:type="page"/>');
    expect(xml).toMatch(/<w:caps\/>.*?Exam signal/);
    expect(xml).toMatch(/w:fill="FFFBEB".*?This is in the exam\./);
    expect(xml).toMatch(/w:fill="F5E0D8".*? Confused 7\/10 /);
    expect(xml).toMatch(/w:fill="EAE8F7".*? 4:12 /);
  });

  it('formulas, the graph and the photo as pictures; the inline formula lowered to the line', async () => {
    const { xml, zip } = await unzip(buildDocx([{ title: 'Notes', content: lesson }], options(), stubPictures([lesson])));
    expect(count(xml, /<w:drawing>/)).toBe(4);
    expect(Object.keys(zip.files).filter((f) => f.startsWith('word/media/')).length).toBeGreaterThanOrEqual(1);
    // 4 px below the line = 3 pt = 6 half points.
    expect(xml).toMatch(/<w:position w:val="-6"\/><\/w:rPr><w:drawing>/);
    // The photo at 50 % of the text's width (601.7 px → 301 px = 2867025 EMU), its height in proportion (80 × 30 → 113 px).
    expect(xml).toContain('<wp:extent cx="2867025" cy="1076325"/>');
  });

  it('a formula that could not be drawn is its LaTeX; a photo that could not be had is left out', async () => {
    const skip = [formulaKey('E = mc^2', true, DEFAULT_SIZE), photoKey('media:photo-1')];
    const { xml } = await unzip(buildDocx([{ title: 'Notes', content: lesson }], options(), stubPictures([lesson], skip)));
    expect(xml).toMatch(/Cambria Math.*?E = mc\^2/);
    expect(count(xml, /<w:drawing>/)).toBe(2);
  });

  it('the paper, margins and page numbers from the page setup', async () => {
    const a4 = await unzip(buildDocx([{ title: 'Notes', content: lesson }], options(), []));
    expect(a4.xml).toMatch(/<w:pgSz w:w="11906" w:h="16838"/);
    expect(a4.xml).toMatch(/<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/);
    expect(a4.xml).toContain('<w:footerReference');
    const footer = await a4.part('word/footer1.xml');
    expect(footer).toMatch(/PAGE/);
    expect(footer).toContain('<w:jc w:val="center"/>');

    const letter = await unzip(buildDocx([{ title: 'Notes', content: lesson }], options({ setup: { ...setup, size: 'letter', orientation: 'landscape', numbers: 'top-right' } }), []));
    expect(letter.xml).toMatch(/<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/);
    expect(letter.xml).toContain('<w:headerReference');
    expect(letter.xml).not.toContain('<w:footerReference');
    expect(await letter.part('word/header1.xml')).toContain('<w:jc w:val="right"/>');

    const none = await unzip(buildDocx([{ title: 'Notes', content: lesson }], options({ numbers: false }), []));
    expect(none.xml).not.toContain('<w:footerReference');
    expect(none.xml).not.toContain('<w:headerReference');
  });

  it('All tabs: a section each (a new page), its name as a Heading 1; a sheet tab as a table', async () => {
    const sheet = { type: 'doc', content: [{ type: 'sheetCell', attrs: { blockId: 'A1', input: 'Total' } }, { type: 'sheetCell', attrs: { blockId: 'B1', input: '42' } }] } as DocJSON;
    const tabs = [
      { title: 'Notes', content: doc(p(t('first tab'))) },
      { title: 'Numbers', content: sheetTableDoc(sheet) },
    ];
    const { xml } = await unzip(buildDocx(tabs, options({ tabHeadings: true }), []));
    expect(count(xml, /<w:sectPr/)).toBe(2);
    expect(xml).toMatch(/Heading1.*?Notes.*?first tab.*?Heading1.*?Numbers/);
    expect(xml).toMatch(/<w:tbl>.*?Total.*?42.*?<\/w:tbl>/);
    // The numbers run on: no section starts them again.
    expect(xml).not.toContain('w:start=');
  });
});

/** A .docx like one written in Word: made here with the docx library, so it is always the same. */
async function wordFile(): Promise<ArrayBuffer> {
  const file = new Document({
    numbering: {
      config: [{ reference: 'n', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.' }] }],
    },
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun('Tema 3 — Word')] }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Capítulo 1')] }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Sección')] }),
          new Paragraph({
            children: [
              new TextRun({ text: 'negrita', bold: true }),
              new TextRun({ text: ' cursiva', italics: true }),
              new TextRun({ text: ' subrayado', underline: { type: UnderlineType.SINGLE } }),
              new TextRun({ text: ' resaltado', highlight: 'yellow' }),
            ],
          }),
          new Paragraph({ bullet: { level: 0 }, children: [new TextRun('punto uno')] }),
          new Paragraph({ bullet: { level: 0 }, children: [new TextRun('punto dos')] }),
          new Paragraph({ numbering: { reference: 'n', level: 0 }, children: [new TextRun('paso uno')] }),
          new Paragraph({ numbering: { reference: 'n', level: 0 }, children: [new TextRun('paso dos')] }),
          new Table({
            rows: [0, 1, 2].map(
              (r) =>
                new TableRow({
                  children: [0, 1, 2].map(
                    (c) => new TableCell({ children: [new Paragraph(`c${r}${c}`)], ...(r === 0 && c === 0 ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'D3F5DB' } } : {}) }),
                  ),
                }),
            ),
          }),
          new Paragraph({ children: [new ImageRun({ type: 'png', data: Uint8Array.from(atob(PNG), (ch) => ch.charCodeAt(0)), transformation: { width: 40, height: 40 } })] }),
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph('después del salto'),
        ],
      },
    ],
  });
  return Packer.toArrayBuffer(file);
}

const flat = (node: JSONContent): JSONContent[] => [node, ...(node.content ?? []).flatMap(flat)];
const textOf = (node: JSONContent): string => (node.text ?? '') + (node.content ?? []).map(textOf).join('');

describe('importing a .docx', () => {
  it('mammoth then the paste rules: Title, headings, marks, highlight, both lists, the table, the picture, the page break', async () => {
    const { html, pictures } = await readDocx(await wordFile());
    const imported = wordHtmlToDoc(html);
    const blocks = imported.content ?? [];
    expect(blocks[0]).toMatchObject({ type: 'title' });
    expect(textOf(blocks[0])).toBe('Tema 3 — Word');
    expect(blocks[1]).toMatchObject({ type: 'heading', attrs: { level: 1 } });
    expect(blocks[2]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
    const runs = flat(blocks[3]).filter((n) => n.type === 'text');
    expect(runs.find((r) => r.text === 'negrita')?.marks).toEqual([{ type: 'bold' }]);
    expect(runs.find((r) => r.text?.includes('cursiva'))?.marks?.map((m) => m.type)).toContain('italic');
    expect(runs.find((r) => r.text?.includes('subrayado'))?.marks?.map((m) => m.type)).toContain('underline');
    expect(runs.find((r) => r.text?.includes('resaltado'))?.marks?.map((m) => m.type)).toContain('highlight');
    expect(blocks.map((b) => b.type)).toEqual(expect.arrayContaining(['bulletList', 'orderedList', 'table', 'pageBreak']));
    const bullets = blocks.find((b) => b.type === 'bulletList')!;
    expect(bullets.content?.map(textOf)).toEqual(['punto uno', 'punto dos']);
    expect(blocks.find((b) => b.type === 'orderedList')!.content?.map(textOf)).toEqual(['paso uno', 'paso dos']);
    const table = blocks.find((b) => b.type === 'table')!;
    expect(table.content).toHaveLength(3);
    expect(table.content?.[2].content?.map(textOf)).toEqual(['c20', 'c21', 'c22']);
    // The picture is taken out, its place kept for the photo.
    expect(pictures).toEqual([{ contentType: 'image/png', base64: PNG }]);
    expect(flat(imported).some((n) => (n.type === 'image' || n.type === 'inlineImage') && n.attrs?.src === `${IMPORT_PICTURE}0`)).toBe(true);
    // The text after the break is after it.
    const breakAt = blocks.findIndex((b) => b.type === 'pageBreak');
    expect(textOf(blocks[breakAt + 1])).toBe('después del salto');
  });

  it('mammoth’s highlights, page breaks, check boxes and footnote links in the shape of a paste', () => {
    const html = wordPasteHtml('<p><mark class="hl-green">g</mark><mark class="hl-darkcyan">c</mark><input type="checkbox" checked>x<sup><a href="#footnote-1">[1]</a></sup></p><hr class="studiply-page-break"><ol><li><p>note <a href="#footnote-ref-1">↑</a></p></li></ol>');
    expect(html).toContain('<span style="mso-highlight: green">g</span>');
    expect(html).toContain('<span style="mso-highlight: teal">c</span>');
    expect(html).toContain('☑ x');
    expect(html).toContain('<sup>[1]</sup>');
    expect(html).toContain('<div data-page-break=""></div>');
    expect(html).not.toContain('↑');
  });

  it('what the file has that is not kept is found in the file and said', async () => {
    const parts = {
      'word/document.xml':
        '<w:body><w:ins w:id="1" w:author="Ana"><w:r><w:t>new</w:t></w:r></w:ins><w:txbxContent/><m:oMath/><w:r><w:rPr><w:color w:val="FF0000"/></w:rPr></w:r><w:tcPr><w:shd w:val="clear" w:fill="D3F5DB"/></w:tcPr></w:body>',
      'word/comments.xml': '<w:comments><w:comment w:id="0"/><w:comment w:id="1"/></w:comments>',
      'word/header1.xml': '<w:hdr><w:p><w:r><w:t>Universidad</w:t></w:r></w:p></w:hdr>',
    };
    expect(notKeptIn(parts)).toEqual([
      'headers and footers',
      '2 comments',
      'tracked changes (the text is as if they were accepted)',
      'text boxes (their text is kept as ordinary lines)',
      'equations',
      'text colours',
      'background colours (cell colours, and highlights made in Google Docs)',
    ]);
    // A page number alone in the footer, black text, white cells: nothing to say.
    expect(notKeptIn({ 'word/document.xml': '<w:color w:val="000000"/><w:shd w:fill="FFFFFF"/>', 'word/footer1.xml': '<w:t>3</w:t>' })).toEqual([]);
    expect(importNote([{ title: 'Tema 3', notKept: ['2 comments', 'equations'] }])).toEqual({
      title: 'Imported from Word',
      message: '“Tema 3” is a document now. Not kept from the Word file:\n• 2 comments\n• equations',
    });
    expect(importNote([{ title: 'Tema 3', notKept: [] }])).toBeNull();
  });
});

describe('importDocx (the iPhone: a file from Files)', () => {
  it('a document named after the file with the text first, then the picture as its photo; the cache copy removed', async () => {
    const bytes = new Uint8Array(await wordFile());
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    jest.mocked(FileSystem.readAsStringAsync).mockResolvedValue(btoa(binary));
    const result = await importDocx(
      { courseId: 'c1', folderId: null },
      { uri: 'file:///picked/Tema 3.docx', name: 'Tema 3.docx', mimeType: null, sizeBytes: bytes.length },
      { toDoc: async (html) => wordHtmlToDoc(html) },
      1000,
    );
    // The file's one shaded cell (mammoth doesn't read cell colours).
    expect(result).toEqual({ fileId: 'file-1', title: 'Tema 3', notKept: ['background colours (cell colours, and highlights made in Google Docs)'] });
    const created = jest.mocked(createDocument).mock.calls[0][0];
    expect(created).toMatchObject({ courseId: 'c1', folderId: null, title: 'Tema 3' });
    // Every block the student's, dated by the import; no picture yet.
    expect(created.content?.content?.every((b) => b.attrs?.origin === 'student' && b.attrs?.editedAt === 1000 && typeof b.attrs?.blockId === 'string')).toBe(true);
    expect(flat(created.content!).some((n) => n.type === 'image' || n.type === 'inlineImage')).toBe(false);
    expect(jest.mocked(addDocPhoto)).toHaveBeenCalledWith('file-1', expect.objectContaining({ mimeType: 'image/png', uri: expect.stringMatching(/^file:\/\/\/cache\/word-import-.*\.png$/) }));
    // The picture's own bytes went to the phone's file (addDocPhoto's toJpeg draws it on white).
    expect(jest.mocked(FileSystem.writeAsStringAsync)).toHaveBeenCalledWith(expect.stringMatching(/word-import-/), PNG, { encoding: 'base64' });
    const saved = jest.mocked(saveDocument).mock.calls[0][0];
    expect(saved).toMatchObject({ fileId: 'file-1', tab: 'notes', base: created.content });
    expect(flat(saved.next).find((n) => n.type === 'image' || n.type === 'inlineImage')?.attrs?.src).toBe('media:media-1');
    expect(jest.mocked(FileSystem.deleteAsync)).toHaveBeenCalledWith(expect.stringMatching(/word-import-/), { idempotent: true });
  });

  it('a file that is not a .docx inside says so', async () => {
    jest.mocked(FileSystem.readAsStringAsync).mockResolvedValue(btoa('not a zip'));
    const page = { toDoc: async () => doc() };
    await expect(importDocx({ courseId: 'c1', folderId: null }, { uri: 'file:///x.docx', name: 'x.docx', mimeType: null, sizeBytes: 9 }, page)).rejects.toThrow(
      "This Word file can't be read",
    );
  });
});

describe('a picture the photo service refuses on import', () => {
  it('is left out and counted in the note; the document keeps its text', async () => {
    jest.mocked(saveDocument).mockClear();
    jest.mocked(addDocPhoto).mockRejectedValueOnce(new Error("This image can't be read. Try a JPEG or PNG."));
    const bytes = new Uint8Array(await wordFile());
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    jest.mocked(FileSystem.readAsStringAsync).mockResolvedValue(btoa(binary));
    const page = { toDoc: async (html: string) => wordHtmlToDoc(html) };
    const result = await importDocx({ courseId: 'c1', folderId: null }, { uri: 'file:///Tema.docx', name: 'Tema.docx', mimeType: null, sizeBytes: bytes.length }, page);
    expect(result.notKept).toContain('1 picture Studiply can’t show');
    expect(jest.mocked(saveDocument)).not.toHaveBeenCalled();
  });
});

describe('a formula picture keeps only the formula', () => {
  it('KaTeX’s own box (its pieces together) in whole pixels with 1 px around, from the drawing’s top left', () => {
    // A fraction reaching above and below the line (its strut), then "+ x²".
    const parts = [
      { left: 100.4, top: 50.2, right: 118.6, bottom: 72.9 },
      { left: 118.6, top: 53.1, right: 147.2, bottom: 68.0 },
    ];
    // 0.4 … 47.2 across and 2.2 … 24.9 down: whole pixels -1 … 49 and 1 … 26.
    expect(cropBox(parts, { left: 100, top: 48 })).toEqual({ x: -1, y: 1, width: 50, height: 25 });
    // Pieces with no size (an empty group) don't count.
    expect(cropBox([...parts, { left: 0, top: 0, right: 0, bottom: 0 }], { left: 100, top: 48 })).toEqual({ x: -1, y: 1, width: 50, height: 25 });
  });
});

describe('KaTeX’s fonts for the formula pictures', () => {
  it('one face whatever the words for its weight; every file it names; a font known by its bytes', () => {
    // KaTeX's stylesheet says 400 / 700, katexFonts.web.ts says normal / bold: the same faces.
    expect(faceKey('KaTeX_Main', '400', 'normal')).toBe(faceKey('KaTeX_Main', 'normal', 'normal'));
    expect(faceKey('KaTeX_Main', '700', 'italic')).toBe(faceKey('KaTeX_Main', 'bold', 'italic'));
    expect(faceKey('KaTeX_Main', '700', 'normal')).not.toBe(faceKey('KaTeX_Main', '400', 'normal'));
    expect(srcUrls('url(fonts/KaTeX_Main-Regular.woff2) format("woff2"), url("fonts/KaTeX_Main-Regular.woff") format("woff"), url(\'x.ttf\')')).toEqual([
      'fonts/KaTeX_Main-Regular.woff2',
      'fonts/KaTeX_Main-Regular.woff',
      'x.ttf',
    ]);
    const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0]);
    const tag = (s: string) => new Uint8Array([...s].map((ch) => ch.charCodeAt(0)));
    expect(fontType(tag('wOF2xxxx'))).toBe('font/woff2');
    expect(fontType(tag('wOFFxxxx'))).toBe('font/woff');
    expect(fontType(bytes(0, 1, 0, 0))).toBe('font/ttf');
    expect(fontType(tag('OTTOxxxx'))).toBe('font/otf');
    // A missing file answered with the app's page is not a font.
    expect(fontType(tag('<!DOCTYPE html>'))).toBeNull();
  });
});

describe('a round trip', () => {
  it('exported then imported: the same text, headings, lists and table', async () => {
    const start = doc(
      { type: 'heading', attrs: { level: 1 }, content: [t('Mercados')] },
      p(t('Oferta y '), t('demanda', [{ type: 'bold' }])),
      { type: 'bulletList', content: [li('precio'), li('cantidad')] },
      { type: 'orderedList', attrs: { start: 1 }, content: [li('paso 1'), li('paso 2')] },
      { type: 'table', content: [{ type: 'tableRow', content: [cell('a'), cell('b')] }, { type: 'tableRow', content: [cell('c'), cell('d')] }] },
      { type: 'heading', attrs: { level: 2 }, content: [t('Fin')] },
    );
    const bytes = await Packer.toArrayBuffer(buildDocx([{ title: 'T', content: start }], options({ numbers: false }), []));
    const back = wordHtmlToDoc((await readDocx(bytes)).html).content ?? [];
    const shape = (blocks: JSONContent[]) => blocks.map((b) => [b.type, b.attrs?.level ?? null, b.type === 'table' ? b.content?.map((r) => r.content?.map(textOf)) : b.content?.map(textOf).join('|')]);
    expect(shape(back)).toEqual(shape(start.content ?? []));
    expect(flat(back[1]).find((n) => n.text === 'demanda')?.marks).toEqual([{ type: 'bold' }]);
  });
});
