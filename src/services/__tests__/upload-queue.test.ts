// The iPhone's queued uploads (step 1.8): what each operation sends, and that
// sending one twice (the app closed just after it reached the server) does
// no harm. The queue's own rules are tested in src/lib/sync/__tests__.

import { answer, callsOn, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { removeFiles, uploadFile } from '../cloud-storage.service';
import { pendingFileExists, removePendingFile } from '../../lib/pendingFiles';
import { PermanentSyncError } from '../../lib/sync/queue';
import { updateSession } from '../session.service';
import { createSourceFile, queueRecording } from '../source-file.service';

type Handler = { run: (payload: unknown, ctx: { progress: (f: number) => void }) => Promise<void> };
type Queued = { kind: string; key: string; payload: unknown };

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../../lib/mappers', () => ({ newId: () => 'media-1' }));
jest.mock('../../utils/toJpeg', () => ({
  toJpeg: jest.fn(async () => ({ uri: 'file:///cache/converted.jpg', mimeType: 'image/jpeg' })),
}));
jest.mock('../cloud-storage.service', () => ({
  Buckets: { audioChunks: 'audio-chunks', slides: 'slides', photos: 'photos' },
  uploadFile: jest.fn(async ({ path }: { path: string }) => {
    jest.requireMock('../../lib/sync').order.push('upload');
    return { path: `user-1/${path}` };
  }),
  getSignedUrl: jest.fn(async () => 'https://signed'),
  removeFiles: jest.fn(async () => {}),
}));
jest.mock('../../lib/pendingFiles', () => ({
  keepPendingFile: jest.fn(async (lectureId: string, name: string) => `file:///docs/pending-uploads/${lectureId}/${name}`),
  pendingFileExists: jest.fn(async () => true),
  removePendingFile: jest.fn(async () => {
    jest.requireMock('../../lib/sync').order.push('delete local file');
  }),
}));
jest.mock('../session.service', () => ({ updateSession: jest.fn(async () => ({})) }));
// The real handlers, captured as the services register them; queued operations recorded.
jest.mock('../../lib/sync', () => {
  const handlers: Record<string, unknown> = {};
  const queued: unknown[] = [];
  return {
    ...jest.requireActual('../../lib/sync/index.web'),
    syncEnabled: true,
    handlers,
    queued,
    order: [] as string[],
    registerSyncHandler: (kind: string, handler: unknown) => {
      handlers[kind] = handler;
    },
    enqueue: async (op: unknown) => {
      queued.push(op);
      return op;
    },
  };
});

const syncMock = jest.requireMock('../../lib/sync') as {
  handlers: Record<string, Handler>;
  queued: Queued[];
  order: string[];
};
const mockHandlers = syncMock.handlers;
const mockQueued = syncMock.queued;
const mockOrder = syncMock.order;

const ctx = { progress: jest.fn() };
const chunk = { lectureId: 'l1', seq: 1, startMs: 1000, durationMs: 2000, uri: 'file:///docs/pending-uploads/l1/0001.m4a' };

beforeEach(() => {
  resetSupabaseMock();
  mockQueued.length = 0;
  mockOrder.length = 0;
  jest.mocked(uploadFile).mockClear();
  jest.mocked(removeFiles).mockClear();
  jest.mocked(removePendingFile).mockClear();
  jest.mocked(pendingFileExists).mockResolvedValue(true);
  jest.mocked(updateSession).mockClear();
});

describe('queueRecording', () => {
  it('queues the lecture as uploading, each chunk in order with its place, then transcribing', async () => {
    await queueRecording({
      sessionId: 'l1',
      chunks: [
        { uri: 'a.m4a', durationMs: 1200000 },
        { uri: 'b.m4a', durationMs: 5000 },
      ],
      durationSeconds: 1205,
    });
    expect(mockQueued.map((o) => [o.kind, o.key])).toEqual([
      ['update_lecture', 'l1'],
      ['upload_chunk', 'l1'],
      ['upload_chunk', 'l1'],
    ]);
    expect(mockQueued[0].payload).toEqual({ id: 'l1', file: {}, lecture: { status: 'uploading', duration_ms: 1205000 } });
    expect(mockQueued[1].payload).toMatchObject({ seq: 0, startMs: 0, durationMs: 1200000, uri: 'a.m4a' });
    expect(mockQueued[2].payload).toMatchObject({ seq: 1, startMs: 1200000, durationMs: 5000, uri: 'b.m4a' });
    // Queued behind the chunks, through updateSession.
    expect(updateSession).toHaveBeenCalledWith('l1', { status: 'transcribing' });
  });
});

describe('upload_chunk', () => {
  it('uploads the chunk, writes its row, and only then deletes the local file', async () => {
    answer('audio_chunks', { data: { id: 'c1', user_id: 'user-1', lecture_id: 'l1', seq: 1, storage_path: 'user-1/l1/0001.m4a', status: 'uploaded' } });
    await mockHandlers.upload_chunk.run(chunk, ctx);

    expect(jest.mocked(uploadFile).mock.calls[0][0]).toMatchObject({
      bucket: 'audio-chunks',
      path: 'l1/0001.m4a',
      uri: chunk.uri,
      upsert: true,
    });
    const [row, options] = callsOn('audio_chunks', 'upsert')[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(row).toMatchObject({ lecture_id: 'l1', seq: 1, start_ms: 1000, duration_ms: 2000, status: 'uploaded' });
    expect(options).toEqual({ onConflict: 'lecture_id,seq' });
    expect(mockOrder).toEqual(['upload', 'delete local file']);
  });

  it('sent again after the file was already uploaded and deleted: nothing more to do', async () => {
    jest.mocked(pendingFileExists).mockResolvedValue(false);
    answer('audio_chunks', { data: { id: 'c1' } });
    await mockHandlers.upload_chunk.run(chunk, ctx);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('a chunk whose file is gone and never reached the server fails for good', async () => {
    jest.mocked(pendingFileExists).mockResolvedValue(false);
    answer('audio_chunks', { data: null });
    await expect(mockHandlers.upload_chunk.run(chunk, ctx)).rejects.toBeInstanceOf(PermanentSyncError);
  });

  it('keeps the local file when the row could not be written', async () => {
    answer('audio_chunks', { error: { message: 'TypeError: Network request failed' } });
    await expect(mockHandlers.upload_chunk.run(chunk, ctx)).rejects.toThrow();
    expect(removePendingFile).not.toHaveBeenCalled();
  });
});

describe('photos and PDFs on the iPhone', () => {
  it('adding a photo keeps it on the phone and queues it (no upload yet)', async () => {
    const file = await createSourceFile({ userId: 'user-1', sessionId: 'l1', fileType: 'photo', filePath: 'file:///cache/pick.heic' });
    expect(uploadFile).not.toHaveBeenCalled();
    expect(file.file_path).toBe('file:///docs/pending-uploads/l1/media-1.jpg');
    expect(file.is_uploaded).toBe(false);
    expect(mockQueued).toEqual([
      {
        kind: 'upload_media',
        key: 'l1',
        payload: expect.objectContaining({ id: 'media-1', lectureId: 'l1', kind: 'photo', ext: 'jpg', contentType: 'image/jpeg' }),
      },
    ]);
  });

  const media = { id: 'media-1', lectureId: 'l1', kind: 'slides', uri: 'file:///docs/pending-uploads/l1/media-1.pdf', contentType: 'application/pdf', ext: 'pdf', sizeBytes: 900, caption: 'Tema 1.pdf' };

  it('upload_media uploads, inserts the row with the id made on the phone, then deletes the local file', async () => {
    answer('media', { data: null }, { data: { id: 'media-1' } });
    await mockHandlers.upload_media.run(media, ctx);
    expect(jest.mocked(uploadFile).mock.calls[0][0]).toMatchObject({ bucket: 'slides', path: 'l1/media-1.pdf', upsert: true });
    expect(callsOn('media', 'insert')[0][0]).toMatchObject({ id: 'media-1', lecture_id: 'l1', kind: 'slides', caption: 'Tema 1.pdf' });
    expect(mockOrder).toEqual(['upload', 'delete local file']);
  });

  it('sent again after the row exists: no second upload or row', async () => {
    answer('media', { data: { id: 'media-1' } });
    await mockHandlers.upload_media.run(media, ctx);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(callsOn('media', 'insert')).toEqual([]);
  });

  it('a row the database refuses removes the uploaded file again', async () => {
    answer('media', { data: null }, { error: { code: '23503', message: 'lecture is gone' } });
    await expect(mockHandlers.upload_media.run(media, ctx)).rejects.toBeInstanceOf(PermanentSyncError);
    expect(removeFiles).toHaveBeenCalledWith('slides', ['user-1/l1/media-1.pdf']);
  });
});
