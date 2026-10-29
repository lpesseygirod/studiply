/**
 * Studiply's spreadsheet formula engine.
 *
 * Plain TypeScript with no app imports, so the app (iPhone and web) and the
 * WebView editor can both use it. Start with Sheet:
 *
 *   const sheet = Sheet.fromJSON({ A1: '10000', A2: '=PMT(8%/12, 10, A1)' });
 *   sheet.value('A2');                 // -1037.03…
 *   sheet.set('A1', '20000');          // → ['A1', 'A2'], the cells to redraw
 *   copyCells(sheet, 'A2', 'B2:D2');   // fill right; references move
 *   sheet.toJSON();                    // what to save: the inputs only
 *
 * Formulas are written the English way (SUM, commas between arguments, a
 * point for decimals). Showing and typing them in another language's
 * style is left to the editor.
 */

export { cellKey, columnIndex, columnName, MAX_COLS, MAX_ROWS, parseArea, type Area } from './address';
export { copyCells, copyFormula, shiftFormula } from './copy';
export { FUNCTIONS } from './functions';
export { parseInput, Sheet, type ParsedInput } from './sheet';
export { formatNumber, isError, SheetError, type CellValue, type ErrorCode } from './values';
