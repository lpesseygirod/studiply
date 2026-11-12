/**
 * A sheet's cells merge between devices through the same rule as text
 * (editor/docBlocks.ts), one cell at a time.
 */
import { combineDocEdits, makeDocEdit, mergeDocEdit, stampBlocks } from '../../editor/docBlocks';
import { cellsOf, inputsOf, sheetDocOf, type SheetCells } from '../sheetDoc';
import { copyCells, Sheet } from '../sheets';
import type { DocJSON } from '../../editor/types';

const cells = (inputs: Record<string, string>, bold: string[] = []): SheetCells =>
  new Map([...Object.keys(inputs), ...bold.filter((a) => !(a in inputs))].map((a) => [a, { input: inputs[a] ?? '', bold: bold.includes(a) }]));

/** A device's edit from `base` to `inputs`, at time `now`. */
const edit = (id: string, base: DocJSON, inputs: Record<string, string>, now: number, bold: string[] = []) =>
  makeDocEdit({ id, device: id, base, next: sheetDocOf(cells(inputs, bold), base, now), now })!;

const inputs = (doc: DocJSON) => inputsOf(cellsOf(doc));

const server = sheetDocOf(cells({ A1: '200000', A2: '3.5%', A3: '360', A4: '=PMT(A2/12, A3, -A1)' }), null, 1000);

describe('a sheet edited on two devices', () => {
  it('keeps both changes when they are in different cells', () => {
    const laptop = mergeDocEdit(server, edit('laptop', server, { A1: '250000', A2: '3.5%', A3: '360', A4: '=PMT(A2/12, A3, -A1)' }, 2000));
    const iphone = mergeDocEdit(laptop.doc, edit('iphone', server, { A1: '200000', A2: '4%', A3: '360', A4: '=PMT(A2/12, A3, -A1)' }, 1500));
    expect(iphone.conflicts).toEqual([]);
    expect(inputs(iphone.doc)).toMatchObject({ A1: '250000', A2: '4%' });
    // Calculated on the device from the merged inputs.
    expect(Sheet.fromJSON(inputs(iphone.doc)).value('A4') as number).toBeCloseTo(1193.54, 2);
  });

  it('keeps the newer change of the same cell, and the other as a version', () => {
    const laptop = mergeDocEdit(server, edit('laptop', server, { ...inputs(server), A2: '5%' }, 3000));
    const iphone = mergeDocEdit(laptop.doc, edit('iphone', server, { ...inputs(server), A2: '4%' }, 2000));
    expect(inputs(iphone.doc).A2).toBe('5%');
    expect(iphone.conflicts).toEqual([{ blockId: 'A2', kept: 'other' }]);
    expect(inputsOf(cellsOf(iphone.versions[0].content)).A2).toBe('4%');
  });

  it('keeps an edit when the other device emptied the cell', () => {
    const { A3: _gone, ...emptied } = inputs(server);
    const laptop = mergeDocEdit(server, edit('laptop', server, emptied, 2000));
    expect(inputs(laptop.doc).A3).toBeUndefined();
    const iphone = mergeDocEdit(laptop.doc, edit('iphone', server, { ...inputs(server), A3: '240' }, 1500));
    expect(inputs(iphone.doc).A3).toBe('240');
  });

  it('keeps the newer of two cells typed into the same empty cell offline', () => {
    const laptop = mergeDocEdit(server, edit('laptop', server, { ...inputs(server), B1: 'Laptop' }, 2000));
    const iphone = mergeDocEdit(laptop.doc, edit('iphone', server, { ...inputs(server), B1: 'iPhone' }, 3000));
    expect(inputs(iphone.doc).B1).toBe('iPhone');
    expect(iphone.versions.map((v) => v.side)).toEqual(['other']);
  });

  it('merges a fill of many cells with one cell changed on the other device', () => {
    const sheet = Sheet.fromJSON({ ...inputs(server), B1: '1', C1: '=B1*2' });
    copyCells(sheet, 'C1', 'C2:C20');
    const filled = mergeDocEdit(server, edit('laptop', server, sheet.toJSON(), 2000));
    const iphone = mergeDocEdit(filled.doc, edit('iphone', server, { ...inputs(server), A3: '240' }, 2500));
    expect(iphone.conflicts).toEqual([]);
    expect(inputs(iphone.doc)).toMatchObject({ A3: '240', C20: '=B20*2' });
  });

  it('carries bold as part of the cell', () => {
    const laptop = mergeDocEdit(server, edit('laptop', server, inputs(server), 2000, ['A4']));
    expect(cellsOf(laptop.doc).get('A4')).toEqual({ input: '=PMT(A2/12, A3, -A1)', bold: true });
    const iphone = mergeDocEdit(laptop.doc, edit('iphone', server, { ...inputs(server), A1: '1' }, 2500));
    expect(cellsOf(iphone.doc).get('A4')?.bold).toBe(true);
  });

  it('combines two offline edits into one before sending', () => {
    const first = edit('iphone', server, { ...inputs(server), A1: '1' }, 2000);
    const afterFirst = sheetDocOf(cells({ ...inputs(server), A1: '1' }), server, 2000);
    const second = makeDocEdit({ id: 'iphone-2', device: 'iphone', base: afterFirst, next: sheetDocOf(cells({ ...inputs(server), A1: '1', B5: 'x' }), afterFirst, 2500), now: 2500 })!;
    const both = combineDocEdits(first, second);
    expect(inputs(mergeDocEdit(server, both).doc)).toMatchObject({ A1: '1', B5: 'x' });
  });

  it('lets a restored version win over what was written before it', () => {
    const later = mergeDocEdit(server, edit('laptop', server, { ...inputs(server), A1: '999' }, 5000)).doc;
    const restored = stampBlocks(server, 6000);
    const restore = makeDocEdit({ id: 'restore', device: 'laptop', base: later, next: restored, now: 6000, restamp: true })!;
    expect(inputs(mergeDocEdit(later, restore).doc).A1).toBe('200000');
  });
});
