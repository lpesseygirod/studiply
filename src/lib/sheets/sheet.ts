/**
 * sheet.ts
 * A spreadsheet: what was typed in each cell, and the values that follow.
 *
 * Only the input is kept (`{ A1: "100", B1: "=A1*2" }`, see toJSON); values
 * are always recalculated from it, so a saved value can't go out of date.
 *
 * Recalculation: each formula records the cells and ranges it reads. When a
 * cell changes, the cells that depend on it (and on those, and so on) are
 * recalculated, each after everything it reads, and nothing else. The
 * order is found without recursion, so a chain of thousands of cells is
 * fine. Ranges are indexed by column, so a cell only checks the ranges in
 * its own column (and the few wider than WIDE_RANGE columns). Cells that read each other in a circle show #REF! "Circular
 * reference", as in Google Sheets; cells that read them get that error in
 * turn. Changing any cell in the circle recalculates it, so breaking the
 * circle brings the values back.
 *
 * What a typed input becomes (as in Excel):
 *   "=…"          a formula (#ERROR! with a reason when it can't be read)
 *   "12", "-1.5e3", "50%"   a number
 *   "TRUE", "false"         TRUE / FALSE
 *   "#N/A" (and the other error codes)   that error
 *   "'123"        the text "123" (a leading apostrophe keeps text as text)
 *   ""            empties the cell
 *   anything else is text, kept exactly as typed.
 */

import { areaOf, cellKey, MAX_COLS, normalizeKey, parseKey, type Area } from './address';
import { evaluateFormula } from './evaluate';
import { FormulaSyntaxError, parseFormula, type Node } from './parser';
import { errorCodeOf, errorFor, parseNumber, type CellValue, type SheetError } from './values';

export type ParsedInput = { kind: 'value'; value: CellValue } | { kind: 'formula'; ast: Node } | { kind: 'invalid'; error: SheetError };

export function parseInput(input: string): ParsedInput {
  if (input.startsWith('=') && input.length > 1) {
    try {
      return { kind: 'formula', ast: parseFormula(input.slice(1)) };
    } catch (e) {
      if (!(e instanceof FormulaSyntaxError)) throw e;
      return { kind: 'invalid', error: errorFor('#ERROR!', e.message) };
    }
  }
  if (input.startsWith("'")) return { kind: 'value', value: input.slice(1) };
  if (input === '') return { kind: 'value', value: null };
  const n = parseNumber(input);
  if (n !== null) return { kind: 'value', value: n };
  const upper = input.trim().toUpperCase();
  if (upper === 'TRUE' || upper === 'FALSE') return { kind: 'value', value: upper === 'TRUE' };
  const code = errorCodeOf(input.trim());
  if (code) return { kind: 'value', value: errorFor(code) };
  return { kind: 'value', value: input };
}

/** The cells (by key) and ranges a formula reads. */
function referencesOf(ast: Node): { cells: Set<string>; areas: Area[] } {
  const cells = new Set<string>();
  const areas: Area[] = [];
  const stack: Node[] = [ast];
  while (stack.length) {
    const node = stack.pop()!;
    switch (node.type) {
      case 'ref':
        cells.add(cellKey(node.ref.row, node.ref.col));
        break;
      case 'range':
        areas.push(areaOf(node.start, node.end));
        break;
      case 'paren':
        stack.push(node.inner);
        break;
      case 'unary':
      case 'percent':
        stack.push(node.operand);
        break;
      case 'binary':
        stack.push(node.left, node.right);
        break;
      case 'call':
        stack.push(...node.args);
        break;
    }
  }
  return { cells, areas };
}

/**
 * Splits cells into groups that reach each other in a circle (Tarjan's
 * algorithm, without recursion); a cell in no circle is a group of one.
 * `next` points from a cell to the cells that read it, and the groups come
 * out readers first, so reversed they are in calculation order.
 */
