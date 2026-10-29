import { parseInput, Sheet } from '../sheet';
import { isError, type CellValue } from '../values';

/** A value, with errors as their code. */
const show = (v: CellValue) => (isError(v) ? v.code : v);

describe('parseInput', () => {
  it.each<[string, CellValue]>([
    ['12', 12],
    [' -1.5e3 ', -1500],
    ['50%', 0.5],
    ['TRUE', true],
    ['false', false],
    ["'123", '123'],
    ["'=A1", '=A1'],
    ['hello', 'hello'],
    ['  spaced  ', '  spaced  '],
    ['=', '='],
    ['1,5', '1,5'],
  ])('"%s" is %p', (input, value) => expect(parseInput(input)).toEqual({ kind: 'value', value }));

  it('reads error codes', () => {
    const parsed = parseInput('#N/A');
    expect(parsed.kind === 'value' && isError(parsed.value) && parsed.value.code).toBe('#N/A');
  });

  it('reads formulas', () => expect(parseInput('=1+2').kind).toBe('formula'));

  it('keeps a reason for a formula it cannot read', () => {
    expect(parseInput('=SUM(1,')).toMatchObject({ kind: 'invalid', error: { code: '#ERROR!', message: 'The formula ends too early' } });
  });
});

describe('Sheet', () => {
  it('computes formulas from other cells', () => {
    const sheet = Sheet.fromJSON({ A1: '10', A2: '20', A3: '=SUM(A1:A2)', B1: '=A3*2' });
    expect(sheet.value('A3')).toBe(30);
    expect(sheet.value('B1')).toBe(60);
  });

  it('accepts addresses in any form', () => {
    const sheet = new Sheet();
    sheet.set('b2', '5');
    expect(sheet.value('$B$2')).toBe(5);
    expect(sheet.input('B2')).toBe('5');
  });

  it('refuses what is not an address', () => expect(() => new Sheet().set('hello', '1')).toThrow('Not a cell address'));

  it('shows empty cells as null, and empty references as 0', () => {
    const sheet = Sheet.fromJSON({ A1: '=Z9' });
    expect(sheet.value('Z9')).toBeNull();
    expect(sheet.input('Z9')).toBe('');
    expect(sheet.value('A1')).toBe(0);
  });

  it('recalculates what depends on a change, in order', () => {
    const sheet = Sheet.fromJSON({ A1: '1', B1: '=A1+1', C1: '=B1*10', D1: '=SUM(A1:C1)' });
    expect(sheet.value('D1')).toBe(1 + 2 + 20);
    const order = sheet.set('A1', '5');
    expect(sheet.value('D1')).toBe(5 + 6 + 60);
    expect(order[0]).toBe('A1');
    expect(order.indexOf('B1')).toBeLessThan(order.indexOf('C1'));
    expect(order.indexOf('C1')).toBeLessThan(order.indexOf('D1'));
  });

  it('recalculates only what depends on the change', () => {
    const sheet = Sheet.fromJSON({ A1: '1', A2: '2', B1: '=A1*2', B2: '=A2*2', C1: '=SUM(B1:B1)' });
    expect(sheet.set('A1', '3').sort()).toEqual(['A1', 'B1', 'C1']);
    expect(sheet.set('A2', '3').sort()).toEqual(['A2', 'B2']);
  });

  it('finds formulas that read a cell through a range', () => {
    const sheet = Sheet.fromJSON({ A1: '1', B1: '=SUM(A1:A100)' });
    sheet.set('A50', '9');
    expect(sheet.value('B1')).toBe(10);
  });

  it('finds formulas that read a cell through a wide range', () => {
    const sheet = Sheet.fromJSON({ A1: '=SUM(B2:BZ3)' });
    sheet.set('AZ3', '4');
    expect(sheet.value('A1')).toBe(4);
    expect(sheet.set('AZ4', '1')).toEqual(['AZ4']);
    sheet.set('A1', '=1');
    expect(sheet.set('AZ3', '5')).toEqual(['AZ3']);
  });

  it('computes a diamond once its two sides are done', () => {
    const sheet = Sheet.fromJSON({ A1: '1', B1: '=A1+1', C1: '=A1*3', D1: '=B1+C1' });
    const order = sheet.set('A1', '2');
    expect(sheet.value('D1')).toBe(3 + 6);
    expect(order.indexOf('D1')).toBe(3);
  });

  it('updates the cells that read a cell that was emptied', () => {
    const sheet = Sheet.fromJSON({ A1: '4', B1: '=A1+1' });
    expect(sheet.set('A1', '')).toEqual(['A1', 'B1']);
    expect(sheet.value('B1')).toBe(1);
    expect(sheet.toJSON()).toEqual({ B1: '=A1+1' });
  });

  it('stops reading cells a formula no longer names', () => {
    const sheet = Sheet.fromJSON({ A1: '1', A2: '2', B1: '=A1' });
    sheet.set('B1', '=A2');
    expect(sheet.set('A1', '100')).toEqual(['A1']);
    expect(sheet.value('B1')).toBe(2);
  });

  it('stops reading ranges a formula no longer names', () => {
    const sheet = Sheet.fromJSON({ A1: '1', B1: '=SUM(A1:A3)' });
    sheet.set('B1', 'text');
    expect(sheet.set('A2', '5')).toEqual(['A2']);
  });

  it('shows a formula it cannot read as #ERROR!', () => {
    const sheet = Sheet.fromJSON({ A1: '=1+', B1: '=A1' });
    expect(sheet.value('A1')).toMatchObject({ code: '#ERROR!' });
    expect(show(sheet.value('B1'))).toBe('#ERROR!');
  });

  it('keeps the input exactly as typed', () => {
    const inputs = { A1: '=sum( b1:b2 )', B1: "'007", B2: '  3 ' };
    const sheet = Sheet.fromJSON(inputs);
    expect(sheet.toJSON()).toEqual(inputs);
    expect(sheet.value('A1')).toBe(3);
    expect(sheet.addresses().sort()).toEqual(['A1', 'B1', 'B2']);
  });

  it('round-trips through JSON', () => {
    const sheet = Sheet.fromJSON({ A1: '100', A2: '=PMT(5%/12, 12, A1)' });
    const copy = Sheet.fromJSON(JSON.parse(JSON.stringify(sheet)));
    expect(copy.value('A2')).toBe(sheet.value('A2'));
  });

  it('computes cells pasted together in the right order', () => {
    const sheet = new Sheet();
    sheet.setMany({ C1: '=B1*2', B1: '=A1+1', A1: '1' });
    expect(sheet.value('C1')).toBe(4);
  });

  it('handles a chain of 10,000 cells', () => {
    const inputs: Record<string, string> = { A1: '1' };
    for (let i = 2; i <= 10_000; i++) inputs[`A${i}`] = `=A${i - 1}+1`;
    const sheet = Sheet.fromJSON(inputs);
    expect(sheet.value('A10000')).toBe(10_000);
    sheet.set('A1', '0');
    expect(sheet.value('A10000')).toBe(9_999);
  });

  it('handles a running total down 2,000 rows', () => {
    const inputs: Record<string, string> = {};
    for (let i = 1; i <= 2_000; i++) {
      inputs[`A${i}`] = '1';
      inputs[`B${i}`] = `=SUM($A$1:A${i})`;
    }
    const sheet = Sheet.fromJSON(inputs);
    expect(sheet.value('B2000')).toBe(2_000);
    sheet.set('A1', '2');
    expect(sheet.value('B2000')).toBe(2_001);
  });
});

