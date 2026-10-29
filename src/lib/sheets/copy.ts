/**
 * copy.ts
 * Copying cells, and formulas to other cells, as Excel does.
 *
 * A reference in a copied formula moves with it: =A1*2 copied one row down
 * becomes =A2*2. A `$` keeps its part fixed: $A$1 never moves, $A1 keeps
 * the column, A$1 keeps the row. A reference pushed off the grid (above
 * row 1, left of column A) becomes #REF!, and so does a range with either
 * end off it. Everything else in the formula stays exactly as typed.
 *
 * copyCells pastes a block: to a single cell it lands with that cell as
 * its top-left; to a range whose size is a multiple of the block, the
 * block repeats to fill it. That is also how a formula is filled down or
 * across: copyCells(sheet, "B2", "B3:B20").
 */

import { cellKey, formatCellRef, inGrid, parseArea, parseCellRef, parseKey, type CellRef } from './address';
import { FormulaSyntaxError, tokenize } from './parser';
import type { Sheet } from './sheet';

function shiftRef(ref: CellRef, rows: number, cols: number): CellRef | null {
  const moved = { ...ref, row: ref.rowAbs ? ref.row : ref.row + rows, col: ref.colAbs ? ref.col : ref.col + cols };
  return inGrid(moved.row, moved.col) ? moved : null;
}

/** A cell's input with its formula's references moved `rows` down and `cols` right (negative: up, left). */
export function shiftFormula(input: string, rows: number, cols: number): string {
  if (!input.startsWith('=') || (rows === 0 && cols === 0)) return input;
  const text = input.slice(1);
  let tokens;
  try {
    tokens = tokenize(text);
  } catch (e) {
    if (e instanceof FormulaSyntaxError) return input; // copied as typed; it shows #ERROR! wherever it goes
    throw e;
  }

  let out = '';
  let last = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind !== 'ref') continue;
    const isRange = tokens[i + 1]?.kind === 'colon' && tokens[i + 2]?.kind === 'ref';
    const end = isRange ? tokens[i + 2] : t;
    const first = shiftRef(parseCellRef(t.text)!, rows, cols);
    const second = isRange ? shiftRef(parseCellRef(end.text)!, rows, cols) : first;
    const replaced = first && second ? (isRange ? `${formatCellRef(first)}:${formatCellRef(second)}` : formatCellRef(first)) : '#REF!';
    out += text.slice(last, t.start) + replaced;
    last = end.end;
    if (isRange) i += 2;
  }
  return `=${out}${text.slice(last)}`;
}

/** A cell's input as it reads when copied from one cell to another ("B2" → "C5"). */
export function copyFormula(input: string, from: string, to: string): string {
  const a = parseKey(from);
  const b = parseKey(to);
  return shiftFormula(input, b.row - a.row, b.col - a.col);
}

/**
 * Copies the cells in `from` (a cell or range) to `to` (a cell or range),
 * empty cells included, and recalculates. Cells that would land off the
 * grid are left out. Returns the cells recalculated, as Sheet.set does.
 */
export function copyCells(sheet: Sheet, from: string, to: string): string[] {
  const source = parseArea(from);
  const target = parseArea(to);
  const height = source.bottom - source.top + 1;
  const width = source.right - source.left + 1;
  const targetHeight = target.bottom - target.top + 1;
  const targetWidth = target.right - target.left + 1;
  const repeats = targetHeight % height === 0 && targetWidth % width === 0;
  const bottom = repeats ? target.bottom : target.top + height - 1;
  const right = repeats ? target.right : target.left + width - 1;

  // Read every source cell before writing, in case the two blocks overlap.
  const inputs: string[][] = [];
  for (let r = 0; r < height; r++) {
    const row: string[] = [];
    for (let c = 0; c < width; c++) row.push(sheet.input(cellKey(source.top + r, source.left + c)));
    inputs.push(row);
  }

  const writes: Record<string, string> = {};
  for (let row = target.top; row <= bottom; row++) {
    for (let col = target.left; col <= right; col++) {
      if (!inGrid(row, col)) continue;
      const r = (row - target.top) % height;
      const c = (col - target.left) % width;
      writes[cellKey(row, col)] = shiftFormula(inputs[r][c], row - (source.top + r), col - (source.left + c));
    }
  }
  return sheet.setMany(writes);
}
