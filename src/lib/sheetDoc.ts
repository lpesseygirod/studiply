/**
 * sheetDoc.ts
 * A spreadsheet tab's cells in its documents row.
 *
 * The tab's content is a document whose top-level blocks are its cells, one
 * block per cell that isn't empty, in row order (A1, B1, …, A2, …):
 *
 *   { type: 'sheetCell', attrs: { blockId: 'B3', input: '=A1*2', bold: true, editedAt, origin: 'student' } }
 *
 * The cell's address is its block id, so the conflict rule that merges text
 * block by block (editor/docBlocks.ts) merges cells one by one, unchanged:
 * two devices changing different cells keep both changes; the same cell:
 * the newer one wins and the other is kept as a version. Saving, the
 * iPhone's queue, versions and Restore all work as for text.
 *
 * Only what was typed is stored; values are calculated on the device
 * (src/lib/sheets). A cell changed since the last read is dated now
 * (`editedAt`), which the merge needs to know which change is newer.
 */

import { parseArea } from './sheets';
import type { DocJSON } from '../editor/types';

/** The grid: columns A–Z, rows 1–1,000. */
export const SHEET_COLS = 26;
export const SHEET_ROWS = 1000;
/** The longest input a cell takes. */
export const MAX_CELL_INPUT = 1000;

export const SHEET_CELL = 'sheetCell';

export interface SheetCell {
  input: string;
  bold: boolean;
}

/** The cells that aren't empty (an input, or bold), by address ("B3"). */
export type SheetCells = Map<string, SheetCell>;

/** A new sheet tab's content: no cells. */
export function emptySheetDoc(): DocJSON {
  return { type: 'doc', content: [] };
}

/** Row and column (0-based) of a cell address in the grid, or null. */
export function cellPosition(address: string): { row: number; col: number } | null {
  try {
    const area = parseArea(address);
    if (area.top !== area.bottom || area.left !== area.right) return null;
    if (area.top >= SHEET_ROWS || area.left >= SHEET_COLS) return null;
    return { row: area.top, col: area.left };
  } catch {
    return null;
  }
}

/** The cells in a tab's content; blocks that aren't cells of the grid are ignored. */
export function cellsOf(doc: DocJSON | null | undefined): SheetCells {
  const cells: SheetCells = new Map();
  for (const block of doc?.content ?? []) {
    if (block.type !== SHEET_CELL) continue;
    const address = block.attrs?.blockId;
    if (typeof address !== 'string' || !cellPosition(address)) continue;
    const input = typeof block.attrs?.input === 'string' ? block.attrs.input : '';
    const bold = block.attrs?.bold === true;
    if (input !== '' || bold) cells.set(address, { input, bold });
  }
  return cells;
}

/** The typed inputs, for Sheet.fromJSON. */
export function inputsOf(cells: SheetCells): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [address, cell] of cells) if (cell.input !== '') out[address] = cell.input;
  return out;
}

const rowMajor = (a: string, b: string) => {
  const p = cellPosition(a)!;
  const q = cellPosition(b)!;
  return p.row - q.row || p.col - q.col;
};

/**
 * The tab's content for `cells`. A cell the same as in `previous` keeps its
 * block (and its time); a changed or new one is dated `now`.
 */
export function sheetDocOf(cells: SheetCells, previous: DocJSON | null | undefined, now: number): DocJSON {
  const before = new Map<string, NonNullable<DocJSON['content']>[number]>();
  for (const block of previous?.content ?? []) {
    if (block.type === SHEET_CELL && typeof block.attrs?.blockId === 'string') before.set(block.attrs.blockId, block);
  }
  const content = [...cells.keys()]
    .filter((address) => cellPosition(address))
    .sort(rowMajor)
    .map((address) => {
      const cell = cells.get(address)!;
      const old = before.get(address);
      if (old && (old.attrs?.input ?? '') === cell.input && (old.attrs?.bold === true) === cell.bold) return old;
      const editedAt = Math.max(now, typeof old?.attrs?.editedAt === 'number' ? old.attrs.editedAt + 1 : 0);
      return { type: SHEET_CELL, attrs: { blockId: address, input: cell.input, ...(cell.bold ? { bold: true } : {}), editedAt, origin: 'student' } };
    });
  return { type: 'doc', content };
}
