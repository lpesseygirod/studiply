/**
 * Step 5.7: recording inside a plain document turns it into a lecture.
 * Nothing the student wrote moves: the file keeps its id, title and place;
 * its first tab (`notes`, the same documents row with its content, block ids
 * and versions) becomes My notes; its other tabs follow the lecture's three
 * (document-tabs.service orders them). Two writes, safe to repeat, in this
 * order: a `lectures` row with the file's id, then `files.kind` from
 * `document` to `lecture`. Then the first tab is made My notes
 * (makeFirstTabMyNotes: a renamed or deleted first tab).
 *
 * The laptop writes at once (online, as the web always is). The iPhone
 * changes its copy and queues `convert_to_lecture` under the file's key
 * (after the document's own creation if that still waits); the recorder's
 * uploads make sure the lecture exists first, and that also finishes the
 * turning (session.service createLectureRows).
 *
 * If the recording can't start right after, everything is put back
 * (revert): it stays a plain document.
 */

import { supabase } from '../lib/supabase';
import { languageToDb, serviceError, type FileRow, type LectureRow } from '../lib/cloudRows';
import { cacheUser, dropRows, markClean, notifyLibraryUpdated, readRow, remember, saveLocalRow } from '../lib/cache';
import { enqueue, pendingSyncFor, registerSyncHandler, syncEnabled } from '../lib/sync';
import { syncError } from '../lib/sync/errors';
import { ensureDocumentOnServer, openDocument, saveDocument, saveVersion } from './document.service';
import { makeFirstTabMyNotes } from './document-tabs.service';
import { forgetLectureKind } from './note-lines.service';

type Fail = (error: { message?: string; code?: string }, message: string) => Error;

interface ConvertPayload {
  fileId: string;
  language: string | null;
  recordedAt: string;
}

interface RevertPayload {
  fileId: string;
}

/** The two writes (safe to repeat): the lecture's row, then the file's kind. */
async function writeConversion(p: ConvertPayload, fail: Fail): Promise<FileRow> {
  const { error } = await supabase
    .from('lectures')
    .upsert({ id: p.fileId, language: p.language, status: 'recording', recorded_at: p.recordedAt }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw fail(error, 'Could not turn the document into a lecture.');
  const { data, error: kindError } = await supabase.from('files').update({ kind: 'lecture' }).eq('id', p.fileId).select('*');
  if (kindError) throw fail(kindError, 'Could not turn the document into a lecture.');
  if (!data?.length) throw fail({ message: 'no row updated' }, 'Could not turn the document into a lecture.');
  return data[0] as FileRow;
}

/**
 * Back to a plain document: the file's kind first, then the (empty) lecture row. Also Cancel recording's
 * server half (services/discard-recording), after the recording's audio is removed.
 */
export async function writeRevert(p: RevertPayload, fail: Fail): Promise<void> {
  const { error } = await supabase.from('files').update({ kind: 'document' }).eq('id', p.fileId).eq('kind', 'lecture');
  if (error) throw fail(error, 'Could not undo the lecture.');
  const { error: deleteError } = await supabase.from('lectures').delete().eq('id', p.fileId);
  if (deleteError) throw fail(deleteError, 'Could not undo the lecture.');
}

/** This iPhone's copy: the file a lecture, with its lecture row. */
async function convertOnDevice(p: ConvertPayload): Promise<void> {
  const userId = cacheUser();
  const file = await readRow<FileRow>('files', p.fileId);
  if (!userId || !file) throw new Error('This document is not on this iPhone yet.');
  const at = new Date().toISOString();
  const lectureFile: FileRow = { ...file, kind: 'lecture', updated_at: at };
  await saveLocalRow('files', lectureFile);
  const lecture: LectureRow = {
    id: p.fileId,
    user_id: userId,
    lecture_number: null,
    recorded_at: p.recordedAt,
    duration_ms: null,
    language: p.language as LectureRow['language'],
    status: 'recording',
    transcript_quality: null,
    avg_confidence: null,
    audio_retention: 'delete_3_days',
    // Dated by the server, 3 days after transcription (20261029152600).
    audio_delete_after: null,
    transcribed_at: null,
    audio_deleted_at: null,
    created_at: at,
    updated_at: at,
  };
  await saveLocalRow('lectures', lecture);
}

/**
 * Turns the plain document `fileId` into a lecture (before its recording starts); returns how to
 * put everything back if the recording then can't start.
 */
export async function convertToLecture(fileId: string, language: string): Promise<() => Promise<void>> {
  const p: ConvertPayload = { fileId, language: languageToDb(language), recordedAt: new Date().toISOString() };
  if (syncEnabled) {
    await convertOnDevice(p);
    await enqueue<ConvertPayload>({ kind: 'convert_to_lecture', key: fileId, payload: p });
  } else {
    const file = await writeConversion(p, serviceError);
    remember('files', [file]);
  }
  forgetLectureKind(fileId);
  notifyLibraryUpdated();
  const undoFirstTab = await makeFirstTabMyNotes(fileId, {
    openNotes: async () => (await openDocument(fileId, 'notes')).content,
    saveVersion: (content, name) => saveVersion(fileId, 'notes', content, 'session_end', name),
    replaceNotes: (base, next) => saveDocument({ fileId, tab: 'notes', base, next }),
  });
  return async () => {
    await undoFirstTab().catch((err) => console.warn('[lecture] could not put the first tab back', err));
    await revertToDocument(fileId);
  };
}

/** Back to a plain document (the recording couldn't start; nothing was recorded). */
async function revertToDocument(fileId: string): Promise<void> {
  if (syncEnabled) {
    const file = await readRow<FileRow>('files', fileId);
    const documentFile: FileRow | null = file && { ...file, kind: 'document', updated_at: new Date().toISOString() };
    if (documentFile) await saveLocalRow('files', documentFile);
    await dropRows('lectures', [fileId]);
    await enqueue<RevertPayload>({ kind: 'revert_to_document', key: fileId, payload: { fileId } });
  } else {
    await writeRevert({ fileId }, serviceError);
  }
  forgetLectureKind(fileId);
  notifyLibraryUpdated();
}

/** After a step was sent: this iPhone's copy of the file becomes the server's, unless more of it waits. */
async function refreshFile(fileId: string): Promise<void> {
  // The running operation itself is still listed.
  if ((await pendingSyncFor(fileId)).length > 1) return;
  const { data } = await supabase.from('files').select('*').eq('id', fileId).maybeSingle();
  if (data) await markClean('files', fileId, data);
}

registerSyncHandler<ConvertPayload>('convert_to_lecture', {
  run: async (p) => {
    // A document made on this iPhone and not sent yet: it first.
    await ensureDocumentOnServer(p.fileId);
    await writeConversion(p, syncError);
    await refreshFile(p.fileId);
    forgetLectureKind(p.fileId);
    notifyLibraryUpdated();
  },
});

registerSyncHandler<RevertPayload>('revert_to_document', {
  run: async (p) => {
    await writeRevert(p, syncError);
    await refreshFile(p.fileId);
    forgetLectureKind(p.fileId);
    notifyLibraryUpdated();
  },
});
