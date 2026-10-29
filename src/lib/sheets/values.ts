/**
 * values.ts
 * What a cell can hold, and the conversions formulas apply between kinds.
 *
 * A cell holds a number, text, TRUE / FALSE, an error, or nothing (null).
 * The rules follow Excel so results match what students see there:
 *   - in maths, an empty cell is 0, TRUE is 1 and text that is a number
 *     ("3") counts; other text is #VALUE!;
 *   - comparisons ignore case, and order numbers < text < TRUE / FALSE;
 *   - numbers are compared at 15 significant digits, so 0.1 + 0.2 = 0.3.
 *
 * Errors carry an Excel code plus, where it helps, a message the editor can
 * show ("Circular reference"). #ERROR! (as in Google Sheets) is a formula
 * that couldn't be read at all.
 */

export type ErrorCode = '#DIV/0!' | '#VALUE!' | '#REF!' | '#NAME?' | '#N/A' | '#NUM!' | '#ERROR!';

export const ERROR_CODES: readonly ErrorCode[] = ['#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#N/A', '#NUM!', '#ERROR!'];

export class SheetError {
  constructor(
    readonly code: ErrorCode,
    readonly message?: string,
  ) {}

  toString(): string {
    return this.code;
  }
}

/** A single cell's value; null is an empty cell. */
export type CellValue = number | string | boolean | null | SheetError;

/** A block of values read from a range, row by row. */
export class Grid {
  constructor(readonly rows: CellValue[][]) {}

  get height(): number {
    return this.rows.length;
  }

  get width(): number {
    return this.rows[0]?.length ?? 0;
  }

  /** Every value, row by row. */
  *values(): Generator<CellValue> {
    for (const row of this.rows) yield* row;
  }
}

/** What a part of a formula evaluates to: one value or a block of them. */
export type Value = CellValue | Grid;

export function isError(v: unknown): v is SheetError {
  return v instanceof SheetError;
}

export function errorFor(code: ErrorCode, message?: string): SheetError {
  return new SheetError(code, message);
}

export function errorCodeOf(text: string): ErrorCode | null {
  const upper = text.toUpperCase();
  return ERROR_CODES.find((c) => c === upper) ?? null;
}

/** A finite number, or #NUM! (overflow, square root of a negative, …). */
export function checkNumber(n: number): number | SheetError {
  return Number.isFinite(n) ? n : errorFor('#NUM!');
}

/** One value from a range used where a single value is expected: only a single cell works. */
export function scalar(v: Value): CellValue {
  if (!(v instanceof Grid)) return v;
  if (v.height === 1 && v.width === 1) return v.rows[0][0];
  return errorFor('#VALUE!', 'A range was used where one value was expected');
}

const NUMBER_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** "12", " -1.5e3 " or "50%" → the number; null for any other text. */
export function parseNumber(text: string): number | null {
  let t = text.trim();
  let scale = 1;
  if (t.endsWith('%')) {
    t = t.slice(0, -1).trimEnd();
    scale = 100;
  }
  if (!NUMBER_TEXT.test(t)) return null;
  const n = Number(t) / scale;
  return Number.isFinite(n) ? n : null;
}

export function toNumber(v: CellValue): number | SheetError {
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    return parseNumber(v) ?? errorFor('#VALUE!', `"${v}" is not a number`);
  }
  return v;
}

export function toBoolean(v: CellValue): boolean | SheetError {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const upper = v.trim().toUpperCase();
    if (upper === 'TRUE') return true;
    if (upper === 'FALSE') return false;
    return errorFor('#VALUE!', `"${v}" is not TRUE or FALSE`);
  }
  return v;
}

/** A number as Excel writes it in text: up to 15 significant digits, so 1/3 → "0.333333333333333". */
export function formatNumber(n: number): string {
  if (n === 0) return '0';
  return String(Number(n.toPrecision(15))).replace('e+', 'E+').replace('e-', 'E-');
}

export function toText(v: CellValue): string | SheetError {
  if (v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
}

/** 0 numbers, 1 text, 2 TRUE / FALSE: the order Excel sorts mixed values in. */
function kindRank(v: number | string | boolean): number {
  return typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2;
}

function round15(n: number): number {
  return n === 0 ? 0 : Number(n.toPrecision(15));
}

/**
 * Compares two values that aren't errors: negative, 0 or positive.
 * An empty cell takes the other side's kind (0, "" or FALSE).
 */
export function compareValues(a: Exclude<CellValue, SheetError>, b: Exclude<CellValue, SheetError>): number {
  const blankLike = (other: typeof a) => (typeof other === 'string' ? '' : typeof other === 'boolean' ? false : 0);
  const x = a === null ? blankLike(b) : a;
  const y = b === null ? blankLike(a) : b;
  const rankDiff = kindRank(x) - kindRank(y);
  if (rankDiff !== 0) return Math.sign(rankDiff);
  if (typeof x === 'number') return Math.sign(round15(x) - round15(y as number));
  if (typeof x === 'string') {
    const p = x.toLowerCase();
    const q = (y as string).toLowerCase();
    return p < q ? -1 : p > q ? 1 : 0;
  }
  return Number(x) - Number(y as boolean);
}

/** Two values of the same kind (both numbers, both text or both TRUE / FALSE), neither empty. */
export function sameKind(a: CellValue, b: CellValue): boolean {
  if (a === null || b === null || isError(a) || isError(b)) return false;
  return kindRank(a) === kindRank(b);
}
