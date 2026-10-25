import { supabase } from '../lib/supabase';
import { folderSubtree, serviceError } from '../lib/cloudRows';
import { Buckets, removeFiles, type Bucket } from './cloud-storage.service';

/**
 * Trash is `deleted_at` on courses, folders and files (step 1.2 schema).
 *
 * Supabase has no multi-statement transactions from the app, so each action
 * is a few writes in a safe order: trashing marks children before the
 * parent, so a failure never hides a parent whose contents still show.
 * Every write of one action shares one timestamp; restoring an item brings
 * back the children with that same timestamp (and not the ones trashed on
 * their own), as before.
 *
 * In the database, deleting a course or folder deletes everything in it.
 * So a restored item never stays under a trashed parent: restoring a
 * lecture or folder also restores its trashed folders and course above it.
 * Permanent deletes also remove the lectures' files from Storage.
 */

// -------------------------------------------------------------------
// TrashItem — unified view of any trashed entity
// -------------------------------------------------------------------
export interface TrashItem {
  id: string;
  type: 'project' | 'session' | 'folder';
  name: string;
  deletedAt: string;
  /** Days remaining before permanent deletion (30-day window) */
  daysRemaining: number;
}

/** How long a trashed item survives before auto-cleanup. */
const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Ids per `in (...)` filter, to keep request URLs short. */
const ID_BATCH = 100;

function daysUntilExpiry(deletedAt: string): number {
  const expiry = new Date(deletedAt).getTime() + RETENTION_MS;
  return Math.max(0, Math.ceil((expiry - Date.now()) / (24 * 60 * 60 * 1000)));
}

function batches<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += ID_BATCH) out.push(items.slice(i, i + ID_BATCH));
  return out;
}

const TRASH_ERROR = 'Could not move this to the trash.';
const RESTORE_ERROR = 'Could not restore this item.';
const DELETE_ERROR = 'Could not delete this permanently.';

/** The folder and every folder below it, among the folders of the same course. */
async function subtreeOf(folderId: string): Promise<string[]> {
  const { data: root, error } = await supabase.from('folders').select('course_id').eq('id', folderId).maybeSingle();
  if (error) throw serviceError(error, TRASH_ERROR);
  if (!root) return [folderId];

  let query = supabase.from('folders').select('id, parent_id');
  query = root.course_id === null ? query.is('course_id', null) : query.eq('course_id', root.course_id);
  const { data: folders, error: listError } = await query;
  if (listError) throw serviceError(listError, TRASH_ERROR);
  return folderSubtree(folderId, folders);
}

// -------------------------------------------------------------------
// trashProject — soft-delete a project and cascade to its children
// -------------------------------------------------------------------
export async function trashProject(projectId: string): Promise<void> {
  const stamp = new Date().toISOString();

  // All three writes share one timestamp: restoreItem uses that shared value
  // to identify exactly which children this operation cascaded over, so a
  // restore puts back what this delete took and nothing else.
  const files = await supabase.from('files').update({ deleted_at: stamp }).eq('course_id', projectId).is('deleted_at', null);
  if (files.error) throw serviceError(files.error, TRASH_ERROR);
  const folders = await supabase.from('folders').update({ deleted_at: stamp }).eq('course_id', projectId).is('deleted_at', null);
  if (folders.error) throw serviceError(folders.error, TRASH_ERROR);
  const course = await supabase.from('courses').update({ deleted_at: stamp }).eq('id', projectId);
  if (course.error) throw serviceError(course.error, TRASH_ERROR);
}

