import { cellKey } from '../address';
import { evaluateFormula } from '../evaluate';
import { parseFormula } from '../parser';
import { formatNumber, isError, SheetError, type CellValue } from '../values';

/** Computes a formula with the given cells around it; errors come back as their code. */
function calc(formula: string, cells: Record<string, CellValue> = {}): CellValue | string {
  const v = evaluateFormula(parseFormula(formula), { get: (r, c) => cells[cellKey(r, c)] ?? null });
  return isError(v) ? v.code : v;
}

describe('arithmetic', () => {
  it.each([
    ['1+2*3', 7],
    ['(1+2)*3', 9],
    ['2^3^2', 64],
    ['-2^2', 4],
    ['-(2^2)', -4],
    ['2^-1', 0.5],
    ['50%', 0.5],
    ['200*10%', 20],
    ['10/4', 2.5],
    ['--3', 3],
    ['+"3"', 3],
  ])('%s = %p', (formula, expected) => expect(calc(formula)).toBe(expected));

  it('treats 0.1 + 0.2 - 0.3 as 0, as Excel does', () => expect(calc('0.1+0.2-0.3')).toBe(0));
  it('keeps small numbers that are real', () => expect(calc('1e-20+1e-21')).toBeCloseTo(1.1e-20, 30));

  it('counts TRUE as 1, empty cells as 0 and number text as numbers', () => {
    expect(calc('TRUE+1')).toBe(2);
    expect(calc('A1+1')).toBe(1);
    expect(calc('A1*2', { A1: '21' })).toBe(42);
  });

  it.each([
    ['1/0', '#DIV/0!'],
    ['A1/A2', '#DIV/0!'],
    ['0^0', '#NUM!'],
    ['0^-1', '#DIV/0!'],
    ['(-8)^(1/3)', '#NUM!'],
    ['10^400', '#NUM!'],
    ['"abc"+1', '#VALUE!'],
    ['Price*2', '#NAME?'],
    ['NOPE(1)', '#NAME?'],
    ['#N/A+1', '#N/A'],
  ])('%s is %s', (formula, code) => expect(calc(formula)).toBe(code));

  it('passes on the first error, left side first', () => {
    expect(calc('A1+A2', { A1: new SheetError('#N/A'), A2: new SheetError('#REF!') })).toBe('#N/A');
  });

  it('says what went wrong', () => {
    const v = evaluateFormula(parseFormula('NOPE(1)'), { get: () => null });
    expect(v).toMatchObject({ code: '#NAME?', message: 'Unknown function NOPE' });
  });
});

describe('text and comparisons', () => {
  it('joins text, numbers and TRUE / FALSE', () => {
    expect(calc('"Total: "&A1', { A1: 12.5 })).toBe('Total: 12.5');
    expect(calc('1/3&""')).toBe('0.333333333333333');
    expect(calc('TRUE&"!"')).toBe('TRUE!');
    expect(calc('A1&"x"')).toBe('x');
  });

  it.each([
    ['1<2', true],
    ['"a"="A"', true],
    ['"apple"<"Banana"', true],
    ['2>="2"', false],
    ['1<"a"', true],
    ['"z"<TRUE', true],
    ['FALSE<TRUE', true],
    ['0.1+0.2=0.3', true],
    ['A1=0', true],
    ['A1=""', true],
    ['A1=FALSE', true],
    ['3<>3', false],
  ])('%s is %p', (formula, expected) => expect(calc(formula)).toBe(expected));
});

describe('references', () => {
  const cells = { A1: 1, A2: 2, B1: 'x' };

  it('reads cells', () => expect(calc('A1+A2', cells)).toBe(3));
  it('shows an empty cell as 0', () => expect(calc('C9', cells)).toBe(0));
  it('reads a single-cell range as its value', () => expect(calc('A2:A2*3', cells)).toBe(6));
  it('refuses a larger range where one value is needed', () => expect(calc('A1:A2+1', cells)).toBe('#VALUE!'));
  it('refuses a range shown in one cell', () => expect(calc('A1:A2', cells)).toBe('#VALUE!'));
  it('refuses huge ranges', () => expect(calc('SUM(A1:XFD1048576)')).toBe('#VALUE!'));
});

describe('formatNumber', () => {
  it.each([
    [0, '0'],
    [0.1 + 0.2, '0.3'],
    [-12.5, '-12.5'],
    [1e21, '1E+21'],
    [1.5e-7, '1.5E-7'],
  ])('%p → %s', (n, text) => expect(formatNumber(n)).toBe(text));
});
