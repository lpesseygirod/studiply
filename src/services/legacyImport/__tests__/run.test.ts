// Step 1.9: sending the earlier version's data. Safe to repeat, resumable,
// files missing on the iPhone listed, and "already uploaded" remembered per
// server and account so a local test upload never blocks the real one.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { reportReachable, resetConnectivityForTests } from '../../../lib/connectivity';
import { answer, callsOn, chains, resetSupabaseMock } from '../../../test-utils/supabaseMock';
import { toJpeg } from '../../../utils/toJpeg';
import { uploadFile } from '../../cloud-storage.service';
import { findLegacyFile, type LegacySource } from '../legacyDb';
import { planImport, type LegacySnapshot } from '../plan';
import {
  conflictingRecord,
  ImportBlockedError,
  readRecords,
  recordKey,
  runImport,
  sendPlan,
  verifyPlan,
  type ImportRecord,
} from '../run';

jest.mock('../../../lib/supabase', () => jest.requireActual('../../../test-utils/supabaseMock').module);
jest.mock('../../cloud-storage.service', () => ({
  Buckets: { audioChunks: 'audio-chunks', slides: 'slides', photos: 'photos' },
  uploadFile: jest.fn(async ({ bucket, path }: { bucket: string; path: string }) => ({ path: `uid/${path}`, bucket })),
}));
jest.mock('../../../utils/toJpeg', () => ({
  toJpeg: jest.fn(async (uri: string) => ({ uri: `${uri}.jpg`, mimeType: 'image/jpeg' })),
}));
jest.mock('../legacyDb', () => ({
  findLegacyFile: jest.fn(async (_s: unknown, f: { storagePath: string | null; filePath: string }) =>
    f.filePath.includes('gone') ? null : `file:///docs/source-files/${f.storagePath ?? 'picked'}`),
}));

const T = '2025-03-01T09:00:00.000Z';
const snapshot: LegacySnapshot = {
  profiles: [{ id: 'me', username: 'Lea', display_name: null, created_at: T }],
  projects: [{ id: 'c1', user_id: 'me', name: 'Psico', color: '#6C63FF', icon: 'folder', sort_order: 0, is_archived: 0, is_deleted: 0, deleted_at: null, created_at: T, updated_at: T }],
  folders: [
    { id: 'f2', user_id: 'me', project_id: 'c1', parent_folder_id: 'f1', name: 'Sub', sort_order: 0, is_deleted: 0, deleted_at: null, created_at: T, updated_at: T },
    { id: 'f1', user_id: 'me', project_id: 'c1', parent_folder_id: null, name: 'Tema 1', sort_order: 0, is_deleted: 0, deleted_at: null, created_at: T, updated_at: T },
  ],
  sessions: [{ id: 'l1', user_id: 'me', project_id: 'c1', folder_id: 'f2', title: 'Clase', recording_mode: 'lecture', language: 'es', status: 'completed', duration_seconds: 600, is_deleted: 0, deleted_at: null, created_at: T, updated_at: T }],
  sourceFiles: [
    { id: 'a0', session_id: 'l1', user_id: 'me', file_type: 'audio', file_path: 'file:///cache/a0.m4a', file_size_bytes: 1, mime_type: 'audio/m4a', retention_policy: 'keep_permanently', is_deleted: 0, storage_path: 'me/l1/a0.m4a', created_at: T },
    { id: 'p1', session_id: 'l1', user_id: 'me', file_type: 'photo', file_path: 'file:///cache/p1.heic', file_size_bytes: 9, mime_type: 'image/jpeg', retention_policy: 'keep_permanently', is_deleted: 0, storage_path: null, created_at: T },
    { id: 'p2', session_id: 'l1', user_id: 'me', file_type: 'photo', file_path: 'file:///cache/gone.jpg', file_size_bytes: 9, mime_type: 'image/jpeg', retention_policy: 'keep_permanently', is_deleted: 0, storage_path: null, created_at: T },
  ],
  transcripts: [{ id: 't1', session_id: 'l1', language: 'es', full_text: 'Hola', segments: '[{"start":0,"end":1,"text":"Hola"}]', confidence_score: 0.9, created_at: T }],
  notes: [{ id: 'n1', session_id: 'l1', user_id: 'me', title: 'N', summary_level: 'standard', summary: 'S', key_concepts: '[]', formulas: '[]', definitions: '[]', tags: '[]', unclear_parts: '[]', manual_annotations: null, is_confirmed: 1, is_deleted: 0, created_at: T, updated_at: T }],
};
const plan = planImport(snapshot, { profileIds: ['me'], now: new Date('2025-03-10T00:00:00Z') });
const real: LegacySource = { dbName: 'studiply.db', filesRoot: 'file:///docs/source-files/', sample: false };
const sample: LegacySource = { dbName: 'studiply-sample.db', filesRoot: 'file:///docs/legacy-sample/source-files/', sample: true };
const LOCAL = 'http://192.168.1.41:54321';
const REMOTE = 'https://xmymneartjmdsawlwzyl.supabase.co';

