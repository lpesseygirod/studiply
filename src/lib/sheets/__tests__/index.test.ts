import { copyCells, Sheet } from '..';

it('works as the example at the top of index.ts says', () => {
  const sheet = Sheet.fromJSON({ A1: '10000', A2: '=PMT(8%/12, 10, A1)' });
  expect(sheet.value('A2') as number).toBeCloseTo(-1037.03, 2);
  expect(sheet.set('A1', '20000')).toEqual(['A1', 'A2']);
  copyCells(sheet, 'A2', 'B2:D2');
  expect(sheet.input('B2')).toBe('=PMT(8%/12, 10, B1)');
  expect(sheet.toJSON()).toEqual({
    A1: '20000',
    A2: '=PMT(8%/12, 10, A1)',
    B2: '=PMT(8%/12, 10, B1)',
    C2: '=PMT(8%/12, 10, C1)',
    D2: '=PMT(8%/12, 10, D1)',
  });
});
