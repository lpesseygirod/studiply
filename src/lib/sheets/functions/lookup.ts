/**
 * lookup.ts
 * VLOOKUP and XLOOKUP.
 *
 * A value only matches values of its own kind: the number 1 doesn't match
 * the text "1", and empty cells never match. Text matches ignore case. In
 * an exact match, text may use wildcards: * for any characters, ? for one,
 * ~ before * ? ~ for the character itself.
 *
 * VLOOKUP(value, table, column, [sorted = TRUE])
 *   sorted TRUE: the first column is in ascending order and the match is the
 *   last value ≤ value. FALSE (or the argument left empty, as in
 *   `VLOOKUP(x, A:B, 2, )`) asks for an exact match.
 *
 * XLOOKUP(value, lookup_array, return_array, [if_not_found], [match_mode = 0], [search_mode = 1])
 *   match_mode 0 exact, -1 exact or next smaller, 1 exact or next larger,
 *   2 wildcards; search_mode 1 first to last, -1 last to first, 2 / -2 a
 *   fast search of values sorted ascending / descending. A return_array
 *   wider than one column gives that whole row to the function around it
 *   (=SUM(XLOOKUP(…))); in a cell of its own it is #VALUE! until results
 *   can spill.
 */

import {
  compareValues,
  errorFor,
  Grid,
  isError,
  sameKind,
  scalar,
  type CellValue,
  type SheetError,
  type Value,
} from '../values';
import { asGrid, booleanArg, numberArg, optionalNumber } from './args';
import type { FunctionDef } from './types';

type Plain = Exclude<CellValue, SheetError | null>;

function hasWildcards(text: string): boolean {
  return /[*?~]/.test(text);
}

/** "Jan*" → /^Jan.*$/i; ~ makes the next * ? ~ plain. */
export function wildcardPattern(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '~' && i + 1 < pattern.length && '*?~'.includes(pattern[i + 1])) {
      source += `\\${pattern[++i]}`;
    } else if (ch === '*') source += '[\\s\\S]*';
    else if (ch === '?') source += '[\\s\\S]';
    else source += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 'i');
}

/** The value to look for, or the error to give: an empty lookup value matches nothing. */
function lookupValue(v: Value): Plain | SheetError {
  const value = scalar(v);
  if (isError(value)) return value;
  if (value === null) return errorFor('#N/A', 'The value to look up is empty');
  return value;
}

function exactMatcher(target: Plain, wildcards: boolean): (v: CellValue) => boolean {
  if (wildcards && typeof target === 'string' && hasWildcards(target)) {
    const re = wildcardPattern(target);
    return (v) => typeof v === 'string' && re.test(v);
  }
  return (v) => sameKind(v, target) && compareValues(v as Plain, target) === 0;
}

const notFound = () => errorFor('#N/A', 'No match found');

function vlookup(args: Value[]): Value {
  const target = lookupValue(args[0]);
  if (isError(target)) return target;
  const table = asGrid(args[1]);
  const column = numberArg(args[2]);
  if (isError(column)) return column;
  const col = Math.trunc(column);
  if (col < 1) return errorFor('#VALUE!', 'The column number must be 1 or more');
  if (col > table.width) return errorFor('#REF!', 'The table has fewer columns than that');
  const sorted = args.length < 4 ? true : booleanArg(args[3]);
  if (isError(sorted)) return sorted;

  const keys = table.rows.map((row) => row[0]);
  let found = -1;
  if (sorted) {
    // The last value ≤ target, stopping at the first larger one (the column is in ascending order).
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!sameKind(key, target)) continue;
      if (compareValues(key as Plain, target) > 0) break;
      found = i;
    }
  } else {
    found = keys.findIndex(exactMatcher(target, true));
  }
  return found < 0 ? notFound() : table.rows[found][col - 1];
}

/** The index of the match in `values`, or -1. */
function xmatch(values: CellValue[], target: Plain, matchMode: number, searchMode: number): number {
  if (searchMode === 2 || searchMode === -2) return binarySearch(values, target, matchMode, searchMode === -2);

  const order = searchMode === -1 ? [...values.keys()].reverse() : [...values.keys()];
  if (matchMode === 0 || matchMode === 2) {
    const matches = exactMatcher(target, matchMode === 2);
    return order.find((i) => matches(values[i])) ?? -1;
  }
  // Exact, or else the closest value below (-1) or above (1); the first one met in search order wins a tie.
  let best = -1;
  for (const i of order) {
    const v = values[i];
    if (!sameKind(v, target)) continue;
    const c = compareValues(v as Plain, target);
    if (c === 0) return i;
    const onRightSide = matchMode === -1 ? c < 0 : c > 0;
    if (!onRightSide) continue;
    if (best < 0) best = i;
    else {
      const closer = compareValues(v as Plain, values[best] as Plain);
      if (matchMode === -1 ? closer > 0 : closer < 0) best = i;
    }
  }
  return best;
}

/** Binary search over values sorted ascending (or descending). */
function binarySearch(values: CellValue[], target: Plain, matchMode: number, descending: boolean): number {
  const n = values.length;
  // Where `target` would go in the sorted order: the first index not before it.
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const v = values[mid];
    const c = isError(v) ? 1 : compareValues(v, target) * (descending ? -1 : 1);
    if (c < 0) lo = mid + 1;
    else hi = mid;
  }
  const exact = lo < n && sameKind(values[lo], target) && compareValues(values[lo] as Plain, target) === 0;
  if (exact) return lo;
  if (matchMode !== -1 && matchMode !== 1) return -1;
  const smaller = descending ? lo : lo - 1;
  const larger = descending ? lo - 1 : lo;
  const i = matchMode === -1 ? smaller : larger;
  return i >= 0 && i < n && sameKind(values[i], target) ? i : -1;
}

function xlookup(args: Value[]): Value {
  const target = lookupValue(args[0]);
  if (isError(target)) return target;
  const lookupArray = asGrid(args[1]);
  const returnArray = asGrid(args[2]);
  const matchMode = optionalNumber(args, 4, 0);
  if (isError(matchMode)) return matchMode;
  const searchMode = optionalNumber(args, 5, 1);
  if (isError(searchMode)) return searchMode;
  if (![0, -1, 1, 2].includes(matchMode)) return errorFor('#VALUE!', 'match_mode must be 0, -1, 1 or 2');
  if (![1, -1, 2, -2].includes(searchMode)) return errorFor('#VALUE!', 'search_mode must be 1, -1, 2 or -2');

  const vertical = lookupArray.width === 1;
  if (!vertical && lookupArray.height !== 1) {
    return errorFor('#VALUE!', 'lookup_array must be a single row or column');
  }
  const values = vertical ? lookupArray.rows.map((row) => row[0]) : lookupArray.rows[0];
  if ((vertical ? returnArray.height : returnArray.width) !== values.length) {
    return errorFor('#VALUE!', 'return_array must be as long as lookup_array');
  }

  const i = xmatch(values, target, matchMode, searchMode);
  if (i < 0) {
    const fallback = args[3];
    return fallback === undefined || fallback === null ? notFound() : fallback;
  }
  const result = vertical ? new Grid([returnArray.rows[i]]) : new Grid(returnArray.rows.map((row) => [row[i]]));
  return result.width === 1 && result.height === 1 ? result.rows[0][0] : result;
}

export const LOOKUP_FUNCTIONS: Record<string, FunctionDef> = {
  VLOOKUP: { min: 3, max: 4, fn: vlookup },
  XLOOKUP: { min: 3, max: 6, fn: xlookup },
};
