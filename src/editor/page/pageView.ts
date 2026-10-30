import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

import { layoutPages, type PageGap, type PageLayout, type PageUnit } from './pageLayout';
import { cleanPageSetup, DEFAULT_SHEET, sheetGeometry, type PageSetup, type SheetGeometry } from './pageSetup';

/**
 * The page view (step 4.5b), on both devices: pages with gaps
 * between them, like Word, and zoom. It only changes the display: the
 * document stays one pageless JSON (ids, merge, sync untouched).
 *
 * In Pages the editor is the sheet (as wide as the page setup's paper, its
 * margins as padding; page setup, after test D, is per document).
 * After layout it measures the document with no gaps (pageLayout.ts has
 * the rules), then draws each gap as a widget where a page ends: blank
 * paper to the bottom margin, the page number, the grey gap, the next
 * page's top margin. Between blocks a gap is a block, inside a paragraph
 * it breaks the line there, in a table it is a row. Remeasured after
 * changes (debounced), on resize, fonts and photos loading, and zoom.
 *
 * Zoom is CSS `zoom` on the editor itself (both modes), so the bars and
 * handles drawn beside it keep measuring the screen as before. Pages are
 * measured in CSS px, so zooming doesn't move a break.
 *
 * `fit` (the iPhone's Print layout): the sheet fits the screen's width and
 * the zoom multiplies that; a pinch zooms (WebKit's gesture events, as the
 * WebView turns the browser's own zoom off), and "Page 3 of 12" shows while
 * scrolling. The laptop works out its own zoom (Fit is at most 100 % there).
 */

export const PAGE_CLASS = 'studiply-pages';
export const PAGE_GAP_CLASS = 'studiply-page-gap';
export const PAGE_LAYER_CLASS = 'studiply-page-layer';
/** On the editor once its pages are drawn (until then it stays one white sheet). */
export const PAGES_DRAWN_CLASS = 'studiply-pages-drawn';
const MEASURING_CLASS = 'studiply-page-measuring';
const DEBOUNCE_MS = 120;
/** The iPhone: room left and right of the sheet in Print layout. */
const FIT_PADDING = 8;
const LABEL_CLASS = 'studiply-page-label';
/** The page number's line height (editorCss). */
const NUMBER_LINE = 16;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;
/** Fit at phone width goes below the zoom steps' 50 % (lib/viewPrefs FIT_MIN_ZOOM; not imported: the WebView bundle has no storage). */
const FIT_MIN_ZOOM = 0.25;

export interface PageViewState {
  pages: boolean;
  /** The zoom chosen; shown multiplied by `factor` when `fit` and in Pages. */
  zoom: number;
  fit: boolean;
  /** The screen's width for the sheet (`fit`). */
  factor: number;
  /** The page from the document's page setup. */
  sheet: SheetGeometry;
  layout: PageLayout | null;
  decorations: DecorationSet;
}
type Meta = { pages?: boolean; zoom?: number; fit?: boolean; factor?: number; sheet?: SheetGeometry; layout?: PageLayout | null; gaps?: DrawnGap[] };
/** A gap as drawn. */
interface DrawnGap extends PageGap {
  /** A table's columns, for a gap drawn as one of its rows (more would add columns to the table). */
  cols?: number;
}

export const pageViewKey = new PluginKey<PageViewState>('studiplyPageView');

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageView: {
      /** Pages (true) or Pageless. */
      setPageView: (pages: boolean) => ReturnType;
      /** 0.5–2 (1 is 100 %); Fit at phone width down to 0.25. */
      setPageZoom: (zoom: number) => ReturnType;
      /** The iPhone's Print layout: the sheet fits the screen's width, the zoom multiplies it. */
      setPageFit: (fit: boolean) => ReturnType;
      /** The document's page setup: paper, margins, page numbers, gap. */
      setPageSetup: (setup: PageSetup) => ReturnType;
    };
  }
}

// The student's steps stay 0.5–2 (lib/viewPrefs); only Fit asks for less.
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(FIT_MIN_ZOOM, Math.round(z * 100) / 100));

