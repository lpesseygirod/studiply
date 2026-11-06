/**
 * Cancel recording (Lea, 6 Nov; DESIGN "Discard recording"): what happens after the recorder closed the
 * microphone and dropped the audio from this device (services/recorder: no chunk is sent after that).
 * No summary request and no AI call.
 *
 *  - A new lecture ('new'): to Recently Deleted with its notes, marks and photos (restorable 30 days, then
 *    the nightly purge), keeping the audio that reached Studiply before Discard; a chunk that still lands
 *    after is removed. Undo (`undoDiscard`) takes it out of the trash.
 *  - Recorded inside a plain document ('document', step 5.7): this recording's audio, transcript and files
 *    are deleted; its photos stay with the document; it is a document again (writeRevert, which removes
 *    the lecture row and with it the recording's marks and note lines).
 *  - Recorded again inside a lecture ('lecture'): only this recording's audio and transcript (its chunks
 *    from `from.seq`, its segments from `from.ms`); the earlier recording stays.
 *  - My notes, in both document cases: saved first as the version "Before discarding the recording",
 *    then this recording's time chips taken off and its mark chips kept as words (editor/discardRecording).
 *
 * The laptop does the server half at once; the iPhone changes its copy and queues `discard_recording`
 * under the lecture's key, after the lecture's own creation or conversion if those still wait.
 * Deleting goes by the recording's range, so it is safe to run again (a late chunk: `cleanUpLate`).
 */

import { supabase } from '../lib/supabase';
import { serviceError, type FileRow } from '../lib/cloudRows';
import { dropRows, notifyLibraryUpdated, readRow, saveLocalRow } from '../lib/cache';
import { discardSync, enqueue, pendingSyncFor, registerSyncHandler, syncEnabled } from '../lib/sync';
import { syncError } from '../lib/sync/errors';
import { unstampDoc } from '../editor/discardRecording';
import type { DocJSON } from '../editor/types';
import { Buckets, removeFiles } from './cloud-storage.service';
import { openDocument, saveDocument, saveVersion } from './document.service';
import { writeRevert } from './lecture-conversion.service';
import { momentTarget } from './moment-placement';
import { forgetLectureKind } from './note-lines.service';
import { restoreItem } from './trash.service';
import type { DiscardPlan } from './recording-flow';

type Fail = (error: { message?: string; code?: string }, message: string) => Error;

const MESSAGE = 'Could not discard the recording.';
export const BEFORE_DISCARD_VERSION = 'Before discarding the recording';

/** The recording's chunks from `fromSeq` (their segments, rows and files), and its segments from `fromMs` (null: by chunk only). */
export async function deleteAudio(lectureId: string, fromSeq: number, fromMs: number | null, fail: Fail = serviceError): Promise<void> {
  const { data, error } = await supabase.from('audio_chunks').select('id, storage_path').eq('lecture_id', lectureId).gte('seq', fromSeq);
  if (error) throw fail(error, MESSAGE);
  const ids = (data ?? []).map((c) => c.id);
  const paths = (data ?? []).flatMap((c) => (c.storage_path ? [c.storage_path] : []));
  if (ids.length) {
    const { error: segError } = await supabase.from('transcript_segments').delete().in('chunk_id', ids);
    if (segError) throw fail(segError, MESSAGE);
  }
  if (fromMs !== null) {
    const { error: timeError } = await supabase.from('transcript_segments').delete().eq('lecture_id', lectureId).gte('start_ms', fromMs);
    if (timeError) throw fail(timeError, MESSAGE);
  }
  if (ids.length) {
    const { error: chunkError } = await supabase.from('audio_chunks').delete().in('id', ids);
    if (chunkError) throw fail(chunkError, MESSAGE);
  }
  // The files last: a failure here leaves files nobody points at, never a row without its file.
  await removeFiles(Buckets.audioChunks, paths).catch((err) => console.warn('[discard] could not delete the audio files', err));
}

/** Where deleting starts: a new lecture keeps what reached Studiply before Discard; otherwise the whole recording. */
const rangeOf = (p: DiscardPlan) => (p.origin === 'new' ? { seq: p.keepBelow, ms: null } : { seq: p.from.seq, ms: p.from.ms });

