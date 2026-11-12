// A spreadsheet tab edited offline on the iPhone, sent when the connection is
// back (checkpoint 3): the cells merge one by one with what the
// laptop wrote meanwhile. Different cells: both kept. The same cell: the
// newer change wins and the other is in version history. Two offline saves
// go as one edit. The handlers and the queue's merge are the real ones; the
// server is a fake with real rows (test-utils/fakeTables), the iPhone's
// cache an in-memory copy (as offline-document.test.ts).

import { resetTables, rowsOf, serverWrite } from '../../test-utils/fakeTables';
import { openDocument, saveDocument, takeDocumentConflicts } from '../document.service';
import { addTab } from '../document-tabs.service';
import { cellsOf, inputsOf, sheetDocOf, type SheetCells } from '../../lib/sheetDoc';
import { Sheet } from '../../lib/sheets';
import type { DocJSON } from '../../editor/types';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/fakeTables').module);
jest.mock('../../lib/deviceId', () => ({ getDeviceId: async () => 'iphone' }));
jest.mock('../../lib/mappers', () => {
  let n = 0;
  return { ...jest.requireActual('../../lib/mappers'), newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});
jest.mock('../../lib/connectivity', () => ({ ...jest.requireActual('../../lib/connectivity'), isOffline: jest.fn(() => true) }));

// The iPhone's cache: rows with a dirty flag, and the meta store.
jest.mock('../../lib/cache', () => {
  const rows: Record<string, Map<string, { data: Record<string, unknown>; dirty: boolean }>> = {};
  const meta = new Map<string, string>();
  const table = (tbl: string) => (rows[tbl] ??= new Map());
  const state = { online: false };
  return {
    rows,
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

// The queue: ops kept in order; a new op on the same key and kind is merged
// into the waiting one with the handler's merge, as lib/sync/queue does.
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
  ops: { kind: string; key: string; payload: unknown }[];
};
const cache = jest.requireMock('../../lib/cache') as {
  rows: Record<string, Map<string, { data: Record<string, unknown>; dirty: boolean }>>;
  state: { online: boolean };
};

/** Back online: the queue sends every op in order; each leaves once it ran. */
async function sendAll(betweenOps?: (kind: string) => void) {
  while (sync.ops.length > 0) {
    const op = sync.ops[0];
    betweenOps?.(op.kind);
    await sync.handlers[op.kind].run(op.payload);
    sync.ops.shift();
  }
}

const cells = (inputs: Record<string, string>): SheetCells => new Map(Object.entries(inputs).map(([a, input]) => [a, { input, bold: false }]));
const inputs = (doc: unknown) => inputsOf(cellsOf(doc as DocJSON));

const LOAN = { A1: 'Amount', B1: '200000', B2: '3.5%', B3: '360', B4: '=PMT(B2/12, B3, -B1)' };

beforeEach(() => {
  resetTables();
  cache.state.online = false;
  sync.ops.length = 0;
  for (const key of Object.keys(cache.rows)) delete cache.rows[key];
});

/** A sheet tab both devices have: on the server, and in the iPhone's cache. */
function sheetOnBoth(): { tab: string; rowId: string; doc: DocJSON } {
  const doc = sheetDocOf(cells(LOAN), null, 1000);
  serverWrite('files', { id: 'file-1', kind: 'document', title: 'Préstamo' });
  const row = serverWrite('documents', { id: 'row-1', file_id: 'file-1', tab: 't-00000000-0000-4000-8000-0000000000aa', kind: 'sheet', title: 'Sheet 1', content: doc });
  cache.rows.documents = new Map([['row-1', { data: { ...row }, dirty: false }]]);
  return { tab: row.tab as string, rowId: 'row-1', doc };
}

describe('a spreadsheet tab edited offline on the iPhone', () => {
  it('merges cell by cell with the laptop: different cells both kept; the same cell, the newer wins and the other is a version', async () => {
    const { tab, doc } = sheetOnBoth();
    // Offline on the iPhone: the rate changed, then a note added (two saves).
    const v1 = sheetDocOf(cells({ ...LOAN, B2: '4%' }), doc, 2000);
    await saveDocument({ fileId: 'file-1', tab, base: doc, next: v1 });
    const v2 = sheetDocOf(cells({ ...LOAN, B2: '4%', C1: 'desde el iPhone' }), v1, 2100);
    await saveDocument({ fileId: 'file-1', tab, base: v1, next: v2 });
    // It shows them here, nothing sent yet, one queued edit.
    expect(inputs((await openDocument('file-1', tab)).content)).toMatchObject({ B2: '4%', C1: 'desde el iPhone' });
    expect(sync.ops.map((o) => o.kind)).toEqual(['document_edit']);
    expect(inputs(rowsOf('documents')[0].content).B2).toBe('3.5%');

    // Meanwhile the laptop changes the amount, and the same note cell, later than the iPhone.
    cache.state.online = true;
    await sendAll(() => {
      serverWrite('documents', { id: 'row-1', content: sheetDocOf(cells({ ...LOAN, B1: '250000', C1: 'desde el portátil' }), doc, 5000) });
    });

    const server = inputs(rowsOf('documents')[0].content);
    // Different cells: both changes kept, and the payment follows both.
    expect(server).toMatchObject({ B1: '250000', B2: '4%' });
    expect(Number(Sheet.fromJSON(server).value('B4')).toFixed(2)).toBe('1193.54');
    // The same cell: the laptop's later change wins; the iPhone's is in version history.
    expect(server.C1).toBe('desde el portátil');
    const kept = rowsOf('document_versions');
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ reason: 'conflict' });
    expect(inputs(kept[0].content).C1).toBe('desde el iPhone');
    expect(await takeDocumentConflicts('file-1', tab)).toEqual(['C1']);
    // The iPhone's copy is the server's now, and clean.
    const local = [...cache.rows.documents.values()];
    expect(local).toHaveLength(1);
    expect(local[0].dirty).toBe(false);
    expect(inputs(local[0].data.content)).toEqual(server);
  });

  it('a cell emptied on the laptop and changed offline on the iPhone keeps the iPhone’s change', async () => {
    const { tab, doc } = sheetOnBoth();
    await saveDocument({ fileId: 'file-1', tab, base: doc, next: sheetDocOf(cells({ ...LOAN, B3: '240' }), doc, 2000) });
    const { B3: _gone, ...emptied } = LOAN;
    cache.state.online = true;
    await sendAll(() => serverWrite('documents', { id: 'row-1', content: sheetDocOf(cells(emptied), doc, 3000) }));
    expect(inputs(rowsOf('documents')[0].content).B3).toBe('240');
  });

  it('a sheet tab made offline on the iPhone is created first, then its cells', async () => {
    serverWrite('files', { id: 'file-2', kind: 'document', title: 'Presupuesto' });
    cache.rows.files = new Map([['file-2', { data: { id: 'file-2', kind: 'document', title: 'Presupuesto' }, dirty: false }]]);
    const added = await addTab('file-2', { isLecture: false, kind: 'sheet' });
    expect(added).toMatchObject({ title: 'Sheet 1', kind: 'sheet' });
    const empty = (await openDocument('file-2', added.tab)).content;
    expect(empty).toEqual({ type: 'doc', content: [] });
    await saveDocument({ fileId: 'file-2', tab: added.tab, base: empty, next: sheetDocOf(cells({ A1: 'Mes', B1: '=PMT(4%/12, 360, -200000)' }), empty, 1000) });
    expect(sync.ops.map((o) => o.kind)).toEqual(['create_tab', 'document_edit']);

    cache.state.online = true;
    await sendAll();
    const row = rowsOf('documents').find((r) => r.tab === added.tab)!;
    expect(row).toMatchObject({ kind: 'sheet', title: 'Sheet 1' });
    expect(inputs(row.content)).toEqual({ A1: 'Mes', B1: '=PMT(4%/12, 360, -200000)' });
  });
});
