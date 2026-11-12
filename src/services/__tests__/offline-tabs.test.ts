// Tabs changed offline on the iPhone, sent when the connection
// is back: a new tab reaches the server before its own edits; a name, a
// place and a deletion queue as one tab step (the latest of each); deleted
// on one device and edited offline on the other, the edit is kept and the
// tab stays (either way round); the page setup reaches every tab, and a new
// tab copies it. The handlers and the queue's merge are the real ones; the
// server is a fake with real rows, the iPhone's cache an in-memory copy.

import { resetTables, rowsOf, serverWrite } from '../../test-utils/fakeTables';
import { addTab, deleteTab, listTabs, moveTab, renameTab } from '../document-tabs.service';
import { openDocument, saveDocument, setPageSetup, takeKeptTabs } from '../document.service';
import { DEFAULT_PAGE_SETUP } from '../../editor/page/pageSetup';
import type { DocJSON } from '../../editor/types';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/fakeTables').module);
jest.mock('../../lib/deviceId', () => ({ getDeviceId: async () => 'iphone' }));
jest.mock('../../lib/mappers', () => {
  let n = 0;
  return { ...jest.requireActual('../../lib/mappers'), newId: () => `0b6f1c2e-4d3a-4f5b-9c8d-${String(++n).padStart(12, '0')}` };
});
jest.mock('../../lib/connectivity', () => ({ ...jest.requireActual('../../lib/connectivity'), isOffline: jest.fn(() => true) }));

// The iPhone's cache: rows with a dirty flag, and the meta store (as in offline-document.test).
jest.mock('../../lib/cache', () => {
  const rows: Record<string, Map<string, { data: Record<string, unknown>; dirty: boolean }>> = {};
  const meta = new Map<string, string>();
  const table = (tbl: string) => (rows[tbl] ??= new Map());
  const state = { online: false };
  return {
    rows,
    meta,
    state,
    cacheUser: () => 'user-1',
    saveLocalRow: async (tbl: string, row: Record<string, unknown>) => void table(tbl).set(row.id as string, { data: row, dirty: true }),
    markClean: async (tbl: string, id: string, row?: Record<string, unknown>) => {
      const entry = table(tbl).get(id);
      if (entry) table(tbl).set(id, { data: row ?? entry.data, dirty: false });
    },
    dropRows: async (tbl: string, ids: string[]) => ids.forEach((id) => table(tbl).get(id)?.dirty === false && table(tbl).delete(id)),
    remember: (tbl: string, list: Record<string, unknown>[]) => list.forEach((r) => table(tbl).set(r.id as string, { data: r, dirty: false })),
    readRow: async (tbl: string, id: string) => table(tbl).get(id)?.data ?? null,
    readRows: async (tbl: string, parent?: string) =>
      [...table(tbl).values()].map((e) => e.data).filter((r) => parent === undefined || r.file_id === parent),
    readThrough: async (remote: () => Promise<unknown>, local: () => Promise<unknown>) => (state.online ? remote() : local()),
    withLocalChanges: async (tbl: string, list: Record<string, unknown>[]) =>
      list.map((r) => {
        const entry = table(tbl).get(r.id as string);
        return entry?.dirty ? entry.data : r;
      }),
    getMeta: async (key: string) => meta.get(key) ?? null,
    setMeta: async (key: string, value: string) => void meta.set(key, value),
    deleteMeta: async (key: string) => void meta.delete(key),
    notifyLibraryUpdated: () => {},
  };
});

