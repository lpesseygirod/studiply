import { supabase } from '../lib/supabase';
import {
  LEGACY_NOTE_FORMAT,
  readLegacyNote,
  isNetworkError,
  serviceError,
  summaryToNote,
  type FileRow,
  type LegacyNoteResult,
  type SummaryRow,
} from '../lib/cloudRows';
import {
  cacheUser,
  deleteMeta,
  getMeta,
  markClean,
  notifyLibraryUpdated,
  readRow,
  readRows,
  readThrough,
  remember,
  saveLocalRow,
  setMeta,
  withLocalChanges,
} from '../lib/cache';
import { confirmedNotes, latestNote, lecturesWithNotes } from '../lib/cache/localQueries';
import { getDeviceId } from '../lib/deviceId';
import { newId } from '../lib/mappers';
import {
  applyEdit,
  combineEdits,
  makeEdit,
  mergeEdit,
  NOTE_BLOCKS,
  type BlockValues,
  type Conflict,
  type NoteBlock,
  type NoteEdit,
} from '../lib/noteBlocks';
import { enqueue, pendingSyncFor, PermanentSyncError, registerSyncHandler, syncEnabled } from '../lib/sync';
import { syncError } from '../lib/sync/errors';
import type { Json } from '../types/supabase';
import type { Note } from '../types/database';

/**
 * The old structured note (summary, key concepts, formulas, …) is kept in
 * a `summaries` row: file_id is the lecture, `result` holds the note
 * (format legacy-note-v1, see cloudRows). The Phase 4 editor and the Phase 7
 * summary engine replace this with document blocks. A note goes to Trash
 * with its lecture, so reads skip notes whose lecture file is trashed.
 *
 * Notes are read through the iPhone's cache (src/lib/cache), so they open
 * offline. On the iPhone an edit is saved in the cache first and sent by the
 * sync queue; the web sends it at once. Either way it is merged block by
 * block with the server's note (src/lib/noteBlocks: the newer edit of a
 * block wins, the other is kept in document_versions).
 */

const ACTIVE_NOTE_SELECT = '*, files!inner(deleted_at)';

function toNote(row: unknown): Note {
  const { files: _files, ...summary } = row as SummaryRow & { files?: unknown };
  const note = summaryToNote(summary);
  if (!note) throw new Error('Note not found.');
  return note;
}

/** The summaries rows of an answer, without the joined file. */
function summaryRows(rows: unknown[]): SummaryRow[] {
  return rows.map((row) => {
    const { files: _files, ...summary } = row as SummaryRow & { files?: unknown };
    return summary;
  });
}

function toNotes(rows: SummaryRow[]): Note[] {
  return rows.map(summaryToNote).filter((n): n is Note => n !== null);
}

// -------------------------------------------------------------------
// updateNote
// Absent keys leave their field alone; an explicit null clears it. `base`
// is the note as the student saw it when they started editing; it tells a
// change made here from one made on another device meanwhile (without it,
// the current note is used).
// -------------------------------------------------------------------
export interface NoteUpdates {
  title?: string;
  summary?: string;
  keyConcepts?: unknown[];
  formulas?: unknown[];
  definitions?: unknown[];
  tags?: string[];
  unclearParts?: unknown[];
  isConfirmed?: boolean;
  manualAnnotations?: string | null;
}

function updatesToBlocks(updates: NoteUpdates): BlockValues {
  const blocks: BlockValues = {};
  if (updates.title !== undefined) blocks.title = updates.title;
  if (updates.summary !== undefined) blocks.summary = updates.summary;
  if (updates.keyConcepts !== undefined) blocks.keyConcepts = updates.keyConcepts as Json;
  if (updates.formulas !== undefined) blocks.formulas = updates.formulas as Json;
  if (updates.definitions !== undefined) blocks.definitions = updates.definitions as Json;
  if (updates.tags !== undefined) blocks.tags = updates.tags;
  if (updates.unclearParts !== undefined) blocks.unclearParts = updates.unclearParts as Json;
  if (updates.isConfirmed !== undefined) blocks.confirmed = updates.isConfirmed;
  if ('manualAnnotations' in updates) blocks.clarifications = updates.manualAnnotations ?? null;
  return blocks;
}