describe('circular references', () => {
  it('catches a cell that reads itself', () => {
    const sheet = Sheet.fromJSON({ A1: '=A1+1' });
    expect(sheet.value('A1')).toMatchObject({ code: '#REF!', message: 'Circular reference' });
  });

  it('catches a cell inside its own range', () => {
    const sheet = Sheet.fromJSON({ A1: '1', A3: '=SUM(A1:A5)' });
    expect(show(sheet.value('A3'))).toBe('#REF!');
  });

  it('catches a circle through several cells, and what reads it', () => {
    const sheet = Sheet.fromJSON({ A1: '=C1', B1: '=A1', C1: '=B1+1', D1: '=C1*2', E1: '=COUNT(C1)', F1: '7' });
    for (const key of ['A1', 'B1', 'C1', 'D1']) expect(show(sheet.value(key))).toBe('#REF!');
    expect(sheet.value('E1')).toBe(0);
    expect(sheet.value('F1')).toBe(7);
  });

  it('brings the values back when the circle is broken', () => {
    const sheet = Sheet.fromJSON({ A1: '=C1', B1: '=A1', C1: '=B1+1', D1: '=C1*2' });
    sheet.set('A1', '5');
    expect(sheet.value('B1')).toBe(5);
    expect(sheet.value('C1')).toBe(6);
    expect(sheet.value('D1')).toBe(12);
  });

  it('only marks cells in the circle, not what is just upstream', () => {
    const sheet = Sheet.fromJSON({ A1: '3', B1: '=A1+C1', C1: '=B1' });
    expect(sheet.value('A1')).toBe(3);
    expect(show(sheet.value('B1'))).toBe('#REF!');
    expect(show(sheet.value('C1'))).toBe('#REF!');
  });
});
