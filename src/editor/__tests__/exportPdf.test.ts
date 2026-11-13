/**
 * @jest-environment jsdom
 */
// The PDF export: what doesn't need a browser's layout. The
// pages themselves (the page view's) are checked in Chrome (export.mjs).
import { blocksByPage, numberPlace, paperPoints, printDocument, withTabHeading, type PlacedBlock } from '../export/printPages';
import { EMPTY_SHEET_TEXT, sheetTableDoc } from '../export/sheetTable';
import { DEFAULT_PAGE_SETUP, type PageSetup } from '../page/pageSetup';
import type { DocJSON } from '../types';

const cell = (address: string, input: string, bold = false) => ({ type: 'sheetCell', attrs: { blockId: address, input, bold } });
const sheet = (...cells: object[]) => ({ type: 'doc', content: cells }) as DocJSON;
type Json = { type: string; attrs?: Record<string, unknown>; content?: Json[]; text?: string; marks?: { type: string }[] };
const rowsOf = (doc: DocJSON) => ((doc.content as Json[])[0].content ?? []).map((row) => (row.content ?? []).map((c) => c.content?.[0]));
const textOf = (p: Json | undefined) => p?.content?.map((t) => t.text).join('') ?? '';

describe('a sheet tab in the PDF', () => {
  it('is a table of the values, from A1 to the last row and column used', () => {
    const doc = sheetTableDoc(sheet(cell('A1', 'Amount'), cell('B1', '200000'), cell('A2', 'Payment'), cell('B2', '=PMT(3.5%/12, 360, -B1)'), cell('C3', 'x')));
    const rows = rowsOf(doc);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveLength(3);
    expect(textOf(rows[0][0])).toBe('Amount');
    // Rounded as Excel's General to 11 characters (a cell's room without measuring it).
    expect(textOf(rows[1][1])).toBe('898.0893756');
    expect(textOf(rows[2][2])).toBe('x');
    expect(rows[0][2]?.content).toBeUndefined();
  });

  it('numbers on the right, TRUE and errors centred, text left; bold kept', () => {
    const doc = sheetTableDoc(sheet(cell('A1', 'Total', true), cell('B1', '42'), cell('C1', '=1/0'), cell('D1', '=1>0')));
    const [row] = rowsOf(doc);
    expect(row.map((p) => p?.attrs?.textAlign ?? null)).toEqual([null, 'right', 'center', 'center']);
    expect(row.map(textOf)).toEqual(['Total', '42', '#DIV/0!', 'TRUE']);
    expect(row[0]?.content?.[0].marks).toEqual([{ type: 'bold' }]);
    expect(row[1]?.content?.[0].marks).toBeUndefined();
  });

  it('an empty sheet says so', () => {
    expect(JSON.stringify(sheetTableDoc(sheet()))).toContain(EMPTY_SHEET_TEXT);
  });
});

