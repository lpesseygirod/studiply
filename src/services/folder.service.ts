import { all, count, first, run } from '../lib/db';
import { mapFolder, newId, now, type FolderRow } from '../lib/mappers';
import type { Folder } from '../types/database';

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
  const id = newId();
  const timestamp = now();

  await run(
    `INSERT INTO folders (id, user_id, project_id, parent_folder_id, name, sort_order,
                          is_deleted, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, NULL, ?, ?)`,
    [
      id,
      params.userId,
      params.projectId,
      params.parentFolderId ?? null,
      params.name,
      timestamp,
      timestamp,
    ],
  );

  return getFolder(id);
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
  let sql = `SELECT * FROM folders WHERE project_id = ? AND is_deleted = 0`;
  const values: (string | null)[] = [params.projectId];

  if (params.parentFolderId !== undefined) {
    if (params.parentFolderId === null) {
      sql += ` AND parent_folder_id IS NULL`;
    } else {
      sql += ` AND parent_folder_id = ?`;
      values.push(params.parentFolderId);
    }
  }

  sql += ` ORDER BY sort_order ASC, name ASC`;

  const rows = await all<FolderRow>(sql, values);
  return rows.map(mapFolder);
}

// -------------------------------------------------------------------
// getFolder
// -------------------------------------------------------------------
export async function getFolder(folderId: string): Promise<Folder> {
  const row = await first<FolderRow>(`SELECT * FROM folders WHERE id = ?`, [folderId]);
  if (!row) throw new Error('Folder not found.');
  return mapFolder(row);
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
  await run(`UPDATE folders SET name = ?, updated_at = ? WHERE id = ?`, [
    name,
    now(),
    folderId,
  ]);
}

// -------------------------------------------------------------------
// isDescendantOf — true when `candidateId` sits somewhere under `folderId`
// -------------------------------------------------------------------
async function isDescendantOf(candidateId: string, folderId: string): Promise<boolean> {
  const visited = new Set<string>();
  let currentId: string | null = candidateId;

  while (currentId) {
    if (currentId === folderId) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);

    const row: FolderRow | null = await first<FolderRow>(
      `SELECT * FROM folders WHERE id = ?`,
      [currentId],
    );
    if (!row) return false;
    currentId = row.parent_folder_id;
  }

  return false;
}

// -------------------------------------------------------------------
// moveFolder — change parent (within same project)
// -------------------------------------------------------------------
export async function moveFolder(
  folderId: string,
  newParentFolderId: string | null,
): Promise<void> {
  if (newParentFolderId !== null) {
    // Reparenting a folder into itself or into one of its own descendants
    // would detach that whole subtree into an unreachable cycle.
    if (newParentFolderId === folderId) {
      throw new Error("A folder can't be moved into itself.");
    }
    if (await isDescendantOf(newParentFolderId, folderId)) {
      throw new Error("A folder can't be moved into one of its own subfolders.");
    }
  }

  await run(`UPDATE folders SET parent_folder_id = ?, updated_at = ? WHERE id = ?`, [
    newParentFolderId,
    now(),
    folderId,
  ]);
}

// -------------------------------------------------------------------
// getFolderCount — number of non-deleted folders at a given level
// -------------------------------------------------------------------
export async function getFolderCount(params: {
  projectId: string;
  parentFolderId?: string | null;
}): Promise<number> {
  let sql = `SELECT COUNT(*) AS count FROM folders WHERE project_id = ? AND is_deleted = 0`;
  const values: (string | null)[] = [params.projectId];

  if (params.parentFolderId !== undefined) {
    if (params.parentFolderId === null) {
      sql += ` AND parent_folder_id IS NULL`;
    } else {
      sql += ` AND parent_folder_id = ?`;
      values.push(params.parentFolderId);
    }
  }

  return count(sql, values);
}
