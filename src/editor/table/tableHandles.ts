import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { addColumn, addRow, CellSelection, TableMap, type TableRect } from '@tiptap/pm/tables';
import type { EditorView } from '@tiptap/pm/view';

import { PAGE_GAP_CLASS } from '../page/pageView';

/**
 * The laptop's table handles (Lea: "small handles on hover"),
 * while the pointer is over a table or the margin around it (where the
 * handles sit):
 * - a grip on each row's left edge and each column's top edge: a click
 *   selects that row or column (then the bar, right-click or Delete act on it);
 * - a "+" on the grip line at a row or column boundary: a click inserts a
 *   row or column there. It appears when the pointer comes near a boundary
 *   and stays there until it comes near another one, so a hand that drifts
 *   on its way to the "+" still finds it (Lea's retest).
 * Leaving the table and its margin hides them after HIDE_MS, not at once.
 * Laptop only (StudiplyEditor.web): the iPhone has no hover.
 */

export const TABLE_HANDLES_CLASS = 'studiply-table-handles';
/** How far the grips sit outside the table. */
export const HANDLE_ROOM = 18;
/** How near a boundary the pointer brings its "+". */
const NEAR = 12;
/** The "+"'s target (its visible circle is smaller). */
const PLUS = 24;
/** The margin around the table (beyond the grips) that still counts as over it. */
const MARGIN = 16;
const HIDE_MS = 300;

const key = new PluginKey('studiplyTableHandles');

interface Geometry {
  tablePos: number;
  map: TableMap;
  /** Window coordinates. */
  rows: { top: number; bottom: number }[];
  cols: { left: number; right: number }[];
  box: DOMRect;
}

/** A button the layer draws, in the parent's coordinates. */
interface Spec {
  cls: string;
  label: string;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  run: () => void;
}

/** The table and the handle margin around it (left and top hold the grips). */
function inZone(table: HTMLElement, x: number, y: number): boolean {
  const r = table.getBoundingClientRect();
  return x >= r.left - HANDLE_ROOM - MARGIN && x <= r.right + MARGIN && y >= r.top - HANDLE_ROOM - MARGIN && y <= r.bottom + MARGIN;
}

class HandlesView {
  private layer = document.createElement('div');
  private table: HTMLTableElement | null = null;
  private pointer = { x: 0, y: 0 };
  private parent: HTMLElement | null = null;
  /** The boundaries whose "+" shows (kept until the pointer nears another). */
  private plus = { row: -1, col: -1 };
  /** What the layer shows now: redrawn only when it changes, so the button under the pointer stays the same element. */
  private drawn = '';
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private frame = 0;

