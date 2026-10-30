import { deleteLinesInFormula, insertLinesInFormula, Sheet } from '..';

const ROW = (n: number) => n - 1; // row number → line
const COL = (letter: string) => letter.charCodeAt(0) - 65;

describe('inserting rows or columns', () => {
  it('moves references at or after the inserted lines, $ ones too', () => {
    expect(insertLinesInFormula('=A1+A3+$B$5+B$2', 'rows', ROW(3), 2)).toBe('=A1+A5+$B$7+B$2');
    expect(insertLinesInFormula('=A1+C1+$D$1', 'cols', COL('B'), 1)).toBe('=A1+D1+$E$1');
  });

  it('widens a range that the insert falls inside, moves one after it, leaves one before it', () => {
    expect(insertLinesInFormula('=SUM(A1:A5)', 'rows', ROW(3), 1)).toBe('=SUM(A1:A6)');
    expect(insertLinesInFormula('=SUM(A1:A5)', 'rows', ROW(1), 1)).toBe('=SUM(A2:A6)');
    expect(insertLinesInFormula('=SUM(A1:A5)', 'rows', ROW(6), 1)).toBe('=SUM(A1:A5)');
    expect(insertLinesInFormula('=SUM(A1:C1)', 'cols', COL('B'), 2)).toBe('=SUM(A1:E1)');
  });

  it('leaves values, text in quotes and function names alone', () => {
    expect(insertLinesInFormula('250', 'rows', 0, 3)).toBe('250');
    expect(insertLinesInFormula('=IF(A2>0, "A2", PMT(B2/12, B3, -B1))', 'rows', ROW(2), 1)).toBe('=IF(A3>0, "A2", PMT(B3/12, B4, -B1))');
    // A bracket left open still moves its references (the tokenizer reads it); text that can't be read is kept as typed.
    expect(insertLinesInFormula('=SUM(A1', 'rows', 0, 1)).toBe('=SUM(A2');
    expect(insertLinesInFormula('="A1', 'rows', 0, 1)).toBe('="A1');
  });
});

describe('deleting rows or columns', () => {
  it('turns a reference to a deleted cell into #REF!, and moves those after it back', () => {
    expect(deleteLinesInFormula('=A1+A3+A6', 'rows', ROW(3), 2)).toBe('=A1+#REF!+A4');
    expect(deleteLinesInFormula('=$B$1*C1', 'cols', COL('B'), 1)).toBe('=#REF!*B1');
  });

  it('shrinks a range that loses lines; a range wholly deleted is #REF!', () => {
    expect(deleteLinesInFormula('=SUM(A1:A10)', 'rows', ROW(3), 2)).toBe('=SUM(A1:A8)');
    expect(deleteLinesInFormula('=SUM(A3:A10)', 'rows', ROW(1), 4)).toBe('=SUM(A1:A6)');
    expect(deleteLinesInFormula('=SUM(A1:A4)', 'rows', ROW(3), 5)).toBe('=SUM(A1:A2)');
    expect(deleteLinesInFormula('=SUM(A3:A4)', 'rows', ROW(2), 4)).toBe('=SUM(#REF!)');
    expect(deleteLinesInFormula('=SUM($A$2:$C$2)', 'cols', COL('A'), 1)).toBe('=SUM($A$2:$B$2)');
  });

  it('keeps a formula calculating after the change (the loan table)', () => {
    // A loan table, then a row inserted above the payment and row 2 deleted again.
    const before = { B1: '200000', B2: '3.5%', B3: '360', B4: '=PMT(B2/12, B3, -B1)' };
    const inserted = Object.fromEntries(
      Object.entries(before).map(([a, v]) => {
        const row = Number(a.slice(1));
        return [`B${row >= 2 ? row + 1 : row}`, insertLinesInFormula(v, 'rows', ROW(2), 1)];
      }),
    );
    expect(inserted.B5).toBe('=PMT(B3/12, B4, -B1)');
    expect(Number(Sheet.fromJSON(inserted).value('B5')).toFixed(2)).toBe('898.09');
    expect(deleteLinesInFormula(inserted.B5, 'rows', ROW(3), 1)).toBe('=PMT(#REF!/12, B3, -B1)');
  });
});
