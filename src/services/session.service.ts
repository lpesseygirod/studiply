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
import {
  cacheUser,
  markClean,
  notifyLibraryUpdated,
  readRow,
  readRows,
  readThrough,
  remember,
  rememberLectureFiles,
  saveLocalRow,
  withLocalRows,
} from '../lib/cache';
import { isNetworkError, NetworkError } from '../lib/cloudRows';
import { isOffline } from '../lib/connectivity';
import { newId } from '../lib/mappers';
import {
  enqueue,
  hasPendingSync,
  pendingSyncFor,
  PermanentSyncError,
  registerSyncHandler,
  syncEnabled,
  SyncHttpError,
} from '../lib/sync';
import { syncError } from '../lib/sync/errors';
import { inLectureScope, latestNote, lecturesIn, withLectures, type LectureScope } from '../lib/cache/localQueries';
import type { Json } from '../types/supabase';
import { cleanName, MAX_NAME_LENGTH } from '../utils/names';
import type { Note, Session } from '../types/database';
import { getNoteBySession, updateNote } from './note.service';

/**
 * A session is a lecture in the Supabase schema: a `files` row (kind
 * lecture: title, course, folder, Trash) plus a `lectures` row with the same
 * id (language, status, duration, audio retention). Recording mode has no
 * column; it is read from the lecture's note and otherwise 'lecture'.
 *
 * Reads go through the iPhone's cache (src/lib/cache), so the library opens
 * offline. Offline, the iPhone can still start a lecture: it is saved in the
 * cache and created on the server by the sync queue (src/lib/sync), with any
 * change made to it meanwhile; it shows in the library at once.
 */

const LECTURE_SELECT = '*, lectures(*)';
/** The hidden lecture a course's uploaded photos and PDFs hang off (not shown in the library). */
export const PROJECT_FILES_TITLE = 'Project Files';

function toSessions(rows: unknown[]): Session[] {
  return (rows as LectureFileRow[]).map((row) => lectureToSession(row));
}

async function cachedLectures(): Promise<{ files: FileRow[]; lectures: LectureRow[] }> {
  const [files, lectures] = await Promise.all([readRows<FileRow>('files'), readRows<LectureRow>('lectures')]);
  return { files, lectures };
}

/**
 * Lectures started or changed on this iPhone that haven't synced yet, put
 * into a server answer so they show (and in their latest state).
 */
async function withUnsyncedLectures(
  answer: LectureFileRow[],
  scope: LectureScope,
  limit?: number,
): Promise<LectureFileRow[]> {
  const fileRows = answer.map(({ lectures: _lecture, ...file }) => file as FileRow);
  const lectureRows = answer.flatMap((r) => (r.lectures ? [r.lectures] : []));
  const files = await withLocalRows('files', fileRows, (f) => inLectureScope(f, scope));
  const lectures = await withLocalRows('lectures', lectureRows, (l) => files.some((f) => f.id === l.id));
  if (files === fileRows && lectures === lectureRows) return answer;
  return lecturesIn(files, lectures, scope, limit);
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
      return withUnsyncedLectures(answer, scope, limit);
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
  if (syncEnabled && isOffline()) return createSessionOnDevice(params);
  try {
    return await createSessionOnline(params);
  } catch (err) {
    if (syncEnabled && isNetworkError(err)) return createSessionOnDevice(params);
    throw err;
  }
}

async function createSessionOnline(params: Parameters<typeof createSession>[0]): Promise<Session> {
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

  rememberLectureFiles([{ ...file, lectures: lecture }]);
  return lectureToSession({ ...file, lectures: lecture }, params.recordingMode);
}

// -------------------------------------------------------------------
// Lectures started and changed on the iPhone while offline
// Saved in the cache with an id made here, then created on the server
// by the queue (create_lecture), followed by the changes (update_lecture).
// -------------------------------------------------------------------
interface CreateLecturePayload {
  file: Pick<FileRow, 'id' | 'kind' | 'title' | 'course_id' | 'folder_id' | 'created_at'>;
  lecture: Pick<LectureRow, 'id' | 'language' | 'status' | 'recorded_at'>;
}

interface UpdateLecturePayload {
  id: string;
  file: Partial<Pick<FileRow, 'title' | 'course_id' | 'folder_id'>>;
  lecture: Partial<Pick<LectureRow, 'language' | 'status' | 'duration_ms'>>;
}

