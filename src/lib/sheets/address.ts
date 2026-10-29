/**
 * address.ts
 * Cell addresses as students type them: A1, $A$1, A1:B5.
 *
 * Rows and columns are 0-based inside the engine (A1 is row 0, column 0) and
 * 1-based / lettered on screen. The grid is as large as Excel's: 1,048,576
 * rows and 16,384 columns (A to XFD); anything outside it is not an address.
 * A `$` fixes the row or column when a formula is copied (see copy.ts).
 */

export const MAX_ROWS = 1_048_576;
export const MAX_COLS = 16_384;

/** One cell reference inside a formula, with its `$` markers. */
export interface CellRef {
  row: number;
  col: number;
  rowAbs: boolean;
  colAbs: boolean;
}

/** A rectangle of cells, corners included (0-based). */
export interface Area {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

const CELL_PATTERN = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/;

/** "A" → 0, "Z" → 25, "AA" → 26, "XFD" → 16383; -1 for anything else. */
export function columnIndex(letters: string): number {
  if (!/^[A-Za-z]{1,3}$/.test(letters)) return -1;
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1 < MAX_COLS ? n - 1 : -1;
}

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function columnName(col: number): string {
  let name = '';
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

export function inGrid(row: number, col: number): boolean {
  return row >= 0 && row < MAX_ROWS && col >= 0 && col < MAX_COLS;
}

/** "$B$3" → { row: 2, col: 1, rowAbs: true, colAbs: true }; null when it isn't a cell in the grid. */
export function parseCellRef(text: string): CellRef | null {
  const m = CELL_PATTERN.exec(text);
  if (!m) return null;
  const col = columnIndex(m[2]);
  const row = Number(m[4]) - 1;
  if (col < 0 || !inGrid(row, col)) return null;
  return { row, col, rowAbs: m[3] === '$', colAbs: m[1] === '$' };
}

/** The reference as written in a formula, `$` included: "$A1". */
export function formatCellRef(ref: CellRef): string {
  return `${ref.colAbs ? '$' : ''}${columnName(ref.col)}${ref.rowAbs ? '$' : ''}${ref.row + 1}`;
}

/** The plain name of a cell, used as its key in a sheet: (2, 1) → "B3". */
export function cellKey(row: number, col: number): string {
  return `${columnName(col)}${row + 1}`;
}

/** "b3" or "$B$3" → "B3"; throws when it isn't a cell in the grid. */
export function normalizeKey(address: string): string {
  const ref = parseCellRef(address.trim());
  if (!ref) throw new Error(`Not a cell address: "${address}"`);
  return cellKey(ref.row, ref.col);
}

/** "B3" → { row: 2, col: 1 }; throws when it isn't a cell in the grid. */
export function parseKey(address: string): { row: number; col: number } {
  const ref = parseCellRef(address.trim());
  if (!ref) throw new Error(`Not a cell address: "${address}"`);
  return { row: ref.row, col: ref.col };
}

/** The rectangle between two corners, whichever way round they were typed (B5:A1 is A1:B5). */
export function areaOf(a: { row: number; col: number }, b: { row: number; col: number }): Area {
  return {
    top: Math.min(a.row, b.row),
    left: Math.min(a.col, b.col),
    bottom: Math.max(a.row, b.row),
    right: Math.max(a.col, b.col),
  };
}

/** "A1:B5" or a single "C2" → its rectangle; throws when it isn't one. */
export function parseArea(text: string): Area {
  const parts = text.trim().split(':');
  if (parts.length > 2) throw new Error(`Not a range: "${text}"`);
  const start = parseKey(parts[0]);
  return areaOf(start, parts.length === 2 ? parseKey(parts[1]) : start);
}

export function areaContains(area: Area, row: number, col: number): boolean {
  return row >= area.top && row <= area.bottom && col >= area.left && col <= area.right;
}
