/**
 * math.ts
 * SUM, AVERAGE, MIN, MAX, COUNT and ROUND.
 */

import { checkNumber, errorFor, Grid, isError, parseNumber } from '../values';
import { collectNumbers, numberArg } from './args';
import type { FunctionDef } from './types';

const MAX_ARGS = 255;

/**
 * Rounds half away from zero at `digits` places (negative: to tens,
 * hundreds…). Works on the number as written, so ROUND(1.005, 2) is 1.01
 * as in Excel, although 1.005 is stored as 1.00499999…
 */
export function roundHalfAway(x: number, digits: number): number {
  const d = Math.trunc(digits);
  if (d > 15) return x;
  const scaled = Math.abs(x) * 10 ** d;
  const rounded = Math.round(Number(scaled.toPrecision(15)));
  const result = d >= 0 ? rounded / 10 ** d : rounded * 10 ** -d;
  return x < 0 ? -result : result;
}

export const MATH_FUNCTIONS: Record<string, FunctionDef> = {
  SUM: {
    min: 1,
    max: MAX_ARGS,
    fn: (args) => {
      const nums = collectNumbers(args);
      if (isError(nums)) return nums;
      let total = 0;
      for (const n of nums) total += n;
      return checkNumber(total);
    },
  },

  AVERAGE: {
    min: 1,
    max: MAX_ARGS,
    fn: (args) => {
      const nums = collectNumbers(args);
      if (isError(nums)) return nums;
      if (nums.length === 0) return errorFor('#DIV/0!', 'AVERAGE found no numbers');
      let total = 0;
      for (const n of nums) total += n;
      return checkNumber(total / nums.length);
    },
  },

  MIN: {
    min: 1,
    max: MAX_ARGS,
    fn: (args) => {
      const nums = collectNumbers(args);
      if (isError(nums)) return nums;
      let min = Infinity;
      for (const n of nums) if (n < min) min = n;
      return nums.length ? min : 0;
    },
  },

  MAX: {
    min: 1,
    max: MAX_ARGS,
    fn: (args) => {
      const nums = collectNumbers(args);
      if (isError(nums)) return nums;
      let max = -Infinity;
      for (const n of nums) if (n > max) max = n;
      return nums.length ? max : 0;
    },
  },

  /** Counts numbers: in cells only numbers; typed in, also TRUE / FALSE and text that is a number. Errors are skipped. */
  COUNT: {
    min: 1,
    max: MAX_ARGS,
    fn: (args) => {
      let count = 0;
      for (const arg of args) {
        if (arg instanceof Grid) {
          for (const v of arg.values()) if (typeof v === 'number') count++;
        } else if (typeof arg === 'number' || typeof arg === 'boolean') {
          count++;
        } else if (typeof arg === 'string' && parseNumber(arg) !== null) {
          count++;
        }
      }
      return count;
    },
  },

  ROUND: {
    min: 2,
    max: 2,
    fn: ([value, digits]) => {
      const x = numberArg(value);
      if (isError(x)) return x;
      const d = numberArg(digits);
      if (isError(d)) return d;
      return checkNumber(roundHalfAway(x, d));
    },
  },
};
