// What session.service sends to Supabase: a lecture is a files row plus a
// lectures row with the same id.
import { answer, callsOn, chains, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { createSession, moveSession, updateSession } from '../session.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);

const T = '2026-10-24T10:00:00.000Z';
const file = {
  id: 'l1',
  user_id: 'user-1',
  course_id: 'c1',
  folder_id: null,
  kind: 'lecture',
  title: 'Week 3',
  sort_order: 0,
  starred_at: null,
  last_opened_at: null,
  deleted_at: null,
  created_at: T,
  updated_at: T,
};
const lecture = { id: 'l1', user_id: 'user-1', language: null, status: 'recording', duration_ms: null };

beforeEach(() => {
  resetSupabaseMock();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('createSession', () => {
  it('creates the file, then its lecture with the same id', async () => {
    answer('files', { data: file });
    answer('lectures', { data: lecture });

    const session = await createSession({
      userId: 'user-1',
      title: '  Week 3 ',
      projectId: 'c1',
      recordingMode: 'discussion',
      language: 'auto',
    });

    expect(callsOn('files', 'insert')[0][0]).toEqual({ kind: 'lecture', title: 'Week 3', course_id: 'c1', folder_id: null });
    expect(callsOn('lectures', 'insert')[0][0]).toMatchObject({ id: 'l1', language: null, status: 'recording' });
    expect(session).toMatchObject({ id: 'l1', status: 'recording', recording_mode: 'discussion', language: 'auto' });
  });

  it('removes the file again when the lecture cannot be created', async () => {
    answer('files', { data: file }, { data: null });
    answer('lectures', { error: { code: '23514', message: 'bad language' } });

    await expect(
      createSession({ userId: 'user-1', title: 'Week 3', recordingMode: 'lecture', language: 'English' }),
    ).rejects.toThrow('Could not start the recording.');
    expect(callsOn('files', 'delete')).toHaveLength(1);
    expect(callsOn('files', 'eq')).toContainEqual(['id', 'l1']);
  });
});

describe('updateSession', () => {
  it('sends title to the file and status and duration to the lecture', async () => {
    answer('files', { data: null }, { data: { ...file, lectures: lecture, summaries: [] } });
    answer('lectures', { data: null });

    await updateSession('l1', { title: 'Week 4', status: 'completed', duration_seconds: 61.6 });

    expect(callsOn('files', 'update')[0][0]).toEqual({ title: 'Week 4', course_id: undefined, folder_id: undefined });
    expect(callsOn('lectures', 'update')[0][0]).toEqual({ language: undefined, status: 'ready', duration_ms: 61600 });
  });

  it('only touches the lecture for a status change', async () => {
    answer('lectures', { data: null });
    answer('files', { data: { ...file, lectures: lecture, summaries: [] } });

    await updateSession('l1', { status: 'processing' });

    expect(callsOn('files', 'update')).toHaveLength(0);
    expect(callsOn('lectures', 'update')[0][0]).toMatchObject({ status: 'transcribing' });
  });
});

describe('moveSession', () => {
  it('sends the course and folder together', async () => {
    await moveSession('l1', 'c2', 'f9');
    expect(chains).toHaveLength(1);
    expect(callsOn('files', 'update')[0][0]).toEqual({ course_id: 'c2', folder_id: 'f9' });
  });
});
