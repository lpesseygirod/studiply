import { cellKey } from '../address';
import { evaluateFormula } from '../evaluate';
import { roundHalfAway } from '../functions/math';
import { parseFormula } from '../parser';
import { isError, SheetError, type CellValue } from '../values';

function calc(formula: string, cells: Record<string, CellValue> = {}): CellValue | string {
  const v = evaluateFormula(parseFormula(formula), { get: (r, c) => cells[cellKey(r, c)] ?? null });
  return isError(v) ? v.code : v;
}

// A1:A6 = 10, 20, "text", TRUE, (empty), "5"
const column: Record<string, CellValue> = { A1: 10, A2: 20, A3: 'text', A4: true, A6: '5' };

describe('SUM', () => {
  it('adds only the numbers in cells', () => expect(calc('SUM(A1:A6)', column)).toBe(30));
  it('adds typed-in TRUE and number text', () => expect(calc('SUM(1, TRUE, "3")')).toBe(5));
  it('refuses typed-in text that is not a number', () => expect(calc('SUM(1, "x")')).toBe('#VALUE!'));
  it('reads a single cell like a range', () => expect(calc('SUM(A3, A1)', column)).toBe(10));
  it('takes several ranges', () => expect(calc('SUM(A1:A2, A1:A2, 1)', column)).toBe(61));
  it('passes on an error in a cell', () => expect(calc('SUM(A1:A2)', { A1: 1, A2: new SheetError('#N/A') })).toBe('#N/A'));
  it('skips a left-out argument', () => expect(calc('SUM(1,,2)')).toBe(3));
  it('needs an argument', () => expect(calc('SUM()')).toBe('#VALUE!'));
  it('gives 0 for an empty range', () => expect(calc('SUM(B1:B9)')).toBe(0));
});

describe('AVERAGE, MIN, MAX', () => {
  it('averages the numbers', () => expect(calc('AVERAGE(A1:A6)', column)).toBe(15));
  it('has no average of nothing', () => expect(calc('AVERAGE(B1:B9)')).toBe('#DIV/0!'));
  it('finds the smallest and largest', () => {
    expect(calc('MIN(A1:A6, 15)', column)).toBe(10);
    expect(calc('MAX(A1:A6, 15)', column)).toBe(20);
    expect(calc('MIN(-1, -5, 3)')).toBe(-5);
  });
  it('gives 0 when there are no numbers', () => {
    expect(calc('MIN(B1:B9)')).toBe(0);
    expect(calc('MAX(A3)', column)).toBe(0);
  });
  it('works on a large range', () => {
    const cells: Record<string, CellValue> = {};
    for (let i = 1; i <= 200_000; i++) cells[`A${i}`] = i;
    expect(calc('MAX(A1:A200000)', cells)).toBe(200_000);
  });
});

describe('COUNT', () => {
  it('counts only numbers in cells', () => expect(calc('COUNT(A1:A6)', column)).toBe(2));
  it('counts typed-in numbers, TRUE and number text', () => expect(calc('COUNT(1, TRUE, "2", "x")')).toBe(3));
  it('skips errors', () => expect(calc('COUNT(A1:A2)', { A1: 1, A2: new SheetError('#DIV/0!') })).toBe(1));
});

describe('ROUND', () => {
  it.each([
    ['ROUND(2.15, 1)', 2.2],
    ['ROUND(2.149, 1)', 2.1],
    ['ROUND(-1.475, 2)', -1.48],
    ['ROUND(21.5, -1)', 20],
    ['ROUND(626.3, -3)', 1000],
    ['ROUND(1.98, -1)', 0],
    ['ROUND(-50.55, -2)', -100],
    ['ROUND(1.005, 2)', 1.01],
    ['ROUND(2.5, 0)', 3],
    ['ROUND(-2.5, 0)', -3],
    ['ROUND(1.23456, 2.9)', 1.23],
  ])('%s = %p', (formula, expected) => expect(calc(formula)).toBe(expected));

  it('needs two arguments', () => expect(calc('ROUND(1.5)')).toBe('#VALUE!'));
  it('keeps very precise numbers', () => expect(roundHalfAway(0.1, 20)).toBe(0.1));
});

describe('IF', () => {
  it('chooses a branch', () => {
    expect(calc('IF(A1>5, "big", "small")', { A1: 10 })).toBe('big');
    expect(calc('IF(A1>5, "big", "small")', { A1: 1 })).toBe('small');
  });
  it('gives FALSE without an else', () => expect(calc('IF(1>2, "yes")')).toBe(false));
  it('gives 0 for a left-out branch', () => expect(calc('IF(1>2, "yes", )')).toBe(0));
  it('computes only the branch it returns', () => {
    expect(calc('IF(B1=0, 0, A1/B1)', { A1: 5 })).toBe(0);
  });
  it('reads numbers and text as conditions', () => {
    expect(calc('IF(2, "y", "n")')).toBe('y');
    expect(calc('IF("false", "y", "n")')).toBe('n');
    expect(calc('IF("maybe", "y", "n")')).toBe('#VALUE!');
  });
  it('passes on an error in the condition', () => expect(calc('IF(1/0, 1, 2)')).toBe('#DIV/0!'));
  it('can return a range to a function', () => expect(calc('SUM(IF(TRUE, A1:A2, 0))', column)).toBe(30));
});

describe('AND, OR', () => {
  it('combines conditions', () => {
    expect(calc('AND(1<2, 2<3)')).toBe(true);
    expect(calc('AND(1<2, 2>3)')).toBe(false);
    expect(calc('OR(1>2, 2<3)')).toBe(true);
    expect(calc('OR(FALSE, 0)')).toBe(false);
  });
  it('reads TRUE / FALSE and numbers in cells, skipping text and empty cells', () => {
    expect(calc('AND(A1:A6)', column)).toBe(true);
    expect(calc('OR(B1:B3)', { B1: 'x', B2: 0 })).toBe(false);
  });
  it('needs at least one TRUE or FALSE', () => expect(calc('AND(A3)', column)).toBe('#VALUE!'));
  it('refuses typed-in text', () => expect(calc('OR("x", TRUE)')).toBe('#VALUE!'));
  it('passes on errors even after a FALSE, as Excel does', () => expect(calc('AND(FALSE, 1/0)')).toBe('#DIV/0!'));
});
