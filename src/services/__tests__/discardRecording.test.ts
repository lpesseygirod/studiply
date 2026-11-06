// Cancel recording (Lea, 6 Nov): the server half of Discard and the notes. What is deleted, in which
// order (segments before chunks, files last), what stays (a new lecture's audio that reached Studiply
// before Discard; an earlier recording's audio), the notes saved as a version first, the iPhone's copy
// and queue. Nothing here touches summaries or calls a function.
import { answer, chains, callsOn, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { removeFiles } from '../cloud-storage.service';
import { openDocument, saveDocument, saveVersion } from '../document.service';
import { writeRevert } from '../lecture-conversion.service';
import { momentTarget } from '../moment-placement';
import { restoreItem } from '../trash.service';
import { dropRows, readRow, saveLocalRow } from '../../lib/cache';
import { discardSync, enqueue, pendingSyncFor, registerSyncHandler } from '../../lib/sync';
import { BEFORE_DISCARD_VERSION, cleanUpLate, discardOnServer, discardRecording, undoDiscard } from '../discard-recording.service';
import type { DiscardPlan } from '../recording-flow';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../cloud-storage.service', () => ({
  Buckets: { audioChunks: 'audio-chunks', slides: 'slides', photos: 'photos' },
  removeFiles: jest.fn(async () => {}),
}));
jest.mock('../document.service', () => ({ openDocument: jest.fn(), saveDocument: jest.fn(async () => ({})), saveVersion: jest.fn(async () => 'v1') }));
jest.mock('../lecture-conversion.service', () => ({ writeRevert: jest.fn(async () => {}) }));
jest.mock('../moment-placement', () => ({ momentTarget: jest.fn(() => null) }));
jest.mock('../note-lines.service', () => ({ forgetLectureKind: jest.fn() }));
jest.mock('../trash.service', () => ({ restoreItem: jest.fn(async () => {}) }));
jest.mock('../../lib/cache', () => ({ dropRows: jest.fn(async () => {}), notifyLibraryUpdated: jest.fn(), readRow: jest.fn(), saveLocalRow: jest.fn(async () => {}) }));
const mockSync = { enabled: false };
jest.mock('../../lib/sync', () => ({
  get syncEnabled() {
    return mockSync.enabled;
  },
  discardSync: jest.fn(async () => {}),
  enqueue: jest.fn(async () => ({})),
  pendingSyncFor: jest.fn(async () => []),
  registerSyncHandler: jest.fn(),
}));

const L = 'lecture-1';
const plan = (over: Partial<DiscardPlan> = {}): DiscardPlan => ({
  lectureId: L,
  origin: 'new',
  from: { seq: 0, ms: 0 },
  toSeq: 3,
  keepBelow: 2,
  keptMs: 60_000,
  before: null,
  ...over,
});
const steps = () => chains.map((c) => `${c.table}.${c.calls[0]?.[0]}`);
// The discard_recording handler, as registered at import.
const handler = jest.mocked(registerSyncHandler).mock.calls.find(([kind]) => kind === 'discard_recording')![1] as { run: (p: DiscardPlan) => Promise<void> };

const notes = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Antes' }] },
    { type: 'paragraph', content: [{ type: 'timestampChip', attrs: { ms: 130_000 } }, { type: 'text', text: ' Durante ' }, { type: 'markChip', attrs: { kind: 'exam', level: 9, markId: 'm1', ms: 131_000, note: null } }] },
  ],
};

beforeEach(() => {
  resetSupabaseMock();
  jest.clearAllMocks();
  mockSync.enabled = false;
  jest.mocked(momentTarget).mockReturnValue(null);
});