// The queue: ops kept in order; a new op on the same key and kind merges into the waiting one.
jest.mock('../../lib/sync', () => {
  const handlers: Record<string, { run: (p: unknown) => Promise<void>; merge?: (a: unknown, b: unknown) => unknown }> = {};
  const ops: { kind: string; key: string; payload: unknown }[] = [];
  return {
    ...jest.requireActual('../../lib/sync/index.web'),
    syncEnabled: true,
    handlers,
    ops,
    registerSyncHandler: (kind: string, handler: (typeof handlers)[string]) => {
      handlers[kind] = handler;
    },
    enqueue: async (op: { kind: string; key: string; payload: unknown }) => {
      const last = [...ops].reverse().find((o) => o.key === op.key);
      const merge = handlers[op.kind]?.merge;
      if (last && last.kind === op.kind && merge) last.payload = merge(last.payload, op.payload);
      else ops.push({ ...op });
    },
    pendingSyncFor: async (key: string) => ops.filter((o) => o.key === key),
  };
});

const sync = jest.requireMock('../../lib/sync') as {
  handlers: Record<string, { run: (p: unknown) => Promise<void> }>;
  ops: { kind: string; key: string; payload: Record<string, unknown> }[];
};
const cache = jest.requireMock('../../lib/cache') as {
  rows: Record<string, Map<string, unknown>>;
  meta: Map<string, string>;
  state: { online: boolean };
  remember: (tbl: string, rows: Record<string, unknown>[]) => void;
};
const connectivity = jest.requireMock('../../lib/connectivity') as { isOffline: jest.Mock };

const FILE = 'file-1';
const T1 = 't-0b6f1c2e-4d3a-4f5b-9c8d-999999999991';
const p = (id: string, text: string, editedAt: number | null = null) => ({ type: 'paragraph', attrs: { blockId: id, origin: 'student', editedAt }, content: text ? [{ type: 'text', text }] : [] });
const texts = (d: unknown) => ((d as DocJSON).content ?? []).map((b) => (b.content ?? []).map((c) => c.text).join(''));
const serverRow = (tab: string) => rowsOf('documents').find((r) => r.file_id === FILE && r.tab === tab);

/** A tab the server has, and this iPhone too (synced). */
function seed(tab: string, extra: Record<string, unknown> = {}) {
  const row = serverWrite('documents', { id: `row-${tab}`, file_id: FILE, tab, content: { type: 'doc', content: [] }, page_setup: null, title: null, position: null, deleted_at: null, kind: null, ...extra });
  cache.remember('documents', [row]);
  return row;
}

/** Back online: the queue sends every op in order. */
async function sendAll() {
  cache.state.online = true;
  connectivity.isOffline.mockReturnValue(false);
  while (sync.ops.length > 0) {
    const op = sync.ops[0];
    await sync.handlers[op.kind].run(op.payload);
    sync.ops.shift();
  }
}

beforeEach(() => {
  resetTables();
  cache.state.online = false;
  connectivity.isOffline.mockReturnValue(true);
  sync.ops.length = 0;
  cache.meta.clear();
  for (const key of Object.keys(cache.rows)) delete cache.rows[key];
  serverWrite('files', { id: FILE, kind: 'document', title: 'Apuntes', course_id: null, folder_id: null });
});

