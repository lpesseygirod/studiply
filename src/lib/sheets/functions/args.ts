/**
 * args.ts
 * Reading function arguments the way Excel does.
 *
 * Excel treats a value typed into a function differently from one read
 * from a cell: SUM("3", TRUE) is 4, but SUM(A1:A2) with "3" and TRUE in
 * the cells is 0, because only numbers in cells count. Cell and range
 * arguments therefore arrive as a Grid (see evaluate.ts).
 */

import { Grid, isError, scalar, toBoolean, toNumber, type CellValue, type SheetError, type Value } from '../values';

/** One number from an argument; a left-out argument is 0. */
export function numberArg(v: Value): number | SheetError {
  return toNumber(scalar(v));
}

/** An optional number: `fallback` when the argument is missing or left out. */
export function optionalNumber(args: Value[], index: number, fallback: number): number | SheetError {
  const v = args[index];
  return v === undefined || v === null ? fallback : numberArg(v);
}

export function booleanArg(v: Value): boolean | SheetError {
  return toBoolean(scalar(v));
}

/** Any argument as a block of values (a single value is a 1 × 1 block). */
export function asGrid(v: Value): Grid {
  return v instanceof Grid ? v : new Grid([[v]]);
}

/**
 * The numbers SUM, AVERAGE, MIN, MAX and NPV work on: from cells only
 * numbers (text, TRUE / FALSE and empty cells are skipped); typed in, also
 * TRUE / FALSE and text that is a number. The first error found is returned.
 */
export function collectNumbers(args: Value[]): number[] | SheetError {
  const out: number[] = [];
  for (const arg of args) {
    if (arg instanceof Grid) {
      for (const v of arg.values()) {
        if (isError(v)) return v;
        if (typeof v === 'number') out.push(v);
      }
    } else if (arg !== null) {
      const n = toNumber(arg);
      if (isError(n)) return n;
      out.push(n);
    }
  }
  return out;
}

/** The first error among some values, if any. */
export function firstError(...values: (CellValue | number | boolean | string)[]): SheetError | undefined {
  return values.find(isError);
}