/** The writes in the order they happened, e.g. "folders:upsert". */
const writes = () =>
  chains.map((c) => `${c.table}:${c.calls[0]?.[0]}`).filter((w) => /:(upsert|insert)$/.test(w));

beforeEach(async () => {
  resetSupabaseMock();
  resetConnectivityForTests();
  reportReachable();
  jest.mocked(uploadFile).mockClear();
  jest.mocked(toJpeg).mockClear();
  jest.mocked(findLegacyFile).mockClear();
  await AsyncStorage.clear();
});

describe('sendPlan', () => {
  it('sends parents first, every row by its old id with ignoreDuplicates', async () => {
    await sendPlan(plan, real);
    expect(writes()).toEqual([
      'courses:upsert', 'folders:upsert', 'folders:upsert', 'files:upsert', 'lectures:upsert', 'summaries:upsert',
      'transcript_segments:insert', 'audio_chunks:upsert', 'media:upsert',
    ]);
    expect(callsOn('folders', 'upsert').map(([rows]) => (rows as { id: string }[])[0].id)).toEqual(['f1', 'f2']);
    expect(callsOn('courses', 'upsert')[0][1]).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    expect(callsOn('audio_chunks', 'upsert')[0][0]).toMatchObject({ lecture_id: 'l1', seq: 0, storage_path: 'uid/l1/0000.m4a', status: 'transcribed' });
  });

  it('photos go through toJpeg; a file no longer on the iPhone is listed and gets no row', async () => {
    const { missing } = await sendPlan(plan, real);
    expect(toJpeg).toHaveBeenCalledWith('file:///docs/source-files/picked');
    expect(jest.mocked(uploadFile).mock.calls.map(([o]) => [o.bucket, o.path])).toEqual([
      ['audio-chunks', 'l1/0000.m4a'],
      ['photos', 'l1/p1.jpg'],
    ]);
    expect(missing).toEqual([{ kind: 'photo', lectureId: 'l1', id: 'p2' }]);
    expect(callsOn('media', 'upsert').map(([row]) => (row as { id: string }).id)).toEqual(['p1']);
  });

  it('sent again: nothing is uploaded twice and no second transcript is added', async () => {
    answer('transcript_segments', { data: [{ id: 's' }] });
    answer('audio_chunks', { data: [{ lecture_id: 'l1', seq: 0 }] });
    answer('media', { data: [{ id: 'p1' }, { id: 'p2' }] });
    await sendPlan(plan, real);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(callsOn('transcript_segments', 'insert')).toEqual([]);
    // Rows are sent again, but ignoreDuplicates leaves existing ones alone.
    expect(callsOn('files', 'upsert')[0][1]).toEqual({ onConflict: 'id', ignoreDuplicates: true });
  });

  it('a failure stops it; running it again continues with what is left', async () => {
    jest.mocked(uploadFile).mockRejectedValueOnce(Object.assign(new Error('Could not upload.'), { status: 503 }));
    await expect(sendPlan(plan, real)).rejects.toThrow('Could not upload.');

    resetSupabaseMock();
    answer('transcript_segments', { data: [{ id: 's' }] });
    jest.mocked(uploadFile).mockClear();
    await sendPlan(plan, real);
    expect(jest.mocked(uploadFile).mock.calls.map(([o]) => o.path)).toEqual(['l1/0000.m4a', 'l1/p1.jpg']);
    expect(callsOn('transcript_segments', 'insert')).toEqual([]);
  });
});

