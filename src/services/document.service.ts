import { supabase } from '../lib/supabase';
import { isNetworkError, serviceError, type FileRow } from '../lib/cloudRows';
import {
  cacheUser,
  deleteMeta,
  dropRows,
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
import { isOffline } from '../lib/connectivity';
import { getDeviceId } from '../lib/deviceId';
import { newId } from '../lib/mappers';
import { enqueue, pendingSyncFor, PermanentSyncError, registerSyncHandler, syncEnabled } from '../lib/sync';
import { syncError } from '../lib/sync/errors';
import { combineDocEdits, makeDocEdit, mergeDocEdit, type DocConflict, type DocConflictVersion, type DocEdit } from '../editor/docBlocks';
import { newBlockId } from '../editor/schema/blockMeta';
import { transcriptDoc } from '../editor/transcriptDoc';
import type { DocJSON } from '../editor/types';
import type { Json, Tables } from '../types/supabase';
import { cleanName } from '../utils/names';

/**
 * Documents (step 4.3): a blank document is a `files` row of kind
 * `document` with one `documents` row (tab `notes`); a lecture has up to
 * three (notes, summary, transcript). The content is ProseMirror JSON whose
 * blocks carry an id, an origin and an edit time (src/editor/schema/blockMeta).
 *
 * Saving sends an edit (src/editor/docBlocks), never the whole document as
 * is: the server merges it block by block with what another device wrote
 * (the newer edit of a block wins, the other is kept in document_versions).
 * The laptop sends at once; the iPhone saves in its cache first and queues
 * the edit, so writing (and creating documents) works offline.
 */

export type DocTab = 'notes' | 'summary' | 'transcript';
export type DocumentRow = Tables<'documents'>;
export type VersionRow = Tables<'document_versions'>;
export type VersionReason = 'ai_generation' | 'session_end' | 'restore' | 'conflict';

export const UNTITLED_DOCUMENT = 'Untitled document';

/** An empty page: one paragraph with its id. */
export function blankDoc(): DocJSON {
  return { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: newBlockId(), origin: 'student', editedAt: null } }] };
}

const EMPTY: DocJSON = { type: 'doc', content: [] };

export interface OpenedDocument {
  fileId: string;
  tab: DocTab;
  /** The documents row, or null for a tab nothing was written in yet. */
  id: string | null;
  content: DocJSON;
  updatedAt: string | null;
}

const asDoc = (content: unknown): DocJSON =>
  content && typeof content === 'object' && (content as { type?: unknown }).type === 'doc' ? (content as DocJSON) : EMPTY;

function opened(fileId: string, tab: DocTab, row: DocumentRow | null | undefined): OpenedDocument {
  return { fileId, tab, id: row?.id ?? null, content: row ? asDoc(row.content) : EMPTY, updatedAt: row?.updated_at ?? null };
}

async function localDocument(fileId: string, tab: DocTab): Promise<DocumentRow | null> {
  const rows = await readRows<DocumentRow>('documents', fileId);
  return rows.find((r) => r.tab === tab) ?? null;
}

/** A document tab, from Supabase or (iPhone, offline) the cache, with this iPhone's unsynced edits. */
export async function openDocument(fileId: string, tab: DocTab): Promise<OpenedDocument> {
  return readThrough(
    async () => {
      const { data, error } = await supabase.from('documents').select('*').eq('file_id', fileId).eq('tab', tab).maybeSingle();
      if (error) throw serviceError(error, 'Could not open the document.');
      if (data) remember('documents', [data]);
      const local = await localDocument(fileId, tab).catch(() => null);
      // Written on this iPhone and not sent yet (also before its row exists on the server).
      if (local && (!data || local.id !== data.id)) {
        const [overlaid] = await withLocalChanges('documents', [local]);
        if (overlaid !== local || !data) return opened(fileId, tab, overlaid);
      }
      const [row] = data ? await withLocalChanges('documents', [data]) : [null];
      return opened(fileId, tab, row);
    },
    async () => {
      const row = await localDocument(fileId, tab);
      if (row) return opened(fileId, tab, row);
      return (await readRow<FileRow>('files', fileId)) ? opened(fileId, tab, null) : null;
    },
  );
}