export const pageViewOf = (state: EditorState): PageViewState | undefined => pageViewKey.getState(state);

/** The CSS zoom the editor is shown at. */
export const shownZoom = (s: PageViewState) => s.zoom * (s.fit && s.pages ? s.factor : 1);

/** A gap: blank space where a page ends (the pages behind it are the layer's). */
function gapWidget(g: DrawnGap) {
  return () => {
    const row = g.place === 'row';
    const el = document.createElement(row ? 'tr' : g.place === 'inline' ? 'span' : 'div');
    el.className = PAGE_GAP_CLASS;
    el.contentEditable = 'false';
    el.setAttribute('aria-hidden', 'true');
    const inner = row ? document.createElement('td') : el;
    if (row) {
      (inner as HTMLTableCellElement).colSpan = g.cols ?? 1;
      el.appendChild(inner);
    }
    inner.style.height = `${Math.max(0, g.height)}px`;
    return el;
  };
}

/**
 * The white pages, behind the text: one sheet per page with its shadow and
 * its number, so the gaps between them show what is behind the editor (the
 * app's gradient).
 */
function pageLayer(pages: number, sheet: SheetGeometry) {
  return () => {
    const layer = document.createElement('div');
    layer.className = PAGE_LAYER_CLASS;
    layer.contentEditable = 'false';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.width = `${sheet.width}px`;
    for (let i = 0; i < pages; i++) {
      const page = document.createElement('div');
      page.className = `${PAGE_LAYER_CLASS}-sheet`;
      page.style.top = `${i * (sheet.height + sheet.gap)}px`;
      page.style.height = `${sheet.height}px`;
      if (sheet.numbers !== 'off') {
        // In the middle of its margin; on the right, lined up with the text's right edge.
        const number = document.createElement('span');
        number.className = `${PAGE_LAYER_CLASS}-number`;
        number.textContent = String(i + 1);
        const top = sheet.numbers === 'top-right';
        const margin = top ? sheet.marginTop : sheet.marginBottom;
        number.style[top ? 'top' : 'bottom'] = `${Math.max(4, (margin - NUMBER_LINE) / 2)}px`;
        if (sheet.numbers === 'bottom-center') Object.assign(number.style, { left: '0', right: '0', textAlign: 'center' });
        else Object.assign(number.style, { right: `${Math.max(8, sheet.marginRight)}px`, textAlign: 'right' });
        page.appendChild(number);
      }
      layer.appendChild(page);
    }
    return layer;
  };
}

/** A gap's height in a widget's key: to the hundredth, so a gap that changes by a fraction of a pixel is drawn again (ProseMirror keeps a widget whose key is the same). */
const px2 = (n: number) => n.toFixed(2);

function decorationsFor(doc: PMNode, gaps: DrawnGap[], layout: PageLayout, sheet: SheetGeometry): DecorationSet {
  const decos = gaps.map((g) => Decoration.widget(g.at, gapWidget(g), { side: -1, key: `gap-${g.page}-${g.at}-${px2(g.height)}-${g.place}`, ignoreSelection: true }));
  decos.push(Decoration.widget(0, pageLayer(layout.pages, sheet), { side: -1, key: `pages-${layout.pages}-${JSON.stringify(sheet)}`, ignoreSelection: true }));
  // The rest of the last page.
  decos.push(
    Decoration.widget(doc.content.size, gapWidget({ unit: -1, at: doc.content.size, place: 'block', height: layout.tail, page: layout.pages + 1 }), {
      side: 1,
      key: `tail-${layout.pages}-${px2(layout.tail)}`,
      ignoreSelection: true,
    }),
  );
  return DecorationSet.create(doc, decos);
}

/** Line boxes from a block's client rects: rects that overlap vertically are one line. */
function linesOf(el: HTMLElement): { top: number; bottom: number; left: number }[] {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = Array.from(range.getClientRects())
    .filter((r) => r.width > 0 && r.height > 0)
    .sort((a, b) => a.top - b.top);
  const lines: { top: number; bottom: number; left: number }[] = [];
  for (const r of rects) {
    const line = lines[lines.length - 1];
    if (line && r.top < line.bottom - 2) {
      line.bottom = Math.max(line.bottom, r.bottom);
      line.left = Math.min(line.left, r.left);
    } else lines.push({ top: r.top, bottom: r.bottom, left: r.left });
  }
  return lines;
}

