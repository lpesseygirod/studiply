// The iPhone's library uploads: the file shows at once from this
// device's rows and the queue sends it; sending again (the app closed just
// after it reached the server) does no harm.
import { answer, callsOn, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { saveLocalRow } from '../../lib/cache';
import { pendingFileExists, removePendingFile } from '../../lib/pendingFiles';
import { PermanentSyncError } from '../../lib/sync/queue';
import { uploadFile } from '../cloud-storage.service';
import { uploadLibraryFile } from '../library-upload.service';

type Handler = { run: (payload: unknown, ctx: { progress: (f: number) => void }) => Promise<void> };
type Queued = { kind: string; key: string; payload: Record<string, unknown> };

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../../lib/mappers', () => {
  let n = 0;
  return { newId: () => `id-${++n}` };
});
jest.mock('../../utils/toJpeg', () => ({
  toJpeg: jest.fn(async () => ({ uri: 'file:///cache/converted.jpg', mimeType: 'image/jpeg' })),
}));
jest.mock('../cloud-storage.service', () => ({
  Buckets: { audioChunks: 'audio-chunks', slides: 'slides', photos: 'photos' },
  uploadFile: jest.fn(async ({ path }: { path: string }) => ({ path: `user-1/${path}` })),
  removeFiles: jest.fn(async () => {}),
}));
jest.mock('../../lib/pendingFiles', () => ({
  keepPendingFile: jest.fn(async (dir: string, name: string) => `file:///docs/pending-uploads/${dir}/${name}`),
  pendingFileExists: jest.fn(async () => true),
  removePendingFile: jest.fn(async () => {}),
}));
jest.mock('../../lib/cache', () => ({
  ...jest.requireActual('../../lib/cache'),
  cacheUser: () => 'user-1',
  saveLocalRow: jest.fn(async () => {}),
  readRow: jest.fn(async () => null),
  markClean: jest.fn(async () => {}),
  notifyLibraryUpdated: jest.fn(),
}));
jest.mock('../../lib/sync', () => {
  const handlers: Record<string, unknown> = {};
  const queued: unknown[] = [];
  return {
    ...jest.requireActual('../../lib/sync/index.web'),
    syncEnabled: true,
    handlers,
    queued,
    registerSyncHandler: (kind: string, handler: unknown) => {
      handlers[kind] = handler;
    },
    enqueue: async (op: unknown) => {
      queued.push(op);
      return op;
    },
  };
});

const syncMock = jest.requireMock('../../lib/sync') as { handlers: Record<string, Handler>; queued: Queued[] };
const ctx = { progress: jest.fn() };
const at = new Date(2026, 9, 26, 10, 42);

beforeEach(() => {
  resetSupabaseMock();
  syncMock.queued.length = 0;
  jest.mocked(saveLocalRow).mockClear();
  jest.mocked(uploadFile).mockClear();
  jest.mocked(removePendingFile).mockClear();
  jest.mocked(pendingFileExists).mockResolvedValue(true);
});

describe('uploadLibraryFile on the iPhone', () => {
  it('saves the file and its media on the device ("Waiting to upload") and queues the upload; nothing sent yet', async () => {
    const id = await uploadLibraryFile({ courseId: 'math', folderId: null }, { uri: 'file:///camera/1.heic', name: null, mimeType: 'image/heic', sizeBytes: null }, { now: at });
    const saved = jest.mocked(saveLocalRow).mock.calls.map(([tbl, row]) => [tbl, row]);
    expect(saved[0]).toEqual(['files', expect.objectContaining({ id, kind: 'image', title: 'Photo 26 Oct 10.42.jpg', course_id: 'math', folder_id: null })]);
    expect(saved[1]).toEqual([
      'media',
      expect.objectContaining({ file_id: id, lecture_id: null, kind: 'photo', local_uri: expect.stringContaining(`pending-uploads/${id}/`) }),
    ]);
    expect(syncMock.queued).toHaveLength(1);
    expect(syncMock.queued[0]).toMatchObject({ kind: 'upload_library_file', key: id });
    expect(uploadFile).not.toHaveBeenCalled();
  });
});

describe('upload_library_file', () => {
  const payload = {
    fileId: 'f1', mediaId: 'm1', kind: 'slides', title: 'Tema 1.pdf', courseId: 'math', folderId: 'tema-a',
    uri: 'file:///docs/pending-uploads/f1/m1.pdf', contentType: 'application/pdf', ext: 'pdf', sizeBytes: 1200,
  };

  it('creates the file row (safe to repeat), uploads, writes the media row, then deletes the local copy', async () => {
    answer('media', { data: null }, { data: { id: 'm1', file_id: 'f1', updated_at: 'x' } });
    await syncMock.handlers.upload_library_file.run(payload, ctx);
    expect(callsOn('files', 'upsert')[0]).toEqual([
      { id: 'f1', kind: 'pdf', title: 'Tema 1.pdf', course_id: 'math', folder_id: 'tema-a' },
      { onConflict: 'id', ignoreDuplicates: true },
    ]);
    expect(jest.mocked(uploadFile).mock.calls[0][0]).toMatchObject({ bucket: 'slides', path: 'f1/m1.pdf', upsert: true });
    expect(callsOn('media', 'insert')[0][0]).toMatchObject({ id: 'm1', file_id: 'f1', lecture_id: null, storage_path: 'user-1/f1/m1.pdf' });
    expect(removePendingFile).toHaveBeenCalledWith(payload.uri);
  });

  it('sent again after it reached the server: no second upload, the local copy still goes', async () => {
    answer('media', { data: { id: 'm1', file_id: 'f1', updated_at: 'x' } });
    await syncMock.handlers.upload_library_file.run(payload, ctx);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(callsOn('media', 'insert')).toEqual([]);
    expect(removePendingFile).toHaveBeenCalledWith(payload.uri);
  });

  it('the local file is gone and nothing reached the server: a permanent failure (not retried forever)', async () => {
    jest.mocked(pendingFileExists).mockResolvedValue(false);
    answer('media', { data: null });
    await expect(syncMock.handlers.upload_library_file.run(payload, ctx)).rejects.toBeInstanceOf(PermanentSyncError);
  });
});