/** The file a document screen shows (a blank document or a lecture): title, place, kind. */
export async function getDocumentFile(fileId: string): Promise<FileRow> {
  const row = await readThrough<FileRow | null>(
    async () => {
      const { data, error } = await supabase.from('files').select('*').eq('id', fileId).is('deleted_at', null).maybeSingle();
      if (error) throw serviceError(error, 'Could not open the document.');
      if (data) remember('files', [data]);
      const [overlaid] = data ? await withLocalChanges('files', [data]) : [await readRow<FileRow>('files', fileId).catch(() => null)];
      return overlaid ?? null;
    },
    () => readRow<FileRow>('files', fileId),
  );
  if (!row || row.deleted_at) throw new Error('This document was deleted.');
  return row;
}

/**
 * A lecture's Transcript tab the first time it opens: made from its
 * transcript (one paragraph per segment with its time) and saved. Nothing
 * when the tab exists or there is no transcript yet.
 */
export async function ensureTranscriptDocument(lectureId: string, segments: { start: number; text: string }[]): Promise<void> {
  if (segments.length === 0) return;
  const current = await openDocument(lectureId, 'transcript');
  if (current.id !== null) return;
  await saveDocument({ fileId: lectureId, tab: 'transcript', base: EMPTY, next: transcriptDoc(segments) });
}

/** When the server's copy last changed, for the open document's check every few seconds. Online only. */
export async function documentStamp(fileId: string, tab: DocTab): Promise<string | null> {
  const { data, error } = await supabase.from('documents').select('updated_at').eq('file_id', fileId).eq('tab', tab).maybeSingle();
  if (error) throw serviceError(error, 'Could not check the document.');
  return data?.updated_at ?? null;
}

// -------------------------------------------------------------------
// New documents
// -------------------------------------------------------------------

export interface CreateDocumentParams {
  courseId: string | null;
  folderId: string | null;
  title?: string;
}

interface CreateDocumentPayload {
  file: Pick<FileRow, 'id' | 'title' | 'course_id' | 'folder_id'>;
  document: Pick<DocumentRow, 'id' | 'file_id' | 'tab' | 'content'>;
}

/** A blank document ("Untitled document", one empty page); returns its file id. */
export async function createDocument(params: CreateDocumentParams): Promise<string> {
  const payload: CreateDocumentPayload = {
    file: { id: newId(), title: cleanName(params.title ?? UNTITLED_DOCUMENT), course_id: params.courseId, folder_id: params.folderId },
    document: { id: newId(), file_id: '', tab: 'notes', content: blankDoc() as unknown as NonNullable<Json> },
  };
  payload.document.file_id = payload.file.id;

  if (syncEnabled && isOffline()) return createDocumentOnDevice(payload);
  try {
    await createDocumentRows(payload, (error, message) => serviceError(error, message));
  } catch (err) {
    if (syncEnabled && isNetworkError(err)) return createDocumentOnDevice(payload);
    throw err;
  }
  const [{ data: file }, { data: document }] = await Promise.all([
    supabase.from('files').select('*').eq('id', payload.file.id).maybeSingle(),
    supabase.from('documents').select('*').eq('id', payload.document.id).maybeSingle(),
  ]);
  if (file) remember('files', [file]);
  if (document) remember('documents', [document]);
  notifyLibraryUpdated();
  return payload.file.id;
}

