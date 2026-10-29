/**
 * evaluate.ts
 * Computes a parsed formula against the values of other cells.
 *
 * A cell or range given to a function arrives as a Grid, so the function
 * can tell "3" typed in from "3" read from a cell (see functions/args.ts).
 * Everywhere else a reference is its cell's value, and a range of more than
 * one cell is #VALUE! (results that spill into several cells come later).
 *
 * The cell's final value: an empty result shows 0 (=A1 with A1 empty, as
 * in Excel), and a number that overflows is #NUM!. A + or − whose result
 * is only rounding noise next to its operands (0.1 + 0.2 − 0.3) gives 0,
 * as Excel does.
 */

import { areaOf } from './address';
import { FUNCTIONS } from './functions';
import type { Node } from './parser';
import {
  checkNumber,
  compareValues,
  errorFor,
  Grid,
  isError,
  scalar,
  toNumber,
  toText,
  type CellValue,
  type Value,
} from './values';

/** Where a formula reads other cells from (0-based); an empty cell is null. */
export interface CellSource {
  get(row: number, col: number): CellValue;
}

/** Larger ranges are refused, so a typo like A1:XFD1048576 can't freeze the app. */
export const MAX_RANGE_CELLS = 1_000_000;

export function evaluateFormula(node: Node, source: CellSource): CellValue {
  const v = scalar(evaluateNode(node, source, false));
  if (v === null) return 0;
  return typeof v === 'number' ? checkNumber(v) : v;
}

function readRange(start: { row: number; col: number }, end: { row: number; col: number }, source: CellSource): Value {
  const area = areaOf(start, end);
  const height = area.bottom - area.top + 1;
  const width = area.right - area.left + 1;
  if (height * width > MAX_RANGE_CELLS) return errorFor('#VALUE!', 'The range is too large');
  const rows: CellValue[][] = [];
  for (let r = area.top; r <= area.bottom; r++) {
    const row: CellValue[] = [];
    for (let c = area.left; c <= area.right; c++) row.push(source.get(r, c));
    rows.push(row);
  }
  return new Grid(rows);
}

/** `asArg`: the node is a function argument, so a single cell stays a Grid. */
function evaluateNode(node: Node, source: CellSource, asArg: boolean): Value {
  switch (node.type) {
    case 'number':
    case 'string':
    case 'boolean':
      return node.value;
    case 'error':
      return errorFor(node.code);
    case 'empty':
      return null;
    case 'name':
      return errorFor('#NAME?', `Unknown name "${node.name}"`);
    case 'ref': {
      const v = source.get(node.ref.row, node.ref.col);
      return asArg ? new Grid([[v]]) : v;
    }
    case 'range':
      return readRange(node.start, node.end, source);
    case 'paren':
      return evaluateNode(node.inner, source, asArg);
    case 'unary': {
      const n = toNumber(scalar(evaluateNode(node.operand, source, false)));
      if (isError(n)) return n;
      return node.op === '-' ? -n : n;
    }
    case 'percent': {
      const n = toNumber(scalar(evaluateNode(node.operand, source, false)));
      return isError(n) ? n : n / 100;
    }
    case 'binary':
      return binary(node.op, node.left, node.right, source);
    case 'call':
      return call(node.name, node.args, source);
  }
}

/** True when `result` is only floating-point noise left over from adding or subtracting a and b. */
function isRoundingNoise(result: number, a: number, b: number): boolean {
  return result !== 0 && Math.abs(result) < Math.max(Math.abs(a), Math.abs(b)) * 1e-15;
}

function binary(op: Extract<Node, { type: 'binary' }>['op'], leftNode: Node, rightNode: Node, source: CellSource): Value {
  const left = scalar(evaluateNode(leftNode, source, false));
  if (isError(left)) return left;
  const right = scalar(evaluateNode(rightNode, source, false));
  if (isError(right)) return right;

  if (op === '&') {
    const a = toText(left);
    if (isError(a)) return a;
    const b = toText(right);
    return isError(b) ? b : a + b;
  }

  if (op === '=' || op === '<>' || op === '<' || op === '>' || op === '<=' || op === '>=') {
    const c = compareValues(left, right);
    switch (op) {
      case '=':
        return c === 0;
      case '<>':
        return c !== 0;
      case '<':
        return c < 0;
      case '>':
        return c > 0;
      case '<=':
        return c <= 0;
      case '>=':
        return c >= 0;
    }
  }

  const a = toNumber(left);
  if (isError(a)) return a;
  const b = toNumber(right);
  if (isError(b)) return b;
  switch (op) {
    case '+': {
      const r = a + b;
      return checkNumber(isRoundingNoise(r, a, b) ? 0 : r);
    }
    case '-': {
      const r = a - b;
      return checkNumber(isRoundingNoise(r, a, b) ? 0 : r);
    }
    case '*':
      return checkNumber(a * b);
    case '/':
      return b === 0 ? errorFor('#DIV/0!') : checkNumber(a / b);
    case '^':
      if (a === 0 && b === 0) return errorFor('#NUM!');
      if (a === 0 && b < 0) return errorFor('#DIV/0!');
      return checkNumber(a ** b);
  }
}

function call(name: string, args: Node[], source: CellSource): Value {
  const def = FUNCTIONS[name];
  if (!def) return errorFor('#NAME?', `Unknown function ${name}`);
  if (args.length < def.min || args.length > def.max) {
    const range = def.min === def.max ? `${def.min}` : def.max >= 255 ? `at least ${def.min}` : `${def.min} to ${def.max}`;
    return errorFor('#VALUE!', `${name} takes ${range} argument${def.max === 1 ? '' : 's'}`);
  }
  const evaluate = (node: Node) => evaluateNode(node, source, true);
  if (def.lazy) return def.lazy(args, evaluate);
  return def.fn!(args.map(evaluate));
}
