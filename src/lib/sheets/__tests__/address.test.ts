import {
  areaContains,
  cellKey,
  columnIndex,
  columnName,
  formatCellRef,
  MAX_COLS,
  MAX_ROWS,
  normalizeKey,
  parseArea,
  parseCellRef,
} from '../address';

describe('column letters', () => {
  it.each([
    ['A', 0],
    ['Z', 25],
    ['AA', 26],
    ['AZ', 51],
    ['BA', 52],
    ['ZZ', 701],
    ['AAA', 702],
    ['XFD', MAX_COLS - 1],
  ])('%s is column %i and back', (letters, index) => {
    expect(columnIndex(letters)).toBe(index);
    expect(columnName(index)).toBe(letters);
  });

  it('accepts lower case', () => expect(columnIndex('ab')).toBe(27));
  it.each(['XFE', 'AAAA', '', 'A1'])('"%s" is not a column', (s) => expect(columnIndex(s)).toBe(-1));
});

describe('parseCellRef', () => {
  it('reads a plain reference', () => {
    expect(parseCellRef('B3')).toEqual({ row: 2, col: 1, rowAbs: false, colAbs: false });
  });

  it('reads the $ markers', () => {
    expect(parseCellRef('$B$3')).toEqual({ row: 2, col: 1, rowAbs: true, colAbs: true });
    expect(parseCellRef('$B3')).toMatchObject({ rowAbs: false, colAbs: true });
    expect(parseCellRef('B$3')).toMatchObject({ rowAbs: true, colAbs: false });
  });

  it('reads the last cell of the grid', () => {
    expect(parseCellRef(`XFD${MAX_ROWS}`)).toMatchObject({ row: MAX_ROWS - 1, col: MAX_COLS - 1 });
  });

  it.each(['A0', `A${MAX_ROWS + 1}`, 'XFE1', '1A', 'A', '$$A1', 'A1:B2', ''])('"%s" is not a cell', (s) => {
    expect(parseCellRef(s)).toBeNull();
  });

  it('writes a reference back as typed', () => {
    for (const s of ['A1', '$A1', 'A$1', '$AB$100']) expect(formatCellRef(parseCellRef(s)!)).toBe(s);
  });
});

describe('keys and areas', () => {
  it('names cells', () => expect(cellKey(2, 27)).toBe('AB3'));
  it('normalizes addresses', () => expect(normalizeKey(' $b$3 ')).toBe('B3'));
  it('rejects what is not an address', () => expect(() => normalizeKey('hello')).toThrow('Not a cell address'));

  it('reads a range either way round', () => {
    const area = { top: 0, left: 0, bottom: 4, right: 1 };
    expect(parseArea('A1:B5')).toEqual(area);
    expect(parseArea('B5:A1')).toEqual(area);
    expect(parseArea('A5:B1')).toEqual(area);
  });

  it('reads a single cell as a range', () => {
    expect(parseArea('C2')).toEqual({ top: 1, left: 2, bottom: 1, right: 2 });
  });

  it('knows what is inside', () => {
    const area = parseArea('B2:C3');
    expect(areaContains(area, 1, 1)).toBe(true);
    expect(areaContains(area, 2, 2)).toBe(true);
    expect(areaContains(area, 0, 1)).toBe(false);
    expect(areaContains(area, 1, 3)).toBe(false);
  });
});