  constructor(private view: EditorView) {
    this.layer.className = TABLE_HANDLES_CLASS;
    this.layer.addEventListener('mousedown', (e) => e.preventDefault());
    // The whole page, not the editor: the handles sit outside the table, and may sit outside the editor's box.
    document.addEventListener('mousemove', this.onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', this.onLeave);
  }

  private attach() {
    const parent = this.view.dom.parentElement;
    if (!parent || parent === this.parent) return;
    this.parent = parent;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.appendChild(this.layer);
  }

  private onLeave = () => this.hideSoon();

  private onMove = (e: MouseEvent) => {
    this.pointer = { x: e.clientX, y: e.clientY };
    if (!this.frame) this.frame = requestAnimationFrame(this.track);
  };

  private track = () => {
    this.frame = 0;
    const { x, y } = this.pointer;
    const hit = document.elementFromPoint(x, y);
    const over = hit?.closest?.('table');
    if (over && over !== this.table && this.view.dom.contains(over)) return this.show(over as HTMLTableElement);
    if (this.table?.isConnected && (this.layer.contains(hit) || inZone(this.table, x, y))) return this.show(this.table);
    this.hideSoon();
  };

  private show(table: HTMLTableElement) {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    if (table !== this.table) this.plus = { row: -1, col: -1 };
    this.table = table;
    this.draw();
  }

  private hideSoon() {
    if (!this.table || this.hideTimer) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.table = null;
      this.plus = { row: -1, col: -1 };
      this.draw();
    }, HIDE_MS);
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
    // Not a page gap drawn as a row (the page view).
    const domRows = Array.from(table.rows).filter((tr) => !tr.classList.contains(PAGE_GAP_CLASS));
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
    const g = this.view.editable ? this.geometry() : null;
    const specs = g && this.parent ? this.specs(g, this.parent.getBoundingClientRect()) : [];
    const drawn = JSON.stringify(specs.map(({ run: _run, ...spec }) => spec));
    if (drawn === this.drawn) return;
    this.drawn = drawn;
    this.layer.replaceChildren(
      ...specs.map((spec) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = spec.cls;
        el.setAttribute('aria-label', spec.label);
        Object.assign(el.style, { left: `${spec.left}px`, top: `${spec.top}px`, width: `${spec.width}px`, height: `${spec.height}px` });
        if (spec.text) {
          const dot = document.createElement('span');
          dot.textContent = spec.text;
          el.appendChild(dot);
        }
        el.addEventListener('click', spec.run);
        return el;
      }),
    );
  }

  private specs(g: Geometry, origin: DOMRect): Spec[] {
    const specs: Spec[] = [];
    const add = (cls: string, label: string, run: () => void, left: number, top: number, width: number, height: number, text = '') =>
      specs.push({ cls, label, text, run, left: left - origin.left, top: top - origin.top, width, height });

    const gripX = g.box.left - HANDLE_ROOM + 4;
    const gripY = g.box.top - HANDLE_ROOM + 4;
    g.rows.forEach((row, i) => add('grip row', `Select row ${i + 1}`, () => this.select('row', i), gripX, row.top + 2, 8, row.bottom - row.top - 4));
    g.cols.forEach((col, i) => add('grip col', `Select column ${i + 1}`, () => this.select('col', i), col.left + 2, gripY, col.right - col.left - 4, 8));

    // "+" at a boundary near the pointer; the last one stays while the pointer is between boundaries.
    const rowEdges = [g.rows[0].top, ...g.rows.map((r) => r.bottom)];
    const colEdges = [g.cols[0].left, ...g.cols.map((c) => c.right)];
    // Near in the document's own size: zoomed out (Pages at Fit), rows are smaller on screen, and so is "near".
    const dom = this.view.dom as HTMLElement;
    const near = NEAR * (dom.offsetWidth ? Math.min(1, dom.getBoundingClientRect().width / dom.offsetWidth) : 1);
    const nearest = (edges: number[], at: number) => {
      let best = -1;
      edges.forEach((edge, i) => {
        if (Math.abs(edge - at) <= near && (best < 0 || Math.abs(edge - at) < Math.abs(edges[best] - at))) best = i;
      });
      return best;
    };
    const { x, y } = this.pointer;
    const inRows = y >= g.box.top - near && y <= g.box.bottom + near && x <= g.box.right + near;
    const inCols = x >= g.box.left - near && x <= g.box.right + near && y <= g.box.bottom + near;
    const r = inRows ? nearest(rowEdges, y) : -1;
    const c = inCols ? nearest(colEdges, x) : -1;
    if (r >= 0) this.plus.row = r;
    if (c >= 0) this.plus.col = c;
    if (this.plus.row >= rowEdges.length) this.plus.row = -1;
    if (this.plus.col >= colEdges.length) this.plus.col = -1;

    const row = this.plus.row;
    const col = this.plus.col;
    if (row >= 0)
      add('plus', row === g.rows.length ? 'Add row at the end' : `Insert row ${row + 1}`, () => this.insert('row', row), gripX + 4 - PLUS / 2, rowEdges[row] - PLUS / 2, PLUS, PLUS, '+');
    if (col >= 0)
      add('plus', col === g.cols.length ? 'Add column at the end' : `Insert column ${col + 1}`, () => this.insert('col', col), colEdges[col] - PLUS / 2, gripY + 4 - PLUS / 2, PLUS, PLUS, '+');
    return specs;
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
    document.removeEventListener('mousemove', this.onMove);
    document.documentElement.removeEventListener('mouseleave', this.onLeave);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    if (this.frame) cancelAnimationFrame(this.frame);
    this.layer.remove();
  }
}

export const TableHandles = Extension.create({
  name: 'tableHandles',
  addProseMirrorPlugins() {
    return [new Plugin({ key, view: (view) => new HandlesView(view) })];
  },
});
