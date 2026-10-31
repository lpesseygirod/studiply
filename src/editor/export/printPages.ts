import { Editor } from '@tiptap/core';

import { studiplyExtensions } from '../bridges';
import { editorCss } from '../editorCss';
import { PAGE_CLASS, PAGE_GAP_CLASS, PAGE_LAYER_CLASS, pageViewOf } from '../page/pageView';
import { cleanPageSetup, paperCm, sheetGeometry, type PageNumbers, type PageSetup, type SheetGeometry } from '../page/pageSetup';
import { PHOTO_CLASS, PHOTO_LOADING } from '../schema/photo';
import { COMMENT_CLASS } from '../schema/comments';
import { katexFamiliesIn, katexFontFaces } from './pictures';
import { LightColors } from '../../constants/colors';
import type { DocJSON } from '../types';

/**
 * The PDF export (step 4.8a), on both devices: the laptop runs it in its own
 * page, the iPhone in a WebView of the editor bundle (PdfRenderer).
 *
 * The pages are the page view's (4.5b): each tab is put in a hidden editor
 * with the document's page setup, Pages on, at 100 % and no gap between
 * pages, and the page view lays it out with pageLayout.ts's rules (widows
 * and orphans, headings with the next line, page breaks, photos and
 * formulas whole, tables between rows). Then every page becomes a box of
 * the paper's size, holding the blocks that are on it where the page view
 * put them; a block that goes on to the next page is cut in the blank
 * margin between them, and shows its next part there. Graphs, formulas,
 * callouts, chips and photos are the editor's own drawing, so they print as
 * they look. The numbers go through the whole file.
 *
 * Step 8.3: a summary's PDF (export/summaryPrint.ts makes its tabs) has a running header from page 2
 * and a "Studiply · Page 2 of 4" footer instead of the number (`running`). Every PDF carries the
 * KaTeX faces its formulas use as data (they printed in fallback fonts when only linked).
 */

export interface PrintTab {
  /** Shown as a heading at the top of the tab's first page (All tabs). */
  title: string;
  content: DocJSON;
}

export interface PrintOptions {
  setup: PageSetup;
  /** Page numbers (on by default): where the page setup puts them, else bottom centre. */
  numbers: boolean;
  /** All tabs: each tab starts with its name as a heading. */
  tabHeadings: boolean;
  /** The document's language (graphs write decimals with a comma in Spanish). */
  language?: string | null;
  /**
   * `browser`: Chrome's print dialog (CSS px at 96 per inch, the page in cm).
   * `ios`: expo-print, whose pages are in points and lays CSS px out as points: the pages are drawn at 3/4.
   */
  target: 'browser' | 'ios';
  /**
   * Step 8.3, a summary's PDF (SUMMARY-SPEC): a running header from page 2 (the course left, the
   * lecture's title right) and a footer on every page ("Studiply" left, "Page 2 of 4" right), in
   * place of the page number.
   */
  running?: RunningHead;
}

export interface RunningHead {
  left: string;
  right: string;
}

/** The footer's left word (the app's name). */
export const BRAND = 'Studiply';

export interface PrintResult {
  html: string;
  pages: number;
  /** The paper in points (expo-print's width and height). */
  width: number;
  height: number;
}

/** A block of a tab as the page view placed it (CSS px from the top of the tab's first page). */
export interface PlacedBlock {
  top: number;
  bottom: number;
  left: number;
  width: number;
  html: string;
  /**
   * How far the block's own box lands below its print wrapper's top: margins of its first
   * descendants that collapse out of it in the editor (a table's top margin out of its
   * wrapper) stay inside the wrapper, which is placed this much higher to make up for it.
   */
  inset?: number;
}

const PT_PER_CM = 72 / 2.54;
/** iOS: CSS px are laid out as points; 96 px make an inch, 72 points too. */
const IOS_SCALE = 0.75;
const NUMBER_LINE = 16;
const PRINT = 'studiply-print';
/** The scope the editor's look is given in the print document. */
const SCOPE = 'studiply-export';

/** The tab's content, with its name as a Heading 1 on top (All tabs). */
export function withTabHeading(tab: PrintTab): DocJSON {
  const heading = { type: 'heading', attrs: { level: 1 }, content: tab.title ? [{ type: 'text', text: tab.title }] : undefined };
  return { ...tab.content, content: [heading, ...(tab.content.content ?? [])] } as DocJSON;
}

/** Where the numbers go: the page setup's place, bottom centre when it has them off. */
export const numberPlace = (setup: PageSetup): Exclude<PageNumbers, 'off'> => (setup.numbers === 'off' ? 'bottom-center' : setup.numbers);

