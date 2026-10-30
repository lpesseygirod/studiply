// Step 5.4: a lecture's note_lines follow its My notes after each save:
// written by document and block, the lines that are gone removed, nothing
// for a plain document or another tab, nothing written twice.
import { resetTables, rowsOf, serverWrite } from '../../test-utils/fakeTables';
import { syncNoteLines } from '../note-lines.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/fakeTables').module);

const chip = (ms: number) => ({ type: 'timestampChip', attrs: { ms } });
const line = (blockId: string, ms: number | null, t: string) => ({
  type: 'paragraph',
  attrs: { blockId },
  content: [...(ms === null ? [] : [chip(ms), { type: 'text', text: ' ' }]), { type: 'text', text: t }],
});
const doc = (...content: unknown[]) => ({ type: 'doc', content });

beforeEach(() => {
  resetTables();
  serverWrite('files', { id: 'lec', kind: 'lecture' });
  serverWrite('files', { id: 'plain', kind: 'document' });
});

const rows = () =>
  rowsOf('note_lines')
    .map((r) => [r.block_id, r.t_ms, r.text, r.position, r.lecture_id, r.document_id])
    .sort((a, b) => Number(a[3]) - Number(b[3]));

describe('note_lines', () => {
  it('writes each line of a lecture’s My notes with its time, text and place', async () => {
    await syncNoteLines({ id: 'doc-1', file_id: 'lec', tab: 'notes', content: doc(line('a', 4000, 'Def'), line('b', null, 'Earlier')) });
    expect(rows()).toEqual([
      ['a', 4000, 'Def', 0, 'lec', 'doc-1'],
      ['b', null, 'Earlier', 1, 'lec', 'doc-1'],
    ]);
  });

  it('follows the notes: changed lines updated, removed ones deleted, the same notes not written again', async () => {
    await syncNoteLines({ id: 'doc-2', file_id: 'lec', tab: 'notes', content: doc(line('a', 4000, 'Def'), line('b', 6000, 'Two')) });
    await syncNoteLines({ id: 'doc-2', file_id: 'lec', tab: 'notes', content: doc(line('a', 4000, 'Def, corrected')) });
    expect(rows()).toEqual([['a', 4000, 'Def, corrected', 0, 'lec', 'doc-2']]);
    const before = JSON.stringify(rowsOf('note_lines'));
    await syncNoteLines({ id: 'doc-2', file_id: 'lec', tab: 'notes', content: doc(line('a', 4000, 'Def, corrected')) });
    expect(JSON.stringify(rowsOf('note_lines'))).toBe(before);
  });

  it('nothing for a plain document, or for a lecture’s other tabs', async () => {
    await syncNoteLines({ id: 'doc-3', file_id: 'plain', tab: 'notes', content: doc(line('a', 1000, 'x')) });
    await syncNoteLines({ id: 'doc-4', file_id: 'lec', tab: 'summary', content: doc(line('a', 1000, 'x')) });
    expect(rowsOf('note_lines')).toEqual([]);
  });
});
