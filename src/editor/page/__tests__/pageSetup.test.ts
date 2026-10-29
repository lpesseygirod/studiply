// Page setup (after test D): paper, orientation, margins, page numbers and
// the gap, saved per document; what the view draws from it.
import { cleanPageSetup, DEFAULT_PAGE_SETUP, fitMargins, MARGIN_PRESETS, paperCm, presetOf, sheetGeometry } from '../pageSetup';

describe('page setup', () => {
  it("the default is today's page: A4 portrait, 2.54 cm margins, numbers at the bottom centre, a 24 px gap", () => {
    expect(sheetGeometry(DEFAULT_PAGE_SETUP)).toEqual({ width: 793.7, height: 1122.5, marginTop: 96, marginBottom: 96, marginLeft: 96, marginRight: 96, gap: 24, numbers: 'bottom-center' });
  });

  it('A4 and Letter, portrait and landscape', () => {
    expect(paperCm({ size: 'a4', orientation: 'portrait' })).toEqual({ width: 21, height: 29.7 });
    expect(paperCm({ size: 'a4', orientation: 'landscape' })).toEqual({ width: 29.7, height: 21 });
    expect(sheetGeometry({ ...DEFAULT_PAGE_SETUP, size: 'letter' })).toMatchObject({ width: 816, height: 1056 });
    expect(sheetGeometry({ ...DEFAULT_PAGE_SETUP, size: 'letter', orientation: 'landscape' })).toMatchObject({ width: 1056, height: 816 });
  });

  it("Word's presets, and custom margins", () => {
    expect(presetOf(MARGIN_PRESETS.narrow.margins)).toBe('narrow');
    expect(presetOf(MARGIN_PRESETS.wide.margins)).toBe('wide');
    expect(presetOf({ top: 2, bottom: 2.54, left: 2.54, right: 2.54 })).toBe('custom');
    expect(sheetGeometry({ ...DEFAULT_PAGE_SETUP, margins: MARGIN_PRESETS.narrow.margins }).marginLeft).toBe(48);
  });

  it('margins that leave less than 5 × 5 cm of text, or are negative, are lowered', () => {
    expect(fitMargins({ top: 2, bottom: 2, left: 10, right: 10 }, { size: 'a4', orientation: 'portrait' })).toEqual({ margins: { top: 2, bottom: 2, left: 8, right: 8 }, lowered: true });
    expect(fitMargins({ top: -1, bottom: 2.54, left: 2.54, right: 2.54 }, { size: 'a4', orientation: 'portrait' }).margins.top).toBe(0);
    expect(fitMargins(MARGIN_PRESETS.wide.margins, { size: 'a4', orientation: 'portrait' }).lowered).toBe(false);
  });

  it('anything saved that does not fit falls back (null is the default)', () => {
    expect(cleanPageSetup(null)).toEqual(DEFAULT_PAGE_SETUP);
    expect(cleanPageSetup({ size: 'A3', orientation: 'sideways', numbers: 'left', gap: 7, margins: { top: 'x' } })).toEqual(DEFAULT_PAGE_SETUP);
    expect(cleanPageSetup({ size: 'letter', orientation: 'landscape', numbers: 'top-right', gap: 48, margins: { top: 1, bottom: 1, left: 2, right: 2 } })).toEqual({
      size: 'letter',
      orientation: 'landscape',
      numbers: 'top-right',
      gap: 48,
      margins: { top: 1, bottom: 1, left: 2, right: 2 },
    });
  });
});
