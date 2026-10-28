import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { addColumn, addRow, CellSelection, TableMap, type TableRect } from '@tiptap/pm/tables';
import type { EditorView } from '@tiptap/pm/view';

/**
 * The laptop's table handles (step 4.5, Lea: "small handles on hover"),
 * while the pointer is over a table:
 * - a grip on each row's left edge and each column's top edge: a click
 *   selects that row or column (then the bar, right-click or Delete act on it);
 * - a "+" on the grip line at the row or column boundary nearest the
 *   pointer: a click inserts a row or column there.
 * Laptop only (StudiplyEditor.web): the iPhone has no hover.
 */

export const TABLE_HANDLES_CLASS = 'studiply-table-handles';
/** How far the grips sit outside the table. */
export const HANDLE_ROOM = 18;
const NEAR = 12;

const key = new PluginKey('studiplyTableHandles');

interface Geometry {
  tablePos: number;
  map: TableMap;
  /** Window coordinates. */
  rows: { top: number; bottom: number }[];
  cols: { left: number; right: number }[];
  box: DOMRect;
}

class HandlesView {
  private layer = document.createElement('div');
  private table: HTMLTableElement | null = null;
  private pointer = { x: 0, y: 0 };
  private parent: HTMLElement | null = null;

  constructor(private view: EditorView) {
    this.layer.className = TABLE_HANDLES_CLASS;
    this.layer.addEventListener('mousedown', (e) => e.preventDefault());
  }

  private attach() {
    const parent = this.view.dom.parentElement;
    if (!parent || parent === this.parent) return;
    this.parent?.removeEventListener('mousemove', this.onMove);
    this.parent?.removeEventListener('mouseleave', this.onLeave);
    this.parent = parent;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.appendChild(this.layer);
    parent.addEventListener('mousemove', this.onMove);
    parent.addEventListener('mouseleave', this.onLeave);
  }

  private onLeave = () => this.show(null);

  private onMove = (e: MouseEvent) => {
    this.pointer = { x: e.clientX, y: e.clientY };
    const target = e.target as HTMLElement | null;
    if (target && this.layer.contains(target)) return this.draw();
    const table = target?.closest?.('table') ?? null;
    if (table && this.view.dom.contains(table)) return this.show(table as HTMLTableElement);
    // Between the table and its handles: keep them.
    if (this.table) {
      const r = this.table.getBoundingClientRect();
      const near = e.clientX > r.left - HANDLE_ROOM - NEAR && e.clientX < r.right && e.clientY > r.top - HANDLE_ROOM - NEAR && e.clientY < r.bottom;
      if (near) return this.draw();
    }
    this.show(null);
  };

  private show(table: HTMLTableElement | null) {
    this.table = table;
    this.draw();
  }

