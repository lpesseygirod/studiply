import { supabase } from '../lib/supabase';
import { folderFromRow, PgCodes, serviceError } from '../lib/cloudRows';
import type { Folder } from '../types/database';

/**
 * Folders live in the `folders` table (step 1.2 schema): `course_id` is the
 * old project id and `parent_id` the old parent folder. The database keeps a
 * folder's course equal to its parent's and refuses cycles itself.
 */

// -------------------------------------------------------------------
// Breadcrumb type used for folder navigation
// -------------------------------------------------------------------
export interface Breadcrumb {
  id: string | null;   // null = project root
  name: string;
  type: 'project' | 'folder';
}

// -------------------------------------------------------------------
// createFolder
// -------------------------------------------------------------------
export async function createFolder(params: {
  userId: string;
  projectId: string;
  parentFolderId?: string | null;
  name: string;
}): Promise<Folder> {
  const { data, error } = await supabase
    .from('folders')
    .insert({
      course_id: params.projectId,
      parent_id: params.parentFolderId ?? null,
      name: params.name,
    })
    .select('*')
    .single();
  if (error) throw serviceError(error, 'Could not create the folder.');
  return folderFromRow(data);
}

// -------------------------------------------------------------------
// getFolders — list folders inside a project (optionally filtered by parent)
// Pass parentFolderId = null  → root-level folders
// Pass parentFolderId = string → children of that folder
// Omit parentFolderId         → all folders in the project
// -------------------------------------------------------------------
export async function getFolders(params: {
  projectId: string;
  parentFolderId?: string | null;
}): Promise<Folder[]> {
  let query = supabase
    .from('folders')
    .select('*')
    .eq('course_id', params.projectId)
    .is('deleted_at', null);

  if (params.parentFolderId === null) query = query.is('parent_id', null);
  else if (params.parentFolderId !== undefined) query = query.eq('parent_id', params.parentFolderId);

  const { data, error } = await query
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw serviceError(error, 'Could not load the folders.');
  return data.map(folderFromRow);
}

// -------------------------------------------------------------------
// getFolder
// -------------------------------------------------------------------
export async function getFolder(folderId: string): Promise<Folder> {
  const { data, error } = await supabase.from('folders').select('*').eq('id', folderId).maybeSingle();
  if (error) throw serviceError(error, 'Could not load the folder.');
  if (!data) throw new Error('Folder not found.');
  return folderFromRow(data);
}

// -------------------------------------------------------------------
// getFolderBreadcrumbs — walk up the tree from a folder to project root
// Returns path ordered from root → current folder.
// The first entry is always the project-root breadcrumb (id = null).
// -------------------------------------------------------------------
export async function getFolderBreadcrumbs(
  folderId: string,
  projectName: string,
): Promise<Breadcrumb[]> {
  const crumbs: Breadcrumb[] = [];
  const visited = new Set<string>();
  let currentId: string | null = folderId;

  while (currentId) {
    // A parent cycle would otherwise spin here forever and hang the screen.
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const folder = await getFolder(currentId);
    crumbs.unshift({ id: folder.id, name: folder.name, type: 'folder' });
    currentId = folder.parent_folder_id;
  }

  // Prepend project root
  crumbs.unshift({ id: null, name: projectName, type: 'project' });
  return crumbs;
}

// -------------------------------------------------------------------
// renameFolder
// -------------------------------------------------------------------
export async function renameFolder(folderId: string, name: string): Promise<void> {
  const { error } = await supabase.from('folders').update({ name }).eq('id', folderId);
  if (error) throw serviceError(error, 'Could not rename the folder.');
}

// -------------------------------------------------------------------
// moveFolder — change parent, and the project when one is given
// With a parent folder, the database takes the course from that parent;
// at a course's top level (parent null) the course must be sent, or the
// folder would stay in its old course. The database moves the folder's
// subfolders and files to the new course too.
// -------------------------------------------------------------------
export async function moveFolder(
  folderId: string,
  newParentFolderId: string | null,
  newProjectId?: string,
): Promise<void> {
  if (newParentFolderId === folderId) {
    throw new Error("A folder can't be moved into itself.");
  }

  const { error } = await supabase
    .from('folders')
    .update(
      newProjectId === undefined
        ? { parent_id: newParentFolderId }
        : { parent_id: newParentFolderId, course_id: newProjectId },
    )
    .eq('id', folderId);
  // The database refuses a move into one of the folder's own subfolders,
  // which would detach that whole subtree into an unreachable cycle.
  if (error?.code === PgCodes.checkViolation) {
    throw new Error("A folder can't be moved into one of its own subfolders.");
  }
  if (error) throw serviceError(error, 'Could not move the folder.');
}

// -------------------------------------------------------------------
// getFolderCount — number of non-deleted folders at a given level
// -------------------------------------------------------------------
export async function getFolderCount(params: {
  projectId: string;
  parentFolderId?: string | null;
}): Promise<number> {
  let query = supabase
    .from('folders')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', params.projectId)
    .is('deleted_at', null);

  if (params.parentFolderId === null) query = query.is('parent_id', null);
  else if (params.parentFolderId !== undefined) query = query.eq('parent_id', params.parentFolderId);

  const { count, error } = await query;
  if (error) throw serviceError(error, 'Could not load the folders.');
  return count ?? 0;
}
