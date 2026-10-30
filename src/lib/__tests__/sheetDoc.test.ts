import { cellPosition, cellsOf, emptySheetDoc, inputsOf, SHEET_CELL, sheetDocOf, type SheetCells } from '../sheetDoc';
import type { DocJSON } from '../../editor/types';

const cells = (entries: [string, string, boolean?][]): SheetCells => new Map(entries.map(([a, input, bold]) => [a, { input, bold: !!bold }]));
const ids = (doc: DocJSON) => (doc.content ?? []).map((b) => b.attrs?.blockId);

describe('sheetDoc', () => {
  it('stores one block per cell, in row order, with input, bold, time and origin', () => {
    const doc = sheetDocOf(cells([['B2', '=A1*2', true], ['A1', '10'], ['C1', 'Total']]), emptySheetDoc(), 1000);
    expect(ids(doc)).toEqual(['A1', 'C1', 'B2']);
    expect(doc.content![2]).toEqual({ type: SHEET_CELL, attrs: { blockId: 'B2', input: '=A1*2', bold: true, editedAt: 1000, origin: 'student' } });
    expect(doc.content![0].attrs).not.toHaveProperty('bold');
  });

  it('reads back what it stores', () => {
    const before = cells([['A1', '10'], ['B2', '=A1*2', true], ['C3', '', true]]);
    expect(cellsOf(sheetDocOf(before, null, 1))).toEqual(before);
    expect(inputsOf(before)).toEqual({ A1: '10', B2: '=A1*2' });
  });

  it('keeps an unchanged cell’s block and time; dates a changed one now', () => {
    const first = sheetDocOf(cells([['A1', '10'], ['A2', '20']]), null, 1000);
    const second = sheetDocOf(cells([['A1', '10'], ['A2', '25']]), first, 5000);
    expect(second.content![0]).toBe(first.content![0]);
    expect(second.content![1].attrs?.editedAt).toBe(5000);
    // Bold alone is a change.
    const third = sheetDocOf(cells([['A1', '10', true], ['A2', '25']]), second, 6000);
    expect(third.content![0].attrs).toMatchObject({ bold: true, editedAt: 6000 });
  });

  it('never dates a change before the version it replaces (a slow clock)', () => {
    const first = sheetDocOf(cells([['A1', '10']]), null, 9000);
    expect(sheetDocOf(cells([['A1', '11']]), first, 100).content![0].attrs?.editedAt).toBe(9001);
  });

  it('leaves an emptied cell out', () => {
    const first = sheetDocOf(cells([['A1', '10'], ['A2', '20']]), null, 1);
    expect(ids(sheetDocOf(cells([['A2', '20']]), first, 2))).toEqual(['A2']);
  });

  it('ignores blocks that are not cells of the grid', () => {
    const doc: DocJSON = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { blockId: 'A1' } },
        { type: SHEET_CELL, attrs: { blockId: 'AA1', input: 'outside' } },
        { type: SHEET_CELL, attrs: { blockId: 'A1001', input: 'outside' } },
        { type: SHEET_CELL, attrs: { blockId: 'nonsense', input: 'x' } },
        { type: SHEET_CELL, attrs: { blockId: 'Z1000', input: 'last cell' } },
      ],
    };
    expect([...cellsOf(doc).keys()]).toEqual(['Z1000']);
  });

  it('knows the grid: A–Z and 1–1,000', () => {
    expect(cellPosition('A1')).toEqual({ row: 0, col: 0 });
    expect(cellPosition('Z1000')).toEqual({ row: 999, col: 25 });
    expect(cellPosition('AA1')).toBeNull();
    expect(cellPosition('A1:B2')).toBeNull();
  });
});