describe('sendPlan: old course uploads (step 3.4)', () => {
  const uploads: LegacySnapshot = {
    ...snapshot,
    sessions: [{ ...snapshot.sessions[0], id: 'pf', folder_id: null, title: 'Project Files', duration_seconds: null }],
    sourceFiles: [
      { id: 'u1', session_id: 'pf', user_id: 'me', file_type: 'photo', file_path: 'file:///cache/u1.jpg', file_size_bytes: 9, mime_type: 'image/jpeg', retention_policy: 'keep_permanently', is_deleted: 0, storage_path: null, created_at: T },
    ],
    transcripts: [],
    notes: [],
  };
  const uploadsPlan = planImport(uploads, { profileIds: ['me'], now: new Date('2025-03-10T00:00:00Z') });

  it('the file row first, then its photo under {fileId}/ with file_id set and no lecture', async () => {
    await sendPlan(uploadsPlan, real);
    expect(writes()).toEqual(['courses:upsert', 'folders:upsert', 'folders:upsert', 'files:upsert', 'media:upsert']);
    expect((callsOn('files', 'upsert')[0][0] as { id: string; kind: string }[]).map((f) => [f.id, f.kind])).toEqual([['u1', 'image']]);
    expect(jest.mocked(uploadFile).mock.calls.map(([o]) => [o.bucket, o.path])).toEqual([['photos', 'u1/u1.jpg']]);
    expect(callsOn('media', 'upsert')[0][0]).toMatchObject({ id: 'u1', lecture_id: null, file_id: 'u1', kind: 'photo', caption: 'Photo 1.jpg' });
  });
});

describe('verifyPlan', () => {
  it('verified when the server has every row and file the iPhone had', async () => {
    answer('courses', { data: [{ id: 'c1' }] });
    answer('folders', { data: [{ id: 'f1' }, { id: 'f2' }] });
    answer('files', { data: [{ id: 'l1' }] });
    answer('lectures', { data: [{ id: 'l1' }] });
    answer('summaries', { data: [{ id: 'n1' }] });
    answer('media', { data: [{ id: 'p1' }] });
    answer('audio_chunks', { data: [{ lecture_id: 'l1', seq: 0 }] });
    answer('transcript_segments', { data: [{ id: 's' }] });
    const result = await verifyPlan(plan, [{ kind: 'photo', lectureId: 'l1', id: 'p2' }]);
    expect(result).toEqual({ verified: true, notOnServer: {} });
  });

  it('not verified while something is missing on the server', async () => {
    answer('courses', { data: [{ id: 'c1' }] });
    answer('folders', { data: [{ id: 'f1' }] });
    const result = await verifyPlan(plan, []);
    expect(result.verified).toBe(false);
    expect(result.notOnServer).toMatchObject({ folders: 1, files: 1, summaries: 1, media: 2, audio_chunks: 1 });
  });
});

describe('"already uploaded": per server and account', () => {
  const record = (over: Partial<ImportRecord>): ImportRecord => ({
    url: LOCAL, uid: 'local-uid', dataset: 'real', profileIds: ['me'], status: 'verified',
    uploadedAt: T, verifiedAt: T, missing: [], ...over,
  });

  it('an upload to local Supabase never blocks the real one to the remote project', () => {
    const records = { [recordKey(LOCAL, 'local-uid', 'real')]: record({}) };
    expect(conflictingRecord(records, { url: REMOTE, uid: 'remote-uid', dataset: 'real', profileIds: ['me'] })).toBeNull();
  });

  it('the same data to another account on the same server is refused', () => {
    const records = { [recordKey(LOCAL, 'local-uid', 'real')]: record({}) };
    expect(conflictingRecord(records, { url: LOCAL, uid: 'other', dataset: 'real', profileIds: ['me'] })).not.toBeNull();
    // Other profiles, or the development sample, are separate.
    expect(conflictingRecord(records, { url: LOCAL, uid: 'other', dataset: 'real', profileIds: ['someone'] })).toBeNull();
    expect(conflictingRecord(records, { url: LOCAL, uid: 'other', dataset: 'sample', profileIds: ['me'] })).toBeNull();
  });

  it('runImport records the upload under its server, account and data set, and refuses a conflict', async () => {
    const result = await runImport({ plan, source: sample, url: LOCAL, uid: 'local-uid', profileIds: ['me'] });
    expect(result.dataset).toBe('sample');
    const records = await readRecords();
    expect(Object.keys(records)).toEqual([recordKey(LOCAL, 'local-uid', 'sample')]);

    await expect(runImport({ plan, source: sample, url: LOCAL, uid: 'someone-else', profileIds: ['me'] })).rejects.toBeInstanceOf(ImportBlockedError);
    // The real data to the remote project is not affected by the sample test upload.
    await expect(runImport({ plan, source: real, url: REMOTE, uid: 'remote-uid', profileIds: ['me'] })).resolves.toMatchObject({ url: REMOTE, dataset: 'real' });
  });
});
