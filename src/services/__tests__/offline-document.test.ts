// A document written offline on the iPhone, sent when the connection is back
// (step 4.3): created, written twice and renamed offline, it reaches the
// server in order as one edit, merged block by block with what the laptop
// wrote meanwhile, and nothing either device wrote is lost. The handlers
// and the queue's merge are the real ones; the server is a fake with real
// rows (test-utils/fakeTables), the iPhone's cache an in-memory copy.

import { resetTables, rowsOf, serverWrite } from '../../test-utils/fakeTables';
import { createDocument, openDocument, renameDocument, saveDocument, saveVersion, takeDocumentConflicts } from '../document.service';
import type { Block } from '../../editor/docBlocks';
import type { DocJSON } from '../../editor/types';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/fakeTables').module);
jest.mock('../../lib/deviceId', () => ({ getDeviceId: async () => 'iphone' }));
jest.mock('../../lib/mappers', () => {
  let n = 0;
  return { ...jest.requireActual('../../lib/mappers'), newId: () => `id-${++n}` };
});
jest.mock('../../lib/connectivity', () => ({ ...jest.requireActual('../../lib/connectivity'), isOffline: jest.fn(() => true) }));

// The iPhone's cache: rows with a dirty flag, and the meta store.
jest.mock('../../lib/cache', () => {
  const rows: Record<string, Map<string, { data: Record<string, unknown>; dirty: boolean }>> = {};
  const meta = new Map<string, string>();
  const table = (tbl: string) => (rows[tbl] ??= new Map());
  return {
    rows,
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
    readThrough: async (_remote: unknown, local: () => Promise<unknown>) => local(),
    withLocalChanges: async (_tbl: string, list: unknown[]) => list,
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
const cache = jest.requireMock('../../lib/cache') as { rows: Record<string, Map<string, { data: Record<string, unknown>; dirty: boolean }>> };

/** Back online: the queue sends every op in order; each leaves once it ran. */
async function sendAll(betweenOps?: (kind: string) => void) {
  while (sync.ops.length > 0) {
    const op = sync.ops[0];
    betweenOps?.(op.kind);
    await sync.handlers[op.kind].run(op.payload);
    sync.ops.shift();
  }
}

const p = (id: string, text: string, editedAt: number | null = null): Block => ({
  type: 'paragraph',
  attrs: { blockId: id, origin: 'student', editedAt },
  content: text ? [{ type: 'text', text }] : [],
});
const texts = (d: unknown) => ((d as DocJSON).content ?? []).map((b) => (b.content ?? []).map((c) => c.text).join(''));

beforeEach(() => {
  resetTables();
  sync.ops.length = 0;
  for (const key of Object.keys(cache.rows)) delete cache.rows[key];
});

describe('a document written offline on the iPhone', () => {
  it('reaches the server in order, merged with the laptop, nothing lost', async () => {
    // Offline: create, write twice, rename.
    const fileId = await createDocument({ courseId: 'c1', folderId: null });
    const blank = (await openDocument(fileId, 'notes')).content;
    const first = (blank.content ?? [])[0].attrs?.blockId as string;

    const v1: DocJSON = { type: 'doc', content: [p(first, 'Hola desde el iPhone', 1000)] };
    await saveDocument({ fileId, tab: 'notes', base: blank, next: v1 });
    const v2: DocJSON = { type: 'doc', content: [p(first, 'Hola desde el iPhone', 1000), p('n2', 'Segunda línea', 1100)] };
    await saveDocument({ fileId, tab: 'notes', base: v1, next: v2 });
    await renameDocument(fileId, 'Apuntes del iPhone');

    // Nothing has left the iPhone; it shows what was written.
    expect(rowsOf('files')).toEqual([]);
    expect(texts((await openDocument(fileId, 'notes')).content)).toEqual(['Hola desde el iPhone', 'Segunda línea']);
    // Two saves became one queued edit, behind the create.
    expect(sync.ops.map((o) => o.kind)).toEqual(['create_document', 'document_edit', 'rename_document']);

    // Back online. Right after the create arrives, the laptop writes the
    // same first line later than the iPhone did.
    await sendAll((kind) => {
      if (kind !== 'document_edit') return;
      const row = rowsOf('documents')[0];
      serverWrite('documents', { id: row.id, content: { type: 'doc', content: [p(first, 'Hola desde el laptop', 2000)] } });
    });

    expect(rowsOf('files')[0]).toMatchObject({ id: fileId, kind: 'document', title: 'Apuntes del iPhone', course_id: 'c1' });
    const server = rowsOf('documents');
    expect(server).toHaveLength(1);
    // The laptop's newer line stays; the iPhone's new line is added.
    expect(texts(server[0].content)).toEqual(['Hola desde el laptop', 'Segunda línea']);
    // The iPhone's older first line is in version history.
    const kept = rowsOf('document_versions');
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ reason: 'conflict', document_id: server[0].id });
    expect(texts(kept[0].content)).toEqual(['Hola desde el iPhone', 'Segunda línea']);
    // The screen will say so once.
    expect(await takeDocumentConflicts(fileId, 'notes')).toEqual([first]);
    expect(await takeDocumentConflicts(fileId, 'notes')).toEqual([]);
    // The iPhone's copy is the server's now, and clean.
    const local = [...cache.rows.documents.values()];
    expect(local).toHaveLength(1);
    expect(local[0].dirty).toBe(false);
    expect(texts(local[0].data.content)).toEqual(['Hola desde el laptop', 'Segunda línea']);
  });

  it('sends a new tab of a lecture the laptop also created, without a second row', async () => {
    serverWrite('files', { id: 'lec-1', kind: 'lecture', title: 'Tema 1' });
    cache.rows.files = new Map([['lec-1', { data: { id: 'lec-1', kind: 'lecture', title: 'Tema 1' }, dirty: false }]]);
    const next: DocJSON = { type: 'doc', content: [p('m1', 'Nota del iPhone', 1000)] };
    await saveDocument({ fileId: 'lec-1', tab: 'notes', base: { type: 'doc', content: [] }, next });
    // The laptop wrote the same tab first.
    serverWrite('documents', { id: 'laptop-row', file_id: 'lec-1', tab: 'notes', content: { type: 'doc', content: [p('m0', 'Nota del laptop', 900)] } });

    await sendAll();
    const rows = rowsOf('documents');
    expect(rows).toHaveLength(1);
    expect(texts(rows[0].content)).toEqual(['Nota del laptop', 'Nota del iPhone']);
    // This iPhone's own row for the tab gave way to the server's.
    expect([...cache.rows.documents.keys()]).toEqual(['laptop-row']);
  });

  it('queues a session version behind the edits and sends it once', async () => {
    const fileId = await createDocument({ courseId: null, folderId: null });
    const blank = (await openDocument(fileId, 'notes')).content;
    const next: DocJSON = { type: 'doc', content: [p('x', 'Final de la sesión', 1000)] };
    await saveDocument({ fileId, tab: 'notes', base: blank, next });
    await saveVersion(fileId, 'notes', next, 'session_end');
    expect(sync.ops.map((o) => o.kind)).toEqual(['create_document', 'document_edit', 'save_version']);

    const versionOp = sync.ops[2];
    await sendAll();
    await sync.handlers.save_version.run(versionOp.payload); // sent twice
    const versions = rowsOf('document_versions');
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ reason: 'session_end', document_id: rowsOf('documents')[0].id });
  });
});