  private geometry(): Geometry | null {
    const table = this.table;
    if (!table?.isConnected) return null;
    const $inside = this.view.state.doc.resolve(this.view.posAtDOM(table, 0));
    let tablePos = -1;
    for (let d = $inside.depth; d >= 0; d--) {
      if ($inside.node(d).type.name === 'table') {
        tablePos = d === 0 ? -1 : $inside.before(d);
        break;
      }
    }
    const node = tablePos >= 0 ? this.view.state.doc.nodeAt(tablePos) : null;
    if (!node) return null;
    const map = TableMap.get(node);
    const domRows = Array.from(table.rows);
    if (domRows.length !== map.height) return null;
    const rows = domRows.map((tr) => {
      const r = tr.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    // Column edges from the cells, through the table map (merged cells span several).
    const cols: { left: number; right: number }[] = Array.from({ length: map.width }, () => ({ left: NaN, right: NaN }));
    node.forEach((row, rowOffset, r) => {
      row.forEach((_cell, cellOffset, c) => {
        const dom = domRows[r]?.cells[c];
        if (!dom) return;
        const rect = map.findCell(rowOffset + 1 + cellOffset);
        const box = dom.getBoundingClientRect();
        if (Number.isNaN(cols[rect.left].left)) cols[rect.left].left = box.left;
        if (Number.isNaN(cols[rect.right - 1].right)) cols[rect.right - 1].right = box.right;
      });
    });
    if (cols.some((c) => Number.isNaN(c.left) || Number.isNaN(c.right))) return null;
    return { tablePos, map, rows, cols, box: table.getBoundingClientRect() };
  }

  private draw() {
    this.attach();
    this.layer.replaceChildren();
    const g = this.view.editable ? this.geometry() : null;
    if (!g || !this.parent) return;
    const origin = this.parent.getBoundingClientRect();
    const place = (el: HTMLElement, left: number, top: number, width: number, height: number) => {
      Object.assign(el.style, { left: `${left - origin.left}px`, top: `${top - origin.top}px`, width: `${width}px`, height: `${height}px` });
      this.layer.appendChild(el);
    };
    const button = (cls: string, label: string, onClick: () => void, text = '') => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = cls;
      el.textContent = text;
      el.setAttribute('aria-label', label);
      el.addEventListener('click', onClick);
      return el;
    };

    const gripX = g.box.left - HANDLE_ROOM + 4;
    const gripY = g.box.top - HANDLE_ROOM + 4;
    g.rows.forEach((row, i) =>
      place(button('grip row', `Select row ${i + 1}`, () => this.select('row', i)), gripX, row.top + 2, 8, row.bottom - row.top - 4),
    );
    g.cols.forEach((col, i) =>
      place(button('grip col', `Select column ${i + 1}`, () => this.select('col', i)), col.left + 2, gripY, col.right - col.left - 4, 8),
    );

    // "+" at the boundary nearest the pointer, on the grip line.
    const rowEdges = [g.rows[0].top, ...g.rows.map((r) => r.bottom)];
    const colEdges = [g.cols[0].left, ...g.cols.map((c) => c.right)];
    const nearest = (edges: number[], at: number) => {
      let best = -1;
      edges.forEach((edge, i) => {
        if (Math.abs(edge - at) <= NEAR && (best < 0 || Math.abs(edge - at) < Math.abs(edges[best] - at))) best = i;
      });
      return best;
    };
    const { x, y } = this.pointer;
    const inRows = y >= g.box.top - NEAR && y <= g.box.bottom + NEAR;
    const inCols = x >= g.box.left - NEAR && x <= g.box.right + NEAR;
    const r = inRows && x <= g.box.right ? nearest(rowEdges, y) : -1;
    const c = inCols && y <= g.box.bottom ? nearest(colEdges, x) : -1;
    if (r >= 0) place(button('plus', r === g.rows.length ? 'Add row at the end' : `Insert row ${r + 1}`, () => this.insert('row', r), '+'), gripX - 4, rowEdges[r] - 8, 16, 16);
    if (c >= 0) place(button('plus', c === g.cols.length ? 'Add column at the end' : `Insert column ${c + 1}`, () => this.insert('col', c), '+'), colEdges[c] - 8, gripY - 4, 16, 16);
  }

  private rect(tablePos: number): TableRect | null {
    const table = this.view.state.doc.nodeAt(tablePos);
    if (!table) return null;
    const map = TableMap.get(table);
    return { map, table, tableStart: tablePos + 1, left: 0, top: 0, right: map.width, bottom: map.height };
  }

  private select(kind: 'row' | 'col', index: number) {
    const g = this.geometry();
    const rect = g && this.rect(g.tablePos);
    if (!g || !rect) return;
    const cellAt = (r: number, c: number) => rect.tableStart + rect.map.map[r * rect.map.width + c];
    const doc = this.view.state.doc;
    const selection =
      kind === 'row'
        ? CellSelection.create(doc, cellAt(index, 0), cellAt(index, rect.map.width - 1))
        : CellSelection.create(doc, cellAt(0, index), cellAt(rect.map.height - 1, index));
    this.view.focus();
    this.view.dispatch(this.view.state.tr.setSelection(selection));
  }

  private insert(kind: 'row' | 'col', at: number) {
    const g = this.geometry();
    const rect = g && this.rect(g.tablePos);
    if (!g || !rect) return;
    const tr = this.view.state.tr;
    if (kind === 'row') addRow(tr, rect, at);
    else addColumn(tr, rect, at);
    this.view.focus();
    this.view.dispatch(tr);
  }

  update(view: EditorView) {
    this.view = view;
    this.draw();
  }

  destroy() {
    this.parent?.removeEventListener('mousemove', this.onMove);
    this.parent?.removeEventListener('mouseleave', this.onLeave);
    this.layer.remove();
  }
}

export const TableHandles = Extension.create({
  name: 'tableHandles',
  addProseMirrorPlugins() {
    return [new Plugin({ key, view: (view) => new HandlesView(view) })];
  },
});
