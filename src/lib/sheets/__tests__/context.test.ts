import { formulaContext } from '..';

/** The context with the cursor where "|" is. */
const at = (typed: string) => formulaContext(typed.replace('|', ''), typed.indexOf('|'));

describe('formulaContext', () => {
  it('is null for a value, or with the cursor before the "="', () => {
    expect(at('12|')).toBeNull();
    expect(at('|=A1')).toBeNull();
  });

  it('finds the function and argument the cursor is in', () => {
    expect(at('=PMT(|')).toMatchObject({ fn: 'PMT', arg: 0 });
    expect(at('=pmt(B1/12, |')).toMatchObject({ fn: 'PMT', arg: 1 });
    expect(at('=PMT(B1/12, B2, |-B3)')).toMatchObject({ fn: 'PMT', arg: 2 });
    expect(at('=PMT(B1/12, B2, -B3)|')).toMatchObject({ fn: null });
  });

  it('takes the innermost function, and skips plain brackets', () => {
    expect(at('=IF(SUM(A1:A3, |')).toMatchObject({ fn: 'SUM', arg: 1 });
    expect(at('=IF(SUM(A1:A3) > 5, |')).toMatchObject({ fn: 'IF', arg: 1 });
    expect(at('=ROUND((A1 + |')).toMatchObject({ fn: 'ROUND', arg: 0 });
  });

  it('does not count commas inside quotes, and knows when the cursor is in them', () => {
    expect(at('=IF(A1 = "a, b", |')).toMatchObject({ fn: 'IF', arg: 1, inString: false });
    expect(at('=IF(A1 = "a, |')).toMatchObject({ fn: 'IF', arg: 0, inString: true, canInsertRef: false, partial: null });
    expect(at('=IF(A1 = "say ""hi"", |')).toMatchObject({ inString: true });
  });

  it('gives the letters being typed for autocomplete, where they start', () => {
    expect(at('=PM|')).toMatchObject({ partial: { text: 'PM', start: 1 } });
    expect(at('=A1*np|')).toMatchObject({ partial: { text: 'np', start: 4 } });
    expect(at('=SUM(A1, ro|')).toMatchObject({ fn: 'SUM', arg: 1, partial: { text: 'ro', start: 9 } });
    expect(at('=PM |')).toMatchObject({ partial: null });
    expect(at('=12|')).toMatchObject({ partial: null });
    expect(at('="ab|')).toMatchObject({ partial: null });
  });

  it('says where a clicked reference can go', () => {
    expect(at('=|')).toMatchObject({ canInsertRef: true, ref: null });
    expect(at('=A1+|')).toMatchObject({ canInsertRef: true });
    expect(at('=SUM(|')).toMatchObject({ canInsertRef: true });
    expect(at('=SUM(A1, |')).toMatchObject({ canInsertRef: true });
    expect(at('=A1:|')).toMatchObject({ canInsertRef: true });
    expect(at('=12|')).toMatchObject({ canInsertRef: false });
    expect(at('=SUM(A1)|')).toMatchObject({ canInsertRef: false });
    expect(at('=50%|')).toMatchObject({ canInsertRef: false });
  });

  it('gives the reference or range just before the cursor, which a new click replaces', () => {
    expect(at('=A1+B2|')).toMatchObject({ canInsertRef: true, ref: { start: 4, end: 6 } });
    expect(at('=SUM($A$1:B9|')).toMatchObject({ ref: { start: 5, end: 12 } });
    expect(at('=A1+B2 |')).toMatchObject({ ref: null, canInsertRef: false });
  });

  it('reads a formula it cannot tokenize without throwing', () => {
    expect(at('=A1 {|')).toEqual({ fn: null, arg: 0, inString: false, partial: null, canInsertRef: false, ref: null });
  });
});
