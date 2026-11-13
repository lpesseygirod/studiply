// Tabs in every document, on the laptop (written at once): the
// order of the tabs, what can be added, renamed, moved and deleted, moves
// that write only their own place, the page setup shared by every tab,
// versions kept per tab, and an edit that brings back a deleted tab. The
// server is a fake with real rows (test-utils/fakeTables).

import { resetTables, rowsOf, serverWrite } from '../../test-utils/fakeTables';
import {
  addTab,
  cleanTabTitle,
  deleteTab,
  isAddedTab,
  lastEditedAt,
  listTabs,
  MAX_TABS,
  moveTab,
  nextTabTitle,
  orderTabs,
  positionBetween,
  renameTab,
  restoreTab,
  type TabRow,
} from '../document-tabs.service';
import { listVersions, saveDocument, saveVersion, setPageSetup } from '../document.service';
import { DEFAULT_PAGE_SETUP } from '../../editor/page/pageSetup';
import type { DocJSON } from '../../editor/types';

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

const FILE = 'file-1';
const T = (n: number) => `t-0b6f1c2e-4d3a-4f5b-9c8d-${String(n).padStart(12, '9')}`;
const row = (tab: string, extra: Record<string, unknown> = {}) =>
  serverWrite('documents', { id: `row-${tab}`, file_id: FILE, tab, content: { type: 'doc', content: [] }, page_setup: null, title: null, position: null, deleted_at: null, kind: null, ...extra });
const docRow = (tab: string) => rowsOf('documents').find((r) => r.file_id === FILE && r.tab === tab)!;
const p = (id: string, text: string, editedAt: number | null = null) => ({ type: 'paragraph', attrs: { blockId: id, origin: 'student', editedAt }, content: text ? [{ type: 'text', text }] : [] });
const names = (tabs: { title: string }[]) => tabs.map((t) => t.title);

beforeEach(() => resetTables());

describe('the rules (pure)', () => {
  const r = (tab: string, extra: Partial<TabRow> = {}): TabRow => ({ tab, title: null, position: null, deleted_at: null, kind: null, created_at: '2026-10-29T10:00:00Z', ...extra });

  it('a lecture: My notes, Summary, Transcript first and fixed (even before their rows exist), then added tabs by place; deleted ones left out', () => {
    const tabs = orderTabs(
      [r('notes', { position: 9 }), r(T(1), { title: 'Semana 1', position: 2 }), r(T(2), { title: 'Semana 2', position: 1 }), r(T(3), { title: 'Borrada', position: 0, deleted_at: '2026-10-29T11:00:00Z' })],
      true,
    );
    expect(names(tabs)).toEqual(['My notes', 'Summary', 'Transcript', 'Semana 2', 'Semana 1']);
    expect(tabs.map((t) => t.fixed)).toEqual([true, true, true, false, false]);
  });

  it('a plain document: its first tab is "Tab 1" and first by default; then by place, then by when they were made', () => {
    const tabs = orderTabs(
      [r(T(1), { title: 'B', created_at: '2026-10-29T10:02:00Z' }), r('notes'), r(T(2), { title: 'A', position: 1 }), r(T(3), { title: 'C', created_at: '2026-10-29T10:03:00Z' })],
      false,
    );
    expect(names(tabs)).toEqual(['Tab 1', 'A', 'B', 'C']);
    expect(tabs.every((t) => !t.fixed)).toBe(true);
    expect(names(orderTabs([], false))).toEqual(['Tab 1']);
  });

  it('kinds: summary and sheet, anything else is an ordinary tab', () => {
    expect(orderTabs([r(T(1), { title: 'X', kind: 'sheet' }), r(T(2), { title: 'Y', kind: 'chart' })], false).map((t) => t.kind)).toEqual(['sheet', null]);
  });

  it('positions: the midpoint, or one past an end', () => {
    expect(positionBetween(null, null)).toBe(1);
    expect(positionBetween(2, null)).toBe(3);
    expect(positionBetween(null, 0)).toBe(-1);
    expect(positionBetween(1, 2)).toBe(1.5);
  });

  it('names: the next free "Tab N"; a title is 1–100 characters', () => {
    expect(nextTabTitle([{ title: 'Tab 1' }])).toBe('Tab 2');
    expect(nextTabTitle([{ title: 'Tab 1' }, { title: 'tab 3' }, { title: 'Otra' }])).toBe('Tab 4');
    // A spreadsheet: "Sheet N", counted among the sheets.
    expect(nextTabTitle([{ title: 'Tab 1', kind: null }, { title: 'Tab 2', kind: null }], 'sheet')).toBe('Sheet 1');
    expect(nextTabTitle([{ title: 'Tab 1' }, { title: 'Sheet 1', kind: 'sheet' }, { title: 'sheet 2' }], 'sheet')).toBe('Sheet 3');
    expect(cleanTabTitle('  Semana   3 ')).toBe('Semana 3');
    expect(() => cleanTabTitle('   ')).toThrow('Enter a name');
    expect(() => cleanTabTitle('a'.repeat(101))).toThrow('at most 100');
    expect(cleanTabTitle('a'.repeat(100))).toHaveLength(100);
  });

  it('an added tab id is t- and a lowercase uuid, as the database checks it', () => {
    expect(isAddedTab('t-0b6f1c2e-4d3a-4f5b-9c8d-7e6f5a4b3c2d')).toBe(true);
    expect(isAddedTab('t-0B6F1C2E-4D3A-4F5B-9C8D-7E6F5A4B3C2D')).toBe(false);
    expect(isAddedTab('notes')).toBe(false);
    expect(isAddedTab('t-123')).toBe(false);
  });

  it('the newest edit in a document', () => {
    expect(lastEditedAt({ type: 'doc', content: [p('a', 'x', 1000), p('b', 'y', 3000), p('c', 'z', null)] })).toBe(3000);
    expect(lastEditedAt({ type: 'doc', content: [] })).toBe(0);
    expect(lastEditedAt(null)).toBe(0);
  });
});

