import type { Node as PMNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import { addRow, removeColumn, removeRow, TableMap, type TableRect } from '@tiptap/pm/tables';

/**
 * A table's size, set by typing rows × columns (step 4.5, Lea: "6 × 4, up to
 * a sensible limit like 50 × 20"): rows are added or removed at the bottom,
 * columns at the right.
 */
export const MAX_TABLE = { rows: 50, cols: 20 } as const;

const clamp = (n: number, max: number) => Math.max(1, Math.min(max, Math.round(Number.isFinite(n) ? n : 1)));
export const clampRows = (n: number) => clamp(n, MAX_TABLE.rows);
export const clampCols = (n: number) => clamp(n, MAX_TABLE.cols);

export function tableSize(table: PMNode): { rows: number; cols: number } {
  const map = TableMap.get(table);
  return { rows: map.height, cols: map.width };
}

function rectOf(tr: Transaction, tablePos: number): TableRect {
  const table = tr.doc.nodeAt(tablePos)!;
  const map = TableMap.get(table);
  return { map, table, tableStart: tablePos + 1, left: 0, top: 0, right: map.width, bottom: map.height };
}

/** Makes the table at `tablePos` rows × columns (already within MAX_TABLE). */
export function resizeTable(tr: Transaction, tablePos: number, rows: number, cols: number): Transaction {
  // The table changes with every row or column: its map is read again each time.
  for (let rect = rectOf(tr, tablePos); rect.map.height < rows; rect = rectOf(tr, tablePos)) addRow(tr, rect, rect.map.height);
  for (let rect = rectOf(tr, tablePos); rect.map.height > Math.max(rows, 1); rect = rectOf(tr, tablePos)) removeRow(tr, rect, rect.map.height - 1);
  for (let width = rectOf(tr, tablePos).map.width; width < cols; width++) addColumnAtEnd(tr, tablePos);
  for (let rect = rectOf(tr, tablePos); rect.map.width > Math.max(cols, 1); rect = rectOf(tr, tablePos)) removeColumn(tr, rect, rect.map.width - 1);
  return tr;
}

/**
 * One more column at the right: a new cell at the end of every row (a header
 * cell in a header row). prosemirror-tables' addColumn maps its positions
 * from the transaction's start, so it can't follow rows added before it.
 */
function addColumnAtEnd(tr: Transaction, tablePos: number) {
  const table = tr.doc.nodeAt(tablePos)!;
  const ends: { pos: number; header: boolean }[] = [];
  let pos = tablePos + 1;
  table.forEach((row) => {
    ends.push({ pos: pos + row.nodeSize - 1, header: row.lastChild?.type.name === 'tableHeader' });
    pos += row.nodeSize;
  });
  const { tableCell, tableHeader } = tr.doc.type.schema.nodes;
  for (const end of ends.reverse()) tr.insert(end.pos, (end.header ? tableHeader : tableCell).createAndFill()!);
}

/** Which rows and which columns have text (for the iPhone, which asks before a resize removes any). */
export function filledLines(table: PMNode): { rows: number[]; cols: number[] } {
  const map = TableMap.get(table);
  const rows = new Set<number>();
  const cols = new Set<number>();
  map.map.forEach((offset, i) => {
    if ((table.nodeAt(offset)?.textContent ?? '').trim() === '') return;
    rows.add(Math.floor(i / map.width));
    cols.add(i % map.width);
  });
  return { rows: [...rows].sort((a, b) => a - b), cols: [...cols].sort((a, b) => a - b) };
}

/** How many of the rows and columns a resize would remove have text in them (to ask first). */
export function textLostByResize(table: PMNode, rows: number, cols: number): { rows: number; cols: number } {
  const map = TableMap.get(table);
  const hasText = (cells: number[]) => cells.some((offset) => (table.nodeAt(offset)?.textContent ?? '').trim() !== '');
  const cellsOfRow = (r: number) => Array.from({ length: map.width }, (_, c) => map.map[r * map.width + c]);
  const cellsOfCol = (c: number) => Array.from({ length: map.height }, (_, r) => map.map[r * map.width + c]);
  let lostRows = 0;
  let lostCols = 0;
  for (let r = rows; r < map.height; r++) if (hasText(cellsOfRow(r))) lostRows++;
  // Columns removed from the rows that stay.
  for (let c = cols; c < map.width; c++) if (hasText(cellsOfCol(c).slice(0, Math.min(rows, map.height)))) lostCols++;
  return { rows: lostRows, cols: lostCols };
}
