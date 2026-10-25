import { supabase } from '../lib/supabase';
import {
  languageToDb,
  lectureToSession,
  readLegacyNote,
  serviceError,
  statusToDb,
  type FileRow,
  type LectureFileRow,
  type LectureRow,
  type SummaryRow,
} from '../lib/cloudRows';
import { readRow, readRows, readThrough, rememberLectureFiles } from '../lib/cache';
import { inLectureScope, latestNote, lectureTitled, lecturesIn, withLectures, type LectureScope } from '../lib/cache/localQueries';
import type { Json } from '../types/supabase';
import type { Session } from '../types/database';

/**
 * A session is a lecture in the step 1.2 schema: a `files` row (kind
 * lecture: title, course, folder, Trash) plus a `lectures` row with the same
 * id (language, status, duration, audio retention). Recording mode has no
 * column; it is read from the lecture's note and otherwise 'lecture'.
 *
 * Reads go through the iPhone's cache (src/lib/cache), so the library opens
 * offline.
 */

const LECTURE_SELECT = '*, lectures(*)';
const PROJECT_FILES_TITLE = 'Project Files';

function toSessions(rows: unknown[]): Session[] {
  return (rows as LectureFileRow[]).map((row) => lectureToSession(row));
}

async function cachedLectures(): Promise<{ files: FileRow[]; lectures: LectureRow[] }> {
  const [files, lectures] = await Promise.all([readRows<FileRow>('files'), readRows<LectureRow>('lectures')]);
  return { files, lectures };
}

/** Lecture files of a scope: Supabase, kept in the cache, or the cache offline. */
async function lectureList(
  scope: LectureScope,
  query: () => PromiseLike<{ data: unknown[] | null; error: { code?: string; message?: string } | null }>,
  failMessage: string,
  limit?: number,
): Promise<Session[]> {
  const rows = await readThrough(
    async () => {
      const { data, error } = await query();
      if (error || !data) throw serviceError(error, failMessage);
      const answer = data as LectureFileRow[];
      rememberLectureFiles(answer, limit === undefined ? (f) => inLectureScope(f, scope) : undefined);
      return answer;
    },
    async () => {
      const { files, lectures } = await cachedLectures();
      return lecturesIn(files, lectures, scope, limit);
    },
  );
  return toSessions(rows);
}