/** The server half (the laptop at once; the iPhone's queued `discard_recording`). Safe to run twice. */
export async function discardOnServer(p: DiscardPlan, fail: Fail = serviceError): Promise<void> {
  const range = rangeOf(p);
  await deleteAudio(p.lectureId, range.seq, range.ms, fail);
  if (p.origin === 'new') {
    const { error } = await supabase.from('files').update({ deleted_at: new Date().toISOString() }).eq('id', p.lectureId).is('deleted_at', null);
    if (error) throw fail(error, MESSAGE);
  } else if (p.origin === 'document') {
    // Its photos stay in the notes: the document's own, before the lecture row (and its cascade) goes.
    const { error } = await supabase.from('media').update({ lecture_id: null, file_id: p.lectureId }).eq('lecture_id', p.lectureId);
    if (error) throw fail(error, MESSAGE);
    await writeRevert({ fileId: p.lectureId }, fail);
  }
}

/** A chunk of a discarded recording wrote to the server after Discard (services/recorder/discarded): removed again. */
export async function cleanUpLate(p: DiscardPlan): Promise<void> {
  const range = rangeOf(p);
  await deleteAudio(p.lectureId, range.seq, range.ms);
}

/** My notes in the document cases: the version first, then the stamps off (in the open editor, else saved here). */
async function unstampNotes(lectureId: string, fromMs: number): Promise<void> {
  const opened = await openDocument(lectureId, 'notes').catch(() => null);
  if (!opened?.content) return;
  const content = opened.content as DocJSON;
  const next = unstampDoc(content, fromMs);
  if (next === content) return;
  await saveVersion(lectureId, 'notes', content, 'session_end', BEFORE_DISCARD_VERSION);
  const target = momentTarget(lectureId);
  if (target?.unstamp) await target.unstamp(fromMs);
  else await saveDocument({ fileId: lectureId, tab: 'notes', base: content, next });
}

/** This iPhone's copy, before the queued server half: a new lecture leaves the library; a document is a document again. */
async function onDevice(p: DiscardPlan): Promise<void> {
  const file = await readRow<FileRow>('files', p.lectureId);
  const at = new Date().toISOString();
  if (p.origin === 'new' && file) {
    const trashed: FileRow = { ...file, deleted_at: at, updated_at: at };
    await saveLocalRow('files', trashed);
  }
  if (p.origin === 'document') {
    if (file) {
      const document: FileRow = { ...file, kind: 'document', updated_at: at };
      await saveLocalRow('files', document);
    }
    await dropRows('lectures', [p.lectureId]);
  }
}

/** After the recorder discarded the recording (recording-flow's `discard`). */
export async function discardRecording(p: DiscardPlan): Promise<void> {
  if (p.origin !== 'new') {
    await unstampNotes(p.lectureId, p.origin === 'document' ? 0 : p.from.ms).catch((err) => console.warn('[discard] the notes were not changed', err));
  }
  if (syncEnabled) {
    await onDevice(p);
    await enqueue<DiscardPlan>({ kind: 'discard_recording', key: p.lectureId, payload: p });
  } else {
    await discardOnServer(p);
  }
  if (p.origin === 'document') forgetLectureKind(p.lectureId);
  notifyLibraryUpdated();
}

/** Undo of a new lecture's Discard: out of Recently Deleted (the audio dropped from the device stays gone). */
export async function undoDiscard(lectureId: string): Promise<void> {
  if (syncEnabled) {
    const waiting = (await pendingSyncFor(lectureId)).find((o) => o.kind === 'discard_recording' && o.status === 'pending');
    if (waiting) {
      // Not sent yet: nothing on the server to undo but the stragglers' clean-up, which no longer matters.
      await discardSync(waiting.id);
      const file = await readRow<FileRow>('files', lectureId);
      if (file) {
        const restored: FileRow = { ...file, deleted_at: null, updated_at: new Date().toISOString() };
        await saveLocalRow('files', restored);
      }
      notifyLibraryUpdated();
      return;
    }
  }
  await restoreItem({ id: lectureId, type: 'session' });
  notifyLibraryUpdated();
}

registerSyncHandler<DiscardPlan>('discard_recording', {
  run: async (p) => {
    await discardOnServer(p, syncError);
    notifyLibraryUpdated();
  },
});
