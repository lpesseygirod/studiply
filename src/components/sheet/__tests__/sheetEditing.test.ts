import { formulaContext, Sheet } from '../../../lib/sheets';
import { acceptFunction, boxOfRef, fillTarget, fillWrites, pointedRef, splice, union } from '../sheetEditing';

const at = (a: string) => {
  const box = boxOfRef(a)!;
  return { row: box.top, col: box.left };
};

describe('pointing at cells while typing a formula', () => {
  it('writes a click as the cell and a drag as a range, top-left first', () => {
    expect(pointedRef(at('B2'), at('B2'))).toBe('B2');
    expect(pointedRef(at('A1'), at('A5'))).toBe('A1:A5');
    expect(pointedRef(at('C5'), at('A1'))).toBe('A1:C5');
  });

  it('puts the reference at the cursor, or in place of the one just before it', () => {
    // =A1+| then a click on B2.
    let draft = '=A1+';
    let ctx = formulaContext(draft, draft.length)!;
    expect(ctx.canInsertRef && ctx.ref === null).toBe(true);
    let next = splice(draft, draft.length, draft.length, 'B2');
    expect(next).toEqual({ draft: '=A1+B2', caret: 6 });
    // A second click (on C3) replaces B2.
    draft = next.draft;
    ctx = formulaContext(draft, next.caret)!;
    next = splice(draft, ctx.ref!.start, ctx.ref!.end, 'C3');
    expect(next).toEqual({ draft: '=A1+C3', caret: 6 });
    // In the middle of a formula, what follows the cursor stays.
    expect(splice('=SUM(, 2)', 5, 5, 'A1:A3')).toEqual({ draft: '=SUM(A1:A3, 2)', caret: 10 });
  });
});

describe('autocomplete', () => {
  it('replaces the letters typed with the function and opens its bracket', () => {
    expect(acceptFunction('=PM', 1, 3, 'PMT')).toEqual({ draft: '=PMT(', caret: 5 });
    expect(acceptFunction('=A1*np', 4, 6, 'NPV')).toEqual({ draft: '=A1*NPV(', caret: 8 });
    // The rest of a name after the cursor, and a bracket already there.
    expect(acceptFunction('=PM|T(B2)'.replace('|', ''), 1, 3, 'PMT')).toEqual({ draft: '=PMT(B2)', caret: 5 });
  });
});

describe('the fill handle', () => {
  const B2 = boxOfRef('B2')!;

  it('reaches in the direction the pointer went furthest, one direction at a time', () => {
    expect(fillTarget(B2, at('B6'))).toEqual(boxOfRef('B3:B6'));
    expect(fillTarget(B2, at('E3'))).toEqual(boxOfRef('C2:E2'));
    expect(fillTarget(B2, at('B1'))).toEqual(boxOfRef('B1'));
    expect(fillTarget(B2, at('A2'))).toEqual(boxOfRef('A2'));
    expect(fillTarget(B2, at('B2'))).toBeNull();
    expect(fillTarget(boxOfRef('A1:B2')!, at('C9'))).toEqual(boxOfRef('A3:B9'));
  });

  it('copies formulas with their references moved ($ fixed), and bold', () => {
    const sheet = Sheet.fromJSON({ A1: '10', A2: '20', A3: '30', B1: '=A1*$D$1', D1: '2' });
    const { inputs, bold } = fillWrites(boxOfRef('B1')!, boxOfRef('B2:B3')!, (a) => sheet.input(a), (a) => a === 'B1');
    expect(inputs).toEqual({ B2: '=A2*$D$1', B3: '=A3*$D$1' });
    expect(bold).toEqual({ B2: true, B3: true });
    sheet.setMany(inputs);
    expect([sheet.value('B2'), sheet.value('B3')]).toEqual([40, 60]);
  });

  it('repeats a block of several cells, also upwards, and empties where the source is empty', () => {
    const sheet = Sheet.fromJSON({ C5: '1', C6: '=C5+1' });
    const down = fillWrites(boxOfRef('C5:C7')!, boxOfRef('C8:C10')!, (a) => sheet.input(a), () => false).inputs;
    expect(down).toEqual({ C8: '1', C9: '=C8+1', C10: '' });
    const up = fillWrites(boxOfRef('C5:C6')!, boxOfRef('C3:C4')!, (a) => sheet.input(a), () => false).inputs;
    expect(up).toEqual({ C3: '1', C4: '=C3+1' });
  });

  it('turns a reference pushed off the grid into #REF!', () => {
    const { inputs } = fillWrites(boxOfRef('B2')!, boxOfRef('B1')!, () => '=A1', () => false);
    expect(inputs).toEqual({ B1: '=#REF!' });
  });

  it('selects the source and what was filled', () => {
    expect(union(boxOfRef('B1')!, boxOfRef('B2:B9')!)).toEqual(boxOfRef('B1:B9'));
  });
});
