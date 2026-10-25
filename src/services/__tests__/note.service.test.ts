// How a note edit reaches Supabase: merged block by block (src/lib/noteBlocks),
// written only if nobody wrote the note meanwhile, the losing value kept as a
// conflict version. The merge rule itself is tested in noteBlocks.test.ts.

import { LEGACY_NOTE_FORMAT, NetworkError, type LegacyNoteResult } from '../../lib/cloudRows';
import { makeEdit } from '../../lib/noteBlocks';
import { PermanentSyncError } from '../../lib/sync/queue';
import { answer, callsOn, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { applyNoteEdit, updateNote } from '../note.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../../lib/deviceId', () => ({ getDeviceId: async () => 'laptop' }));

const CREATED = '2026-10-20T09:00:00.000Z';
const T = (min: number) => new Date(Date.UTC(2026, 9, 25, 10, min)).toISOString();

function result(over: Partial<LegacyNoteResult> = {}): LegacyNoteResult {
  return {
    format: LEGACY_NOTE_FORMAT,
    title: 'Macro 1',
    summaryLevel: 'standard',
    recordingMode: 'lecture',
    summary: 'S0',
    keyConcepts: [],
    formulas: [],
    definitions: [],
    tags: [],
    unclearParts: [],
    manualAnnotations: null,
    isConfirmed: true,
    ...over,
  };
}

function row(res: LegacyNoteResult, updated_at = '2026-10-25T10:00:00.000000+00:00') {
  return { id: 'n1', user_id: 'user-1', file_id: 'l1', result: res, created_at: CREATED, updated_at };
}

const phoneEdit = (summary: string, min: number) =>
  makeEdit({ id: 'edit-1', device: 'phone', base: result(), baseCreatedAt: CREATED, updates: { summary }, now: new Date(T(min)) })!;

beforeEach(() => resetSupabaseMock());

describe('applyNoteEdit', () => {
  it('writes the merged note only if nobody wrote it since it was read', async () => {
    answer('summaries', { data: row(result()) }, { data: [row(result({ summary: 'A' }))] });
    const { row: saved, conflicts } = await applyNoteEdit('n1', phoneEdit('A', 5));

    expect(conflicts).toEqual([]);
    expect((saved.result as unknown as LegacyNoteResult).summary).toBe('A');
    const update = callsOn('summaries', 'update')[0][0] as { result: LegacyNoteResult };
    expect(update.result.summary).toBe('A');
    expect(update.result.blocks?.summary).toMatchObject({ origin: 'student', device: 'phone' });
    expect(callsOn('summaries', 'eq')).toContainEqual(['updated_at', '2026-10-25T10:00:00.000000+00:00']);
    expect(callsOn('document_versions', 'insert')).toEqual([]);
  });

  it('reads and merges again when another device wrote in between', async () => {
    const laptop = result({ formulas: ['Y = C + I'] });
    answer(
      'summaries',
      { data: row(result()) },
      { data: [] }, // compare-and-swap missed
      { data: row(laptop, '2026-10-25T10:01:00.000000+00:00') },
      { data: [row({ ...laptop, summary: 'A' })] },
    );
    await applyNoteEdit('n1', phoneEdit('A', 5));
    const updates = callsOn('summaries', 'update').map(([u]) => (u as { result: LegacyNoteResult }).result);
    expect(updates).toHaveLength(2);
    expect(updates[1]).toMatchObject({ summary: 'A', formulas: ['Y = C + I'] });
  });

  it("keeps the phone's older summary as a conflict version when the laptop's is newer", async () => {
    const laptop = result({ summary: 'B', blocks: { summary: { origin: 'student', editedAt: T(7), device: 'laptop' } } });
    answer('summaries', { data: row(laptop) });
    answer('document_versions', { data: [] }, { data: null });

    const { conflicts } = await applyNoteEdit('n1', phoneEdit('A', 5));
    expect(conflicts).toEqual([{ block: 'summary', kept: 'other' }]);
    // Nothing else changed, so the note isn't written.
    expect(callsOn('summaries', 'update')).toEqual([]);

    const [version] = callsOn('document_versions', 'insert')[0] as [Record<string, unknown>];
    expect(version).toMatchObject({ file_id: 'l1', summary_id: 'n1', reason: 'conflict' });
    expect(version.content).toMatchObject({
      summary: 'A',
      conflict: { blocks: ['summary'], side: 'this', device: 'phone', editId: 'edit-1' },
    });
  });

  it('does not store the same conflict version twice when an edit is resent', async () => {
    const laptop = result({ summary: 'B', blocks: { summary: { origin: 'student', editedAt: T(7), device: 'laptop' } } });
    answer('summaries', { data: row(laptop) });
    answer('document_versions', { data: [{ id: 'v1' }] });
    await applyNoteEdit('n1', phoneEdit('A', 5));
    expect(callsOn('document_versions', 'insert')).toEqual([]);
  });

  it('a note deleted on another device is a permanent failure', async () => {
    answer('summaries', { data: null });
    await expect(applyNoteEdit('n1', phoneEdit('A', 5))).rejects.toBeInstanceOf(PermanentSyncError);
  });

  it('a lost connection is reported as one (the queue tries again later)', async () => {
    answer('summaries', { error: { message: 'TypeError: Network request failed' } });
    await expect(applyNoteEdit('n1', phoneEdit('A', 5))).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('updateNote (web: sent at once)', () => {
  it('uses the note as the student saw it, so a change made meanwhile on another device is not overwritten silently', async () => {
    const seen = {
      id: 'n1', user_id: 'user-1', session_id: 'l1', title: 'Macro 1', summary_level: 'standard' as const,
      summary: 'S0', key_concepts: [], formulas: [], definitions: [], tags: [], unclear_parts: [],
      manual_annotations: null, is_confirmed: true, is_deleted: false, deleted_at: null,
      created_at: CREATED, updated_at: CREATED,
    };
    // The phone synced "A" (edited a minute ago) after the laptop opened the note.
    const now = new Date();
    const phone = result({ summary: 'A', blocks: { summary: { origin: 'student', editedAt: new Date(now.getTime() - 60_000).toISOString(), device: 'phone' } } });
    answer('summaries', { data: row(phone) }, { data: row(phone) }, { data: [row(result({ summary: 'B' }))] });
    answer('document_versions', { data: [] }, { data: null });

    const note = await updateNote('n1', { summary: 'B' }, seen);
    expect(note.summary).toBe('B');
    const [version] = callsOn('document_versions', 'insert')[0] as [Record<string, unknown>];
    expect(version.content).toMatchObject({ summary: 'A', conflict: { side: 'other', device: 'phone' } });
  });
});
