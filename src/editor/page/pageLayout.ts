/**
 * Where the pages break (step 4.5b): a pure function from the measured
 * pieces of a document to the gaps the page view inserts. The same rules
 * will serve the PDF / Word export (4.8), so the page count matches.
 *
 * The document is measured once with no gaps (all in CSS px at 100 %, y
 * from the top of the first page's text area), as a list of units in
 * reading order:
 * - `line`: one line of a paragraph, heading or list item; a page can end
 *   between two lines of the same block (at least two on each page, as
 *   Word's widow / orphan control);
 * - `block`: a photo, a display formula, a whole block that can't split;
 * - `row`: a table row (a table splits between rows);
 * - `break`: a page break: what follows starts a new page.
 *
 * A gap goes where a unit starts (`at`, a document position); it begins
 * where what is before it ends (`start`: the end of the previous unit, its
 * bottom margin included) and is as tall as it takes for the unit to start
 * at the top of the next page's text area. Headings stay with the line
 * after them.
 */

export interface PageGeometry {
  /** The page's height (A4: 1123 px). */
  height: number;
  /** Top and bottom margins. */
  margin: number;
  /** The grey space between two pages. */
  gap: number;
}

/** A4 at 96 px per inch, 2.54 cm margins, as in Google Docs (page setup comes in 4.7). */
export const A4: PageGeometry & { width: number } = { width: 794, height: 1123, margin: 96, gap: 24 };

export type UnitKind = 'line' | 'block' | 'row' | 'break';
/** How the gap is drawn there: between blocks, inside a paragraph (at a line), or as a table row. */
export type GapPlace = 'block' | 'inline' | 'row';

export interface PageUnit {
  kind: UnitKind;
  /** Where a gap before this unit goes. */
  at: number;
  place: GapPlace;
  /** Where a gap before it would begin (the end of what is before it). */
  start: number;
  /** From the top of the block the gap goes before to this unit's top (a list item's or quote's own space). */
  lead?: number;
  top: number;
  bottom: number;
  /** Lines of one block: which block, which line, of how many. */
  block?: number;
  line?: number;
  lines?: number;
  /** A heading's lines: not left alone at the bottom of a page. */
  keepWithNext?: boolean;
}

export interface PageGap {
  /** The unit it goes before (its index). */
  unit: number;
  at: number;
  place: GapPlace;
  /** From `start` to the top of the next page's text. */
  height: number;
  /** The page that begins after this gap (2 for the first gap). */
  page: number;
}

export interface PageLayout {
  gaps: PageGap[];
  pages: number;
  /** Space after the last line to the bottom of the last page's text area. */
  tail: number;
}

/** A pixel of slack: measured sizes are fractional. */
const EPS = 0.5;

/** `end`: where the document's content ends (the last block's bottom margin included), if known. */
export function layoutPages(units: PageUnit[], page: PageGeometry = A4, end?: number): PageLayout {
  const text = page.height - 2 * page.margin;
  const pitch = page.height + page.gap;
  const gaps: PageGap[] = [];
  let shift = 0;
  let n = 0;
  // The first unit on the current page (it never moves: a unit taller than a page stays).
  let firstOnPage = 0;
  let forced = false;
  let lastBottom = 0;

  const breakBefore = (b: number) => {
    const u = units[b];
    const nextTop = (n + 1) * pitch;
    gaps.push({ unit: b, at: u.at, place: u.place, height: nextTop - (u.lead ?? 0) - (u.start + shift), page: n + 2 });
    shift = nextTop - u.top;
    n += 1;
    firstOnPage = b;
  };

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.kind === 'break') {
      // What follows starts a new page; the break itself takes no room.
      forced = i < units.length - 1;
      lastBottom = Math.max(lastBottom, u.bottom + shift);
      continue;
    }
    const pageEnd = n * pitch + text;
    const overflows = u.bottom + shift > pageEnd + EPS;
    if (!forced && (!overflows || i === firstOnPage)) {
      lastBottom = u.bottom + shift;
      continue;
    }
    let b = i;
    if (!forced) {
      // Widow / orphan: at least two lines of a block on each page.
      if (u.kind === 'line' && u.lines !== undefined && u.line !== undefined && u.lines > 1) {
        // Not one line alone at the top of the next page…
        if (u.line === u.lines - 1 && u.lines >= 3) b = i - 1;
        // …nor alone at the bottom of this one (a 3-line block then moves whole).
        if (units[b].line === 1) b -= 1;
      }
      // A heading goes with what follows it.
      while (b - 1 > firstOnPage && units[b - 1].keepWithNext) b -= 1;
      if (b <= firstOnPage) b = i;
    }
    forced = false;
    breakBefore(b);
    // Go on from the unit now at the top of the new page.
    i = b;
    lastBottom = units[b].bottom + shift;
  }
  const lastPageEnd = n * pitch + text;
  if (end !== undefined) lastBottom = Math.max(lastBottom, end + shift);
  return { gaps, pages: n + 1, tail: Math.max(0, lastPageEnd - lastBottom) };
}