describe('the server half (the laptop: at once)', () => {
  it('a new lecture: only the chunks that landed after Discard go (segments, rows, then files), then it goes to Recently Deleted', async () => {
    answer('audio_chunks', { data: [{ id: 'c2', storage_path: 'u1/lecture-1/0002.webm' }] });
    await discardRecording(plan());
    expect(steps()).toEqual(['audio_chunks.select', 'transcript_segments.delete', 'audio_chunks.delete', 'files.update']);
    expect(callsOn('audio_chunks', 'gte')[0]).toEqual(['seq', 2]);
    expect(callsOn('transcript_segments', 'in')[0]).toEqual(['chunk_id', ['c2']]);
    expect(jest.mocked(removeFiles)).toHaveBeenCalledWith('audio-chunks', ['u1/lecture-1/0002.webm']);
    expect((callsOn('files', 'update')[0][0] as { deleted_at: string }).deleted_at).toEqual(expect.any(String));
    // Its notes are left as they are (they go to Recently Deleted with it).
    expect(openDocument).not.toHaveBeenCalled();
    expect(chains.some((c) => c.table === 'summaries')).toBe(false);
  });

  it('a lecture recorded again: its notes saved as a version, then unstamped from the recording’s start; only that recording’s audio and transcript', async () => {
    jest.mocked(openDocument).mockResolvedValue({ id: 'd1', content: notes } as never);
    answer('audio_chunks', { data: [{ id: 'c4', storage_path: 'p4' }, { id: 'c5', storage_path: null }] });
    await discardRecording(plan({ origin: 'lecture', from: { seq: 4, ms: 121_000 }, before: 'completed' }));
    expect(saveVersion).toHaveBeenCalledWith(L, 'notes', notes, 'session_end', BEFORE_DISCARD_VERSION);
    const saved = jest.mocked(saveDocument).mock.calls[0][0];
    expect(saved.base).toBe(notes);
    expect(JSON.stringify(saved.next)).toBe(
      JSON.stringify({
        type: 'doc',
        content: [notes.content[0], { type: 'paragraph', content: [{ type: 'text', text: 'Durante ' }, { type: 'text', text: 'Exam 9/10' }] }],
      }),
    );
    expect(jest.mocked(saveVersion).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(saveDocument).mock.invocationCallOrder[0]);
    expect(steps()).toEqual(['audio_chunks.select', 'transcript_segments.delete', 'transcript_segments.delete', 'audio_chunks.delete']);
    expect(callsOn('audio_chunks', 'gte')[0]).toEqual(['seq', 4]);
    expect(callsOn('transcript_segments', 'gte')[0]).toEqual(['start_ms', 121_000]);
    expect(jest.mocked(removeFiles)).toHaveBeenCalledWith('audio-chunks', ['p4']);
    // The lecture stays (no trash, no revert).
    expect(chains.some((c) => c.table === 'files')).toBe(false);
    expect(writeRevert).not.toHaveBeenCalled();
  });

  it('a document that became a lecture: all its audio, its photos kept by the document, then a document again', async () => {
    jest.mocked(openDocument).mockResolvedValue({ id: 'd1', content: notes } as never);
    answer('audio_chunks', { data: [{ id: 'c0', storage_path: 'p0' }] });
    await discardRecording(plan({ origin: 'document', from: { seq: 0, ms: 0 } }));
    expect(steps()).toEqual(['audio_chunks.select', 'transcript_segments.delete', 'transcript_segments.delete', 'audio_chunks.delete', 'media.update']);
    expect(callsOn('media', 'update')[0]).toEqual([{ lecture_id: null, file_id: L }]);
    expect(writeRevert).toHaveBeenCalledWith({ fileId: L }, expect.any(Function));
    expect(jest.mocked(removeFiles).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(writeRevert).mock.invocationCallOrder[0]);
  });

  it('My notes open in an editor here: the editor takes the stamps off (and saves); the version is saved first', async () => {
    jest.mocked(openDocument).mockResolvedValue({ id: 'd1', content: notes } as never);
    const unstamp = jest.fn();
    jest.mocked(momentTarget).mockReturnValue({ place: jest.fn(), unstamp });
    await discardRecording(plan({ origin: 'lecture', from: { seq: 4, ms: 121_000 } }));
    expect(unstamp).toHaveBeenCalledWith(121_000);
    expect(saveDocument).not.toHaveBeenCalled();
    expect(saveVersion).toHaveBeenCalled();
  });

  it('a chunk that landed after Discard: the same range removed again', async () => {
    answer('audio_chunks', { data: [{ id: 'c2', storage_path: 'p2' }] });
    await cleanUpLate(plan());
    expect(callsOn('audio_chunks', 'gte')[0]).toEqual(['seq', 2]);
    expect(steps()).toEqual(['audio_chunks.select', 'transcript_segments.delete', 'audio_chunks.delete']);
    resetSupabaseMock();
    await cleanUpLate(plan({ origin: 'document' }));
    expect(callsOn('audio_chunks', 'gte')[0]).toEqual(['seq', 0]);
  });

  it('safe to run twice: nothing left, nothing deleted', async () => {
    await discardOnServer(plan({ origin: 'lecture', from: { seq: 4, ms: 121_000 } }));
    expect(steps()).toEqual(['audio_chunks.select', 'transcript_segments.delete']);
    expect(jest.mocked(removeFiles)).toHaveBeenCalledWith('audio-chunks', []);
  });

  it('Undo of a new lecture’s Discard: out of Recently Deleted', async () => {
    await undoDiscard(L);
    expect(restoreItem).toHaveBeenCalledWith({ id: L, type: 'session' });
  });
});

describe('the iPhone: its copy now, the server half queued', () => {
  beforeEach(() => {
    mockSync.enabled = true;
    jest.mocked(readRow).mockResolvedValue({ id: L, kind: 'lecture', deleted_at: null, updated_at: 'x' } as never);
  });

  it('a new lecture leaves the library on this iPhone; discard_recording queued under the lecture (after its creation)', async () => {
    await discardRecording(plan());
    expect(jest.mocked(saveLocalRow).mock.calls[0]).toEqual(['files', expect.objectContaining({ id: L, deleted_at: expect.any(String) })]);
    expect(enqueue).toHaveBeenCalledWith({ kind: 'discard_recording', key: L, payload: plan() });
    expect(chains).toEqual([]);
  });

  it('a document again on this iPhone (its lecture row dropped)', async () => {
    jest.mocked(openDocument).mockResolvedValue({ id: 'd1', content: { type: 'doc', content: [] } } as never);
    await discardRecording(plan({ origin: 'document' }));
    expect(jest.mocked(saveLocalRow).mock.calls[0]).toEqual(['files', expect.objectContaining({ kind: 'document' })]);
    expect(dropRows).toHaveBeenCalledWith('lectures', [L]);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'discard_recording', key: L }));
  });

  it('the queued job does the server half', async () => {
    answer('audio_chunks', { data: [] });
    await handler.run(plan());
    expect(steps()).toEqual(['audio_chunks.select', 'files.update']);
  });

  it('Undo while the job still waits: the job is dropped and the lecture is back on this iPhone', async () => {
    jest.mocked(pendingSyncFor).mockResolvedValue([{ id: 'op-9', kind: 'discard_recording', status: 'pending' } as never]);
    await undoDiscard(L);
    expect(discardSync).toHaveBeenCalledWith('op-9');
    expect(jest.mocked(saveLocalRow).mock.calls[0]).toEqual(['files', expect.objectContaining({ deleted_at: null })]);
    expect(restoreItem).not.toHaveBeenCalled();
  });
});
