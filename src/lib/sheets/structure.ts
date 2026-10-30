/**
 * structure.ts
 * What happens to a formula's references when rows or columns are inserted
 * or deleted (step 4.7e, checkpoint 2b), as Excel does it:
 *   - inserting `count` lines before line `at` moves every reference at or
 *     after it by `count`, `$` ones too (they name a cell, and the cell moved);
 *     a range's two ends move each on its own, so inserting inside a range
 *     widens it;
 *   - deleting lines `at … at + count − 1`: a reference to a deleted cell
 *     becomes #REF!; a range loses the deleted lines (A1:A10 without rows
 *     3–4 is A1:A8); a range entirely deleted becomes #REF!; references
 *     after the deleted lines move back.
 * Lines are 0-based (row 1 is 0, column A is 0). Everything else in the
 * formula stays exactly as typed. Values aren't formulas: they never change.
 */

import { formatCellRef, inGrid, parseCellRef, type CellRef } from './address';
import { FormulaSyntaxError, tokenize, type Token } from './parser';

export type Lines = 'rows' | 'cols';

const lineOf = (ref: CellRef, lines: Lines) => (lines === 'rows' ? ref.row : ref.col);
const withLine = (ref: CellRef, lines: Lines, line: number): CellRef => (lines === 'rows' ? { ...ref, row: line } : { ...ref, col: line });

/** Rewrites each reference and range in a formula; `move` returns the new text of one, or '#REF!'. */
function rewrite(input: string, move: (first: CellRef, last: CellRef | null) => string): string {
  if (!input.startsWith('=')) return input;
  const text = input.slice(1);
  let tokens: Token[];
  try {
    tokens = tokenize(text);
  } catch (e) {
    if (e instanceof FormulaSyntaxError) return input; // kept as typed; it shows #ERROR! wherever it is
    throw e;
  }
  let out = '';
  let last = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind !== 'ref') continue;
    const isRange = tokens[i + 1]?.kind === 'colon' && tokens[i + 2]?.kind === 'ref';
    const end = isRange ? tokens[i + 2] : t;
    out += text.slice(last, t.start) + move(parseCellRef(t.text)!, isRange ? parseCellRef(end.text)! : null);
    last = end.end;
    if (isRange) i += 2;
  }
  return `=${out}${text.slice(last)}`;
}

const written = (first: CellRef, last: CellRef | null) => (last ? `${formatCellRef(first)}:${formatCellRef(last)}` : formatCellRef(first));

/** A cell's input after inserting `count` rows (or columns) before line `at`. */
export function insertLinesInFormula(input: string, lines: Lines, at: number, count: number): string {
  if (count <= 0) return input;
  const shift = (ref: CellRef): CellRef | null => {
    const line = lineOf(ref, lines);
    const moved = withLine(ref, lines, line >= at ? line + count : line);
    return inGrid(moved.row, moved.col) ? moved : null;
  };
  return rewrite(input, (first, last) => {
    const a = shift(first);
    const b = last ? shift(last) : null;
    if (!a || (last && !b)) return '#REF!';
    return written(a, b);
  });
}

/** A cell's input after deleting `count` rows (or columns) from line `at`. */
export function deleteLinesInFormula(input: string, lines: Lines, at: number, count: number): string {
  if (count <= 0) return input;
  const endLine = at + count - 1;
  return rewrite(input, (first, last) => {
    if (!last) {
      const line = lineOf(first, lines);
      if (line >= at && line <= endLine) return '#REF!';
      return formatCellRef(line > endLine ? withLine(first, lines, line - count) : first);
    }
    // A range: its ends in order along these lines (B5:A1 counts as A1:B5).
    const swap = lineOf(first, lines) > lineOf(last, lines);
    const lo = swap ? last : first;
    const hi = swap ? first : last;
    const top = lineOf(lo, lines);
    const bottom = lineOf(hi, lines);
    if (top >= at && bottom <= endLine) return '#REF!';
    const newTop = top < at ? top : top <= endLine ? at : top - count;
    const newBottom = bottom < at ? bottom : bottom <= endLine ? at - 1 : bottom - count;
    const a = withLine(lo, lines, newTop);
    const b = withLine(hi, lines, newBottom);
    return swap ? written(b, a) : written(a, b);
  });
}