// -------------------------------------------------------------------
// trashFolder — soft-delete a folder, its subfolders, and their sessions
// -------------------------------------------------------------------
export async function trashFolder(folderId: string): Promise<void> {
  const stamp = new Date().toISOString();
  const ids = await subtreeOf(folderId);

  for (const batch of batches(ids)) {
    const { error } = await supabase.from('files').update({ deleted_at: stamp }).in('folder_id', batch).is('deleted_at', null);
    if (error) throw serviceError(error, TRASH_ERROR);
  }
  // The folder itself last, so it only disappears once its contents are trashed.
  const below = ids.filter((id) => id !== folderId);
  for (const batch of batches(below)) {
    const { error } = await supabase.from('folders').update({ deleted_at: stamp }).in('id', batch).is('deleted_at', null);
    if (error) throw serviceError(error, TRASH_ERROR);
  }
  const { error } = await supabase.from('folders').update({ deleted_at: stamp }).eq('id', folderId);
  if (error) throw serviceError(error, TRASH_ERROR);
}

// -------------------------------------------------------------------
// trashSession — soft-delete a single lecture (its note goes with it)
// -------------------------------------------------------------------
export async function trashSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from('files').update({ deleted_at: new Date().toISOString() }).eq('id', sessionId);
  if (error) throw serviceError(error, TRASH_ERROR);
}

// -------------------------------------------------------------------
// getTrashItems — all soft-deleted items for a user, newest first
// -------------------------------------------------------------------
export async function getTrashItems(_userId: string): Promise<TrashItem[]> {
  const [courses, folders, files] = await Promise.all([
    supabase.from('courses').select('id, name, deleted_at').not('deleted_at', 'is', null),
    supabase.from('folders').select('id, name, deleted_at').not('deleted_at', 'is', null),
    supabase.from('files').select('id, title, deleted_at').not('deleted_at', 'is', null),
  ]);
  const error = courses.error ?? folders.error ?? files.error;
  if (error) throw serviceError(error, 'Could not load the trash.');

  const item = (id: string, type: TrashItem['type'], name: string, deletedAt: string | null): TrashItem => ({
    id,
    type,
    name,
    deletedAt: deletedAt as string,
    daysRemaining: daysUntilExpiry(deletedAt as string),
  });

  return [
    ...(courses.data ?? []).map((c) => item(c.id, 'project', c.name, c.deleted_at)),
    ...(files.data ?? []).map((f) => item(f.id, 'session', f.title, f.deleted_at)),
    ...(folders.data ?? []).map((f) => item(f.id, 'folder', f.name, f.deleted_at)),
  ].sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
}

// -------------------------------------------------------------------
// getTrashCount — total number of trashed items for a user
// -------------------------------------------------------------------
export async function getTrashCount(_userId: string): Promise<number> {
  const counts = await Promise.all(
    (['courses', 'folders', 'files'] as const).map((table) =>
      supabase.from(table).select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
    ),
  );
  const error = counts.find((c) => c.error)?.error;
  if (error) throw serviceError(error, 'Could not load the trash.');
  return counts.reduce((sum, c) => sum + (c.count ?? 0), 0);
}

// -------------------------------------------------------------------
// restoreItem — undo a trash operation
// -------------------------------------------------------------------
// Restoring an item also restores the children that were trashed as part of
// the same operation, matched on the shared deleted_at stamp. Children
// trashed separately keep their own stamp and stay in the trash.
export async function restoreItem(item: Pick<TrashItem, 'id' | 'type'>): Promise<void> {
  const table = tableFor(item.type);
  const { data: row, error } = await supabase.from(table).select('deleted_at').eq('id', item.id).maybeSingle();
  if (error) throw serviceError(error, RESTORE_ERROR);
  if (!row) throw new Error('That item is no longer in the trash.');
  const stamp = row.deleted_at;

  // Parents first: the item must not come back under a trashed folder or course.
  await restoreParents(item);

  const restored = await supabase.from(table).update({ deleted_at: null }).eq('id', item.id);
  if (restored.error) throw serviceError(restored.error, RESTORE_ERROR);
  if (!stamp) return;

  if (item.type === 'project') {
    for (const child of ['folders', 'files'] as const) {
      const { error: childError } = await supabase
        .from(child)
        .update({ deleted_at: null })
        .eq('course_id', item.id)
        .eq('deleted_at', stamp);
      if (childError) throw serviceError(childError, RESTORE_ERROR);
    }
  }

  if (item.type === 'folder') {
    const ids = await subtreeOf(item.id);
    for (const batch of batches(ids)) {
      const folders = await supabase.from('folders').update({ deleted_at: null }).in('id', batch).eq('deleted_at', stamp);
      if (folders.error) throw serviceError(folders.error, RESTORE_ERROR);
      const files = await supabase.from('files').update({ deleted_at: null }).in('folder_id', batch).eq('deleted_at', stamp);
      if (files.error) throw serviceError(files.error, RESTORE_ERROR);
    }
  }
}