describe('on the laptop', () => {
  it('adds "Tab 2" at the end with an empty page and the document’s page setup', async () => {
    const letter = { ...DEFAULT_PAGE_SETUP, size: 'letter' };
    row('notes', { page_setup: letter });
    const added = await addTab(FILE, { isLecture: false });
    expect(added).toMatchObject({ title: 'Tab 2', fixed: false, kind: null });
    expect(isAddedTab(added.tab)).toBe(true);
    const saved = docRow(added.tab);
    expect(saved).toMatchObject({ title: 'Tab 2', position: 1, page_setup: letter, kind: null });
    // (The fake server has no column defaults; the database's deleted_at starts null.)
    expect(saved.deleted_at ?? null).toBeNull();
    expect((saved.content as DocJSON).content?.[0]?.type).toBe('paragraph');
    expect(names(await listTabs(FILE, false))).toEqual(['Tab 1', 'Tab 2']);
  });

  it('a lecture’s added tab comes after its fixed ones; a spreadsheet tab has kind sheet', async () => {
    row('notes');
    const sheet = await addTab(FILE, { isLecture: true, title: 'Presupuesto', kind: 'sheet' });
    expect(names(await listTabs(FILE, true))).toEqual(['My notes', 'Summary', 'Transcript', 'Presupuesto']);
    expect(docRow(sheet.tab).kind).toBe('sheet');
    // No cells yet (not an empty page).
    expect(docRow(sheet.tab).content).toEqual({ type: 'doc', content: [] });
    const unnamed = await addTab(FILE, { isLecture: true, kind: 'sheet' });
    expect(unnamed.title).toBe('Sheet 2');
  });

  it('at most 30 tabs', async () => {
    row('notes');
    for (let i = 1; i < MAX_TABS; i++) row(T(i), { title: `Tab ${i + 1}`, position: i });
    expect(await listTabs(FILE, false)).toHaveLength(MAX_TABS);
    await expect(addTab(FILE, { isLecture: false })).rejects.toThrow('at most 30 tabs');
  });

  it('renames a tab; a lecture’s fixed tabs refuse; an empty name is refused', async () => {
    row('notes');
    row(T(1), { title: 'Semana 1', position: 1 });
    await renameTab(FILE, T(1), ' Semana  uno ', false);
    expect(docRow(T(1)).title).toBe('Semana uno');
    await renameTab(FILE, 'notes', 'Resumen', false);
    expect(docRow('notes').title).toBe('Resumen');
    await expect(renameTab(FILE, 'summary', 'X', true)).rejects.toThrow("Summary tab can't be renamed");
    await expect(renameTab(FILE, T(1), '  ', false)).rejects.toThrow('Enter a name');
  });

  it('a move writes only the moved tab’s place; two devices moving different tabs keep both moves', async () => {
    row('notes');
    row(T(1), { title: 'A', position: 1 });
    row(T(2), { title: 'B', position: 2 });
    row(T(3), { title: 'C', position: 3 });
    const before = rowsOf('documents').map((r) => [r.tab, r.position]);
    // This laptop: C between Tab 1 and A.
    await moveTab(FILE, T(3), 1, false);
    const after = rowsOf('documents').map((r) => [r.tab, r.position]);
    expect(after.filter((x, i) => x[1] !== before[i][1])).toEqual([[T(3), 0.5]]);
    // The other device, from its older view: A to the end (after C's old place).
    serverWrite('documents', { id: docRow(T(1)).id, position: positionBetween(3, null) });
    expect(names(await listTabs(FILE, false))).toEqual(['Tab 1', 'C', 'B', 'A']);
    // A plain document's first tab moves too; a lecture's added tab stays after the fixed ones.
    await moveTab(FILE, 'notes', 3, false);
    expect(names(await listTabs(FILE, false))).toEqual(['C', 'B', 'A', 'Tab 1']);
    await moveTab(FILE, T(2), 0, true);
    expect(names(await listTabs(FILE, true)).slice(0, 4)).toEqual(['My notes', 'Summary', 'Transcript', 'B']);
    await expect(moveTab(FILE, 'transcript', 5, true)).rejects.toThrow("can't be moved");
  });

  it('deletes softly (Undo brings it back); not a lecture’s fixed tabs, nor a document’s last tab', async () => {
    row('notes');
    row(T(1), { title: 'Semana 1', position: 1 });
    await deleteTab(FILE, T(1), false);
    expect(docRow(T(1)).deleted_at).toEqual(expect.any(String));
    expect(names(await listTabs(FILE, false))).toEqual(['Tab 1']);
    await expect(deleteTab(FILE, 'notes', false)).rejects.toThrow("last tab can't be deleted");
    await restoreTab(FILE, T(1));
    expect(names(await listTabs(FILE, false))).toEqual(['Tab 1', 'Semana 1']);
    await expect(deleteTab(FILE, 'summary', true)).rejects.toThrow("can't be deleted");
  });

  it('page setup is the document’s: saved to every tab', async () => {
    row('notes');
    row(T(1), { title: 'Semana 1', position: 1 });
    row(T(2), { title: 'Semana 2', position: 2 });
    const landscape = { ...DEFAULT_PAGE_SETUP, orientation: 'landscape' as const };
    await setPageSetup(FILE, T(1), landscape);
    expect(rowsOf('documents').map((r) => (r.page_setup as { orientation?: string } | null)?.orientation)).toEqual(['landscape', 'landscape', 'landscape']);
  });

  it('versions are kept per tab', async () => {
    row('notes');
    row(T(1), { title: 'Semana 1', position: 1 });
    await saveVersion(FILE, T(1), { type: 'doc', content: [p('a', 'Semana uno')] }, 'session_end');
    expect(await listVersions(FILE, T(1))).toHaveLength(1);
    expect(await listVersions(FILE, 'notes')).toHaveLength(0);
  });

  it('an edit reaching a tab deleted on another device brings it back: the edit is kept', async () => {
    row('notes');
    const base: DocJSON = { type: 'doc', content: [p('a', 'Hola', 1000)] };
    row(T(1), { title: 'Semana 1', position: 1, content: base });
    serverWrite('documents', { id: docRow(T(1)).id, deleted_at: '2026-10-29T12:00:00Z' });
    const saved = await saveDocument({ fileId: FILE, tab: T(1), base, next: { type: 'doc', content: [p('a', 'Hola de nuevo', 5000)] } });
    expect(saved.revived).toBe(true);
    expect(docRow(T(1)).deleted_at).toBeNull();
    expect(names(await listTabs(FILE, false))).toEqual(['Tab 1', 'Semana 1']);
  });
});