/** The note's block values as a screen holds them, over the stored note. */
function withNoteValues(current: LegacyNoteResult, note: Note): LegacyNoteResult {
  return {
    ...current,
    title: note.title,
    summary: note.summary,
    keyConcepts: note.key_concepts,
    formulas: note.formulas,
    definitions: note.definitions,
    tags: note.tags,
    unclearParts: note.unclear_parts,
    manualAnnotations: note.manual_annotations,
    isConfirmed: note.is_confirmed,
  };
}

export async function updateNote(noteId: string, updates: NoteUpdates, base?: Note): Promise<Note> {
  if (syncEnabled) return updateNoteOnDevice(noteId, updates, base);

  const { data: row, error: readError } = await supabase.from('summaries').select('*').eq('id', noteId).maybeSingle();
  if (readError) throw serviceError(readError, 'Could not save the note.');
  const current = row ? readLegacyNote(row.result) : null;
  if (!row || !current) throw new Error('Note not found.');

  const edit = makeEdit({
    id: newId(),
    device: await getDeviceId(),
    base: base ? withNoteValues(current, base) : current,
    baseCreatedAt: row.created_at,
    updates: updatesToBlocks(updates),
    now: new Date(),
  });
  if (!edit) return toNote(row);

  try {
    const { row: saved } = await applyNoteEdit(noteId, edit);
    return toNote(saved);
  } catch (err) {
    if (isNetworkError(err)) throw err;
    if (__DEV__) console.warn('[note] save failed', err);
    throw new Error('Could not save the note.');
  }
}

/**
 * iPhone: the edit is saved in the cache at once (so it shows and survives
 * offline) and queued; the queue merges it into the server's note.
 */
async function updateNoteOnDevice(noteId: string, updates: NoteUpdates, base?: Note): Promise<Note> {
  let row = await readRow<SummaryRow>('summaries', noteId);
  if (!row) {
    // Opened online before the cache had it.
    const { data, error } = await supabase.from('summaries').select('*').eq('id', noteId).maybeSingle();
    if (error) throw serviceError(error, 'Could not save the note.');
    row = data;
  }
  const current = row ? readLegacyNote(row.result) : null;
  if (!row || !current) throw new Error('Note not found.');

  const edit = makeEdit({
    id: newId(),
    device: await getDeviceId(),
    base: base ? withNoteValues(current, base) : current,
    baseCreatedAt: row.created_at,
    updates: updatesToBlocks(updates),
    now: new Date(),
  });
  if (!edit) return toNote(row);

  const local: SummaryRow = { ...row, result: applyEdit(current, edit) as unknown as Json };
  await saveLocalRow('summaries', local);
  await enqueue<NoteEditPayload>({ kind: 'note_edit', key: noteId, payload: { summaryId: noteId, edit } });
  return toNote(local);
}

// -------------------------------------------------------------------
// applyNoteEdit
// Merges an edit into the note on the server. The write only succeeds if
// nobody wrote the note since it was read (compare-and-swap on
// updated_at); otherwise the note is read and merged again. Values that
// lost a conflict are stored as versions first, so they can't get lost.
// Safe to run twice for the same edit.
// -------------------------------------------------------------------
const MERGE_ATTEMPTS = 3;

export async function applyNoteEdit(
  summaryId: string,
  edit: NoteEdit,
): Promise<{ row: SummaryRow; conflicts: Conflict[] }> {
  for (let attempt = 0; attempt < MERGE_ATTEMPTS; attempt++) {
    const { data: row, error } = await supabase.from('summaries').select('*').eq('id', summaryId).maybeSingle();
    if (error) throw syncError(error, 'Could not save the note.');
    const current = row ? readLegacyNote(row.result) : null;
    if (!row || !current) throw new PermanentSyncError('This note was deleted on another device.');

    const merged = mergeEdit(current, row.created_at, edit);
    await saveConflictVersions(row, edit, merged.versions);
    if (!merged.changed) return { row, conflicts: merged.conflicts };

    const { data: saved, error: writeError } = await supabase
      .from('summaries')
      .update({ result: merged.result as unknown as Json })
      .eq('id', summaryId)
      .eq('updated_at', row.updated_at)
      .select('*');
    if (writeError) throw syncError(writeError, 'Could not save the note.');
    if (saved.length === 1) return { row: saved[0], conflicts: merged.conflicts };
    // Written by another device in between: read it again and merge.
  }
  throw new SyncBusyError();
}