async function createSessionOnDevice(params: Parameters<typeof createSession>[0]): Promise<Session> {
  const userId = cacheUser();
  if (!userId) throw new Error('Could not start the recording.');
  const id = newId();
  const at = new Date().toISOString();
  const file: FileRow = {
    id,
    user_id: userId,
    kind: 'lecture',
    title: params.title.trim(),
    course_id: params.projectId ?? null,
    folder_id: params.folderId ?? null,
    sort_order: 0,
    starred_at: null,
    last_opened_at: null,
    past_exam_format: null,
    deleted_at: null,
    created_at: at,
    updated_at: at,
    changed_at: at,
  };
  const lecture: LectureRow = {
    id,
    user_id: userId,
    lecture_number: null,
    recorded_at: at,
    duration_ms: null,
    language: languageToDb(params.language),
    status: 'recording',
    transcript_quality: null,
    avg_confidence: null,
    audio_retention: 'delete_3_days',
    // Dated by the server, 3 days after transcription (20261029152600).
    audio_delete_after: null,
    transcribed_at: null,
    audio_deleted_at: null,
    // Its course's default until the summarize panel or its menu sets it.
    study_reminders: null,
    created_at: at,
    updated_at: at,
  };
  await saveLocalRow('files', file);
  await saveLocalRow('lectures', lecture);
  await enqueue<CreateLecturePayload>({
    kind: 'create_lecture',
    key: id,
    payload: {
      file: { id, kind: 'lecture', title: file.title, course_id: file.course_id, folder_id: file.folder_id, created_at: at },
      lecture: { id, language: lecture.language, status: lecture.status, recorded_at: at },
    },
  });
  notifyLibraryUpdated();
  return lectureToSession({ ...file, lectures: lecture }, params.recordingMode);
}

/** Applies a change to the cached lecture and queues it. */
async function updateSessionOnDevice(sessionId: string, update: UpdateLecturePayload): Promise<Session> {
  const [file, lecture] = await Promise.all([
    readRow<FileRow>('files', sessionId),
    readRow<LectureRow>('lectures', sessionId),
  ]);
  if (!file) throw new Error('Session not found.');
  const at = new Date().toISOString();
  const defined = <T extends object>(patch: T) =>
    Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;

  const nextFile: FileRow = { ...file, ...defined(update.file), updated_at: at };
  await saveLocalRow('files', nextFile);
  let nextLecture = lecture;
  if (lecture) {
    nextLecture = { ...lecture, ...defined(update.lecture), updated_at: at };
    await saveLocalRow('lectures', nextLecture);
  }
  await enqueue<UpdateLecturePayload>({
    kind: 'update_lecture',
    key: sessionId,
    payload: { id: sessionId, file: defined(update.file), lecture: defined(update.lecture) },
  });
  notifyLibraryUpdated();
  return getSession(sessionId);
}

/** The lecture as the server has it now; clean in the cache unless more is waiting. */
async function refreshSynced(id: string): Promise<void> {
  const { data, error } = await supabase.from('files').select(LECTURE_SELECT).eq('id', id).maybeSingle();
  if (error || !data) return;
  // The running operation itself is still listed.
  if ((await pendingSyncFor(id)).length > 1) return;
  const { lectures: lecture, ...file } = data as LectureFileRow;
  await markClean('files', id, file);
  if (lecture) await markClean('lectures', id, lecture);
  remember('files', [file]);
}

/**
 * Creates the lecture's rows on the server; a row that already exists is
 * left as it is (ignoreDuplicates), so this is safe to run twice, or in
 * parallel. Never deletes anything: a lecture made on the iPhone must not
 * be lost because one write was refused.
 */
