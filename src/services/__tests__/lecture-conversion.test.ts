// On the laptop (written at once), a plain document becomes a
// lecture without anything moving: a lectures row with its id, then its
// kind; the first tab (the same row, content and versions) is My notes and
// the other tabs follow the lecture's three; a renamed first tab takes the
// name My notes (the old name in a version's name); a deleted first tab
// gives an empty My notes (its text saved first as "Before recording");
// safe to repeat; everything put back if the recording can't start; the
// note lines and marks learn it's a lecture now. A fake server with real
// rows (test-utils/fakeTables).

import { resetTables, rowsOf, serverWrite } from '../../test-utils/fakeTables';
import { listTabs, renamedVersionName } from '../document-tabs.service';
import { convertToLecture } from '../lecture-conversion.service';
import { isLectureFile } from '../note-lines.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/fakeTables').module);
jest.mock('../../lib/deviceId', () => ({ getDeviceId: async () => 'laptop' }));
jest.mock('../../lib/mappers', () => {
  let n = 0;
  return { ...jest.requireActual('../../lib/mappers'), newId: () => `0b6f1c2e-4d3a-4f5b-9c8d-${String(++n).padStart(12, '0')}` };
});
// The laptop: no cache, nothing queued.
jest.mock('../../lib/cache', () => ({
  cacheUser: () => 'user-1',
  saveLocalRow: async () => {},
  markClean: async () => {},
  dropRows: async () => {},
  remember: () => {},
  readRow: async () => null,
  readRows: async () => [],
  readThrough: async (remote: () => Promise<unknown>) => remote(),
  withLocalChanges: async (_tbl: string, list: unknown[]) => list,
  getMeta: async () => null,
  setMeta: async () => {},
  deleteMeta: async () => {},
  notifyLibraryUpdated: () => {},
}));
jest.mock('../../lib/sync', () => ({
  ...jest.requireActual('../../lib/sync/index.web'),
  syncEnabled: false,
  registerSyncHandler: () => {},
  enqueue: async () => {
    throw new Error('the laptop queues nothing');
  },
  pendingSyncFor: async () => [],
}));

const FILE = 'doc-1';
const p = (id: string, text: string) => ({ type: 'paragraph', attrs: { blockId: id, origin: 'student', editedAt: 1000 }, content: [{ type: 'text', text, marks: [{ type: 'bold' }] }] });
const WRITTEN = { type: 'doc', content: [p('b1', 'Lo que ya escribí'), p('b2', 'Segunda línea')] };
const notesRow = (extra: Record<string, unknown> = {}) =>
  serverWrite('documents', { id: 'row-notes', file_id: FILE, tab: 'notes', content: WRITTEN, page_setup: null, title: null, position: null, deleted_at: null, kind: null, ...extra });
const tabRow = (tab: string, title: string, kind: string | null = null) =>
  serverWrite('documents', { id: `row-${tab}`, file_id: FILE, tab, content: { type: 'doc', content: [] }, page_setup: null, title, position: 1, deleted_at: null, kind });
const notes = () => rowsOf('documents').find((r) => r.file_id === FILE && r.tab === 'notes')!;
const file = () => rowsOf('files').find((r) => r.id === FILE)!;
const lectures = () => rowsOf('lectures').filter((r) => r.id === FILE);
const versions = () => rowsOf('document_versions').filter((v) => v.file_id === FILE);
const T2 = 't-0b6f1c2e-4d3a-4f5b-9c8d-999999999992';
const SHEET = 't-0b6f1c2e-4d3a-4f5b-9c8d-999999999993';

beforeEach(() => {
  resetTables();
  serverWrite('files', { id: FILE, kind: 'document', title: 'Apuntes', course_id: 'c1', folder_id: 'f1' });
});

describe('turning a document into a lecture (laptop)', () => {
  it('a lectures row with its id, then its kind; the first tab untouched is My notes; the other tabs follow', async () => {
    notesRow();
    tabRow(T2, 'Tab 2');
    tabRow(SHEET, 'Sheet 1', 'sheet');
    await convertToLecture(FILE, 'es');
    expect(lectures()).toEqual([expect.objectContaining({ id: FILE, status: 'recording', language: 'es' })]);
    expect(file()).toMatchObject({ kind: 'lecture', title: 'Apuntes', course_id: 'c1', folder_id: 'f1' });
    // Nothing moved: the same row, the same content (formatting and block ids), no version needed.
    expect(notes()).toMatchObject({ id: 'row-notes', content: WRITTEN, title: null, deleted_at: null });
    expect(versions()).toEqual([]);
    expect((await listTabs(FILE, true)).map((t) => [t.title, t.fixed, t.kind])).toEqual([
      ['My notes', true, null],
      ['Summary', true, null],
      ['Transcript', true, null],
      ['Tab 2', false, null],
      ['Sheet 1', false, 'sheet'],
    ]);
  });

  it('safe to repeat (one lecture row); the note lines and marks learn it is a lecture now', async () => {
    notesRow();
    expect(await isLectureFile(FILE)).toBe(false);
    await convertToLecture(FILE, 'es');
    await convertToLecture(FILE, 'es');
    expect(lectures()).toHaveLength(1);
    expect(await isLectureFile(FILE)).toBe(true);
  });

  it('a renamed first tab becomes My notes; its old name is in the name of a version of its text', async () => {
    notesRow({ title: 'Semana 3' });
    await convertToLecture(FILE, 'es');
    expect(notes()).toMatchObject({ title: null, content: WRITTEN });
    expect(versions()).toEqual([expect.objectContaining({ name: 'Before recording · the tab was “Semana 3”', content: WRITTEN })]);
    expect(renamedVersionName('Semana 3')).toBe('Before recording · the tab was “Semana 3”');
    expect((await listTabs(FILE, true))[0].title).toBe('My notes');
  });

  it('a first tab deleted earlier: My notes starts empty; its text is saved first as "Before recording"', async () => {
    notesRow({ deleted_at: '2026-10-29T10:00:00Z' });
    tabRow(T2, 'Tab 2');
    await convertToLecture(FILE, 'es');
    expect(versions()).toEqual([expect.objectContaining({ name: 'Before recording', content: WRITTEN })]);
    expect(notes().deleted_at).toBeNull();
    const kept = (notes().content as { content: { content?: unknown[] }[] }).content;
    expect(kept).toHaveLength(1);
    expect(kept[0].content ?? []).toEqual([]);
  });

  it('the recording can’t start: everything is put back, a plain document again', async () => {
    notesRow({ title: 'Semana 3' });
    const putBack = await convertToLecture(FILE, 'es');
    await putBack();
    expect(file().kind).toBe('document');
    expect(lectures()).toEqual([]);
    expect(notes()).toMatchObject({ title: 'Semana 3', content: WRITTEN });
    expect(await isLectureFile(FILE)).toBe(false);

    resetTables();
    serverWrite('files', { id: FILE, kind: 'document', title: 'Apuntes' });
    notesRow({ deleted_at: '2026-10-29T10:00:00Z' });
    tabRow(T2, 'Tab 2');
    await (await convertToLecture(FILE, 'es'))();
    expect(notes()).toMatchObject({ deleted_at: '2026-10-29T10:00:00Z' });
    expect((notes().content as { content: unknown[] }).content).toHaveLength(2);
  });
});
