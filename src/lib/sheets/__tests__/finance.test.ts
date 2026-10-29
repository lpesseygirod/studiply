import { cellKey } from '../address';
import { evaluateFormula } from '../evaluate';
import { solveRate } from '../functions/finance';
import { parseFormula } from '../parser';
import { isError, type CellValue } from '../values';

function calc(formula: string, cells: Record<string, CellValue> = {}): CellValue | string {
  const v = evaluateFormula(parseFormula(formula), { get: (r, c) => cells[cellKey(r, c)] ?? null });
  return isError(v) ? v.code : v;
}

/** A number result, failing the test when it isn't one. */
function num(formula: string, cells?: Record<string, CellValue>): number {
  const v = calc(formula, cells);
  if (typeof v !== 'number') throw new Error(`${formula} gave ${String(v)}`);
  return v;
}

// Expected values are the worked examples in Microsoft's Excel help for each function.

describe('PMT', () => {
  it('pays off a loan', () => expect(num('PMT(8%/12, 10, 10000)')).toBeCloseTo(-1037.03, 2));
  it('pays at the start of each period', () => expect(num('PMT(8%/12, 10, 10000, 0, 1)')).toBeCloseTo(-1030.16, 2));
  it('saves up to a goal', () => expect(num('PMT(6%/12, 18*12, 0, 50000)')).toBeCloseTo(-129.08, 2));
  it('works without interest', () => expect(num('PMT(0, 10, 1000)')).toBe(-100));
  it('needs a period', () => expect(calc('PMT(5%, 0, 1000)')).toBe('#NUM!'));
});

describe('FV', () => {
  it('grows savings', () => expect(num('FV(0.06/12, 10, -200, -500, 1)')).toBeCloseTo(2581.4, 2));
  it('grows monthly deposits', () => expect(num('FV(0.12/12, 12, -1000)')).toBeCloseTo(12682.5, 2));
  it('takes a left-out pv', () => expect(num('FV(0.11/12, 35, -2000, , 1)')).toBeCloseTo(82846.25, 2));
  it('works without interest', () => expect(num('FV(0, 10, -100, -50)')).toBe(1050));
});

describe('PV', () => {
  it('values an annuity', () => expect(num('PV(0.08/12, 12*20, 500, , 0)')).toBeCloseTo(-59777.15, 2));
  it('works without interest', () => expect(num('PV(0, 10, -100)')).toBe(1000));
  it('agrees with FV', () => {
    const present = num('PV(5%, 10, -100, 2000, 1)');
    expect(num(`FV(5%, 10, -100, ${present}, 1)`)).toBeCloseTo(2000, 8);
  });
});

describe('NPER', () => {
  it('counts periods, paying at the start', () => expect(num('NPER(0.12/12, -100, -1000, 10000, 1)')).toBeCloseTo(59.6738657, 6));
  it('counts periods, paying at the end', () => expect(num('NPER(0.12/12, -100, -1000, 10000)')).toBeCloseTo(60.0821229, 6));
  it('counts periods with no goal', () => expect(num('NPER(0.12/12, -100, -1000)')).toBeCloseTo(-9.57859404, 6));
  it('works without interest', () => expect(num('NPER(0, -100, 1000)')).toBe(10));
  it('refuses no rate and no payment', () => expect(calc('NPER(0, 0, 1000)')).toBe('#NUM!'));
  it('refuses a loan whose interest is more than the payment', () => expect(calc('NPER(10%, -50, 1000)')).toBe('#NUM!'));
});

describe('NPV', () => {
  it('discounts cash flows', () => expect(num('NPV(10%, -10000, 3000, 4200, 6800)')).toBeCloseTo(1188.44, 2));

  const flows = { A1: 8000, A2: 9200, A3: 10000, A4: 12000, A5: 14500, A6: 'note' };
  it('reads cash flows from cells, skipping text', () => {
    expect(num('NPV(8%, A1:A6) + -40000', flows)).toBeCloseTo(1922.06, 2);
  });
  it('takes cells and typed-in values together', () => {
    expect(num('NPV(8%, A1:A5, -9000) - 40000', flows)).toBeCloseTo(-3749.47, 2);
  });
  it('refuses a rate of -100 %', () => expect(calc('NPV(-1, 100)')).toBe('#DIV/0!'));
});

describe('IRR', () => {
  const flows = { A1: -70000, A2: 12000, A3: 15000, A4: 18000, A5: 21000, A6: 26000 };
  it('finds the rate over five years', () => expect(num('IRR(A1:A6)', flows)).toBeCloseTo(0.0866, 4));
  it('finds a negative rate over four years', () => expect(num('IRR(A1:A5)', flows)).toBeCloseTo(-0.0212, 4));
  it('starts from a guess', () => expect(num('IRR(A1:A3, -10%)', flows)).toBeCloseTo(-0.4435, 4));
  it('agrees with NPV', () => {
    const rate = num('IRR(A1:A6)', flows);
    expect(num(`A1 + NPV(${rate}, A2:A6)`, flows)).toBeCloseTo(0, 6);
  });
  it('finds the rate from a far-off guess', () => expect(num('IRR(A1:A6, 50)', flows)).toBeCloseTo(0.0866, 4));
  it('needs a payment and a receipt', () => {
    expect(calc('IRR(A2:A6)', flows)).toBe('#NUM!');
  });
  it('skips text and empty cells', () => {
    expect(num('IRR(B1:B4)', { B1: -100, B2: 'x', B4: 110 })).toBeCloseTo(0.1, 10);
  });
});

describe('RATE', () => {
  it('finds a loan’s monthly rate', () => expect(num('RATE(4*12, -200, 8000)')).toBeCloseTo(0.0077014725, 9));
  it('finds the yearly rate', () => expect(num('RATE(4*12, -200, 8000)*12')).toBeCloseTo(0.09241767, 7));
  it('agrees with PMT', () => {
    const rate = num('RATE(10, -1037.03, 10000, 0, 1)');
    expect(num(`PMT(${rate}, 10, 10000, 0, 1)`)).toBeCloseTo(-1037.03, 6);
  });
  it('finds a rate of 0', () => expect(num('RATE(10, -100, 1000)')).toBeCloseTo(0, 10));
  it('finds a negative rate', () => expect(num('RATE(5, 0, -1000, 900)')).toBeCloseTo((0.9 ** 0.2) - 1, 10));
  it('gives #NUM! when no rate fits', () => expect(calc('RATE(10, 100, 1000)')).toBe('#NUM!'));
  it('needs a period', () => expect(calc('RATE(0, -100, 1000)')).toBe('#NUM!'));
});

describe('solveRate', () => {
  it('falls back to halving when Newton cannot start', () => {
    // Flat at the guess, so Newton's first step has no slope.
    const f = (r: number) => (r < 0.5 ? -1 : r - 0.6);
    expect(solveRate(f, 0, 1)).toBeCloseTo(0.6, 9);
  });
  it('gives null when there is no root', () => expect(solveRate(() => 1, 0.1, 1)).toBeNull());
});