async function createDocumentOnDevice(payload: CreateDocumentPayload): Promise<string> {
  const userId = cacheUser();
  if (!userId) throw new Error('Could not create the document.');
  const at = new Date().toISOString();
  const file: FileRow = {
    ...payload.file,
    user_id: userId,
    kind: 'document',
    sort_order: 0,
    starred_at: null,
    last_opened_at: at,
    deleted_at: null,
    created_at: at,
    updated_at: at,
    changed_at: at,
  };
  const document: DocumentRow = { ...payload.document, user_id: userId, created_at: at, updated_at: at };
  await saveLocalRow('files', file);
  await saveLocalRow('documents', document);
  await enqueue<CreateDocumentPayload>({ kind: 'create_document', key: file.id, payload });
  notifyLibraryUpdated();
  return file.id;
}

type ErrorOf = (error: { code?: string; message?: string }, message: string) => Error;

/**
 * Creates the document's rows; rows that already exist are left as they
 * are (ignoreDuplicates), so this is safe to run twice. Never deletes.
 */
async function createDocumentRows(payload: CreateDocumentPayload, fail: ErrorOf = syncError): Promise<void> {
  const { file, document } = payload;
  const { error } = await supabase
    .from('files')
    .upsert({ id: file.id, kind: 'document', title: file.title, course_id: file.course_id, folder_id: file.folder_id }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw fail(error, 'Could not create the document.');
  const { error: docError } = await supabase
    .from('documents')
    .upsert({ id: document.id, file_id: document.file_id, tab: document.tab, content: document.content as NonNullable<Json> }, { onConflict: 'file_id,tab', ignoreDuplicates: true });
  if (docError) throw fail(docError, 'Could not create the document.');
}

/**
 * Before an edit, a rename or a version is sent: makes sure the server has
 * the file, creating it from this iPhone's copy when its own create step
 * went missing.
 */
export async function ensureDocumentOnServer(fileId: string): Promise<void> {
  const { data, error } = await supabase.from('files').select('id').eq('id', fileId).maybeSingle();
  if (error) throw syncError(error, 'Could not check the document.');
  if (data) return;
  const file = await readRow<FileRow>('files', fileId);
  if (!file) throw new PermanentSyncError('This document is no longer on this iPhone or on Studiply.', `file ${fileId} missing`);
  const { error: insertError } = await supabase
    .from('files')
    .upsert({ id: file.id, kind: file.kind, title: file.title, course_id: file.course_id, folder_id: file.folder_id }, { onConflict: 'id', ignoreDuplicates: true });
  if (insertError) throw syncError(insertError, 'Could not create the document.');
}

// -------------------------------------------------------------------
// Saving
// -------------------------------------------------------------------

export interface SavedDocument {
  content: DocJSON;
  updatedAt: string | null;
  /** On the iPhone: saved here and waiting to be sent. */
  queued: boolean;
  /** Blocks where another device's newer edit was kept (this one is in version history). */
  lost: string[];
}

/**
 * Saves `next`, written on top of `base` (the document as last loaded or
 * saved). `restamp` dates every change now (restoring a version).
 */
export async function saveDocument(params: {
  fileId: string;
  tab: DocTab;
  base: DocJSON;
  next: DocJSON;
  restamp?: boolean;
}): Promise<SavedDocument> {
  const { fileId, tab, base, next } = params;
  const edit = makeDocEdit({ id: newId(), device: await getDeviceId(), base, next, now: Date.now(), restamp: params.restamp });
  if (!edit) return { content: next, updatedAt: null, queued: false, lost: [] };
  if (syncEnabled) return saveOnDevice(fileId, tab, next, edit);

  try {
    const { row, conflicts } = await applyDocEdit(fileId, tab, edit);
    return { content: asDoc(row.content), updatedAt: row.updated_at, queued: false, lost: lostBlocks(conflicts) };
  } catch (err) {
    if (isNetworkError(err)) throw err;
    if (__DEV__) console.warn('[document] save failed', err);
    throw new Error('Could not save the document.');
  }
}

const lostBlocks = (conflicts: DocConflict[]) => conflicts.filter((c) => c.kept === 'other').map((c) => c.blockId);

export interface DocumentEditPayload {
  fileId: string;
  tab: DocTab;
  /** This iPhone's row id for the tab (the server may have another if both devices created it). */
  localId: string;
  edit: DocEdit;
}

const editKey = (fileId: string, tab: DocTab) => `${fileId}:${tab}`;

/** iPhone: saved in the cache at once (shows and survives offline), then queued. */
async function saveOnDevice(fileId: string, tab: DocTab, next: DocJSON, edit: DocEdit): Promise<SavedDocument> {
  const userId = cacheUser();
  if (!userId) throw new Error('Could not save the document.');
  const at = new Date().toISOString();
  const existing = await localDocument(fileId, tab);
  const row: DocumentRow = existing
    ? { ...existing, content: next as unknown as NonNullable<Json>, updated_at: at }
    : { id: newId(), user_id: userId, file_id: fileId, tab, content: next as unknown as NonNullable<Json>, created_at: at, updated_at: at };
  await saveLocalRow('documents', row);
  await enqueue<DocumentEditPayload>({ kind: 'document_edit', key: editKey(fileId, tab), payload: { fileId, tab, localId: row.id, edit } });
  return { content: next, updatedAt: null, queued: true, lost: [] };
}

// -------------------------------------------------------------------
// applyDocEdit
// Merges an edit into the document on the server. The write only succeeds
// if nobody wrote the document since it was read (compare-and-swap on
// updated_at); otherwise it is read and merged again. Blocks that lost a
// conflict are stored as versions first, so they can't get lost. Safe to
// run twice for the same edit.
// -------------------------------------------------------------------
const MERGE_ATTEMPTS = 3;

export async function applyDocEdit(
  fileId: string,
  tab: DocTab,
  edit: DocEdit,
  newRowId: string = newId(),
): Promise<{ row: DocumentRow; conflicts: DocConflict[] }> {
  for (let attempt = 0; attempt < MERGE_ATTEMPTS; attempt++) {
    const { data: row, error } = await supabase.from('documents').select('*').eq('file_id', fileId).eq('tab', tab).maybeSingle();
    if (error) throw syncError(error, 'Could not save the document.');
    if (!row) {
      // The tab's first save: create it empty (or find another device's), then merge.
      const { error: insertError } = await supabase
        .from('documents')
        .upsert({ id: newRowId, file_id: fileId, tab, content: EMPTY as unknown as NonNullable<Json> }, { onConflict: 'file_id,tab', ignoreDuplicates: true });
      if (insertError) throw syncError(insertError, 'Could not save the document.');
      attempt--;
      continue;
    }

    const merged = mergeDocEdit(asDoc(row.content), edit);
    await saveConflictVersions(row, edit, merged.versions);
    if (!merged.changed) return { row, conflicts: merged.conflicts };

    const { data: saved, error: writeError } = await supabase
      .from('documents')
      .update({ content: merged.doc as unknown as NonNullable<Json> })
      .eq('id', row.id)
      .eq('updated_at', row.updated_at)
      .select('*');
    if (writeError) throw syncError(writeError, 'Could not save the document.');
    if (saved.length === 1) return { row: saved[0], conflicts: merged.conflicts };
    // Written by another device in between: read it again and merge.
  }
  throw new SyncBusyError();
}

class SyncBusyError extends Error {
  readonly status = 503;
  constructor() {
    super('The document kept changing on another device; trying again later.');
  }
}

async function saveConflictVersions(row: DocumentRow, edit: DocEdit, versions: DocConflictVersion[]): Promise<void> {
  for (const v of versions) {
    // A resent edit finds the version it stored the first time.
    const { data: existing, error } = await supabase
      .from('document_versions')
      .select('id')
      .eq('document_id', row.id)
      .eq('content->conflict->>editId', edit.id)
      .eq('content->conflict->>side', v.side)
      .limit(1);
    if (error) throw syncError(error, 'Could not keep the other version.');
    if (existing.length > 0) continue;

    const content = { ...v.content, conflict: { ...v.content.conflict, editId: edit.id } };
    const { error: insertError } = await supabase.from('document_versions').insert({
      document_id: row.id,
      file_id: row.file_id,
      reason: 'conflict',
      content: content as unknown as NonNullable<Json>,
    });
    if (insertError) throw syncError(insertError, 'Could not keep the other version.');
  }
}

const conflictKey = (fileId: string, tab: DocTab) => `${cacheUser()}:docconflict:${fileId}:${tab}`;

/**
 * Blocks where this iPhone's edit lost to a newer one from another device,
 * once (the screen tells the student, then forgets it).
 */
export async function takeDocumentConflicts(fileId: string, tab: DocTab): Promise<string[]> {
  const raw = await getMeta(conflictKey(fileId, tab)).catch(() => null);
  if (!raw) return [];
  await deleteMeta(conflictKey(fileId, tab)).catch(() => {});
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

// -------------------------------------------------------------------
// Renaming
// -------------------------------------------------------------------

interface RenameDocumentPayload {
  id: string;
  title: string;
}

/** Renames a blank document (a lecture is renamed through session.service). */
export async function renameDocument(fileId: string, rawTitle: string): Promise<string> {
  const title = cleanName(rawTitle);
  if (syncEnabled && isOffline()) return renameOnDevice(fileId, title);
  try {
    const { data, error } = await supabase.from('files').update({ title }).eq('id', fileId).select('*').maybeSingle();
    if (error) throw serviceError(error, 'Could not rename the document.');
    if (data) remember('files', [data]);
  } catch (err) {
    if (syncEnabled && isNetworkError(err)) return renameOnDevice(fileId, title);
    throw err;
  }
  notifyLibraryUpdated();
  return title;
}

async function renameOnDevice(fileId: string, title: string): Promise<string> {
  const file = await readRow<FileRow>('files', fileId);
  if (!file) throw new Error('Could not rename the document.');
  const renamed: FileRow = { ...file, title, updated_at: new Date().toISOString() };
  await saveLocalRow('files', renamed);
  await enqueue<RenameDocumentPayload>({ kind: 'rename_document', key: fileId, payload: { id: fileId, title } });
  notifyLibraryUpdated();
  return title;
}

// -------------------------------------------------------------------
// Versions
// -------------------------------------------------------------------

interface SaveVersionPayload {
  id: string;
  fileId: string;
  tab: DocTab;
  content: DocJSON;
  reason: VersionReason;
}

/**
 * Keeps `content` as a version of the tab (the end of an editing session, an
 * AI generation, the text before a restore). The iPhone queues it after the
 * edits waiting for the same tab; insert-or-ignore, so safe to send twice.
 */
export async function saveVersion(fileId: string, tab: DocTab, content: DocJSON, reason: VersionReason): Promise<string> {
  const payload: SaveVersionPayload = { id: newId(), fileId, tab, content, reason };
  if (syncEnabled) {
    await enqueue<SaveVersionPayload>({ kind: 'save_version', key: editKey(fileId, tab), payload });
    return payload.id;
  }
  await insertVersion(payload, (error, message) => serviceError(error, message));
  return payload.id;
}

async function insertVersion(payload: SaveVersionPayload, fail: ErrorOf = syncError): Promise<void> {
  const { data: doc, error } = await supabase.from('documents').select('id').eq('file_id', payload.fileId).eq('tab', payload.tab).maybeSingle();
  if (error) throw fail(error, 'Could not save the version.');
  const { error: insertError } = await supabase.from('document_versions').upsert(
    {
      id: payload.id,
      document_id: doc?.id ?? null,
      file_id: payload.fileId,
      reason: payload.reason,
      content: payload.content as unknown as NonNullable<Json>,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (insertError) throw fail(insertError, 'Could not save the version.');
}

export type VersionSummary = Pick<VersionRow, 'id' | 'reason' | 'created_at'>;

/** The tab's versions, newest first, without their content. Online only. */
export async function listVersions(fileId: string, tab: DocTab): Promise<VersionSummary[]> {
  const { data: doc, error } = await supabase.from('documents').select('id').eq('file_id', fileId).eq('tab', tab).maybeSingle();
  if (error) throw serviceError(error, 'Could not load the version history.');
  if (!doc) return [];
  const { data, error: listError } = await supabase
    .from('document_versions')
    .select('id, reason, created_at')
    .eq('document_id', doc.id)
    .order('created_at', { ascending: false });
  if (listError) throw serviceError(listError, 'Could not load the version history.');
  return data;
}

/** One version's document. */
export async function getVersion(id: string): Promise<DocJSON> {
  const { data, error } = await supabase.from('document_versions').select('content').eq('id', id).single();
  if (error) throw serviceError(error, 'Could not open this version.');
  const { conflict: _conflict, ...doc } = data.content as unknown as DocJSON & { conflict?: unknown };
  return asDoc(doc);
}

// -------------------------------------------------------------------
// The queued steps (iPhone)
// -------------------------------------------------------------------

/** The tab as the server has it now: replaces this iPhone's copy unless more is waiting. */
async function refreshSyncedDocument(row: DocumentRow, localId: string, key: string): Promise<void> {
  // The running operation itself is still listed.
  if ((await pendingSyncFor(key)).length > 1) return;
  if (row.id === localId) {
    await markClean('documents', localId, row);
  } else {
    // Both devices created this tab: the server's row is the one.
    await markClean('documents', localId);
    await dropRows('documents', [localId]);
    remember('documents', [row]);
  }
}

registerSyncHandler<CreateDocumentPayload>('create_document', {
  run: async (payload) => {
    // The iPhone's latest title and place (renamed or moved since).
    const local = await readRow<FileRow>('files', payload.file.id);
    const file = local ? { id: local.id, title: local.title, course_id: local.course_id, folder_id: local.folder_id } : payload.file;
    await createDocumentRows({ ...payload, file });
    if ((await pendingSyncFor(payload.file.id)).length <= 1) {
      const { data } = await supabase.from('files').select('*').eq('id', payload.file.id).maybeSingle();
      if (data) await markClean('files', data.id, data);
    }
    notifyLibraryUpdated();
  },
});

registerSyncHandler<DocumentEditPayload>('document_edit', {
  run: async ({ fileId, tab, localId, edit }) => {
    await ensureDocumentOnServer(fileId);
    const { row, conflicts } = await applyDocEdit(fileId, tab, edit, localId);
    await refreshSyncedDocument(row, localId, editKey(fileId, tab));
    const lost = lostBlocks(conflicts);
    if (lost.length > 0) await setMeta(conflictKey(fileId, tab), JSON.stringify(lost));
    notifyLibraryUpdated();
  },
  merge: (earlier, later) => ({ ...later, edit: combineDocEdits(earlier.edit, later.edit) }),
});

registerSyncHandler<RenameDocumentPayload>('rename_document', {
  run: async ({ id, title }) => {
    await ensureDocumentOnServer(id);
    const { data, error } = await supabase.from('files').update({ title }).eq('id', id).select('*').maybeSingle();
    if (error) throw syncError(error, 'Could not rename the document.');
    if (data && (await pendingSyncFor(id)).length <= 1) await markClean('files', id, data);
    notifyLibraryUpdated();
  },
  merge: (_earlier, later) => later,
});

registerSyncHandler<SaveVersionPayload>('save_version', {
  run: async (payload) => {
    await ensureDocumentOnServer(payload.fileId);
    await insertVersion(payload);
  },
});
