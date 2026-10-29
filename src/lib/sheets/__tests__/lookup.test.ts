import { cellKey } from '../address';
import { evaluateFormula } from '../evaluate';
import { wildcardPattern } from '../functions/lookup';
import { parseFormula } from '../parser';
import { isError, type CellValue } from '../values';

function calc(formula: string, cells: Record<string, CellValue>): CellValue | string {
  const v = evaluateFormula(parseFormula(formula), { get: (r, c) => cells[cellKey(r, c)] ?? null });
  return isError(v) ? v.code : v;
}

/** Puts rows of values into cells from A1, row by row. */
function table(rows: CellValue[][]): Record<string, CellValue> {
  const cells: Record<string, CellValue> = {};
  rows.forEach((row, r) => row.forEach((v, c) => (cells[cellKey(r, c)] = v)));
  return cells;
}

// Grades: score from → grade, sorted ascending (VLOOKUP's classic approximate example).
const grades = table([
  [0, 'F'],
  [60, 'D'],
  [70, 'C'],
  [80, 'B'],
  [90, 'A'],
]);

const people = table([
  ['ID', 'Name', 'Dept', 'Salary'],
  [101, 'Ana', 'Finance', 52000],
  [102, 'Ben', 'Marketing', 48000],
  [103, 'Carla', 'Finance', 61000],
  ['104', 'Dev', 'Law', 57000],
  [105, 'Ana Ruiz', 'Law', 70000],
]);

describe('VLOOKUP', () => {
  it('finds an exact match', () => {
    expect(calc('VLOOKUP(103, A1:D6, 2, FALSE)', people)).toBe('Carla');
    expect(calc('VLOOKUP("carla", B1:D6, 3, FALSE)', people)).toBe(61000);
  });

  it('treats an empty fourth argument as FALSE', () => expect(calc('VLOOKUP(102, A1:D6, 2, )', people)).toBe('Ben'));

  it('matches only values of the same kind', () => {
    expect(calc('VLOOKUP(104, A1:D6, 2, FALSE)', people)).toBe('#N/A');
    expect(calc('VLOOKUP("104", A1:D6, 2, FALSE)', people)).toBe('Dev');
  });

  it('matches wildcards in an exact match', () => {
    expect(calc('VLOOKUP("Ana *", B1:D6, 3, FALSE)', people)).toBe(70000);
    expect(calc('VLOOKUP("B?n", B1:D6, 2, FALSE)', people)).toBe('Marketing');
  });

  it('finds the last value ≤ the target when sorted (the default)', () => {
    expect(calc('VLOOKUP(85, A1:B5, 2)', grades)).toBe('B');
    expect(calc('VLOOKUP(90, A1:B5, 2, TRUE)', grades)).toBe('A');
    expect(calc('VLOOKUP(100, A1:B5, 2)', grades)).toBe('A');
    expect(calc('VLOOKUP(59.9, A1:B5, 2)', grades)).toBe('F');
  });

  it('finds nothing below the first value', () => expect(calc('VLOOKUP(-1, A1:B5, 2)', grades)).toBe('#N/A'));
  it('finds nothing that is not there', () => expect(calc('VLOOKUP(999, A1:D6, 2, FALSE)', people)).toBe('#N/A'));
  it('refuses column 0', () => expect(calc('VLOOKUP(101, A1:D6, 0, FALSE)', people)).toBe('#VALUE!'));
  it('refuses a column past the table', () => expect(calc('VLOOKUP(101, A1:D6, 5, FALSE)', people)).toBe('#REF!'));
  it('gives #N/A for an empty lookup value', () => expect(calc('VLOOKUP(Z1, A1:D6, 2, FALSE)', people)).toBe('#N/A'));
  it('shows an empty result cell as 0', () => {
    expect(calc('VLOOKUP(1, A1:B2, 2, FALSE)', table([[1, null]]))).toBe(0);
  });
});