// -------------------------------------------------------------------
// createSession
// The file first, then its lecture. If the lecture can't be created the
// file is removed again, so no half-made lecture shows in the library.
// -------------------------------------------------------------------
export async function createSession(params: {
  userId: string;
  title: string;
  projectId?: string;
  folderId?: string;
  recordingMode: 'lecture' | 'standard' | 'discussion';
  language: string;
}): Promise<Session> {
  const { data: file, error } = await supabase
    .from('files')
    .insert({
      kind: 'lecture',
      title: params.title.trim(),
      course_id: params.projectId ?? null,
      folder_id: params.folderId ?? null,
    })
    .select('*')
    .single();
  if (error) throw serviceError(error, 'Could not start the recording.');

  const { data: lecture, error: lectureError } = await supabase
    .from('lectures')
    .insert({
      id: file.id,
      language: languageToDb(params.language),
      status: 'recording',
      recorded_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (lectureError) {
    await supabase.from('files').delete().eq('id', file.id);
    throw serviceError(lectureError, 'Could not start the recording.');
  }

  return lectureToSession({ ...file, lectures: lecture }, params.recordingMode);
}

// -------------------------------------------------------------------
// updateSession
// Title, project and folder are on the file; language, status and
// duration on the lecture. recording_mode is not stored (see top).
// -------------------------------------------------------------------
export async function updateSession(
  sessionId: string,
  updates: Partial<
    Pick<
      Session,
      | 'title'
      | 'recording_mode'
      | 'language'
      | 'status'
      | 'duration_seconds'
      | 'project_id'
      | 'folder_id'
    >
  >,
): Promise<Session> {
  const filePatch = {
    title: updates.title,
    course_id: updates.project_id,
    folder_id: updates.folder_id,
  };
  const lecturePatch = {
    language: updates.language === undefined ? undefined : languageToDb(updates.language),
    status: updates.status === undefined ? undefined : statusToDb(updates.status),
    duration_ms:
      updates.duration_seconds === undefined
        ? undefined
        : updates.duration_seconds === null
          ? null
          : Math.round(updates.duration_seconds * 1000),
  };
  const has = (patch: object) => Object.values(patch).some((v) => v !== undefined);

  if (has(filePatch)) {
    const { error } = await supabase.from('files').update(filePatch).eq('id', sessionId);
    if (error) throw serviceError(error, 'Could not save the lecture.');
  }
  if (has(lecturePatch)) {
    const { error } = await supabase.from('lectures').update(lecturePatch).eq('id', sessionId);
    if (error) throw serviceError(error, 'Could not save the lecture.');
  }
  return getSession(sessionId);
}

// -------------------------------------------------------------------
// getSession
// -------------------------------------------------------------------
export async function getSession(sessionId: string): Promise<Session> {
  type Answer = LectureFileRow & { summaries: { result: Json | null; created_at: string }[] | null };
  const data = await readThrough<Answer | null>(
    async () => {
      const { data, error } = await supabase
        .from('files')
        .select(`${LECTURE_SELECT}, summaries(result, created_at)`)
        .eq('id', sessionId)
        .eq('kind', 'lecture')
        .maybeSingle();
      if (error) throw serviceError(error, 'Could not load the lecture.');
      if (data) {
        const { summaries: _notes, ...file } = data as Answer;
        rememberLectureFiles([file]);
      }
      return data as Answer | null;
    },
    async () => {
      const file = await readRow<FileRow>('files', sessionId);
      if (!file || file.kind !== 'lecture') return null;
      const [lecture, summaries] = await Promise.all([
        readRow<LectureRow>('lectures', sessionId),
        readRows<SummaryRow>('summaries', sessionId),
      ]);
      const note = latestNote(summaries, { ...file, deleted_at: null });
      return {
        ...withLectures([file], lecture ? [lecture] : [])[0],
        summaries: note ? [{ result: note.result, created_at: note.created_at }] : [],
      };
    },
  );
  if (!data) throw new Error('Session not found.');

  const { summaries, ...row } = data;
  const latest = [...(summaries ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const mode = latest.map((s) => readLegacyNote(s.result)?.recordingMode).find(Boolean);
  return lectureToSession(row, mode ?? 'lecture');
}

// -------------------------------------------------------------------
// getSessionsByProject
// Pass folderId = undefined → all sessions in project (any folder)
// Pass folderId = null      → only sessions at the project root (no folder)
// Pass folderId = string    → only sessions in that specific folder
// -------------------------------------------------------------------
export async function getSessionsByProject(
  projectId: string,
  folderId?: string | null,
): Promise<Session[]> {
  return lectureList(
    { courseId: projectId, folderId },
    () => {
      let query = supabase
        .from('files')
        .select(LECTURE_SELECT)
        .eq('kind', 'lecture')
        .eq('course_id', projectId)
        .is('deleted_at', null);

      if (folderId === null) query = query.is('folder_id', null);
      else if (folderId !== undefined) query = query.eq('folder_id', folderId);

      return query.order('updated_at', { ascending: false });
    },
    'Could not load the lectures.',
  );
}

// -------------------------------------------------------------------
// getSessionsByFolder
// -------------------------------------------------------------------
export async function getSessionsByFolder(folderId: string): Promise<Session[]> {
  return lectureList(
    { folderId },
    () =>
      supabase
        .from('files')
        .select(LECTURE_SELECT)
        .eq('kind', 'lecture')
        .eq('folder_id', folderId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false }),
    'Could not load the lectures.',
  );
}

// -------------------------------------------------------------------
// moveSession — move to a different project/folder
// Inside a folder the database takes the course from that folder.
// -------------------------------------------------------------------
export async function moveSession(
  sessionId: string,
  projectId: string,
  folderId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('files')
    .update({ course_id: projectId, folder_id: folderId })
    .eq('id', sessionId);
  if (error) throw serviceError(error, 'Could not move the lecture.');
}

// -------------------------------------------------------------------
// getOrCreateProjectUploadSession
// Returns (or creates) a dedicated 'completed' lecture used to hold
// files uploaded directly to a project, not tied to any recording.
// -------------------------------------------------------------------
export async function getOrCreateProjectUploadSession(
  _userId: string,
  projectId: string,
): Promise<Session> {
  const existing = await readThrough(
    async () => {
      const { data, error } = await supabase
        .from('files')
        .select(LECTURE_SELECT)
        .eq('kind', 'lecture')
        .eq('course_id', projectId)
        .eq('title', PROJECT_FILES_TITLE)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1);
      if (error) throw serviceError(error, 'Could not prepare the project files.');
      rememberLectureFiles(data as LectureFileRow[]);
      return (data[0] as LectureFileRow | undefined) ?? null;
    },
    async () => {
      const { files, lectures } = await cachedLectures();
      return lectureTitled(files, lectures, projectId, PROJECT_FILES_TITLE);
    },
  );
  if (existing) return toSessions([existing])[0];

  const session = await createSession({
    userId: _userId,
    title: PROJECT_FILES_TITLE,
    projectId,
    recordingMode: 'standard',
    language: 'en',
  });
  return updateSession(session.id, { status: 'completed' });
}

// -------------------------------------------------------------------
// getRecentSessions
// -------------------------------------------------------------------
export async function getRecentSessions(_userId: string, limit = 10): Promise<Session[]> {
  return lectureList(
    {},
    () =>
      supabase
        .from('files')
        .select(LECTURE_SELECT)
        .eq('kind', 'lecture')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(limit),
    'Could not load your recent lectures.',
    limit,
  );
}

// -------------------------------------------------------------------
// deleteSession
// Deletes the lecture file; the database cascades to the lecture, its
// transcript, notes, chunks and media rows. Storage files are removed by
// trash.service's permanent delete, which reads their paths first.
// -------------------------------------------------------------------
export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from('files').delete().eq('id', sessionId);
  if (error) throw serviceError(error, 'Could not delete the lecture.');
}
