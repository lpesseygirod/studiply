// A lecture recorded offline on the iPhone, sent when the connection is back
// (Lea's test 3): the lecture's rows must exist on the server before
// its recording chunk, photo or changes, even if its own create step went
// missing, and nothing may delete it. The handlers are the real ones, as the
// services register them; Supabase and the files are fakes.

import { answer, chains, callsOn, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { uploadFile } from '../cloud-storage.service';
import { PermanentSyncError, SyncHttpError } from '../../lib/sync/queue';
import '../session.service';
import '../source-file.service';

type Handler = { run: (payload: unknown, ctx: { progress: (f: number) => void }) => Promise<void> };

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../cloud-storage.service', () => ({
  Buckets: { audioChunks: 'audio-chunks', slides: 'slides', photos: 'photos' },
  uploadFile: jest.fn(async ({ path }: { path: string }) => ({ path: `user-1/${path}` })),
  getSignedUrl: jest.fn(async () => 'https://signed'),
  removeFiles: jest.fn(async () => {}),
}));
jest.mock('../../lib/pendingFiles', () => ({
  keepPendingFile: jest.fn(async (_l: string, _n: string, uri: string) => uri),
  pendingFileExists: jest.fn(async () => true),
  removePendingFile: jest.fn(async () => {
    jest.requireActual('../../test-utils/supabaseMock').chains.push({ table: 'local file', calls: [['delete']] });
  }),
}));
// The iPhone's copy of the lecture, as saved when it was started offline.
jest.mock('../../lib/cache', () => {
  const local: Record<string, Record<string, unknown>> = { files: {}, lectures: {} };
  return {
    ...jest.requireActual('../../lib/cache'),
    local,
    readRow: jest.fn(async (tbl: string, id: string) => local[tbl]?.[id] ?? null),
  };
});
jest.mock('../../lib/sync', () => {
  const handlers: Record<string, unknown> = {};
  return {
    ...jest.requireActual('../../lib/sync/index.web'),
    syncEnabled: true,
    handlers,
    registerSyncHandler: (kind: string, handler: unknown) => {
      handlers[kind] = handler;
    },
    pendingSyncFor: async () => [],
  };
});

const handlers = (jest.requireMock('../../lib/sync') as { handlers: Record<string, Handler> }).handlers;
const local = (jest.requireMock('../../lib/cache') as { local: Record<string, Record<string, unknown>> }).local;
const ctx = { progress: () => {} };

const ID = '45272a12-1d1f-4461-9f94-0c75b3481cdf';
const T = '2026-10-25T11:20:00.000Z';
const file = { id: ID, user_id: 'user-1', kind: 'lecture', title: 'Test 5', course_id: 'c1', folder_id: null, sort_order: 0, starred_at: null, last_opened_at: null, deleted_at: null, created_at: T, updated_at: T };
const lecture = { id: ID, user_id: 'user-1', lecture_number: null, recorded_at: T, duration_ms: 31000, language: null, status: 'transcribing', transcript_quality: null, avg_confidence: null, audio_retention: 'delete_3_days', audio_delete_after: null, created_at: T, updated_at: T };
const chunk = { lectureId: ID, seq: 0, startMs: 0, durationMs: 31000, uri: `file:///docs/pending-uploads/${ID}/0000.m4a` };

/** Writes in the order they happened: "files:upsert", "lectures:upsert", … */
function writes(): string[] {
  return chains
    .map((c) => `${c.table}:${c.calls[0]?.[0]}`)
    .filter((w) => /:(upsert|insert|update|delete)$/.test(w));
}

beforeEach(() => {
  resetSupabaseMock();
  jest.mocked(uploadFile).mockClear();
  local.files = { [ID]: file };
  local.lectures = { [ID]: lecture };
});