describe('All tabs', () => {
  it('each tab starts with its name as a Heading 1', () => {
    const doc = withTabHeading({ title: 'Semana 3', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hola' }] }] } as DocJSON });
    const [first, second] = doc.content as Json[];
    expect(first).toMatchObject({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Semana 3' }] });
    expect(second.type).toBe('paragraph');
  });
});

describe('pages', () => {
  const block = (top: number, bottom: number, html = 'p'): PlacedBlock => ({ top, bottom, left: 96, width: 600, html: `<p>${html}</p>` });

  it('a block is on every page it reaches, its top from that page', () => {
    const pages = blocksByPage([block(96, 200, 'a'), block(1000, 1200, 'b'), block(1300, 1400, 'c')], 2, 1122.5);
    expect(pages[0].map((b) => b.html)).toEqual(['<p>a</p>', '<p>b</p>']);
    expect(pages[1].map((b) => b.html)).toEqual(['<p>b</p>', '<p>c</p>']);
    expect(pages[1][0].top).toBeCloseTo(1000 - 1122.5);
    expect(pages[1][1].top).toBeCloseTo(1300 - 1122.5);
  });

  it('numbers go where the page setup puts them; bottom centre when it has them off', () => {
    expect(numberPlace(DEFAULT_PAGE_SETUP)).toBe('bottom-center');
    expect(numberPlace({ ...DEFAULT_PAGE_SETUP, numbers: 'top-right' })).toBe('top-right');
    expect(numberPlace({ ...DEFAULT_PAGE_SETUP, numbers: 'off' })).toBe('bottom-center');
  });

  it('the paper in points: A4, Letter, landscape', () => {
    expect(paperPoints(DEFAULT_PAGE_SETUP)).toEqual({ width: 595.28, height: 841.89 });
    expect(paperPoints({ ...DEFAULT_PAGE_SETUP, size: 'letter' })).toEqual({ width: 612, height: 792 });
    expect(paperPoints({ ...DEFAULT_PAGE_SETUP, orientation: 'landscape' })).toEqual({ width: 841.89, height: 595.28 });
  });
});

describe('the print document', () => {
  const pages = [[{ top: 96, bottom: 120, left: 96, width: 600, html: '<p>uno</p>' }], [{ top: 96, bottom: 120, left: 96, width: 600, html: '<p>dos</p>' }], []];
  const letterLandscape: PageSetup = { ...DEFAULT_PAGE_SETUP, size: 'letter', orientation: 'landscape' };

  it('one box of the paper’s size per page, the page size for Chrome in cm', () => {
    const html = printDocument(pages, { setup: DEFAULT_PAGE_SETUP, numbers: true, target: 'browser' }, 'Finanzas');
    expect(html).toContain('@page { size: 21cm 29.7cm; margin: 0; }');
    expect(html.match(/<section class="studiply-print-page"/g)).toHaveLength(3);
    expect(html).toContain('width: 21cm; height: 29.7cm');
    expect(html).toContain('<title>Finanzas</title>');
    expect(html.indexOf('uno')).toBeLessThan(html.indexOf('dos'));
  });

  it('Letter landscape turns the page', () => {
    expect(printDocument(pages, { setup: letterLandscape, numbers: false, target: 'browser' }, 'x')).toContain('@page { size: 27.94cm 21.59cm; margin: 0; }');
  });

  it('numbers 1…n through the file, or none', () => {
    const on = printDocument(pages, { setup: DEFAULT_PAGE_SETUP, numbers: true, target: 'browser' }, 'x');
    expect([...on.matchAll(/class="studiply-print-number"[^>]*>(\d+)</g)].map((m) => m[1])).toEqual(['1', '2', '3']);
    expect(printDocument(pages, { setup: DEFAULT_PAGE_SETUP, numbers: false, target: 'browser' }, 'x')).not.toContain('class="studiply-print-number"');
  });

  it('iOS: the page in points, the content drawn at 3/4 (expo-print lays CSS px out as points)', () => {
    const html = printDocument(pages, { setup: DEFAULT_PAGE_SETUP, numbers: true, target: 'ios' }, 'x');
    expect(html).toContain('width: 595.28px; height: 841.89px');
    expect(html).toContain('transform: scale(0.75)');
  });

  it('a block whose box lands lower in its wrapper (a table’s margin) is placed that much higher', () => {
    const table = { top: 612.5, bottom: 1325, left: 96, width: 600, html: '<div class="tableWrapper"><table></table></div>', inset: 9 };
    const html = printDocument([[table]], { setup: DEFAULT_PAGE_SETUP, numbers: false, target: 'browser' }, 'x');
    expect(html).toContain('style="top: 603.5px; left: 96px; width: 600px"');
  });

  it('the title is escaped; the language is kept', () => {
    const html = printDocument(pages, { setup: DEFAULT_PAGE_SETUP, numbers: true, target: 'browser', language: 'es' }, 'A <b> & "c"');
    expect(html).toContain('<title>A &lt;b&gt; &amp; &quot;c&quot;</title>');
    expect(html).toContain('<html lang="es">');
  });
});