/** The paper in points (cm → pt), as expo-print takes it. */
export function paperPoints(setup: PageSetup): { width: number; height: number } {
  const paper = paperCm(cleanPageSetup(setup));
  return { width: Math.round(paper.width * PT_PER_CM * 100) / 100, height: Math.round(paper.height * PT_PER_CM * 100) / 100 };
}

/** The blocks on each page: those that reach into it, with their top from the page's top. */
export function blocksByPage(blocks: PlacedBlock[], pages: number, pageHeight: number): PlacedBlock[][] {
  const out: PlacedBlock[][] = Array.from({ length: pages }, () => []);
  for (const b of blocks) {
    for (let k = 0; k < pages; k++) {
      const top = k * pageHeight;
      if (b.bottom > top + 0.5 && b.top < top + pageHeight - 0.5) out[k].push({ ...b, top: b.top - top, bottom: b.bottom - top });
    }
  }
  return out;
}

/** The page's body and its blocks in the print (also in the page that lays the tabs out, to find each block's inset). */
const BLOCK_CSS = `
.${SCOPE} .ProseMirror.${PRINT}-body { position: absolute; inset: 0; width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; background: #fff; overflow: visible; orphans: 1; widows: 1; }
.${PRINT}-block { position: absolute; }
.${PRINT}-block > * { margin-top: 0 !important; margin-bottom: 0 !important; }`;

const blockHtml = (b: PlacedBlock, top: number) => `<div class="${PRINT}-block" style="top: ${top - (b.inset ?? 0)}px; left: ${b.left}px; width: ${b.width}px">${b.html}</div>`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A page's number, placed as the page view places it (in the middle of its margin; on the right, lined up with the text). */
function numberHtml(n: number, place: Exclude<PageNumbers, 'off'>, sheet: SheetGeometry): string {
  const top = place === 'top-right';
  const margin = top ? sheet.marginTop : sheet.marginBottom;
  const edge = `${top ? 'top' : 'bottom'}: ${Math.max(4, (margin - NUMBER_LINE) / 2)}px`;
  const side = place === 'bottom-center' ? 'left: 0; right: 0; text-align: center' : `right: ${Math.max(8, sheet.marginRight)}px; text-align: right`;
  return `<span class="${PRINT}-number" style="${edge}; ${side}">${n}</span>`;
}

/**
 * A summary's running header (from page 2) and footer (every page), each in the middle of its margin,
 * lined up with the text's edges (step 8.3).
 */
function runningHtml(k: number, total: number, running: RunningHead, sheet: SheetGeometry): string {
  const across = `left: ${sheet.marginLeft}px; right: ${sheet.marginRight}px`;
  const line = (where: 'top' | 'bottom', left: string, right: string, kind: string) =>
    `<div class="${PRINT}-${kind}" style="${where}: ${Math.max(4, ((where === 'top' ? sheet.marginTop : sheet.marginBottom) - NUMBER_LINE) / 2)}px; ${across}"><span>${esc(left)}</span><span>${esc(right)}</span></div>`;
  return `${k > 0 ? line('top', running.left, running.right, 'header') : ''}${line('bottom', BRAND, `Page ${k + 1} of ${total}`, 'footer')}`;
}

