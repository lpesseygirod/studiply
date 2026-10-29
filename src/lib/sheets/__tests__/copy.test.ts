import { MAX_COLS, MAX_ROWS, columnName } from '../address';
import { copyCells, copyFormula, shiftFormula } from '../copy';
import { Sheet } from '../sheet';

describe('shiftFormula', () => {
  it('moves relative references', () => {
    expect(shiftFormula('=A1*2', 1, 0)).toBe('=A2*2');
    expect(shiftFormula('=A1+B2', 2, 3)).toBe('=D3+E4');
    expect(shiftFormula('=C5', -2, -1)).toBe('=B3');
  });

  it('keeps the parts marked with $', () => {
    expect(shiftFormula('=$A$1+$A1+A$1+A1', 1, 1)).toBe('=$A$1+$A2+B$1+B2');
  });

  it('moves both ends of a range', () => {
    expect(shiftFormula('=SUM(A1:B3)', 1, 1)).toBe('=SUM(B2:C4)');
    expect(shiftFormula('=SUM($A$1:A3)', 2, 0)).toBe('=SUM($A$1:A5)');
  });

  it('keeps everything else as typed', () => {
    expect(shiftFormula('= sum( a1 , "A1" ) & LOG10(1) & Price', 1, 0)).toBe('= sum( A2 , "A1" ) & LOG10(1) & Price');
  });

  it('writes #REF! for references pushed off the grid', () => {
    expect(shiftFormula('=A1+B2', -1, 0)).toBe('=#REF!+B1');
    expect(shiftFormula('=A1', 0, -1)).toBe('=#REF!');
    expect(shiftFormula(`=${columnName(MAX_COLS - 1)}1`, 0, 1)).toBe('=#REF!');
    expect(shiftFormula(`=A${MAX_ROWS}`, 1, 0)).toBe('=#REF!');
  });

  it('writes #REF! for a range with either end off the grid', () => {
    expect(shiftFormula('=SUM(A1:A5)', -1, 0)).toBe('=SUM(#REF!)');
    expect(shiftFormula('=SUM(A5:A1)', -2, 0)).toBe('=SUM(#REF!)');
  });

  it('leaves other inputs alone', () => {
    expect(shiftFormula('A1', 1, 1)).toBe('A1');
    expect(shiftFormula("'=A1", 1, 1)).toBe("'=A1");
    expect(shiftFormula('=A1+"', 1, 1)).toBe('=A1+"');
  });
});

describe('copyFormula', () => {
  it('moves by the distance between the cells', () => {
    expect(copyFormula('=A1+$B$1', 'C1', 'D5')).toBe('=B5+$B$1');
  });
});

describe('copyCells', () => {
  it('fills a formula down', () => {
    const sheet = Sheet.fromJSON({ A1: '1', A2: '2', A3: '3', B1: '=A1*10' });
    const changed = copyCells(sheet, 'B1', 'B2:B3');
    expect(sheet.input('B3')).toBe('=A3*10');
    expect(sheet.value('B3')).toBe(30);
    expect(changed.sort()).toEqual(['B2', 'B3']);
  });

  it('fills a running total with a fixed start', () => {
    const sheet = Sheet.fromJSON({ A1: '5', A2: '5', A3: '5', B1: '=SUM($A$1:A1)' });
    copyCells(sheet, 'B1', 'B2:B3');
    expect([sheet.value('B1'), sheet.value('B2'), sheet.value('B3')]).toEqual([5, 10, 15]);
  });

  it('pastes a block at a cell', () => {
    const sheet = Sheet.fromJSON({ A1: '1', B1: '=A1+1', A2: 'x' });
    copyCells(sheet, 'A1:B2', 'D4');
    expect(sheet.toJSON()).toMatchObject({ D4: '1', E4: '=D4+1', D5: 'x' });
    expect(sheet.value('E4')).toBe(2);
  });

  it('repeats a block over a range that is a multiple of its size', () => {
    const sheet = Sheet.fromJSON({ A1: 'a', B1: 'b' });
    copyCells(sheet, 'A1:B1', 'A3:D4');
    expect(['A3', 'B3', 'C3', 'D3', 'A4', 'D4'].map((k) => sheet.input(k))).toEqual(['a', 'b', 'a', 'b', 'a', 'b']);
  });

  it('pastes once when the range is not a multiple', () => {
    const sheet = Sheet.fromJSON({ A1: 'a', B1: 'b' });
    copyCells(sheet, 'A1:B1', 'A3:C3');
    expect(sheet.input('C3')).toBe('');
    expect(sheet.input('B3')).toBe('b');
  });

  it('copies empty cells as empty', () => {
    const sheet = Sheet.fromJSON({ A1: '1', C1: 'old', C2: '=C1' });
    copyCells(sheet, 'A1:A2', 'C1');
    expect(sheet.input('C1')).toBe('1');
    expect(sheet.input('C2')).toBe('');
  });

  it('reads the source before writing when the blocks overlap', () => {
    const sheet = Sheet.fromJSON({ A1: '1', A2: '2', A3: '=A2+A1' });
    copyCells(sheet, 'A1:A3', 'A2');
    expect([sheet.input('A2'), sheet.input('A3'), sheet.input('A4')]).toEqual(['1', '2', '=A3+A2']);
    expect(sheet.value('A4')).toBe(3);
  });

  it('shows #REF! for references copied off the grid', () => {
    const sheet = Sheet.fromJSON({ B2: '=A1' });
    copyCells(sheet, 'B2', 'A1');
    expect(sheet.input('A1')).toBe('=#REF!');
    expect(sheet.value('A1')).toMatchObject({ code: '#REF!' });
  });

  it('leaves out cells that would land off the grid', () => {
    const sheet = Sheet.fromJSON({ A1: '1', A2: '2' });
    const last = `A${MAX_ROWS}`;
    copyCells(sheet, 'A1:A2', last);
    expect(sheet.input(last)).toBe('1');
    expect(sheet.addresses()).toHaveLength(3);
  });

  it('copies finance formulas across with fixed inputs', () => {
    // Monthly payment for loans in B1:D1 at the rate in A2.
    const sheet = Sheet.fromJSON({ A2: '6%', B1: '10000', C1: '20000', D1: '30000', B2: '=PMT($A$2/12, 60, B$1)' });
    copyCells(sheet, 'B2', 'C2:D2');
    expect(sheet.input('D2')).toBe('=PMT($A$2/12, 60, D$1)');
    expect(sheet.value('D2') as number).toBeCloseTo(3 * (sheet.value('B2') as number), 8);
  });
});
