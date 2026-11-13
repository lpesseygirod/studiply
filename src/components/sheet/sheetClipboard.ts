/**
 * sheetClipboard.ts
 * Copy, cut and paste of cells in a spreadsheet tab,
 * pure so it is unit tested; SheetTab wires it to the browser's copy,
 * cut and paste events (no permission asked).
 *   - Copying puts the cells' values on the clipboard as tab-separated text
 *     (rows on lines), which pastes into Excel, Google Sheets or a document;
 *     the tab also keeps the cells themselves (what was typed, bold).
 *   - Pasting what this tab copied: formulas move like a fill (copyFormula,
 *     $ parts fixed). After a cut they move as they are, and the cut cells
 *     are emptied (Known issue: other cells that pointed at them aren't
 *     redirected, as Excel does).
 *   - Pasting other text: tab-separated pieces into the cells from the
 *     selected one, each as if typed.
 */

import { cellKey, copyFormula, formatNumber, isError, type CellValue } from '../../lib/sheets';
import { SHEET_COLS, SHEET_ROWS, type SheetCell } from '../../lib/sheetDoc';
import type { Box, CellAt } from './sheetDisplay';

export interface Clip {
  source: Box;
  /** The source's cells row by row (null: empty). */
  cells: (SheetCell | null)[][];
  /** What was put on the clipboard as text; a paste of the same text is this clip. */
  text: string;
  cut: boolean;
}

/** A value as it goes to other apps: numbers in full (15 digits), TRUE / FALSE, an error's code. */
export function valueText(value: CellValue): string {
  if (value === null) return '';
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (isError(value)) return value.code;
  return value;
}

export const toTSV = (rows: string[][]): string => rows.map((r) => r.join('\t')).join('\n');

/** Tab-separated text as rows of pieces (the last line break, as Excel adds, is ignored). */
export function parseTSV(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  return lines.map((line) => line.split('\t'));
}

/**
 * A copy (or cut) of `box`, shrunk to the part with cells in it when it is
 * larger (whole rows or columns), at least its first cell.
 */
export function makeClip(box: Box, cellOf: (address: string) => SheetCell | undefined, valueOf: (address: string) => CellValue, cut: boolean): Clip {
  let bottom = box.top;
  let right = box.left;
  for (let row = box.top; row <= box.bottom; row++) {
    for (let col = box.left; col <= box.right; col++) {
      const cell = cellOf(cellKey(row, col));
      if (cell && (cell.input !== '' || cell.bold)) {
        bottom = Math.max(bottom, row);
        right = Math.max(right, col);
      }
    }
  }
  const source = { top: box.top, left: box.left, bottom, right };
  const cells: (SheetCell | null)[][] = [];
  const texts: string[][] = [];
  for (let row = source.top; row <= source.bottom; row++) {
    const cellRow: (SheetCell | null)[] = [];
    const textRow: string[] = [];
    for (let col = source.left; col <= source.right; col++) {
      const key = cellKey(row, col);
      cellRow.push(cellOf(key) ?? null);
      textRow.push(valueText(valueOf(key)));
    }
    cells.push(cellRow);
    texts.push(textRow);
  }
  return { source, cells, text: toTSV(texts), cut };
}

const inGrid = (row: number, col: number) => row < SHEET_ROWS && col < SHEET_COLS;

/**
 * What pasting a clip at `at` writes, and the box pasted. A copy moves the
 * formulas by the distance; a cut keeps them and empties the cut cells
 * that the paste doesn't cover. Cells past the grid's edge are left out.
 */
export function pasteClip(clip: Clip, at: CellAt): { inputs: Record<string, string>; bold: Record<string, boolean>; box: Box } {
  const inputs: Record<string, string> = {};
  const bold: Record<string, boolean> = {};
  const height = clip.cells.length;
  const width = clip.cells[0]?.length ?? 0;
  const box = { top: at.row, left: at.col, bottom: Math.min(SHEET_ROWS - 1, at.row + height - 1), right: Math.min(SHEET_COLS - 1, at.col + width - 1) };
  const inBox = (row: number, col: number) => row >= box.top && row <= box.bottom && col >= box.left && col <= box.right;
  if (clip.cut) {
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const row = clip.source.top + r;
        const col = clip.source.left + c;
        if (!inBox(row, col)) {
          inputs[cellKey(row, col)] = '';
          bold[cellKey(row, col)] = false;
        }
      }
    }
  }
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const row = at.row + r;
      const col = at.col + c;
      if (!inGrid(row, col)) continue;
      const cell = clip.cells[r][c];
      const from = cellKey(clip.source.top + r, clip.source.left + c);
      const to = cellKey(row, col);
      const input = cell?.input ?? '';
      inputs[to] = clip.cut ? input : copyFormula(input, from, to);
      bold[to] = !!cell?.bold;
    }
  }
  return { inputs, bold, box };
}

/** What pasting other apps' text at `at` writes (each piece as typed), and the box pasted. */
export function pasteText(text: string, at: CellAt): { inputs: Record<string, string>; box: Box } {
  const rows = parseTSV(text);
  const inputs: Record<string, string> = {};
  let bottom = at.row;
  let right = at.col;
  rows.forEach((pieces, r) =>
    pieces.forEach((piece, c) => {
      const row = at.row + r;
      const col = at.col + c;
      if (!inGrid(row, col)) return;
      inputs[cellKey(row, col)] = piece;
      bottom = Math.max(bottom, row);
      right = Math.max(right, col);
    }),
  );
  return { inputs, box: { top: at.row, left: at.col, bottom, right } };
}
