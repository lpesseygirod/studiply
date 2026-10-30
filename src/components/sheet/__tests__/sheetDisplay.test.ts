import { Sheet } from '../../../lib/sheets';
import { displayOf, explainError, fitNumber, fitsChars, moveSelection, selectionCells, selectionName, single, type Fits } from '../sheetDisplay';

/** A cell `px` wide in a font where digits are 8 px, the point and minus narrower (as real fonts). */
const width = (px: number): Fits => (text) => [...text].reduce((w, ch) => w + (ch === '.' ? 3 : ch === '-' ? 5 : 8), 0) <= px;

describe('numbers in a cell (Excel’s General, to the cell’s width)', () => {
  const pmt = 898.0893756235;

  it('shows every digit that fits', () => {
    expect(fitNumber(1234.5, width(100))).toBe('1234.5');
    expect(fitNumber(200000, width(100))).toBe('200000');
    expect(fitNumber(-70000, width(100))).toBe('-70000');
  });

  it('rounds to the decimals that fit, never cutting: 898.0894, 898.09, 898.1, 898', () => {
    expect(fitNumber(pmt, width(8 * 7 + 3))).toBe('898.0894');
    expect(fitNumber(pmt, width(8 * 5 + 3))).toBe('898.09');
    expect(fitNumber(pmt, width(8 * 4 + 3))).toBe('898.1');
    expect(fitNumber(pmt, width(8 * 3))).toBe('898');
    // Rounded, not cut: 898.0894 is never shown as 898.08.
    for (let px = 24; px <= 120; px++) {
      const text = fitNumber(pmt, width(px));
      expect(Math.abs(Number(text) - pmt)).toBeLessThanOrEqual(0.5 * 10 ** -(text.split('.')[1]?.length ?? 0) + 1e-12);
    }
  });

  it('drops trailing zeros, as General does (1188.4400 → 1188.44)', () => {
    expect(fitNumber(1188.440000001, width(8 * 7 + 3))).toBe('1188.44');
    expect(fitNumber(0.0866309480, width(8 * 6 + 3))).toBe('0.08663');
    expect(fitNumber(-0.0001, width(100))).toBe('-0.0001');
  });

  it('rounding up carries into the whole part (999.96 → 1000)', () => {
    expect(fitNumber(999.96, width(8 * 4))).toBe('1000');
  });

  it('goes scientific only when the whole part doesn’t fit, or for very small numbers', () => {
    // 12 digits don't fit 88 px; the scientific form with the most digits that fit does.
    expect(fitNumber(123456789012, width(8 * 11))).toBe('1.23457E+11');
    expect(fitNumber(123456789012, width(8 * 9))).toBe('1.235E+11');
    expect(fitNumber(123456789012345, fitsChars(11))).toBe('1.23457E+14');
    expect(fitNumber(1e20, fitsChars(11))).toBe('1E+20');
    expect(fitNumber(0.00001, fitsChars(11))).toBe('1E-05');
    expect(fitNumber(0.0000012345, fitsChars(11))).toBe('1.2345E-06');
  });

  it('shows ### only when even the scientific form can’t fit', () => {
    expect(fitNumber(123456789, width(8 * 4))).toBe('####');
    expect(fitNumber(5, width(8))).toBe('5');
    expect(fitNumber(0, width(8))).toBe('0');
  });
});

describe('what a cell shows', () => {
  const sheet = Sheet.fromJSON({ A1: '1234.5', A2: 'Total', A3: 'TRUE', A4: '=1/0', A5: '=B5', B5: '=A5', A6: '=FOO(1)', A7: "'007" });
  const shown = (a: string) => displayOf(sheet.value(a));

  it('numbers on the right, text on the left, TRUE / FALSE and errors centred', () => {
    expect(shown('A1')).toEqual({ text: '1234.5', align: 'right', error: false });
    expect(shown('A2')).toEqual({ text: 'Total', align: 'left', error: false });
    expect(shown('A3')).toEqual({ text: 'TRUE', align: 'center', error: false });
    expect(shown('A4')).toEqual({ text: '#DIV/0!', align: 'center', error: true });
    expect(shown('A7').text).toBe('007');
    expect(shown('Z9')).toEqual({ text: '', align: 'left', error: false });
  });

  it('explains an error: the engine’s reason when it has one, else a short line per code', () => {
    expect(explainError(sheet.value('A4'))).toBe('#DIV/0!: A number is divided by zero (or by an empty cell).');
    expect(explainError(sheet.value('A5'))).toBe('#REF!: Circular reference.');
    expect(explainError(sheet.value('A6'))).toMatch(/^#NAME\?: /);
    expect(explainError(sheet.value('A1'))).toBeNull();
  });
});

describe('moving around the grid', () => {
  it('moves the active cell, and stops at the edges (A–Z, 1–1,000)', () => {
    expect(moveSelection(single({ row: 0, col: 0 }), 'down')).toEqual(single({ row: 1, col: 0 }));
    expect(moveSelection(single({ row: 0, col: 0 }), 'up')).toEqual(single({ row: 0, col: 0 }));
    expect(moveSelection(single({ row: 0, col: 25 }), 'right')).toEqual(single({ row: 0, col: 25 }));
    expect(moveSelection(single({ row: 999, col: 3 }), 'down')).toEqual(single({ row: 999, col: 3 }));
  });

  it('with Shift, extends the selection from the active cell', () => {
    const s = moveSelection(moveSelection(single({ row: 1, col: 1 }), 'down', true), 'right', true);
    expect(selectionName(s)).toBe('B2:C3');
    expect(selectionCells(s)).toEqual(['B2', 'C2', 'B3', 'C3']);
    // Then a plain arrow leaves the range from the active cell.
    expect(selectionName(moveSelection(s, 'left'))).toBe('A2');
  });

  it('names a single cell or a range whichever way it was made', () => {
    expect(selectionName(single({ row: 2, col: 1 }))).toBe('B3');
    expect(selectionName({ anchor: { row: 4, col: 2 }, focus: { row: 2, col: 1 } })).toBe('B3:C5');
  });
});
