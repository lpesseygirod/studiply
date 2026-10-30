/**
 * sheetEditing.ts
 * Editing a spreadsheet tab's formulas (step 4.7e, checkpoint 2a), pure so
 * it is unit tested; SheetTab wires it to the pointer and the keys:
 *   - pointing: clicking a cell while typing a formula puts its reference at
 *     the cursor, or replaces the reference just before it; dragging makes
 *     a range (A1:A5, top-left to bottom-right whichever way it was dragged);
 *   - autocomplete: a chosen function replaces the letters typed and opens
 *     its bracket (PM → PMT();
 *   - the fill handle: dragging the selection's corner copies its cells down,
 *     up, left or right, the references moving as in Excel ($ parts fixed),
 *     bold too.
 */

import { cellKey, copyFormula, parseArea } from '../../lib/sheets';
import { SHEET_COLS, SHEET_ROWS } from '../../lib/sheetDoc';
import type { Box, CellAt } from './sheetDisplay';

/** The reference for a click (one cell) or a drag (a range, written top-left:bottom-right). */
export function pointedRef(anchor: CellAt, to: CellAt): string {
  if (anchor.row === to.row && anchor.col === to.col) return cellKey(anchor.row, anchor.col);
  const top = Math.min(anchor.row, to.row);
  const left = Math.min(anchor.col, to.col);
  const bottom = Math.max(anchor.row, to.row);
  const right = Math.max(anchor.col, to.col);
  return `${cellKey(top, left)}:${cellKey(bottom, right)}`;
}

/** The draft with `text` in place of draft[from, to), and the cursor after it. */
export function splice(draft: string, from: number, to: number, text: string): { draft: string; caret: number } {
  return { draft: draft.slice(0, from) + text + draft.slice(to), caret: from + text.length };
}

/** A chosen function in place of the letters typed (from `start` to the cursor), its bracket opened. */
export function acceptFunction(draft: string, start: number, caret: number, name: string): { draft: string; caret: number } {
  // Letters typed after the cursor belong to the name too (PM|T).
  let end = caret;
  while (end < draft.length && /[A-Za-z0-9.]/.test(draft[end])) end++;
  const opens = draft[end] === '(';
  return splice(draft, start, opens ? end + 1 : end, `${name}(`);
}

/** The cells (a box) a reference or range names, or null. */
export function boxOfRef(text: string): Box | null {
  try {
    const a = parseArea(text);
    return { top: a.top, left: a.left, bottom: a.bottom, right: a.right };
  } catch {
    return null;
  }
}

/**
 * Where a fill from `source` reaches with the pointer over `cell`: the
 * cells beside the source in the direction the pointer went furthest (as
 * Excel, one direction at a time), inside the grid; null over the source.
 */
export function fillTarget(source: Box, cell: CellAt): Box | null {
  const row = Math.min(SHEET_ROWS - 1, Math.max(0, cell.row));
  const col = Math.min(SHEET_COLS - 1, Math.max(0, cell.col));
  const dy = row > source.bottom ? row - source.bottom : row < source.top ? row - source.top : 0;
  const dx = col > source.right ? col - source.right : col < source.left ? col - source.left : 0;
  if (dy === 0 && dx === 0) return null;
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy > 0
      ? { top: source.bottom + 1, bottom: row, left: source.left, right: source.right }
      : { top: row, bottom: source.top - 1, left: source.left, right: source.right };
  }
  return dx > 0
    ? { top: source.top, bottom: source.bottom, left: source.right + 1, right: col }
    : { top: source.top, bottom: source.bottom, left: col, right: source.left - 1 };
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * What a fill writes: each target cell gets the source cell in the same
 * place of the repeating source block, its references moved by the
 * distance (copyFormula: $ parts stay), and its bold. Empty source cells
 * empty their targets, as Excel does.
 */
export function fillWrites(
  source: Box,
  target: Box,
  inputOf: (address: string) => string,
  boldOf: (address: string) => boolean,
): { inputs: Record<string, string>; bold: Record<string, boolean> } {
  const height = source.bottom - source.top + 1;
  const width = source.right - source.left + 1;
  const inputs: Record<string, string> = {};
  const bold: Record<string, boolean> = {};
  for (let row = target.top; row <= target.bottom; row++) {
    for (let col = target.left; col <= target.right; col++) {
      const from = cellKey(source.top + mod(row - source.top, height), source.left + mod(col - source.left, width));
      const to = cellKey(row, col);
      inputs[to] = copyFormula(inputOf(from), from, to);
      bold[to] = boldOf(from);
    }
  }
  return { inputs, bold };
}

/** The box covering both. */
export const union = (a: Box, b: Box): Box => ({
  top: Math.min(a.top, b.top),
  left: Math.min(a.left, b.left),
  bottom: Math.max(a.bottom, b.bottom),
  right: Math.max(a.right, b.right),
});