/** The print document: one box of the paper's size per page. `styles`: the page's own stylesheets (KaTeX and its fonts). */
export function printDocument(pages: PlacedBlock[][], options: Pick<PrintOptions, 'setup' | 'numbers' | 'target' | 'language' | 'running'>, title: string, styles = ''): string {
  const setup = cleanPageSetup(options.setup);
  const sheet = sheetGeometry(setup);
  const paper = paperCm(setup);
  const ios = options.target === 'ios';
  const pt = paperPoints(setup);
  // The page box: the paper exactly (cm in Chrome; points, drawn at 3/4, on iOS), never more, so no blank page follows.
  const box = ios ? `width: ${Math.floor(pt.width * 100) / 100}px; height: ${Math.floor(pt.height * 100) / 100}px` : `width: ${paper.width}cm; height: ${paper.height}cm`;
  const place = numberPlace(setup);
  const body = pages
    .map((blocks, k) => {
      const inner = blocks.map((b) => blockHtml(b, b.top)).join('');
      const marginal = options.running ? runningHtml(k, pages.length, options.running, sheet) : options.numbers ? numberHtml(k + 1, place, sheet) : '';
      return `<section class="${PRINT}-page" data-page="${k + 1}"><div class="${PRINT}-scale"><div class="${SCOPE}"><div class="ProseMirror ${PAGE_CLASS} ${PRINT}-body">${inner}</div></div>${marginal}</div></section>`;
    })
    .join('\n');
  const c = LightColors;
  const css = `
@page { size: ${paper.width}cm ${paper.height}cm; margin: 0; }
html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.${PRINT}-page { position: relative; ${box}; overflow: hidden; break-after: page; page-break-after: always; break-inside: avoid; }
.${PRINT}-page:last-child { break-after: auto; page-break-after: auto; }
.${PRINT}-scale { position: absolute; left: 0; top: 0; width: ${sheet.width}px; height: ${sheet.height}px;${ios ? ` transform: scale(${IOS_SCALE}); transform-origin: 0 0;` : ''} }
${BLOCK_CSS}
.${SCOPE} .${PAGE_GAP_CLASS} { background: transparent !important; }
.${SCOPE} .${PAGE_GAP_CLASS} * { visibility: hidden; }
.${SCOPE} .page-break { visibility: hidden; }
.${SCOPE} .${COMMENT_CLASS}, .${SCOPE} .${COMMENT_CLASS}.resolved { background: none !important; }
.${SCOPE} .ProseMirror-selectednode { outline: none !important; }
.${PRINT}-number { position: absolute; font: 11px/16px -apple-system, system-ui, sans-serif; color: ${c.text.secondary}; }
/* A summary's header and footer (step 8.3): 8.5 pt (11.33 px) in the secondary colour; a long name ends in "…" rather than wrapping. */
.${PRINT}-header, .${PRINT}-footer { position: absolute; display: flex; justify-content: space-between; gap: 24px; font: 11.33px/16px -apple-system, system-ui, sans-serif; color: ${c.text.secondary}; white-space: nowrap; }
.${PRINT}-header span, .${PRINT}-footer span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.${PRINT}-header span:last-child, .${PRINT}-footer span:last-child { flex-shrink: 0; max-width: 60%; }
`;
  const lang = options.language ? ` lang="${esc(options.language)}"` : '';
  return `<!DOCTYPE html><html${lang}><head><meta charset="utf-8"><title>${esc(title)}</title>${styles}<style>${editorCss(`.${SCOPE}`)}</style><style>${css}</style></head><body>${body}</body></html>`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits until the page view has laid the tab out and nothing is still loading (photos, fonts, graphs). */
async function settled(editor: Editor, timeout = 20000): Promise<void> {
  await (document.fonts?.ready ?? Promise.resolve()).catch(() => {});
  const dom = editor.view.dom as HTMLElement;
  const until = Date.now() + timeout;
  let last = '';
  let stable = 0;
  while (Date.now() < until) {
    await sleep(150);
    const loading =
      // Fonts asked for while the tab is drawn (KaTeX's for a formula) change its sizes when they arrive.
      document.fonts?.status === 'loading' ||
      Array.from(dom.querySelectorAll('img')).some((img) => img.getAttribute('src') && !img.complete) ||
      Array.from(dom.querySelectorAll(`.${PHOTO_CLASS}`)).some((p) => p.textContent?.includes(PHOTO_LOADING));
    const layout = pageViewOf(editor.state)?.layout;
    // To the hundredth of a pixel: the page view draws again for any change (pageView.ts), so this waits for its last layout.
    // The height too, to the hundredth (offsetHeight is whole pixels): a block that grows by a fraction (a graph drawn late, a font) moves everything after it.
    const key = layout ? JSON.stringify([layout.pages, layout.tail.toFixed(2), layout.gaps.map((g) => [g.at, g.height.toFixed(2)]), dom.getBoundingClientRect().height.toFixed(2)]) : '';
    if (!loading && key && key === last) {
      stable += 1;
      if (stable >= 2) return;
    } else stable = 0;
    last = key;
  }
}

const MEASURE_CSS_ID = 'studiply-export-css';

/** The editor's look under the export's scope, once in the page, so the hidden editor measures as the page view draws. */
function ensureMeasureCss(): void {
  if (document.getElementById(MEASURE_CSS_ID)) return;
  const style = document.createElement('style');
  style.id = MEASURE_CSS_ID;
  style.textContent = `${editorCss(`.${SCOPE}`)}\n${BLOCK_CSS}`;
  document.head.appendChild(style);
}

/**
 * Each block's inset in the print (PlacedBlock.inset): the blocks are put once in the print's
 * own body and wrappers, off screen, and how far each block's box lands below its wrapper's
 * top is measured.
 */
function printInsets(blocks: PlacedBlock[], width: number): number[] {
  const probe = document.createElement('div');
  probe.className = SCOPE;
  probe.setAttribute('aria-hidden', 'true');
  Object.assign(probe.style, { position: 'absolute', left: '-20000px', top: '0', width: `${width}px`, pointerEvents: 'none' });
  probe.innerHTML = `<div class="ProseMirror ${PAGE_CLASS} ${PRINT}-body" style="position: relative; height: auto">${blocks.map((b) => blockHtml({ ...b, inset: 0 }, 0)).join('')}</div>`;
  document.body.appendChild(probe);
  try {
    return Array.from(probe.querySelectorAll(`.${PRINT}-block`)).map((wrapper) => {
      const own = wrapper.firstElementChild;
      return own ? own.getBoundingClientRect().top - wrapper.getBoundingClientRect().top : 0;
    });
  } finally {
    probe.remove();
  }
}

/** The tab laid out in pages: its blocks where the page view put them, how many pages, and the KaTeX font families its formulas use. */
async function layOut(content: DocJSON, setup: PageSetup, language: string | null | undefined): Promise<{ blocks: PlacedBlock[]; pages: number; fonts: Set<string> }> {
  ensureMeasureCss();
  const sheet = sheetGeometry(setup);
  const host = document.createElement('div');
  host.className = SCOPE;
  host.setAttribute('aria-hidden', 'true');
  if (language) host.setAttribute('lang', language);
  // Off screen but laid out (the page view measures it), as wide as the paper.
  Object.assign(host.style, { position: 'absolute', left: '-20000px', top: '0', width: `${sheet.width}px`, pointerEvents: 'none' });
  document.body.appendChild(host);
  const editor = new Editor({ element: host, extensions: studiplyExtensions(), content, editable: false });
  try {
    editor.chain().setPageSetup({ ...setup, gap: 0 }).setPageZoom(1).setPageView(true).run();
    await settled(editor);
    const dom = editor.view.dom as HTMLElement;
    const capture = (): PlacedBlock[] => {
      const box = dom.getBoundingClientRect();
      const blocks: PlacedBlock[] = [];
      for (const el of Array.from(dom.children)) {
        if (el.classList.contains(PAGE_GAP_CLASS) || el.classList.contains(PAGE_LAYER_CLASS)) continue;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        blocks.push({ top: r.top - box.top, bottom: r.bottom - box.top, left: r.left - box.left, width: r.width, html: el.outerHTML });
      }
      return blocks;
    };
    const where = (blocks: PlacedBlock[]) => JSON.stringify(blocks.map((b) => [b.top.toFixed(2), b.bottom.toFixed(2)]));
    // Taken again until two takes agree to the hundredth of a pixel: a block can still change a
    // fraction after the layout looks settled, and every block after it moves with it.
    let blocks = capture();
    let insets = printInsets(blocks, sheet.width);
    for (let i = 0; i < 20; i++) {
      await sleep(200);
      const again = capture();
      if (where(again) === where(blocks)) break;
      blocks = again;
      insets = printInsets(blocks, sheet.width);
    }
    const pages = pageViewOf(editor.state)?.layout?.pages ?? Math.max(1, Math.ceil(dom.offsetHeight / sheet.height));
    return { blocks: blocks.map((b, i) => (insets[i] ? { ...b, inset: insets[i] } : b)), pages, fonts: katexFamiliesIn(dom) };
  } finally {
    editor.destroy();
    host.remove();
  }
}

/** The page's stylesheets (KaTeX and its fonts among them), for the print document. */
export function pageStyles(): string {
  return Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))
    .filter((n) => n.id !== MEASURE_CSS_ID)
    .map((n) => n.outerHTML)
    .join('');
}

/** The print document of the tabs: every tab from a new page, numbers through the whole file. */
export async function buildPrint(tabs: PrintTab[], options: PrintOptions, title: string): Promise<PrintResult> {
  const setup = cleanPageSetup(options.setup);
  const sheet = sheetGeometry(setup);
  const pages: PlacedBlock[][] = [];
  const fonts = new Set<string>();
  for (const tab of tabs) {
    const content = options.tabHeadings ? withTabHeading(tab) : tab.content;
    const laid = await layOut(content, setup, options.language);
    pages.push(...blocksByPage(laid.blocks, laid.pages, sheet.height));
    laid.fonts.forEach((f) => fonts.add(f));
  }
  // Step 8.3 (SUMMARY-SPEC: fonts embedded, works offline): the formulas' KaTeX faces go in as data, last, so the print never waits for a link.
  const faces = await katexFontFaces(fonts);
  const html = printDocument(pages, { ...options, setup }, title, `${pageStyles()}${faces ? `<style>${faces}</style>` : ''}`);
  return { html, pages: pages.length, ...paperPoints(setup) };
}