async function createLectureRows(
  file: Pick<FileRow, 'id' | 'kind' | 'title' | 'course_id' | 'folder_id'>,
  lecture: Pick<LectureRow, 'id' | 'language' | 'status' | 'recorded_at'> & Partial<Pick<LectureRow, 'duration_ms'>>,
): Promise<void> {
  const { error } = await supabase
    .from('files')
    .upsert(
      { id: file.id, kind: file.kind, title: file.title, course_id: file.course_id, folder_id: file.folder_id },
      { onConflict: 'id', ignoreDuplicates: true },
    );
  if (error) throw syncError(error, 'Could not create the lecture.');
  // A document turned into a lecture on this iPhone whose turning hasn't been sent yet:
  // the file is there as a document; it is a lecture now (the queued turning would do it later).
  if (file.kind === 'lecture' && (await pendingSyncFor(file.id)).some((op) => op.kind === 'convert_to_lecture')) {
    const { error: kindError } = await supabase.from('files').update({ kind: 'lecture' }).eq('id', file.id).eq('kind', 'document');
    if (kindError) throw syncError(kindError, 'Could not create the lecture.');
  }

  const { error: lectureError } = await supabase.from('lectures').upsert(
    {
      id: lecture.id,
      language: lecture.language,
      status: lecture.status,
      recorded_at: lecture.recorded_at,
      ...(lecture.duration_ms != null && { duration_ms: lecture.duration_ms }),
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (!lectureError) return;
  // Another run created it at the same moment: that's fine.
  if (await lectureExists(lecture.id)) return;
  throw syncError(lectureError, 'Could not create the lecture.');
}

async function lectureExists(id: string): Promise<boolean> {
  const { data, error } = await supabase.from('lectures').select('id').eq('id', id).maybeSingle();
  if (error) throw syncError(error, 'Could not check the lecture.');
  return data !== null;
}

/**
 * Before anything is sent for a lecture (a change, a recording chunk, a
 * photo): makes sure the server has it, creating it from this iPhone's copy
 * when it doesn't (started offline and not created yet, or lost). This keeps
 * the order "lecture first" even if its own create step went missing.
 */
export async function ensureLectureOnServer(id: string): Promise<void> {
  if (await lectureExists(id)) return;
  const [file, lecture] = await Promise.all([readRow<FileRow>('files', id), readRow<LectureRow>('lectures', id)]);
  if (!file || !lecture) {
    throw new PermanentSyncError('This lecture is no longer on this iPhone or on Studiply.', `lecture ${id} missing`);
  }
  await createLectureRows(file, lecture);
}

registerSyncHandler<CreateLecturePayload>('create_lecture', {
  run: async ({ file, lecture }) => {
    // The iPhone's latest copy if there is one (title or status may have changed since).
    const [localFile, localLecture] = await Promise.all([
      readRow<FileRow>('files', file.id),
      readRow<LectureRow>('lectures', lecture.id),
    ]);
    await createLectureRows(localFile ?? file, localLecture ?? lecture);
    await refreshSynced(file.id);
    notifyLibraryUpdated();
  },
});

registerSyncHandler<UpdateLecturePayload>('update_lecture', {
  run: async ({ id, file, lecture }) => {
    await ensureLectureOnServer(id);
    if (Object.keys(file).length > 0) {
      const { data, error } = await supabase.from('files').update(file).eq('id', id).select('id');
      if (error) throw syncError(error, 'Could not save the lecture.');
      if (data.length === 0) throw new SyncHttpError('Could not save the lecture.', 503, `file ${id}: no row updated`);
    }
    if (Object.keys(lecture).length > 0) {
      const { data, error } = await supabase.from('lectures').update(lecture).eq('id', id).select('id');
      if (error) throw syncError(error, 'Could not save the lecture.');
      if (data.length === 0) throw new SyncHttpError('Could not save the lecture.', 503, `lecture ${id}: no row updated`);
    }
    await refreshSynced(id);
    notifyLibraryUpdated();
  },
  merge: (earlier, later) => ({
    id: earlier.id,
    file: { ...earlier.file, ...later.file },
    lecture: { ...earlier.lecture, ...later.lecture },
  }),
});

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

  // On the iPhone, a lecture with queued work (or no connection) changes in
  // order behind it.
  if (syncEnabled && (isOffline() || (await hasPendingSync(sessionId)))) {
    return updateSessionOnDevice(sessionId, { id: sessionId, file: filePatch, lecture: lecturePatch });
  }

  try {
    await updateSessionOnline(sessionId, filePatch, lecturePatch, has);
  } catch (err) {
    if (syncEnabled && isNetworkError(err)) {
      return updateSessionOnDevice(sessionId, { id: sessionId, file: filePatch, lecture: lecturePatch });
    }
    throw err;
  }
  return getSession(sessionId);
}

async function updateSessionOnline(
  sessionId: string,
  filePatch: UpdateLecturePayload['file'],
  lecturePatch: UpdateLecturePayload['lecture'],
  has: (patch: object) => boolean,
): Promise<void> {
  if (has(filePatch)) {
    const { error } = await supabase.from('files').update(filePatch).eq('id', sessionId);
    if (error) throw serviceError(error, 'Could not save the lecture.');
  }
  if (has(lecturePatch)) {
    const { error } = await supabase.from('lectures').update(lecturePatch).eq('id', sessionId);
    if (error) throw serviceError(error, 'Could not save the lecture.');
  }
}

type SessionAnswer = LectureFileRow & { summaries: { result: Json | null; created_at: string }[] | null };

/** A lecture from the cache, in the shape getSession reads from Supabase. */
async function localSession(sessionId: string, fallback: SessionAnswer | null): Promise<SessionAnswer | null> {
  const file = await readRow<FileRow>('files', sessionId);
  if (!file || file.kind !== 'lecture') return fallback;
  const [lecture, summaries] = await Promise.all([
    readRow<LectureRow>('lectures', sessionId),
    readRows<SummaryRow>('summaries', sessionId),
  ]);
  const note = latestNote(summaries, { ...file, deleted_at: null });
  return {
    ...withLectures([file], lecture ? [lecture] : [])[0],
    summaries: note ? [{ result: note.result, created_at: note.created_at }] : (fallback?.summaries ?? []),
  };
}

// -------------------------------------------------------------------
// getSession
// -------------------------------------------------------------------
export async function getSession(sessionId: string): Promise<Session> {
  type Answer = SessionAnswer;
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
      if (!syncEnabled) return data as Answer | null;
      // Started or changed on this iPhone and not synced yet: the local copy.
      if (!data || (await hasPendingSync(sessionId))) return localSession(sessionId, data as Answer | null);
      return data as Answer;
    },
    () => localSession(sessionId, null),
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

// -------------------------------------------------------------------
// renameSession
// A lecture's title is stored twice: on its file (library, Home, course)
// and in its note (note screen, PDF). Renaming changes both and never
// leaves them different without saying so: the note is tried twice; if it
// still fails the file's old title is put back; if even that fails, the
// student is told exactly which title is where. Online only.
// -------------------------------------------------------------------
export const MAX_TITLE_LENGTH = MAX_NAME_LENGTH;

/** Both titles couldn't be brought in line; the message says what is where. */
export class RenameIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenameIncompleteError';
  }
}

