// Step 5.5: a lecture's marks follow its My notes after each save (Lea's
// advisor, decision A): every linked mark chip is its `marks` row; a chip
// deleted by typing deletes the row; brought back, the row is back; a level
// or note changed on the chip changes the row. Chips put in by hand (4.6,
// no markId), plain documents, other tabs and another lecture's marks are
// left alone; nothing is written twice.
import { resetTables, rowsOf, serverWrite } from '../../test-utils/fakeTables';
import { marksOf, syncMarks } from '../marks.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/fakeTables').module);

const mark = (markId: string | null, kind: string, level: number, ms: number | null, note: string | null = null) => ({
  type: 'markChip',
  attrs: { markId, kind, level, ms, note },
});
const line = (...inline: unknown[]) => ({ type: 'paragraph', content: [{ type: 'text', text: 'Línea ' }, ...inline] });
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const notes = (lecture: string, ...content: unknown[]) => ({ file_id: lecture, tab: 'notes', content: doc(...content) });

const rows = () =>
  rowsOf('marks')
    .map((r) => [r.id, r.lecture_id, r.type, r.level, r.t_ms, r.note])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

beforeEach(() => {
  resetTables();
  serverWrite('files', { id: 'lec', kind: 'lecture' });
  serverWrite('files', { id: 'lec2', kind: 'lecture' });
  serverWrite('files', { id: 'plain', kind: 'document' });
});

describe('marks', () => {
  it('the linked chips of a document, in order: hand-made chips, broken ones and copies left out', () => {
    const d = doc(
      line(mark('m1', 'important', 8, 12_000, '  Definición clave  ')),
      line(mark(null, 'exam', 9, null)),
      line(mark('m2', 'confused', 3, 61_500.4), mark('m1', 'important', 8, 12_000)),
      line(mark('m3', 'nonsense', 5, 1000), mark('m4', 'exam', 7, -5)),
    );
    expect(marksOf(d as never)).toEqual([
      { id: 'm1', type: 'important', level: 8, t_ms: 12_000, note: 'Definición clave' },
      { id: 'm2', type: 'confused', level: 3, t_ms: 61_500, note: null },
    ]);
  });

  it('each chip is a row; a changed level or note changes it; a chip deleted by typing deletes it; brought back, it is back', async () => {
    await syncMarks(notes('lec', line(mark('m1', 'important', 8, 12_000, 'Clave')), line(mark('m2', 'confused', 3, 40_000))));
    expect(rows()).toEqual([
      ['m1', 'lec', 'important', 8, 12_000, 'Clave'],
      ['m2', 'lec', 'confused', 3, 40_000, null],
    ]);
    await syncMarks(notes('lec', line(mark('m1', 'important', 8, 12_000, 'Clave')), line(mark('m2', 'confused', 7, 40_000, 'Paso 2'))));
    expect(rows()[1]).toEqual(['m2', 'lec', 'confused', 7, 40_000, 'Paso 2']);
    // Backspace over the Important chip: its mark goes.
    await syncMarks(notes('lec', line(), line(mark('m2', 'confused', 7, 40_000, 'Paso 2'))));
    expect(rows().map((r) => r[0])).toEqual(['m2']);
    // Undo: the chip is back, and so is the mark.
    await syncMarks(notes('lec', line(mark('m1', 'important', 8, 12_000, 'Clave')), line(mark('m2', 'confused', 7, 40_000, 'Paso 2'))));
    expect(rows().map((r) => r[0])).toEqual(['m1', 'm2']);
  });

  it('the same marks are not written again', async () => {
    await syncMarks(notes('lec', line(mark('m1', 'exam', 9, 5000))));
    const before = JSON.stringify(rowsOf('marks'));
    await syncMarks(notes('lec', line(mark('m1', 'exam', 9, 5000))));
    expect(JSON.stringify(rowsOf('marks'))).toBe(before);
  });

  it('nothing for a plain document or another tab; a chip copied from another lecture stays that lecture’s', async () => {
    await syncMarks(notes('plain', line(mark('p1', 'exam', 9, 5000))));
    await syncMarks({ file_id: 'lec', tab: 'summary', content: doc(line(mark('s1', 'exam', 9, 5000))) });
    expect(rowsOf('marks')).toEqual([]);

    await syncMarks(notes('lec', line(mark('m1', 'important', 6, 1000))));
    await syncMarks(notes('lec2', line(mark('m1', 'important', 2, 1000)), line(mark('n1', 'exam', 4, 2000))));
    expect(rows()).toEqual([
      ['m1', 'lec', 'important', 6, 1000, null],
      ['n1', 'lec2', 'exam', 4, 2000, null],
    ]);
  });
});
