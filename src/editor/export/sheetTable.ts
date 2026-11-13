import { cellKey, Sheet } from '../../lib/sheets';
import { cellPosition, cellsOf, inputsOf } from '../../lib/sheetDoc';
import { displayOf, fitsChars } from '../../components/sheet/sheetDisplay';
import type { DocJSON } from '../types';

/** What an empty sheet tab prints. */
export const EMPTY_SHEET_TEXT = 'This sheet is empty.';

/**
 * A spreadsheet tab in the PDF export: a table of its
 * values as the grid shows them (numbers rounded to the cell as Excel's
 * General, on the right; TRUE / FALSE and errors centred; bold kept), over
 * the area that has something in it (A1 to the last row and column used).
 * No column letters or row numbers, as Excel prints by default.
 */
export function sheetTableDoc(content: DocJSON | null | undefined): DocJSON {
  const cells = cellsOf(content);
  let rows = 0;
  let cols = 0;
  for (const address of cells.keys()) {
    const p = cellPosition(address);
    if (!p) continue;
    rows = Math.max(rows, p.row + 1);
    cols = Math.max(cols, p.col + 1);
  }
  if (!rows || !cols) return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: EMPTY_SHEET_TEXT }] }] };
  const sheet = Sheet.fromJSON(inputsOf(cells));
  const fits = fitsChars();
  const tableRows = Array.from({ length: rows }, (_, row) => ({
    type: 'tableRow',
    content: Array.from({ length: cols }, (_, col) => {
      const address = cellKey(row, col);
      const shown = displayOf(sheet.value(address), fits);
      const bold = cells.get(address)?.bold === true;
      const text = shown.text ? [{ type: 'text', text: shown.text, ...(bold ? { marks: [{ type: 'bold' }] } : {}) }] : undefined;
      return {
        type: 'tableCell',
        attrs: { colspan: 1, rowspan: 1 },
        content: [{ type: 'paragraph', attrs: { textAlign: shown.align === 'left' ? null : shown.align }, ...(text ? { content: text } : {}) }],
      };
    }),
  }));
  return { type: 'doc', content: [{ type: 'table', content: tableRows }] } as DocJSON;
}
