// Where pages break (step 4.5b): the rules the page view (and later the
// export) follows, on made-up measurements.
import { layoutPages, type PageGeometry, type PageUnit } from '../pageLayout';

// A small page: 100 px of text a page, 20 px margins, 10 px between pages.
const PAGE: PageGeometry = { height: 140, marginTop: 20, marginBottom: 20, gap: 10 };
const PITCH = 150;

/** Blocks of lines, 20 px a line, `space` px between blocks. */
function blocks(lineCounts: number[], { space = 0, heading = [] as number[] } = {}): PageUnit[] {
  const units: PageUnit[] = [];
  let y = 0;
  let at = 0;
  lineCounts.forEach((lines, block) => {
    const start = y;
    if (block > 0) y += space;
    for (let line = 0; line < lines; line++) {
      units.push({
        kind: 'line',
        at: at++,
        place: line === 0 ? 'block' : 'inline',
        start: line === 0 ? start : y,
        top: y,
        bottom: y + 20,
        block,
        line,
        lines,
        keepWithNext: heading.includes(block),
      });
      y += 20;
    }
  });
  return units;
}

/** Where each unit ends up (its top), given the gaps. */
function placed(units: PageUnit[], gaps: { at: number; height: number }[]) {
  let shift = 0;
  return units.map((u) => {
    const gap = gaps.find((g) => g.at === u.at);
    if (gap) shift = u.start + shift + gap.height - u.top;
    return u.top + shift;
  });
}

describe('page breaks', () => {
  it('one page: no gap, the rest of the page after the text', () => {
    const r = layoutPages(blocks([2, 1]), PAGE);
    expect(r).toEqual({ gaps: [], pages: 1, tail: 40 });
  });

  it('a long paragraph splits between lines; every page starts at its text top', () => {
    const units = blocks([8]);
    const r = layoutPages(units, PAGE);
    expect(r.pages).toBe(2);
    expect(r.gaps).toEqual([{ unit: 5, at: 5, place: 'inline', height: PITCH - 100, page: 2 }]);
    const tops = placed(units, r.gaps);
    expect(tops[5]).toBe(PITCH);
    expect(tops[7]).toBe(PITCH + 40);
    expect(r.tail).toBe(100 - 60);
  });

  it('never one line alone at the bottom (orphan): the block moves', () => {
    // 4 lines fill 80 px, then a block of 3 lines: only its first line would fit.
    const units = blocks([4, 3]);
    const r = layoutPages(units, PAGE);
    expect(r.gaps.map((g) => g.at)).toEqual([4]);
    expect(placed(units, r.gaps)[4]).toBe(PITCH);
  });

  it('never one line alone at the top (widow): one more line goes with it', () => {
    // 6 lines: 5 fit, the last would be alone on page 2.
    const units = blocks([6]);
    const r = layoutPages(units, PAGE);
    expect(r.gaps.map((g) => g.at)).toEqual([4]);
  });

  it('a 3-line block whose last line would be alone on the next page moves whole (not 1 + 2)', () => {
    // 3 lines fill 60 px; a block of 3 lines: two fit (60–100), the third wouldn't.
    const units = blocks([3, 3]);
    const r = layoutPages(units, PAGE);
    expect(r.gaps.map((g) => g.at)).toEqual([3]);
  });

  it('a heading stays with the line after it', () => {
    // 4 lines, a one-line heading (fits at 80–100), then a paragraph that doesn't fit.
    const units = blocks([4, 1, 3], { heading: [1] });
    const r = layoutPages(units, PAGE);
    expect(r.gaps.map((g) => g.at)).toEqual([4]);
    const tops = placed(units, r.gaps);
    expect(tops[4]).toBe(PITCH);
    expect(tops[5]).toBe(PITCH + 20);
  });

  it('the gap starts where what is before it ends, the space between blocks included', () => {
    const units = blocks([4, 2], { space: 12 });
    const r = layoutPages(units, PAGE);
    // The second block starts at 92 and would end at 132: it moves.
    expect(r.gaps).toEqual([{ unit: 4, at: 4, place: 'block', height: PITCH - 80, page: 2 }]);
    expect(placed(units, r.gaps)[4]).toBe(PITCH);
  });

  it("a list item's own space above its first line stays: the line, not the item's edge, starts the page", () => {
    const units = blocks([4, 2]);
    // The second block's first line sits 6 px below the edge of the item the gap goes before.
    units[4] = { ...units[4], lead: 6 };
    const r = layoutPages(units, PAGE);
    expect(r.gaps[0].height).toBe(PITCH - 80 - 6);
    // The item's edge lands at the page top, its line 6 px lower: the line's top is the page's text top.
    expect(80 + r.gaps[0].height + 6).toBe(PITCH);
  });

  it('a page break: what follows starts a new page; at the very end it adds nothing', () => {
    const units: PageUnit[] = [
      { kind: 'line', at: 0, place: 'block', start: 0, top: 0, bottom: 20, block: 0, line: 0, lines: 1 },
      { kind: 'break', at: 1, place: 'block', start: 20, top: 20, bottom: 20 },
      { kind: 'line', at: 2, place: 'block', start: 20, top: 20, bottom: 40, block: 1, line: 0, lines: 1 },
    ];
    const r = layoutPages(units, PAGE);
    expect(r.gaps).toEqual([{ unit: 2, at: 2, place: 'block', height: PITCH - 20, page: 2 }]);
    expect(r.pages).toBe(2);
    expect(layoutPages(units.slice(0, 2), PAGE).pages).toBe(1);
  });

  it('a table splits between rows; a row taller than a page stays (no endless breaking)', () => {
    const rows: PageUnit[] = [0, 1, 2].map((i) => ({ kind: 'row', at: i, place: 'row', start: i * 40, top: i * 40, bottom: i * 40 + 40 }));
    expect(layoutPages(rows, PAGE).gaps.map((g) => [g.at, g.place])).toEqual([[2, 'row']]);
    const tall: PageUnit[] = [{ kind: 'block', at: 0, place: 'block', start: 0, top: 0, bottom: 260 }];
    expect(layoutPages(tall, PAGE)).toMatchObject({ gaps: [], pages: 1 });
    const after: PageUnit[] = [{ kind: 'line', at: 0, place: 'block', start: 0, top: 0, bottom: 20 }, { ...tall[0], at: 1, start: 20, top: 20, bottom: 280 }];
    expect(layoutPages(after, PAGE).gaps.map((g) => g.at)).toEqual([1]);
  });

  it('ten pages of text: ten pages (two-line blocks stay together: four lines a page)', () => {
    expect(layoutPages(blocks(Array.from({ length: 25 }, () => 2)), PAGE).pages).toBe(13);
    const r = layoutPages(blocks(Array.from({ length: 50 }, () => 1)), PAGE);
    expect(r.pages).toBe(10);
    expect(r.gaps.map((g) => g.page)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