/** The title to store, or an error the student can act on. */
export function cleanTitle(title: string): string {
  return cleanName(title);
}

export interface RenameDeps {
  getSession: (id: string) => Promise<Session>;
  getNote: (sessionId: string) => Promise<Note | null>;
  setLectureTitle: (id: string, title: string) => Promise<Session>;
  setNoteTitle: (note: Note, title: string) => Promise<unknown>;
  online: () => boolean;
}

async function twice<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return fn();
  }
}

export async function renameLecture(deps: RenameDeps, sessionId: string, title: string): Promise<Session> {
  const next = cleanTitle(title);
  if (!deps.online()) throw new NetworkError();

  const before = await deps.getSession(sessionId);
  const note = await deps.getNote(sessionId);
  const renamed = await deps.setLectureTitle(sessionId, next);
  if (!note || note.title === next) return renamed;

  try {
    await twice(() => deps.setNoteTitle(note, next));
    return renamed;
  } catch (err) {
    try {
      await deps.setLectureTitle(sessionId, before.title);
    } catch {
      throw new RenameIncompleteError(
        `The lecture is now called “${next}”, but its note still says “${note.title}”. Rename it again to fix this.`,
      );
    }
    if (isNetworkError(err)) throw err;
    throw new Error('Could not rename the lecture. Nothing was changed.');
  }
}

export function renameSession(sessionId: string, title: string): Promise<Session> {
  return renameLecture(
    {
      getSession,
      getNote: getNoteBySession,
      setLectureTitle: (id, t) => updateSession(id, { title: t }),
      setNoteTitle: (note, t) => updateNote(note.id, { title: t }, note),
      online: () => !isOffline(),
    },
    sessionId,
    title,
  );
}

/**
 * The note's title was changed in Edit Note: the lecture follows (tried
 * twice). If it can't, the student is told the library still shows the old
 * name; the note itself is already saved.
 */
export async function followNoteTitle(sessionId: string, title: string, oldTitle: string): Promise<void> {
  const next = cleanTitle(title);
  try {
    await twice(() => updateSession(sessionId, { title: next }));
  } catch {
    throw new RenameIncompleteError(
      `The note is now called “${next}”, but the lecture in your library is still “${oldTitle}”. Rename the lecture to fix this.`,
    );
  }
}
