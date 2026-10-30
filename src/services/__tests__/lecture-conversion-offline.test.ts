// Step 5.7 on the iPhone: a plain document becomes a lecture offline. Its
// copy on the phone changes at once and `convert_to_lecture` is queued under
// the file's key; once online the job does the two writes. A chunk upload
// that runs first (the recorder's own queue) makes sure the lecture exists
// and finishes the turning too. If the recording couldn't start, it is put
// back the same way. The handlers are the real ones; the server is a fake
// with real rows; the phone's copy and its queue are fakes.

import { resetTables, rowsOf, serverWrite } from '../../test-utils/fakeTables';
import { convertToLecture } from '../lecture-conversion.service';
import { ensureLectureOnServer } from '../session.service';

type Handler = { run: (payload: unknown, ctx: { progress: (f: number) => void }) => Promise<void> };
type Op = { kind: string; key: string; payload: unknown };

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/fakeTables').module);
jest.mock('../../lib/deviceId', () => ({ getDeviceId: async () => 'iphone' }));
jest.mock('../../lib/cache', () => {
  const local: Record<string, Record<string, Record<string, unknown>>> = { files: {}, lectures: {} };
  return {
    local,
    cacheUser: () => 'user-1',
    readRow: async (tbl: string, id: string) => local[tbl]?.[id] ?? null,
    saveLocalRow: async (tbl: string, row: Record<string, unknown>) => {
      local[tbl] = { ...(local[tbl] ?? {}), [row.id as string]: row };
    },
    dropRows: async (tbl: string, ids: string[]) => {
      for (const id of ids) delete local[tbl]?.[id];
    },
    markClean: async () => {},
    remember: () => {},
    readRows: async () => [],
    readThrough: async (remote: () => Promise<unknown>) => remote(),
    withLocalChanges: async (_tbl: string, list: unknown[]) => list,
    withLocalRows: async (_tbl: string, list: unknown[]) => list,
    getMeta: async () => null,
    setMeta: async () => {},
    deleteMeta: async () => {},
    notifyLibraryUpdated: () => {},
    rememberLectureFiles: () => {},
  };
});
jest.mock('../../lib/sync', () => {
  const handlers: Record<string, unknown> = {};
  const queued: { kind: string; key: string; payload: unknown }[] = [];
  return {
    ...jest.requireActual('../../lib/sync/index.web'),
    syncEnabled: true,
    handlers,
    queued,
    registerSyncHandler: (kind: string, handler: unknown) => {
      handlers[kind] = handler;
    },
    enqueue: async (op: { kind: string; key: string; payload: unknown }) => {
      queued.push(op);
      return op;
    },
    pendingSyncFor: async (key: string) => queued.filter((op) => op.key === key),
  };
});

const sync = jest.requireMock('../../lib/sync') as { handlers: Record<string, Handler>; queued: Op[] };
const local = (jest.requireMock('../../lib/cache') as { local: Record<string, Record<string, Record<string, unknown>>> }).local;
const ctx = { progress: () => {} };
const FILE = 'doc-1';
const fileRow = { id: FILE, user_id: 'user-1', kind: 'document', title: 'Apuntes', course_id: 'c1', folder_id: null, sort_order: 0, starred_at: null, last_opened_at: null, deleted_at: null, created_at: 'x', updated_at: 'x' };
const server = () => ({ kind: rowsOf('files').find((r) => r.id === FILE)?.kind, lectures: rowsOf('lectures').filter((r) => r.id === FILE).length });

beforeEach(() => {
  resetTables();
  sync.queued.length = 0;
  local.files = { [FILE]: { ...fileRow } };
  local.lectures = {};
  serverWrite('files', { id: FILE, kind: 'document', title: 'Apuntes', course_id: 'c1', folder_id: null });
});

describe('turning a document into a lecture on the iPhone', () => {
  it('offline: the phone’s copy at once and a queued job; online the job does both writes', async () => {
    await convertToLecture(FILE, 'es');
    expect(local.files[FILE].kind).toBe('lecture');
    expect(local.lectures[FILE]).toMatchObject({ id: FILE, status: 'recording', language: 'es' });
    expect(sync.queued.map((o) => [o.kind, o.key])).toEqual([['convert_to_lecture', FILE]]);
    expect(server()).toEqual({ kind: 'document', lectures: 0 });

    await sync.handlers.convert_to_lecture.run(sync.queued[0].payload, ctx);
    expect(server()).toEqual({ kind: 'lecture', lectures: 1 });
    // Safe to run twice.
    await sync.handlers.convert_to_lecture.run(sync.queued[0].payload, ctx);
    expect(server()).toEqual({ kind: 'lecture', lectures: 1 });
  });

  it('a chunk upload that runs first makes sure the lecture exists and finishes the turning', async () => {
    await convertToLecture(FILE, 'es');
    await ensureLectureOnServer(FILE);
    expect(server()).toEqual({ kind: 'lecture', lectures: 1 });
  });

  it('the recording couldn’t start: put back on the phone and queued; online the server is a document again', async () => {
    const putBack = await convertToLecture(FILE, 'es');
    await sync.handlers.convert_to_lecture.run(sync.queued[0].payload, ctx);
    await putBack();
    expect(local.files[FILE].kind).toBe('document');
    expect(local.lectures[FILE]).toBeUndefined();
    expect(sync.queued.map((o) => o.kind)).toEqual(['convert_to_lecture', 'revert_to_document']);
    await sync.handlers.revert_to_document.run(sync.queued[1].payload, ctx);
    expect(server()).toEqual({ kind: 'document', lectures: 0 });
  });
});