describe('XLOOKUP', () => {
  it('finds an exact match in a column', () => {
    expect(calc('XLOOKUP(103, A2:A6, B2:B6)', people)).toBe('Carla');
    expect(calc('XLOOKUP("ben", B2:B6, D2:D6)', people)).toBe(48000);
  });

  it('looks to the left', () => expect(calc('XLOOKUP("Carla", B2:B6, A2:A6)', people)).toBe(103));

  it('finds a match in a row', () => {
    expect(calc('XLOOKUP("Dept", A1:D1, A3:D3)', people)).toBe('Marketing');
  });

  it('gives if_not_found or #N/A', () => {
    expect(calc('XLOOKUP(999, A2:A6, B2:B6, "nobody")', people)).toBe('nobody');
    expect(calc('XLOOKUP(999, A2:A6, B2:B6)', people)).toBe('#N/A');
    expect(calc('XLOOKUP(999, A2:A6, B2:B6, , 0)', people)).toBe('#N/A');
  });

  it('gives a whole row to the function around it', () => {
    expect(calc('SUM(XLOOKUP(70, A1:A5, A1:B5))', grades)).toBe(70);
    expect(calc('COUNT(XLOOKUP(101, A2:A6, B2:D6))', people)).toBe(1);
  });

  it('refuses a whole row in a cell of its own', () => {
    expect(calc('XLOOKUP(101, A2:A6, B2:D6)', people)).toBe('#VALUE!');
  });

  it('finds the next smaller or larger value', () => {
    expect(calc('XLOOKUP(85, A1:A5, B1:B5, , -1)', grades)).toBe('B');
    expect(calc('XLOOKUP(85, A1:A5, B1:B5, , 1)', grades)).toBe('A');
    expect(calc('XLOOKUP(80, A1:A5, B1:B5, , 1)', grades)).toBe('B');
    expect(calc('XLOOKUP(95, A1:A5, B1:B5, , 1)', grades)).toBe('#N/A');
  });

  it('finds the next smaller value in unsorted data', () => {
    const cells = table([[30], [10], [25], [40]]);
    expect(calc('XLOOKUP(27, A1:A4, A1:A4, , -1)', cells)).toBe(25);
    expect(calc('XLOOKUP(27, A1:A4, A1:A4, , 1)', cells)).toBe(30);
  });

  it('matches wildcards only in match mode 2', () => {
    expect(calc('XLOOKUP("Ana*", B2:B6, D2:D6, , 2)', people)).toBe(52000);
    expect(calc('XLOOKUP("Ana*", B2:B6, D2:D6)', people)).toBe('#N/A');
  });

  it('searches from the end', () => {
    expect(calc('XLOOKUP("Finance", C2:C6, B2:B6)', people)).toBe('Ana');
    expect(calc('XLOOKUP("Finance", C2:C6, B2:B6, , 0, -1)', people)).toBe('Carla');
  });

  it('searches sorted values fast, ascending and descending', () => {
    expect(calc('XLOOKUP(70, A1:A5, B1:B5, , 0, 2)', grades)).toBe('C');
    expect(calc('XLOOKUP(85, A1:A5, B1:B5, , -1, 2)', grades)).toBe('B');
    expect(calc('XLOOKUP(85, A1:A5, B1:B5, , 1, 2)', grades)).toBe('A');
    expect(calc('XLOOKUP(-5, A1:A5, B1:B5, , -1, 2)', grades)).toBe('#N/A');
    expect(calc('XLOOKUP(71, A1:A5, B1:B5, , 0, 2)', grades)).toBe('#N/A');

    const desc = table([[90], [80], [70], [60]]);
    expect(calc('XLOOKUP(80, A1:A4, A1:A4, , 0, -2)', desc)).toBe(80);
    expect(calc('XLOOKUP(75, A1:A4, A1:A4, , -1, -2)', desc)).toBe(70);
    expect(calc('XLOOKUP(75, A1:A4, A1:A4, , 1, -2)', desc)).toBe(80);
    expect(calc('XLOOKUP(95, A1:A4, A1:A4, , 1, -2)', desc)).toBe('#N/A');
  });

  it('refuses arrays that do not fit together', () => {
    expect(calc('XLOOKUP(1, A1:B5, B1:B5)', grades)).toBe('#VALUE!');
    expect(calc('XLOOKUP(1, A1:A5, B1:B4)', grades)).toBe('#VALUE!');
  });

  it('refuses unknown modes', () => {
    expect(calc('XLOOKUP(70, A1:A5, B1:B5, , 3)', grades)).toBe('#VALUE!');
    expect(calc('XLOOKUP(70, A1:A5, B1:B5, , 0, 0)', grades)).toBe('#VALUE!');
  });
});

describe('wildcardPattern', () => {
  it('reads * ? and ~', () => {
    expect(wildcardPattern('a*').test('ABC')).toBe(true);
    expect(wildcardPattern('a?c').test('abc')).toBe(true);
    expect(wildcardPattern('a?c').test('abbc')).toBe(false);
    expect(wildcardPattern('5~*').test('5*')).toBe(true);
    expect(wildcardPattern('5~*').test('55')).toBe(false);
    expect(wildcardPattern('what~?').test('what?')).toBe(true);
  });

  it('keeps other characters plain', () => {
    expect(wildcardPattern('1.5 (x)').test('1.5 (x)')).toBe(true);
    expect(wildcardPattern('1.5').test('125')).toBe(false);
  });
});
