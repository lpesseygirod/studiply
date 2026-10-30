/**
 * sheetDisplay.ts
 * How a spreadsheet tab shows its cells and moves around them (step 4.7e).
 * Pure, so it is unit tested; SheetTab and SheetGrid draw with it.
 */

import { cellKey, formatNumber, isError, type CellValue, type ErrorCode } from '../../lib/sheets';
import { SHEET_COLS, SHEET_ROWS } from '../../lib/sheetDoc';

export interface CellAt {
  row: number;
  col: number;
}

/** The selected cells: from where the selection started (the active cell) to where it reaches. */
export interface Selection {
  anchor: CellAt;
  focus: CellAt;
}

export interface Box {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export const boxOf = (s: Selection): Box => ({
  top: Math.min(s.anchor.row, s.focus.row),
  left: Math.min(s.anchor.col, s.focus.col),
  bottom: Math.max(s.anchor.row, s.focus.row),
  right: Math.max(s.anchor.col, s.focus.col),
});

/** "B3", or "B3:C5" for a range. */
export function selectionName(s: Selection): string {
  const b = boxOf(s);
  const first = cellKey(b.top, b.left);
  return b.top === b.bottom && b.left === b.right ? first : `${first}:${cellKey(b.bottom, b.right)}`;
}

/** Every cell address in the selection, row by row. */
export function selectionCells(s: Selection): string[] {
  const b = boxOf(s);
  const out: string[] = [];
  for (let row = b.top; row <= b.bottom; row++) for (let col = b.left; col <= b.right; col++) out.push(cellKey(row, col));
  return out;
}

const clamp = (cell: CellAt): CellAt => ({
  row: Math.min(SHEET_ROWS - 1, Math.max(0, cell.row)),
  col: Math.min(SHEET_COLS - 1, Math.max(0, cell.col)),
});

export type Move = 'up' | 'down' | 'left' | 'right';
const STEP: Record<Move, CellAt> = { up: { row: -1, col: 0 }, down: { row: 1, col: 0 }, left: { row: 0, col: -1 }, right: { row: 0, col: 1 } };

/**
 * An arrow key (or Enter, Tab): the active cell moves and the selection is
 * that cell; with Shift (`extend`) the selection's far corner moves instead.
 * The grid's edges stop it.
 */
export function moveSelection(s: Selection, move: Move, extend = false): Selection {
  const d = STEP[move];
  if (extend) return { anchor: s.anchor, focus: clamp({ row: s.focus.row + d.row, col: s.focus.col + d.col }) };
  const cell = clamp({ row: s.anchor.row + d.row, col: s.anchor.col + d.col });
  return { anchor: cell, focus: cell };
}

export const single = (cell: CellAt): Selection => ({ anchor: clamp(cell), focus: clamp(cell) });

export type Align = 'left' | 'right' | 'center';

/** Whether a text fits in the cell (measured with the cell's font, bold or not). */
export type Fits = (text: string) => boolean;

/** Without a measure: what fits a cell of the laptop's width, about 11 characters. */
export const fitsChars =
  (maxChars = 11): Fits =>
  (text) =>
    text.length <= maxChars;

/** Excel's scientific form: 1.23457E+14, 1E-07 (two exponent digits). */
function scientific(n: number, decimals: number): string {
  const [mantissa, exponent] = n.toExponential(decimals).split('e');
  const sign = exponent.startsWith('-') ? '-' : '+';
  const digits = exponent.replace(/^[+-]/, '').padStart(2, '0');
  return `${mantissa.includes('.') ? mantissa.replace(/\.?0+$/, '') : mantissa}E${sign}${digits}`;
}

/** The number with `decimals` decimals, without trailing zeros (General never shows them). */
function fixed(n: number, decimals: number): string {
  const text = n.toFixed(decimals);
  const trimmed = text.includes('.') ? text.replace(/\.?0+$/, '') : text;
  return trimmed === '-0' ? '0' : trimmed;
}

/**
 * A number as Excel's General format shows it in a cell (step 4.7e): all
 * its digits when they fit; else rounded to the decimals that fit the
 * cell's width (898.0893756 → 898.0894 → 898.09 → 898.1 → 898); scientific
 * only when even the whole part doesn't fit (1.23457E+14) or for very small
 * numbers (1E-05, as Excel shows 0.00001); "###" when nothing fits. Never
 * cut with "…": a cut number would read as another value. The formula bar
 * keeps what was typed; there are no number formats in 4.7e.
 */
export function fitNumber(n: number, fits: Fits): string {
  if (n === 0) return '0';
  const abs = Math.abs(n);
  const sciFirst = abs < 1e-4;
  const sciForms = () => {
    for (let decimals = 14; decimals >= 0; decimals--) {
      const text = scientific(n, decimals);
      if (fits(text)) return text;
    }
    return null;
  };
  if (sciFirst) {
    const text = sciForms();
    if (text) return text;
  } else {
    const full = formatNumber(n);
    if (!/E/.test(full)) {
      if (fits(full)) return full;
      const decimals = full.includes('.') ? full.split('.')[1].length : 0;
      for (let d = decimals - 1; d >= 0; d--) {
        const text = fixed(n, d);
        if (fits(text)) return text;
      }
    }
    const text = sciForms();
    if (text) return text;
  }
  for (let count = 12; count > 1; count--) if (fits('#'.repeat(count))) return '#'.repeat(count);
  return '#';
}

/** What a cell shows, and where, as in Excel: numbers right, TRUE / FALSE and errors centred, text left. */
export function displayOf(value: CellValue, fits: Fits = fitsChars()): { text: string; align: Align; error: boolean } {
  if (value === null) return { text: '', align: 'left', error: false };
  if (typeof value === 'number') return { text: fitNumber(value, fits), align: 'right', error: false };
  if (typeof value === 'boolean') return { text: value ? 'TRUE' : 'FALSE', align: 'center', error: false };
  if (isError(value)) return { text: value.code, align: 'center', error: true };
  return { text: value, align: 'left', error: false };
}

const EXPLAIN: Record<ErrorCode, string> = {
  '#DIV/0!': 'A number is divided by zero (or by an empty cell).',
  '#VALUE!': 'A value has the wrong type, such as text where a number is needed.',
  '#REF!': 'A reference points to a cell that doesn’t exist.',
  '#NAME?': 'The formula uses a name that isn’t a function or a cell.',
  '#N/A': 'The value looked for wasn’t found.',
  '#NUM!': 'The result isn’t a valid number (for example, no rate fits).',
  '#ERROR!': 'The formula can’t be read.',
};

/** The line under the formula bar for an error: its code, then the engine's reason or a short explanation. */
export function explainError(value: CellValue): string | null {
  if (!isError(value)) return null;
  return `${value.code}: ${value.message ? `${value.message}.`.replace(/\.\.$/, '.') : EXPLAIN[value.code]}`;
}