const TEXTBLOCKS_KEEP_WITH_NEXT = ['heading', 'title'];
const CONTAINERS = ['bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'blockquote'];

/**
 * Measures the document (no gaps shown) into units for the layout, in CSS px from the first page's text top.
 * `textHeight`: a page's text area (a callout that fits moves whole; a longer one splits between lines).
 * `scale`: the CSS zoom the editor is shown at (shownZoom), exactly. Not box.width / offsetWidth:
 * offsetWidth is whole pixels, and an A4 sheet is 793.7 px wide, so that ratio is 0.99962 at
 * 100 %, every position came out 0.04 % too far down (1 px by the third page), the gaps that
 * much short, and the pages started off their top margin (step 4.8a's PDF check found it).
 */
function measure(view: EditorView, textHeight: number, scale: number): { units: PageUnit[]; scale: number; sheetLeft: number; end: number } | null {
  const dom = view.dom as HTMLElement;
  const box = dom.getBoundingClientRect();
  if (!dom.offsetWidth || !box.width || !scale) return null;
  const style = getComputedStyle(dom);
  const top0 = box.top + parseFloat(style.paddingTop) * scale + parseFloat(style.borderTopWidth) * scale;
  const y = (v: number) => (v - top0) / scale;
  const units: PageUnit[] = [];
  const elementAt = (pos: number) => view.nodeDOM(pos) as HTMLElement | null;
  const marginBottom = (el: Element) => parseFloat(getComputedStyle(el).marginBottom) || 0;
  // A gap before the block at `at` begins where the block before it ends (its bottom margin
  // included); what is between the block's edge and the unit's top (`lead`) stays.
  const gapBefore = (at: number, unitTop: number): { start: number; lead: number } => {
    const outer = elementAt(at);
    if (!(outer instanceof Element)) return { start: unitTop, lead: 0 };
    const top = y(outer.getBoundingClientRect().top);
    let prev = outer.previousElementSibling;
    while (prev && (prev.classList.contains(PAGE_GAP_CLASS) || prev.classList.contains(PAGE_LAYER_CLASS))) prev = prev.previousElementSibling;
    const start = prev ? y(prev.getBoundingClientRect().bottom) + marginBottom(prev) : top;
    return { start, lead: unitTop - top };
  };

  // The position a first line's gap goes before: the outermost block it is the first line of.
  const outerStart = (doc: PMNode, pos: number) => {
    const $pos = doc.resolve(pos);
    let depth = $pos.depth;
    while (depth > 1 && $pos.index(depth - 1) === 0) depth -= 1;
    return depth >= 1 ? $pos.before(depth) : pos;
  };

  const block = (node: PMNode, pos: number, blockIndex: number) => {
    const el = elementAt(pos);
    if (!el || !(el instanceof HTMLElement)) return;
    const r = el.getBoundingClientRect();
    const name = node.type.name;
    if (name === 'pageBreak') {
      units.push({ kind: 'break', at: pos + node.nodeSize, place: 'block', start: y(r.top), top: y(r.top), bottom: y(r.top) });
      return;
    }
    if (name === 'table') {
      const rows = Array.from(el.querySelectorAll('tr')).filter((tr) => !tr.classList.contains(PAGE_GAP_CLASS));
      let rowPos = pos + 1;
      // prosemirror-tables puts a colgroup first; rows follow the table's children.
      node.forEach((row, offset, i) => {
        const tr = rows[i];
        rowPos = pos + 1 + offset;
        if (!tr) return;
        const rr = tr.getBoundingClientRect();
        const first = i === 0 ? gapBefore(pos, y(rr.top)) : { start: y(rr.top), lead: 0 };
        units.push({ kind: 'row', at: i === 0 ? pos : rowPos, place: i === 0 ? 'block' : 'row', ...first, top: y(rr.top), bottom: y(rr.bottom) });
      });
      return;
    }
    // A callout (step 4.6) or a formula card (4.7c) moves whole when it fits on a page, as in the PDF (SUMMARY-SPEC); a longer one splits between lines.
    if (CONTAINERS.includes(name) || ((name === 'callout' || name === 'formulaCard') && (r.bottom - r.top) / scale > textHeight)) {
      node.forEach((child, offset, i) => block(child, pos + 1 + offset, blockIndex * 1000 + i));
      return;
    }
    if (node.isTextblock) {
      const lines = linesOf(el);
      const keep = TEXTBLOCKS_KEEP_WITH_NEXT.includes(name);
      const at = outerStart(view.state.doc, pos);
      if (!lines.length) {
        units.push({ kind: 'line', at, place: 'block', ...gapBefore(at, y(r.top)), top: y(r.top), bottom: y(r.bottom), block: blockIndex, line: 0, lines: 1, keepWithNext: keep });
      } else {
        // Line boxes: from the block's top to halfway to the next line, and so on.
        const cs = getComputedStyle(el);
        const contentTop = r.top + (parseFloat(cs.paddingTop) || 0) * scale;
        const contentBottom = r.bottom - (parseFloat(cs.paddingBottom) || 0) * scale;
        lines.forEach((line, i) => {
          const top = i === 0 ? contentTop : (lines[i - 1].bottom + line.top) / 2;
          const bottom = i === lines.length - 1 ? contentBottom : (line.bottom + lines[i + 1].top) / 2;
          units.push({
            kind: 'line',
            // A later line's place is found only where a page breaks (resolveLine).
            at: i === 0 ? at : -1,
            place: i === 0 ? 'block' : 'inline',
            ...(i === 0 ? gapBefore(at, y(top)) : { start: y(top), lead: 0 }),
            top: y(top),
            bottom: y(bottom),
            block: blockIndex,
            line: i,
            lines: lines.length,
            keepWithNext: keep,
            // Kept for resolveLine (screen px).
            ...({ screenLeft: line.left, screenTop: line.top, screenBottom: line.bottom, blockPos: pos } as object),
          });
        });
      }
      return;
    }
    // A photo, a display formula: whole.
    const at = outerStart(view.state.doc, pos);
    units.push({ kind: 'block', at, place: 'block', ...gapBefore(at, y(r.top)), top: y(r.top), bottom: y(r.bottom) });
  };

  view.state.doc.forEach((node, offset, i) => block(node, offset, i));
  // Where the content ends: the last block's bottom margin included.
  let last = dom.lastElementChild;
  while (last && last.classList.contains(PAGE_GAP_CLASS)) last = last.previousElementSibling;
  const end = last ? y(last.getBoundingClientRect().bottom) + marginBottom(last) : 0;
  return { units, scale, sheetLeft: box.left, end };
}

/** The columns of the table a row position is in (its first row's cells and their spans). */
function columnsAt(doc: PMNode, pos: number): number {
  const $pos = doc.resolve(pos);
  const table = $pos.parent;
  let cols = 0;
  table.firstChild?.forEach((cell) => {
    cols += Number(cell.attrs.colspan) || 1;
  });
  return Math.max(1, cols);
}

type LineUnit = PageUnit & { screenLeft?: number; screenTop?: number; screenBottom?: number; blockPos?: number };

/** Where a later line of a paragraph starts, as a document position. */
function resolveLine(view: EditorView, u: LineUnit): number | null {
  if (u.screenLeft === undefined || u.screenTop === undefined || u.screenBottom === undefined || u.blockPos === undefined) return null;
  const found = view.posAtCoords({ left: u.screenLeft + 1, top: (u.screenTop + u.screenBottom) / 2 });
  if (!found) return null;
  const node = view.state.doc.nodeAt(u.blockPos);
  if (!node) return null;
  const start = u.blockPos + 1;
  const end = u.blockPos + node.nodeSize - 1;
  let pos = Math.max(start + 1, Math.min(found.pos, end));
  // posAtCoords can land after the line's first character: step back while that's still on this line.
  while (pos > start + 1) {
    const prev = view.coordsAtPos(pos - 1, 1);
    if (prev.top < u.screenTop - 2) break;
    pos -= 1;
  }
  return pos;
}

class PageViewController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private observer: ResizeObserver | null = null;
  private lastWidth = 0;
  /** The document's height (CSS px, to the hundredth), to notice a block that grows after the pages were drawn. */
  private lastHeight = 0;
  private pinchFrom = 1;
  private label: HTMLElement | null = null;
  private labelTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private view: EditorView) {
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => {
        // CSS px: zooming changes nothing here, a narrower window or column does.
        const dom = this.view.dom as HTMLElement;
        const w = dom.offsetWidth;
        if (Math.abs(w - this.lastWidth) > 0.5) {
          this.lastWidth = w;
          this.schedule(0);
        }
        // A block that changes size after the pages were drawn (a graph drawn late, a font, a photo
        // sized by its frame), even by a fraction of a pixel: measured again, or every page after it
        // would start that much off its top margin (and the PDF export, 4.8a, would differ). Drawing
        // the gaps changes the height too; the measure after that finds the same layout and stops.
        const s = pageViewOf(this.view.state);
        const h = s ? dom.getBoundingClientRect().height / shownZoom(s) : 0;
        if (Math.abs(h - this.lastHeight) > 0.01) {
          this.lastHeight = h;
          if (s?.pages) this.schedule();
        }
        this.fitScreen();
      });
      this.observer.observe(view.dom);
      if (view.dom.parentElement) this.observer.observe(view.dom.parentElement);
    }
    view.dom.addEventListener('load', this.onLoad, true);
    document.fonts?.ready.then(() => this.schedule(0)).catch(() => {});
    // Fonts asked for later (KaTeX's, when a formula is first drawn) change sizes after the first measure.
    document.fonts?.addEventListener?.('loadingdone', this.onLoad);
    document.addEventListener('gesturestart', this.onPinchStart as EventListener, { passive: false });
    document.addEventListener('gesturechange', this.onPinch as EventListener, { passive: false });
    // The page or a box inside it, whichever scrolls (scroll events don't bubble).
    document.addEventListener('scroll', this.onScroll, { passive: true, capture: true });
    this.schedule(0);
  }

  private fitting = () => {
    const s = pageViewOf(this.view.state);
    return !!s?.fit;
  };

  /** The sheet as wide as the screen (Print layout on the iPhone). */
  private fitScreen() {
    const s = pageViewOf(this.view.state);
    const room = this.view.dom.parentElement?.clientWidth ?? 0;
    if (!s?.fit || !room) return;
    const factor = Math.round(((room - 2 * FIT_PADDING) / s.sheet.width) * 1000) / 1000;
    if (Math.abs(factor - s.factor) > 0.002) this.view.dispatch(this.view.state.tr.setMeta(pageViewKey, { factor } satisfies Meta).setMeta('addToHistory', false));
  }

  // A pinch (iPhone): zooms from where it started, 50–200 % of the chosen size.
  private onPinchStart = (e: Event & { scale?: number }) => {
    if (!this.fitting()) return;
    e.preventDefault();
    this.pinchFrom = pageViewOf(this.view.state)?.zoom ?? 1;
  };
  private onPinch = (e: Event & { scale?: number }) => {
    if (!this.fitting() || typeof e.scale !== 'number') return;
    e.preventDefault();
    const zoom = clampZoom(this.pinchFrom * e.scale);
    if (zoom !== pageViewOf(this.view.state)?.zoom) this.view.dispatch(this.view.state.tr.setMeta(pageViewKey, { zoom } satisfies Meta).setMeta('addToHistory', false));
  };

  // "Page 3 of 12" while scrolling in Print layout (the laptop shows its own).
  private onScroll = () => {
    const s = pageViewOf(this.view.state);
    if (!s?.fit || !s.pages || !s.layout || s.layout.pages < 2) return;
    const top = (this.view.dom as HTMLElement).getBoundingClientRect().top;
    const pitch = (s.sheet.height + s.sheet.gap) * shownZoom(s);
    const page = Math.max(1, Math.min(s.layout.pages, Math.floor((window.innerHeight / 2 - top) / pitch) + 1));
    if (!this.label) {
      this.label = document.createElement('div');
      this.label.className = LABEL_CLASS;
      this.label.setAttribute('aria-live', 'polite');
      document.body.appendChild(this.label);
    }
    this.label.textContent = `Page ${page} of ${s.layout.pages}`;
    this.label.style.opacity = '1';
    if (this.labelTimer) clearTimeout(this.labelTimer);
    this.labelTimer = setTimeout(() => {
      if (this.label) this.label.style.opacity = '0';
    }, 1200);
  };

  private onLoad = () => this.schedule(0);

  schedule(ms = DEBOUNCE_MS) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      requestAnimationFrame(() => this.run());
    }, ms);
  }

  update(view: EditorView, prev: EditorState) {
    this.view = view;
    const now = pageViewOf(view.state);
    const before = pageViewOf(prev);
    if (!now) return;
    if (now.fit !== before?.fit || now.pages !== before?.pages) this.fitScreen();
    if (now.sheet !== before?.sheet) this.fitScreen();
    if (now.pages !== before?.pages || now.sheet !== before?.sheet) this.schedule(0);
    else if (view.state.doc !== prev.doc && now.pages) this.schedule();
  }

  private run() {
    const view = this.view;
    const state = pageViewOf(view.state);
    if (!state || (view as EditorView & { isDestroyed?: boolean }).isDestroyed) return;
    if (!state.pages) {
      if (state.layout) view.dispatch(view.state.tr.setMeta(pageViewKey, { layout: null, gaps: [] } satisfies Meta).setMeta('addToHistory', false));
      return;
    }
    const dom = view.dom as HTMLElement;
    dom.classList.add(MEASURING_CLASS);
    const measured = measure(view, state.sheet.height - state.sheet.marginTop - state.sheet.marginBottom, shownZoom(state));
    if (!measured) {
      dom.classList.remove(MEASURING_CLASS);
      return;
    }
    const layout = layoutPages(measured.units, state.sheet, measured.end);
    const gaps: DrawnGap[] = [];
    for (const g of layout.gaps) {
      const u = measured.units[g.unit] as LineUnit;
      let at = g.at;
      if (at < 0) at = resolveLine(view, u) ?? -1;
      if (at < 0) continue;
      gaps.push({ ...g, at, cols: g.place === 'row' ? columnsAt(view.state.doc, at) : undefined });
    }
    dom.classList.remove(MEASURING_CLASS);
    // Drawn again whenever a gap moves at all (to the hundredth of a pixel): a gap kept from an earlier
    // measure that differs by a fraction of a pixel moves everything after it, and the differences add
    // up page after page (the PDF export, 4.8a, lays the pages out once, from the last measure).
    // Measuring hides the gaps, so drawing them doesn't change the next measure: no loop.
    const same =
      state.layout &&
      state.layout.pages === layout.pages &&
      px2(state.layout.tail) === px2(layout.tail) &&
      JSON.stringify(state.layout.gaps.map((g) => [g.at, px2(g.height)])) === JSON.stringify(gaps.map((g) => [g.at, px2(g.height)]));
    if (same) return;
    view.dispatch(view.state.tr.setMeta(pageViewKey, { layout: { ...layout, gaps }, gaps } satisfies Meta).setMeta('addToHistory', false));
  }

  destroy() {
    if (this.timer) clearTimeout(this.timer);
    this.observer?.disconnect();
    this.view.dom.removeEventListener('load', this.onLoad, true);
    document.fonts?.removeEventListener?.('loadingdone', this.onLoad);
    document.removeEventListener('gesturestart', this.onPinchStart as EventListener);
    document.removeEventListener('gesturechange', this.onPinch as EventListener);
    document.removeEventListener('scroll', this.onScroll, { capture: true });
    if (this.labelTimer) clearTimeout(this.labelTimer);
    this.label?.remove();
  }
}

