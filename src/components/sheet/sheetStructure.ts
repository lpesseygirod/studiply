/**
 * sheetStructure.ts
 * Inserting and deleting rows and columns in a spreadsheet tab,
 * pure so it is unit tested. The cells after the change
 * move with it, and every formula's references move as in Excel
 * (src/lib/sheets/structure.ts: $ ones too; a deleted cell's are #REF!).
 *
 * A cell's address is its id (src/lib/sheetDoc.ts), so moved cells are
 * written as new cells and their old addresses emptied: one change, merged
 * cell by cell. (Known issue: the other device's offline edit of a moved
 * cell lands at its old address.)
 */

import { cellKey, deleteLinesInFormula, insertLinesInFormula, type Lines } from '../../lib/sheets';
import { cellPosition, SHEET_COLS, SHEET_ROWS, type SheetCell, type SheetCells } from '../../lib/sheetDoc';

export type { Lines } from '../../lib/sheets';

export interface LinesChange {
  kind: 'insert' | 'delete';
  lines: Lines;
  /** The first line (0-based): inserted before it, or deleted from it. */
  at: number;
  count: number;
}

/**
 * The cells after the change, or null when an insert would push a cell
 * that isn't empty past the grid's last row (1,000) or column (Z).
 */
export function changeLines(cells: SheetCells, change: LinesChange): SheetCells | null {
  const { kind, lines, at, count } = change;
  const limit = lines === 'rows' ? SHEET_ROWS : SHEET_COLS;
  const end = at + count - 1;
  const next: SheetCells = new Map();
  for (const [key, cell] of cells) {
    const pos = cellPosition(key);
    if (!pos) continue;
    const line = lines === 'rows' ? pos.row : pos.col;
    let moved = line;
    if (kind === 'insert') {
      if (line >= at) moved = line + count;
      if (moved >= limit) return null;
    } else {
      if (line >= at && line <= end) continue;
      if (line > end) moved = line - count;
    }
    const input = kind === 'insert' ? insertLinesInFormula(cell.input, lines, at, count) : deleteLinesInFormula(cell.input, lines, at, count);
    const address = lines === 'rows' ? cellKey(moved, pos.col) : cellKey(pos.row, moved);
    next.set(address, { input, bold: cell.bold });
  }
  return next;
}

/** What to write to go from `before` to `after`: the cells that differ (emptied ones as ""). */
export function cellChanges(before: SheetCells, after: SheetCells): { inputs: Record<string, string>; bold: Record<string, boolean> } {
  const inputs: Record<string, string> = {};
  const bold: Record<string, boolean> = {};
  const empty: SheetCell = { input: '', bold: false };
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(key) ?? empty;
    const b = after.get(key) ?? empty;
    if (a.input !== b.input) inputs[key] = b.input;
    if (a.bold !== b.bold) bold[key] = b.bold;
  }
  return { inputs, bold };
}

/** The menu's words for a change of `count` lines ("Insert 2 rows above", "Delete column"). */
export function linesLabel(kind: 'above' | 'below' | 'left' | 'right' | 'delete', lines: Lines, count: number): string {
  const noun = lines === 'rows' ? (count === 1 ? 'row' : `${count} rows`) : count === 1 ? 'column' : `${count} columns`;
  return kind === 'delete' ? `Delete ${noun}` : `Insert ${noun} ${kind}`;
}