/** Restores the trashed course and folders above a lecture or folder. */
async function restoreParents(item: Pick<TrashItem, 'id' | 'type'>): Promise<void> {
  if (item.type === 'project') return;

  const { data: self, error } =
    item.type === 'session'
      ? await supabase.from('files').select('course_id, folder_id').eq('id', item.id).maybeSingle()
      : await supabase.from('folders').select('course_id, folder_id:parent_id').eq('id', item.id).maybeSingle();
  if (error) throw serviceError(error, RESTORE_ERROR);
  if (!self) return;

  const seen = new Set<string>();
  let folderId = self.folder_id;
  while (folderId && !seen.has(folderId)) {
    seen.add(folderId);
    const { data: folder, error: folderError } = await supabase
      .from('folders')
      .select('id, parent_id, deleted_at')
      .eq('id', folderId)
      .maybeSingle();
    if (folderError) throw serviceError(folderError, RESTORE_ERROR);
    if (!folder) break;
    if (folder.deleted_at) {
      const { error: upError } = await supabase.from('folders').update({ deleted_at: null }).eq('id', folder.id);
      if (upError) throw serviceError(upError, RESTORE_ERROR);
    }
    folderId = folder.parent_id;
  }

  if (self.course_id) {
    const { error: courseError } = await supabase
      .from('courses')
      .update({ deleted_at: null })
      .eq('id', self.course_id)
      .not('deleted_at', 'is', null);
    if (courseError) throw serviceError(courseError, RESTORE_ERROR);
  }
}

// -------------------------------------------------------------------
// permanentlyDelete — hard delete a single item
// The database deletes everything inside it (folders, lectures, notes,
// transcripts); the lectures' files in Storage are removed afterwards.
// -------------------------------------------------------------------
export async function permanentlyDelete(item: Pick<TrashItem, 'id' | 'type'>): Promise<void> {
  const fileIds = await filesInside(item);
  const paths = await storagePathsOf(fileIds);

  const { error } = await supabase.from(tableFor(item.type)).delete().eq('id', item.id);
  if (error) throw serviceError(error, DELETE_ERROR);
  await removeStorage(paths);
}

// -------------------------------------------------------------------
// emptyTrash — permanently delete all trashed items for a user
// -------------------------------------------------------------------
export async function emptyTrash(_userId: string): Promise<void> {
  await purgeTrashed(null);
}

// -------------------------------------------------------------------
// autoCleanTrash — permanently delete items trashed > 30 days ago
// Called fire-and-forget from AuthProvider after sign-in.
// -------------------------------------------------------------------
export async function autoCleanTrash(_userId: string): Promise<void> {
  await purgeTrashed(new Date(Date.now() - RETENTION_MS).toISOString());
}

// -------------------------------------------------------------------
// helpers
// -------------------------------------------------------------------

/**
 * Hard-deletes trashed rows, optionally only those trashed before `cutoff`.
 * Lectures first, then folders, then courses; Storage files last, once the
 * rows that point at them are gone.
 */
