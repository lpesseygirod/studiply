/**
 * logic.ts
 * IF, AND and OR.
 *
 * IF computes only the branch it returns, so =IF(B1=0, 0, A1/B1) never
 * shows #DIV/0!. AND and OR look at every argument, as in Excel: an error
 * anywhere is the result.
 */

import { errorFor, Grid, isError, toBoolean, type SheetError, type Value } from '../values';
import { booleanArg } from './args';
import type { FunctionDef } from './types';

const MAX_ARGS = 255;

/** TRUE / FALSE values for AND and OR: from cells, TRUE / FALSE and numbers (text and empty cells are skipped). */
function collectLogicals(args: Value[]): boolean[] | SheetError {
  const out: boolean[] = [];
  for (const arg of args) {
    if (arg instanceof Grid) {
      for (const v of arg.values()) {
        if (isError(v)) return v;
        if (typeof v === 'boolean') out.push(v);
        else if (typeof v === 'number') out.push(v !== 0);
      }
    } else {
      const b = toBoolean(arg);
      if (isError(b)) return b;
      out.push(b);
    }
  }
  return out;
}

export const LOGIC_FUNCTIONS: Record<string, FunctionDef> = {
  IF: {
    min: 2,
    max: 3,
    lazy: (args, evaluate) => {
      const condition = booleanArg(evaluate(args[0]));
      if (isError(condition)) return condition;
      if (condition) return evaluate(args[1]);
      return args.length > 2 ? evaluate(args[2]) : false;
    },
  },

  AND: {
    min: 1,
    max: MAX_ARGS,
    fn: (args) => {
      const values = collectLogicals(args);
      if (isError(values)) return values;
      if (values.length === 0) return errorFor('#VALUE!', 'AND found no TRUE or FALSE values');
      return values.every(Boolean);
    },
  },

  OR: {
    min: 1,
    max: MAX_ARGS,
    fn: (args) => {
      const values = collectLogicals(args);
      if (isError(values)) return values;
      if (values.length === 0) return errorFor('#VALUE!', 'OR found no TRUE or FALSE values');
      return values.some(Boolean);
    },
  },
};