function stronglyConnected(nodes: Iterable<string>, next: (node: string) => string[]): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const groups: string[][] = [];
  let counter = 0;

  for (const root of nodes) {
    if (index.has(root)) continue;
    const work: { node: string; edges: string[]; i: number }[] = [];
    const open = (node: string) => {
      index.set(node, counter);
      low.set(node, counter);
      counter++;
      stack.push(node);
      onStack.add(node);
      work.push({ node, edges: next(node), i: 0 });
    };
    open(root);
    while (work.length) {
      const frame = work[work.length - 1];
      if (frame.i < frame.edges.length) {
        const m = frame.edges[frame.i++];
        if (!index.has(m)) open(m);
        else if (onStack.has(m)) low.set(frame.node, Math.min(low.get(frame.node)!, index.get(m)!));
        continue;
      }
      work.pop();
      if (low.get(frame.node) === index.get(frame.node)) {
        const group: string[] = [];
        let m: string;
        do {
          m = stack.pop()!;
          onStack.delete(m);
          group.push(m);
        } while (m !== frame.node);
        groups.push(group);
      }
      if (work.length) {
        const parent = work[work.length - 1].node;
        low.set(parent, Math.min(low.get(parent)!, low.get(frame.node)!));
      }
    }
  }
  return groups;
}

interface Entry {
  input: string;
  parsed: ParsedInput;
}

/** A range a formula reads, filed under each of its columns. */
interface RangeRead {
  formula: string;
  top: number;
  bottom: number;
}

/** Ranges wider than this many columns are checked against every cell instead of filed by column. */
const WIDE_RANGE = 32;

/** A number for each cell, so reading a range doesn't build a key per cell. */
const cellId = (row: number, col: number) => row * MAX_COLS + col;

export class Sheet {
  private entries = new Map<string, Entry>();
  /** Values by cellId. */
  private values = new Map<number, CellValue>();
  /** Cell → the formulas that name it on its own (A1 in =A1*2). */
  private readers = new Map<string, Set<string>>();
  /** Formula → the ranges it reads (A1:A5 in =SUM(A1:A5)). */
  private rangesOf = new Map<string, Area[]>();
  /** Column → the ranges that cover it, for ranges up to WIDE_RANGE columns. */
  private rangesByColumn = new Map<number, RangeRead[]>();
  /** Ranges wider than WIDE_RANGE columns. */
  private wideRanges: { formula: string; area: Area }[] = [];

  private readonly source = {
    get: (row: number, col: number): CellValue => this.values.get(cellId(row, col)) ?? null,
  };

  private valueOf(key: string): CellValue {
    const { row, col } = parseKey(key);
    return this.values.get(cellId(row, col)) ?? null;
  }

  static fromJSON(inputs: Record<string, string>): Sheet {
    const sheet = new Sheet();
    sheet.setMany(inputs);
    return sheet;
  }