async function purgeTrashed(cutoff: string | null): Promise<void> {
  const trashed = async (table: 'courses' | 'folders' | 'files') => {
    let query = supabase.from(table).select('id').not('deleted_at', 'is', null);
    if (cutoff) query = query.lt('deleted_at', cutoff);
    const { data, error } = await query;
    if (error) throw serviceError(error, DELETE_ERROR);
    return data.map((r) => r.id);
  };
  const [courseIds, folderIds, fileIds] = await Promise.all([trashed('courses'), trashed('folders'), trashed('files')]);

  const inside = [
    ...(await Promise.all(courseIds.map((id) => filesInside({ id, type: 'project' })))).flat(),
    ...(await Promise.all(folderIds.map((id) => filesInside({ id, type: 'folder' })))).flat(),
  ];
  const paths = await storagePathsOf([...new Set([...fileIds, ...inside])]);

  for (const [table, ids] of [['files', fileIds], ['folders', folderIds], ['courses', courseIds]] as const) {
    for (const batch of batches(ids)) {
      const { error } = await supabase.from(table).delete().in('id', batch);
      if (error) throw serviceError(error, DELETE_ERROR);
    }
  }
  await removeStorage(paths);
}

/** Ids of the lecture files an item holds (itself, for a lecture). */
async function filesInside(item: Pick<TrashItem, 'id' | 'type'>): Promise<string[]> {
  if (item.type === 'session') return [item.id];

  if (item.type === 'project') {
    const { data, error } = await supabase.from('files').select('id').eq('course_id', item.id);
    if (error) throw serviceError(error, DELETE_ERROR);
    return data.map((f) => f.id);
  }

  const ids: string[] = [];
  for (const batch of batches(await subtreeOf(item.id))) {
    const { data, error } = await supabase.from('files').select('id').in('folder_id', batch);
    if (error) throw serviceError(error, DELETE_ERROR);
    ids.push(...data.map((f) => f.id));
  }
  return ids;
}

type StoragePaths = Map<Bucket, string[]>;

/**
 * Storage objects of these files: audio chunks, photos and slides, found
 * through their rows (lecture_id / file_id), never by path prefix. A photo
 * moved to another lecture keeps its old path ({uid}/{oldLecture}/…), so a
 * prefix would delete it with the old lecture; its row now points to the
 * new lecture and keeps it out of this list.
 */
async function storagePathsOf(fileIds: string[]): Promise<StoragePaths> {
  const paths: StoragePaths = new Map();
  const add = (bucket: Bucket, path: string | null) => {
    if (path) paths.set(bucket, [...(paths.get(bucket) ?? []), path]);
  };

  for (const batch of batches(fileIds)) {
    const [chunks, byLecture, byFile] = await Promise.all([
      supabase.from('audio_chunks').select('storage_path').in('lecture_id', batch),
      supabase.from('media').select('kind, storage_path').in('lecture_id', batch),
      supabase.from('media').select('kind, storage_path').in('file_id', batch),
    ]);
    const error = chunks.error ?? byLecture.error ?? byFile.error;
    if (error) throw serviceError(error, DELETE_ERROR);
    for (const c of chunks.data ?? []) add(Buckets.audioChunks, c.storage_path);
    for (const m of [...(byLecture.data ?? []), ...(byFile.data ?? [])]) {
      add(m.kind === 'photo' ? Buckets.photos : Buckets.slides, m.storage_path);
    }
  }
  return paths;
}

/**
 * Best effort: the rows are already gone, so a failure here only leaves
 * unreachable files behind (removed with the account in step 10.1).
 */
async function removeStorage(paths: StoragePaths): Promise<void> {
  for (const [bucket, list] of paths) {
    for (const batch of batches([...new Set(list)])) {
      await removeFiles(bucket, batch).catch((err) => {
        if (__DEV__) console.warn('[trash] Could not remove files from Storage', bucket, err);
      });
    }
  }
}

function tableFor(type: TrashItem['type']): 'courses' | 'files' | 'folders' {
  switch (type) {
    case 'project': return 'courses';
    case 'session': return 'files';
    case 'folder':  return 'folders';
  }
}