class SyncBusyError extends Error {
  readonly status = 503;
  constructor() {
    super('The note kept changing on another device; trying again later.');
  }
}

async function saveConflictVersions(
  row: SummaryRow,
  edit: NoteEdit,
  versions: ReturnType<typeof mergeEdit>['versions'],
): Promise<void> {
  for (const v of versions) {
    // A resent edit finds the version it stored the first time.
    const { data: existing, error } = await supabase
      .from('document_versions')
      .select('id')
      .eq('summary_id', row.id)
      .eq('content->conflict->>editId', edit.id)
      .eq('content->conflict->>side', v.side)
      .limit(1);
    if (error) throw syncError(error, 'Could not keep the other version.');
    if (existing.length > 0) continue;

    const content = { ...v.content, conflict: { ...v.content.conflict, editId: edit.id } };
    const { error: insertError } = await supabase.from('document_versions').insert({
      file_id: row.file_id,
      summary_id: row.id,
      reason: 'conflict',
      content: content as unknown as NonNullable<Json>,
    });
    if (insertError) throw syncError(insertError, 'Could not keep the other version.');
  }
}

// -------------------------------------------------------------------
// The queued edit (iPhone)
// -------------------------------------------------------------------
export interface NoteEditPayload {
  summaryId: string;
  edit: NoteEdit;
}

const conflictKey = (summaryId: string) => `${cacheUser()}:conflict:${summaryId}`;

registerSyncHandler<NoteEditPayload>('note_edit', {
  run: async ({ summaryId, edit }) => {
    const { row, conflicts } = await applyNoteEdit(summaryId, edit);
    // Newer edits still waiting keep the iPhone's copy as it is.
    const waiting = await pendingSyncFor(summaryId);
    if (waiting.length <= 1) await markClean('summaries', summaryId, row);

    const lost = conflicts.filter((c) => c.kept === 'other').map((c) => c.block);
    if (lost.length > 0) await setMeta(conflictKey(summaryId), JSON.stringify(lost));
    notifyLibraryUpdated();
  },
  merge: (earlier, later) => ({ summaryId: earlier.summaryId, edit: combineEdits(earlier.edit, later.edit) }),
});

/**
 * Blocks where this iPhone's edit lost to a newer one from another device,
 * once (the note screen tells the student, then forgets it).
 */
export async function takeConflictNotice(summaryId: string): Promise<NoteBlock[]> {
  if (!syncEnabled) return [];
  const raw = await getMeta(conflictKey(summaryId)).catch(() => null);
  if (!raw) return [];
  await deleteMeta(conflictKey(summaryId)).catch(() => {});
  try {
    const blocks = JSON.parse(raw) as unknown[];
    return NOTE_BLOCKS.filter((b) => blocks.includes(b));
  } catch {
    return [];
  }
}

/** Has this note an edit that hasn't reached Supabase yet? */
export async function noteHasUnsyncedEdit(noteId: string): Promise<boolean> {
  if (!syncEnabled) return false;
  return (await pendingSyncFor(noteId)).length > 0;
}

// -------------------------------------------------------------------
// getSessionsWithNotes
// Returns the set of session IDs (from the given list) that have a
// confirmed note. One query — no N+1.
// -------------------------------------------------------------------
export async function getSessionsWithNotes(sessionIds: string[]): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set();

  return readThrough(
    async () => {
      const { data, error } = await supabase
        .from('summaries')
        .select('file_id')
        .in('file_id', sessionIds)
        .eq('result->>format', LEGACY_NOTE_FORMAT)
        .eq('result->>isConfirmed', 'true');
      if (error) throw serviceError(error, 'Could not load your notes.');
      return new Set(data.map((r) => r.file_id));
    },
    async () => lecturesWithNotes(await readRows<SummaryRow>('summaries'), sessionIds),
  );
}

