import { Sheet } from '../../../lib/sheets';
import { inputsOf, type SheetCells } from '../../../lib/sheetDoc';
import { makeClip, parseTSV, pasteClip, pasteText, toTSV, valueText } from '../sheetClipboard';
import { SheetHistory, writesOf } from '../sheetHistory';
import { cellChanges, changeLines, linesLabel } from '../sheetStructure';
import { boxOfRef } from '../sheetEditing';

const cells = (inputs: Record<string, string>, bold: string[] = []): SheetCells =>
  new Map(Object.entries(inputs).map(([a, input]) => [a, { input, bold: bold.includes(a) }]));

const loan = cells({ A1: 'Amount', B1: '200000', B2: '3.5%', B3: '360', B4: '=PMT(B2/12, B3, -B1)', C4: '=SUM(B1:B3)' }, ['A1']);

describe('undo and redo', () => {
  it('undoes and redoes one step at a time; a new step clears Redo', () => {
    const h = new SheetHistory();
    expect(h.canUndo).toBe(false);
    h.record({ before: { A1: { input: '', bold: false } }, after: { A1: { input: '1', bold: false } } });
    h.record({ before: { A1: { input: '1', bold: false } }, after: { A1: { input: '1', bold: true } } });
    expect(h.undo()?.before.A1).toEqual({ input: '1', bold: false });
    expect(h.canRedo).toBe(true);
    expect(h.redo()?.after.A1).toEqual({ input: '1', bold: true });
    h.undo();
    h.record({ before: { B1: { input: '', bold: false } }, after: { B1: { input: 'x', bold: false } } });
    expect(h.canRedo).toBe(false);
  });

  it('keeps no empty step, and at most 100', () => {
    const h = new SheetHistory(3);
    h.record({ before: {}, after: {} });
    expect(h.canUndo).toBe(false);
    for (let i = 0; i < 5; i++) h.record({ before: { A1: { input: String(i), bold: false } }, after: { A1: { input: String(i + 1), bold: false } } });
    let undone = 0;
    while (h.undo()) undone++;
    expect(undone).toBe(3);
  });

  it('a step side becomes inputs and bold to write back', () => {
    expect(writesOf({ A1: { input: '', bold: false }, B2: { input: '=A1', bold: true } })).toEqual({
      inputs: { A1: '', B2: '=A1' },
      bold: { A1: false, B2: true },
    });
  });
});

describe('inserting and deleting rows and columns', () => {
  it('a row inserted above the payment moves the cells below and their references', () => {
    const after = changeLines(loan, { kind: 'insert', lines: 'rows', at: 1, count: 1 })!;
    expect(inputsOf(after)).toEqual({ A1: 'Amount', B1: '200000', B3: '3.5%', B4: '360', B5: '=PMT(B3/12, B4, -B1)', C5: '=SUM(B1:B4)' });
    expect(after.get('A1')?.bold).toBe(true);
    expect(Number(Sheet.fromJSON(inputsOf(after)).value('B5')).toFixed(2)).toBe('898.09');
  });

  it('a deleted row takes its cells; references to them become #REF!, ranges shrink', () => {
    const after = changeLines(loan, { kind: 'delete', lines: 'rows', at: 1, count: 1 })!;
    expect(inputsOf(after)).toEqual({ A1: 'Amount', B1: '200000', B2: '360', B3: '=PMT(#REF!/12, B2, -B1)', C3: '=SUM(B1:B2)' });
    expect(String(Sheet.fromJSON(inputsOf(after)).value('B3'))).toBe('#REF!');
  });

  it('columns too', () => {
    const after = changeLines(loan, { kind: 'insert', lines: 'cols', at: 1, count: 2 })!;
    expect(inputsOf(after).D4).toBe('=PMT(D2/12, D3, -D1)');
    expect(inputsOf(after).E4).toBe('=SUM(D1:D3)');
    const back = changeLines(after, { kind: 'delete', lines: 'cols', at: 1, count: 2 })!;
    expect(inputsOf(back)).toEqual(inputsOf(loan));
  });

  it('refuses an insert that would push a cell past row 1,000 or column Z', () => {
    expect(changeLines(cells({ A1000: 'last' }), { kind: 'insert', lines: 'rows', at: 0, count: 1 })).toBeNull();
    expect(changeLines(cells({ Z1: 'last' }), { kind: 'insert', lines: 'cols', at: 25, count: 1 })).toBeNull();
    expect(changeLines(cells({ A999: 'fits' }), { kind: 'insert', lines: 'rows', at: 0, count: 1 })?.get('A1000')?.input).toBe('fits');
  });

  it('writes only what differs: moved cells as new ones, their old places emptied', () => {
    const after = changeLines(cells({ A1: '1', A2: '2' }), { kind: 'insert', lines: 'rows', at: 0, count: 1 })!;
    expect(cellChanges(cells({ A1: '1', A2: '2' }), after)).toEqual({ inputs: { A1: '', A2: '1', A3: '2' }, bold: {} });
  });

  it('names the menu items', () => {
    expect(linesLabel('above', 'rows', 1)).toBe('Insert row above');
    expect(linesLabel('right', 'cols', 3)).toBe('Insert 3 columns right');
    expect(linesLabel('delete', 'rows', 2)).toBe('Delete 2 rows');
  });
});