describe('tabs changed offline on the iPhone', () => {
  it('a new tab shows at once and reaches the server before its own edits', async () => {
    seed('notes');
    const added = await addTab(FILE, { isLecture: false });
    expect(serverRow(added.tab)).toBeUndefined();
    expect((await listTabs(FILE, false)).map((t) => t.title)).toEqual(['Tab 1', 'Tab 2']);

    const blank = (await openDocument(FILE, added.tab)).content;
    const first = (blank.content ?? [])[0].attrs?.blockId as string;
    await saveDocument({ fileId: FILE, tab: added.tab, base: blank, next: { type: 'doc', content: [p(first, 'Semana 3', 1000)] } });
    expect(sync.ops.map((o) => [o.kind, o.key])).toEqual([
      ['create_tab', `${FILE}:${added.tab}`],
      ['document_edit', `${FILE}:${added.tab}`],
    ]);

    await sendAll();
    const row = serverRow(added.tab);
    expect(row).toMatchObject({ title: 'Tab 2', position: 1 });
    expect(texts(row?.content)).toEqual(['Semana 3']);
    expect(rowsOf('documents').filter((r) => r.tab === added.tab)).toHaveLength(1);
  });

  it('name, place and deletion queue as one step per tab: the latest of each', async () => {
    seed('notes');
    seed(T1, { title: 'Semana 1', position: 1 });
    await renameTab(FILE, T1, 'Semana uno', false);
    await renameTab(FILE, T1, 'Semana 1 (repaso)', false);
    await moveTab(FILE, T1, 0, false);
    expect(sync.ops.map((o) => o.kind)).toEqual(['tab_meta']);
    expect(sync.ops[0].payload.meta).toEqual({ title: 'Semana 1 (repaso)', position: -1 });
    expect((await listTabs(FILE, false)).map((t) => t.title)).toEqual(['Semana 1 (repaso)', 'Tab 1']);

    await sendAll();
    expect(serverRow(T1)).toMatchObject({ title: 'Semana 1 (repaso)', position: -1 });
  });

  it('deleted offline with nothing newer elsewhere: deleted', async () => {
    seed('notes');
    seed(T1, { title: 'Semana 1', position: 1, content: { type: 'doc', content: [p('a', 'Hola', 1000)] } });
    await deleteTab(FILE, T1, false);
    expect((await listTabs(FILE, false)).map((t) => t.title)).toEqual(['Tab 1']);
    await sendAll();
    expect(serverRow(T1)?.deleted_at).toEqual(expect.any(String));
    expect(await takeKeptTabs(FILE)).toEqual([]);
  });

  it('deleted on the iPhone while the laptop edited it: the edit is kept, the tab stays', async () => {
    seed('notes');
    seed(T1, { title: 'Semana 1', position: 1, content: { type: 'doc', content: [p('a', 'Hola', 1000)] } });
    await deleteTab(FILE, T1, false);
    expect(sync.ops[0].payload.seenEditedAt).toBe(1000);
    // Meanwhile the laptop writes in the tab.
    serverWrite('documents', { id: `row-${T1}`, content: { type: 'doc', content: [p('a', 'Hola desde el laptop', 2000)] } });

    await sendAll();
    expect(serverRow(T1)?.deleted_at ?? null).toBeNull();
    expect(texts(serverRow(T1)?.content)).toEqual(['Hola desde el laptop']);
    expect(await takeKeptTabs(FILE)).toEqual([T1]);
    expect(await takeKeptTabs(FILE)).toEqual([]);
  });

  it('deleted on the laptop while the iPhone edited it offline: the edit brings the tab back', async () => {
    seed('notes');
    const base: DocJSON = { type: 'doc', content: [p('a', 'Hola', 1000)] };
    seed(T1, { title: 'Semana 1', position: 1, content: base });
    await saveDocument({ fileId: FILE, tab: T1, base, next: { type: 'doc', content: [p('a', 'Hola desde el iPhone', 3000)] } });
    serverWrite('documents', { id: `row-${T1}`, deleted_at: '2026-10-29T12:00:00Z' });

    await sendAll();
    expect(serverRow(T1)?.deleted_at).toBeNull();
    expect(texts(serverRow(T1)?.content)).toEqual(['Hola desde el iPhone']);
    expect(await takeKeptTabs(FILE)).toEqual([T1]);
  });

  it('page setup from the iPhone reaches every tab; a new tab copies it', async () => {
    seed('notes');
    seed(T1, { title: 'Semana 1', position: 1 });
    const landscape = { ...DEFAULT_PAGE_SETUP, orientation: 'landscape' as const };
    await setPageSetup(FILE, 'notes', landscape);
    const added = await addTab(FILE, { isLecture: false });
    expect(sync.ops.find((o) => o.kind === 'create_tab')?.payload.pageSetup).toMatchObject({ orientation: 'landscape' });

    await sendAll();
    expect(rowsOf('documents').map((r) => [r.tab, (r.page_setup as { orientation?: string } | null)?.orientation])).toEqual([
      ['notes', 'landscape'],
      [T1, 'landscape'],
      [added.tab, 'landscape'],
    ]);
  });
});