// -------------------------------------------------------------------
// getNoteBySession
// Returns the most recent note for a session (null if none).
// -------------------------------------------------------------------
export async function getNoteBySession(sessionId: string): Promise<Note | null> {
  const row = await latestNoteRow(sessionId);
  return row ? summaryToNote(row) : null;
}

/**
 * The most recent note of a session as stored (each section's origin and time
 * included), for step 4.9's conversion into the Summary tab. Null if none.
 */
export async function getNoteResultBySession(sessionId: string): Promise<{ id: string; result: LegacyNoteResult } | null> {
  const row = await latestNoteRow(sessionId);
  const result = row ? readLegacyNote(row.result) : null;
  return row && result ? { id: row.id, result } : null;
}

async function latestNoteRow(sessionId: string): Promise<SummaryRow | null> {
  // Wrapped, so "this lecture has no note" isn't mistaken for "nothing cached".
  const found = await readThrough<{ row: SummaryRow | null }>(
    async () => {
      const { data, error } = await supabase
        .from('summaries')
        .select(ACTIVE_NOTE_SELECT)
        .eq('file_id', sessionId)
        .eq('result->>format', LEGACY_NOTE_FORMAT)
        .is('files.deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw serviceError(error, 'Could not load the note.');
      const rows = summaryRows(data);
      remember('summaries', rows);
      return { row: (await withLocalChanges('summaries', rows))[0] ?? null };
    },
    async () => {
      const file = await readRow<FileRow>('files', sessionId);
      if (!file) return null;
      return { row: latestNote(await readRows<SummaryRow>('summaries', sessionId), file) };
    },
  );
  return found.row;
}

// -------------------------------------------------------------------
// getNote
// -------------------------------------------------------------------
export async function getNote(noteId: string): Promise<Note> {
  const data = await readThrough(
    async () => {
      const { data, error } = await supabase.from('summaries').select('*').eq('id', noteId).maybeSingle();
      if (error) throw serviceError(error, 'Could not load the note.');
      if (!data) return null;
      remember('summaries', [data]);
      return (await withLocalChanges('summaries', [data]))[0];
    },
    () => readRow<SummaryRow>('summaries', noteId),
  );
  if (!data) throw new Error('Note not found.');
  return toNote(data);
}

// -------------------------------------------------------------------
// getUserNotes
// -------------------------------------------------------------------
export async function getUserNotes(_userId: string): Promise<Note[]> {
  const rows = await readThrough(
    async () => {
      const { data, error } = await supabase
        .from('summaries')
        .select(ACTIVE_NOTE_SELECT)
        .eq('result->>format', LEGACY_NOTE_FORMAT)
        .eq('result->>isConfirmed', 'true')
        .is('files.deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw serviceError(error, 'Could not load your notes.');
      const rows = summaryRows(data);
      remember('summaries', rows);
      return withLocalChanges('summaries', rows);
    },
    async () => {
      const [summaries, files] = await Promise.all([readRows<SummaryRow>('summaries'), readRows<FileRow>('files')]);
      return confirmedNotes(summaries, files);
    },
  );
  return toNotes(rows);
}

// -------------------------------------------------------------------
// deleteNote
// -------------------------------------------------------------------
export async function deleteNote(noteId: string): Promise<void> {
  const { error } = await supabase.from('summaries').delete().eq('id', noteId);
  if (error) throw serviceError(error, 'Could not delete the note.');
}

// -------------------------------------------------------------------
// confirmNote
// Marks an existing draft note as confirmed and updates metadata.
// -------------------------------------------------------------------
export async function confirmNote(
  noteId: string,
  updates?: { title?: string },
): Promise<Note> {
  return updateNote(noteId, { isConfirmed: true, ...updates });
}