describe('lecture created offline → back online', () => {
  it('creates the lecture, then the chunk upload succeeds', async () => {
    // create_lecture
    answer('files', {}, { data: { ...file, lectures: lecture } });
    answer('lectures', {});
    await handlers.create_lecture.run(
      { file: { ...file }, lecture: { id: ID, language: null, status: 'recording', recorded_at: T } },
      ctx,
    );
    // upload_chunk: the lecture is there now.
    answer('lectures', { data: { id: ID } });
    answer('audio_chunks', {});
    await handlers.upload_chunk.run(chunk, ctx);

    expect(writes()).toEqual(['files:upsert', 'lectures:upsert', 'audio_chunks:upsert', 'local file:delete']);
    expect(jest.mocked(uploadFile).mock.calls[0][0]).toMatchObject({ bucket: 'audio-chunks', path: `${ID}/0000.m4a` });
    // The iPhone's latest copy is sent: status and length from after Stop.
    expect(callsOn('lectures', 'upsert')[0][0]).toMatchObject({ id: ID, status: 'transcribing', duration_ms: 31000 });
  });

  it("the create step went missing (Lea's test 3): the chunk creates the lecture first, without losing the audio", async () => {
    answer('lectures', { data: null }, {}); // not on the server; then the upsert
    answer('files', {});
    answer('audio_chunks', {});
    await handlers.upload_chunk.run(chunk, ctx);

    expect(writes()).toEqual(['files:upsert', 'lectures:upsert', 'audio_chunks:upsert', 'local file:delete']);
    expect(callsOn('files', 'upsert')[0]).toEqual([
      { id: ID, kind: 'lecture', title: 'Test 5', course_id: 'c1', folder_id: null },
      { onConflict: 'id', ignoreDuplicates: true },
    ]);
  });

  it('a photo and a change for that lecture also create it first', async () => {
    answer('lectures', { data: null }, {}, { data: [{ id: ID }] });
    answer('files', {});
    await handlers.update_lecture.run({ id: ID, file: {}, lecture: { status: 'transcribing' } }, ctx);
    expect(writes()).toEqual(['files:upsert', 'lectures:upsert', 'lectures:update']);

    resetSupabaseMock();
    answer('lectures', { data: null }, {});
    answer('files', {});
    answer('media', { data: null }, { data: { id: 'm1' } });
    await handlers.upload_media.run(
      { id: 'm1', lectureId: ID, kind: 'photo', uri: 'file:///p.jpg', contentType: 'image/jpeg', ext: 'jpg', sizeBytes: null, caption: null },
      ctx,
    );
    expect(writes()).toEqual(['files:upsert', 'lectures:upsert', 'media:insert', 'local file:delete']);
  });

  it('two create steps at the same moment: the refused one finds the lecture there and deletes nothing', async () => {
    answer('files', {}, { data: { ...file, lectures: lecture } });
    answer(
      'lectures',
      { error: { code: '23505', message: 'duplicate key value violates unique constraint "lectures_pkey"' } },
      { data: { id: ID } },
    );
    await handlers.create_lecture.run({ file, lecture }, ctx);
    expect(callsOn('files', 'delete')).toEqual([]);
  });

  it("a change that updates no row isn't counted as sent", async () => {
    answer('lectures', { data: { id: ID } }, { data: [] });
    await expect(handlers.update_lecture.run({ id: ID, file: {}, lecture: { status: 'ready' } }, ctx)).rejects.toBeInstanceOf(SyncHttpError);
  });

  it("the server's error is kept for the logs, not only the sentence", async () => {
    answer('lectures', { data: { id: ID } });
    answer('audio_chunks', {
      error: { code: '23503', message: 'insert or update on table "audio_chunks" violates foreign key constraint' },
    });
    const err = await handlers.upload_chunk.run(chunk, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermanentSyncError);
    expect((err as PermanentSyncError).detail).toMatch(/^23503 insert or update on table "audio_chunks"/);
    // The audio stays on the phone.
    expect(writes()).not.toContain('local file:delete');
  });

  it('a lecture neither on the phone nor on the server fails for good, with a clear reason', async () => {
    local.files = {};
    answer('lectures', { data: null });
    await expect(handlers.upload_chunk.run(chunk, ctx)).rejects.toThrow('no longer on this iPhone or on Studiply');
  });
});