describe('copy, cut and paste', () => {
  const sheet = Sheet.fromJSON(inputsOf(loan));
  const clipOf = (range: string, cut = false) => makeClip(boxOfRef(range)!, (a) => loan.get(a), (a) => sheet.value(a), cut);

  it('copies the values as tab-separated text, numbers in full', () => {
    expect(clipOf('A1:B2').text).toBe('Amount\t200000\n\t0.035');
    expect(clipOf('B4').text).toBe(valueText(sheet.value('B4')));
    expect(clipOf('B4').text.startsWith('898.08937')).toBe(true);
  });

  it('shrinks a whole column copied to the part with cells', () => {
    expect(clipOf('B1:B1000').source).toEqual(boxOfRef('B1:B4'));
  });

  it('a paste moves formulas like a fill ($ fixed), with bold', () => {
    const { inputs, bold, box } = pasteClip(clipOf('A4:C4'), { row: 9, col: 0 });
    expect(inputs).toEqual({ A10: '', B10: '=PMT(B8/12, B9, -B7)', C10: '=SUM(B7:B9)' });
    expect(bold.B10).toBe(false);
    expect(box).toEqual(boxOfRef('A10:C10'));
    expect(pasteClip(clipOf('A1'), { row: 5, col: 5 }).bold).toEqual({ F6: true });
  });

  it('a cut pastes the formulas as they are and empties the cut cells the paste doesn’t cover', () => {
    const { inputs } = pasteClip(clipOf('B3:B4', true), { row: 3, col: 1 });
    expect(inputs).toEqual({ B3: '', B4: '360', B5: '=PMT(B2/12, B3, -B1)' });
  });

  it('pastes other apps’ tab-separated text into the cells from the selected one', () => {
    expect(parseTSV('Mes\tPago\r\n1\t898,09\r\n')).toEqual([
      ['Mes', 'Pago'],
      ['1', '898,09'],
    ]);
    const { inputs, box } = pasteText('Mes\tPago\n1\t=B4*2', { row: 9, col: 3 });
    expect(inputs).toEqual({ D10: 'Mes', E10: 'Pago', D11: '1', E11: '=B4*2' });
    expect(box).toEqual(boxOfRef('D10:E11'));
    expect(toTSV([['a', 'b'], ['c', '']])).toBe('a\tb\nc\t');
  });

  it('leaves out what would land past the grid', () => {
    expect(Object.keys(pasteText('1\t2\t3', { row: 0, col: 24 }).inputs)).toEqual(['Y1', 'Z1']);
  });
});