/** Adds to what this change already sets (a chain sets several on one change). */
function withMeta(tr: Transaction, meta: Meta) {
  tr.setMeta(pageViewKey, { ...((tr.getMeta(pageViewKey) as Meta | undefined) ?? {}), ...meta }).setMeta('addToHistory', false);
}

export interface PageViewOptions {
  /** Where the editor starts (the laptop: Pages; the iPhone: Pageless). */
  pages: boolean;
  zoom: number;
}

export const PageView = Extension.create<PageViewOptions>({
  name: 'pageView',

  addOptions() {
    return { pages: false, zoom: 1 };
  },

  addCommands() {
    return {
      setPageView:
        (pages) =>
        ({ tr, dispatch }) => {
          if (dispatch) withMeta(tr, { pages });
          return true;
        },
      setPageZoom:
        (zoom) =>
        ({ tr, dispatch }) => {
          if (dispatch) withMeta(tr, { zoom: clampZoom(zoom) });
          return true;
        },
      setPageSetup:
        (setup) =>
        ({ tr, dispatch }) => {
          if (dispatch) withMeta(tr, { sheet: sheetGeometry(cleanPageSetup(setup)) });
          return true;
        },
      setPageFit:
        (fit) =>
        ({ tr, dispatch }) => {
          if (dispatch) withMeta(tr, { fit });
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const { pages, zoom } = this.options;
    return [
      new Plugin<PageViewState>({
        key: pageViewKey,
        state: {
          init: () => ({ pages, zoom: clampZoom(zoom), fit: false, factor: 1, sheet: DEFAULT_SHEET, layout: null, decorations: DecorationSet.empty }),
          apply: (tr, value, _old, state) => {
            const meta = tr.getMeta(pageViewKey) as Meta | undefined;
            let next = value;
            if (meta?.pages !== undefined && meta.pages !== value.pages) next = { ...next, pages: meta.pages, layout: null, decorations: DecorationSet.empty };
            if (meta?.zoom !== undefined) next = { ...next, zoom: meta.zoom };
            if (meta?.fit !== undefined) next = { ...next, fit: meta.fit };
            if (meta?.factor !== undefined) next = { ...next, factor: meta.factor };
            // A new page setup: pages are measured again (until then the old gaps stay).
            if (meta?.sheet && JSON.stringify(meta.sheet) !== JSON.stringify(next.sheet)) next = { ...next, sheet: meta.sheet };
            if (meta && 'layout' in meta) {
              const layout = meta.layout ?? null;
              next = { ...next, layout, decorations: layout && next.pages ? decorationsFor(state.doc, meta.gaps ?? [], layout, next.sheet) : DecorationSet.empty };
            } else if (tr.docChanged) {
              // Until the next measure, the gaps move with the text.
              next = { ...next, decorations: next.decorations.map(tr.mapping, tr.doc) };
            }
            return next;
          },
        },
        view: (view) => new PageViewController(view),
        props: {
          decorations: (state) => pageViewOf(state)?.decorations,
          attributes: (state): Record<string, string> => {
            const s = pageViewOf(state);
            if (!s) return {};
            const attrs: Record<string, string> = {};
            if (s.pages) attrs.class = s.layout ? `${PAGE_CLASS} ${PAGES_DRAWN_CLASS}` : PAGE_CLASS;
            const zoom = shownZoom(s);
            const style: string[] = [];
            // The sheet: the paper's width, at least one page tall, the margins as padding.
            if (s.pages) {
              const g = s.sheet;
              style.push(`width: ${g.width}px`, `min-height: ${g.height}px`, `padding: ${g.marginTop}px ${g.marginRight}px ${g.marginBottom}px ${g.marginLeft}px`);
            }
            if (zoom !== 1) style.push(`zoom: ${zoom}`);
            if (style.length) attrs.style = style.join('; ');
            return attrs;
          },
        },
      }),
    ];
  },
});