  /** What was typed in each cell that isn't empty, by key ("B3"). */
  toJSON(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, entry] of this.entries) out[key] = entry.input;
    return out;
  }

  /** What was typed in the cell ("" when empty). */
  input(address: string): string {
    return this.entries.get(normalizeKey(address))?.input ?? '';
  }

  /** The cell's value (null when empty). */
  value(address: string): CellValue {
    return this.valueOf(normalizeKey(address));
  }

  /** The keys of the cells that aren't empty. */
  addresses(): string[] {
    return [...this.entries.keys()];
  }

  /**
   * Types `input` into a cell ("" empties it) and recalculates. Returns the
   * cells that were recalculated, in the order they were computed, so the
   * editor can redraw only those.
   */
  set(address: string, input: string): string[] {
    return this.setMany({ [address]: input });
  }

  /** Several cells at once (a paste), recalculated together. */
  setMany(inputs: Record<string, string>): string[] {
    const keys: string[] = [];
    for (const [address, input] of Object.entries(inputs)) {
      const key = normalizeKey(address);
      this.define(key, input);
      keys.push(key);
    }
    return this.recalculate(keys);
  }

  private define(key: string, input: string): void {
    const old = this.entries.get(key);
    if (old?.parsed.kind === 'formula') {
      for (const cell of referencesOf(old.parsed.ast).cells) {
        const set = this.readers.get(cell);
        set?.delete(key);
        if (set?.size === 0) this.readers.delete(cell);
      }
      this.unfileRanges(key);
    }

    if (input === '') {
      this.entries.delete(key);
      return;
    }
    const parsed = parseInput(input);
    this.entries.set(key, { input, parsed });
    if (parsed.kind === 'formula') {
      const { cells, areas } = referencesOf(parsed.ast);
      for (const cell of cells) {
        if (!this.readers.has(cell)) this.readers.set(cell, new Set());
        this.readers.get(cell)!.add(key);
      }
      if (areas.length) this.fileRanges(key, areas);
    }
  }

  private fileRanges(formula: string, areas: Area[]): void {
    this.rangesOf.set(formula, areas);
    for (const area of areas) {
      if (area.right - area.left >= WIDE_RANGE) {
        this.wideRanges.push({ formula, area });
        continue;
      }
      for (let col = area.left; col <= area.right; col++) {
        if (!this.rangesByColumn.has(col)) this.rangesByColumn.set(col, []);
        this.rangesByColumn.get(col)!.push({ formula, top: area.top, bottom: area.bottom });
      }
    }
  }

  private unfileRanges(formula: string): void {
    const areas = this.rangesOf.get(formula);
    if (!areas) return;
    this.rangesOf.delete(formula);
    for (const area of areas) {
      if (area.right - area.left >= WIDE_RANGE) {
        this.wideRanges = this.wideRanges.filter((w) => w.formula !== formula);
        continue;
      }
      for (let col = area.left; col <= area.right; col++) {
        const kept = this.rangesByColumn.get(col)?.filter((r) => r.formula !== formula) ?? [];
        if (kept.length) this.rangesByColumn.set(col, kept);
        else this.rangesByColumn.delete(col);
      }
    }
  }

  /** The formulas that read this cell, on its own or in a range. */
  private dependentsOf(key: string): string[] {
    const out = new Set(this.readers.get(key));
    const { row, col } = parseKey(key);
    for (const r of this.rangesByColumn.get(col) ?? []) {
      if (row >= r.top && row <= r.bottom) out.add(r.formula);
    }
    for (const w of this.wideRanges) {
      if (row >= w.area.top && row <= w.area.bottom && col >= w.area.left && col <= w.area.right) out.add(w.formula);
    }
    return [...out];
  }

  private recalculate(changed: string[]): string[] {
    // Everything downstream of the changed cells.
    const affected = new Set(changed);
    const queue = [...changed];
    const edges = new Map<string, string[]>();
    while (queue.length) {
      const key = queue.pop()!;
      const dependents = this.dependentsOf(key);
      edges.set(key, dependents);
      for (const d of dependents) {
        if (!affected.has(d)) {
          affected.add(d);
          queue.push(d);
        }
      }
    }

    const order: string[] = [];
    const groups = stronglyConnected(affected, (key) => edges.get(key) ?? []).reverse();
    for (const group of groups) {
      const circular = group.length > 1 || (edges.get(group[0]) ?? []).includes(group[0]);
      for (const key of group) {
        order.push(key);
        const { row, col } = parseKey(key);
        const id = cellId(row, col);
        const entry = this.entries.get(key);
        if (!entry) {
          this.values.delete(id);
        } else if (circular) {
          this.values.set(id, errorFor('#REF!', 'Circular reference'));
        } else {
          const { parsed } = entry;
          const value =
            parsed.kind === 'value' ? parsed.value : parsed.kind === 'invalid' ? parsed.error : evaluateFormula(parsed.ast, this.source);
          this.values.set(id, value);
        }
      }
    }
    return order;
  }
}
