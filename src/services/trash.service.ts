import { all, count, first, run, transaction } from '../lib/db';
import { now } from '../lib/mappers';

// -------------------------------------------------------------------
// TrashItem — unified view of any trashed entity
// -------------------------------------------------------------------
export interface TrashItem {
  id: string;
  type: 'project' | 'session' | 'folder' | 'note';
  name: string;
  deletedAt: string;
  /** Days remaining before permanent deletion (30-day window) */
  daysRemaining: number;
}

/** How long a trashed item survives before auto-cleanup. */
const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

function daysUntilExpiry(deletedAt: string): number {
  const expiry = new Date(deletedAt).getTime() + RETENTION_MS;
  return Math.max(0, Math.ceil((expiry - Date.now()) / (24 * 60 * 60 * 1000)));
}

/**
 * A folder plus every folder beneath it.
 *
 * Replaces the old per-level recursion (one round trip per subfolder), so a
 * whole subtree is trashed by a single statement inside one transaction.
 */
const SUBTREE_CTE = `
  WITH RECURSIVE subtree(id) AS (
    SELECT ?
    UNION
    SELECT f.id FROM folders f JOIN subtree s ON f.parent_folder_id = s.id
  )
`;

// -------------------------------------------------------------------
// trashProject — soft-delete a project and cascade to its children
// -------------------------------------------------------------------
export async function trashProject(projectId: string): Promise<void> {
  const timestamp = now();

  // All three writes share one timestamp: restoreItem uses that shared value
  // to identify exactly which children this operation cascaded over, so a
  // restore puts back what this delete took and nothing else.
  await transaction(async () => {
    await run(
      `UPDATE sessions SET is_deleted = 1, deleted_at = ?
        WHERE project_id = ? AND is_deleted = 0`,
      [timestamp, projectId],
    );
    await run(
      `UPDATE folders SET is_deleted = 1, deleted_at = ?
        WHERE project_id = ? AND is_deleted = 0`,
      [timestamp, projectId],
    );
    await run(
      `UPDATE projects SET is_deleted = 1, deleted_at = ? WHERE id = ?`,
      [timestamp, projectId],
    );
  });
}

// -------------------------------------------------------------------
// trashFolder — soft-delete a folder, its subfolders, and their sessions
// -------------------------------------------------------------------
export async function trashFolder(folderId: string): Promise<void> {
  const timestamp = now();

  await transaction(async () => {
    await run(
      `${SUBTREE_CTE}
       UPDATE sessions SET is_deleted = 1, deleted_at = ?
        WHERE folder_id IN (SELECT id FROM subtree) AND is_deleted = 0`,
      [folderId, timestamp],
    );
    await run(
      `${SUBTREE_CTE}
       UPDATE folders SET is_deleted = 1, deleted_at = ?
        WHERE id IN (SELECT id FROM subtree) AND is_deleted = 0`,
      [folderId, timestamp],
    );
  });
}

// -------------------------------------------------------------------
// trashSession — soft-delete a single session (and its notes)
// -------------------------------------------------------------------
export async function trashSession(sessionId: string): Promise<void> {
  const timestamp = now();

  await transaction(async () => {
    await run(
      `UPDATE notes SET is_deleted = 1, deleted_at = ?
        WHERE session_id = ? AND is_deleted = 0`,
      [timestamp, sessionId],
    );
    await run(
      `UPDATE sessions SET is_deleted = 1, deleted_at = ? WHERE id = ?`,
      [timestamp, sessionId],
    );
  });
}

// -------------------------------------------------------------------
// getTrashItems — all soft-deleted items for a user, newest first
// -------------------------------------------------------------------
// projects/folders name the column `name`; sessions/notes use `title`. The
// UNION aliases both to `name` so the app sees one shape.
export async function getTrashItems(userId: string): Promise<TrashItem[]> {
  const rows = await all<{
    id: string;
    type: TrashItem['type'];
    name: string;
    deleted_at: string;
  }>(
    `SELECT id, 'project' AS type, name,  deleted_at FROM projects WHERE user_id = ? AND is_deleted = 1
     UNION ALL
     SELECT id, 'session' AS type, title, deleted_at FROM sessions WHERE user_id = ? AND is_deleted = 1
     UNION ALL
     SELECT id, 'folder'  AS type, name,  deleted_at FROM folders  WHERE user_id = ? AND is_deleted = 1
     UNION ALL
     SELECT id, 'note'    AS type, title, deleted_at FROM notes    WHERE user_id = ? AND is_deleted = 1
     ORDER BY deleted_at DESC`,
    [userId, userId, userId, userId],
  );

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    name: row.name,
    deletedAt: row.deleted_at,
    daysRemaining: daysUntilExpiry(row.deleted_at),
  }));
}

// -------------------------------------------------------------------
// getTrashCount — total number of trashed items for a user
// -------------------------------------------------------------------
export async function getTrashCount(userId: string): Promise<number> {
  return count(
    `SELECT (
       (SELECT COUNT(*) FROM projects WHERE user_id = ? AND is_deleted = 1) +
       (SELECT COUNT(*) FROM sessions WHERE user_id = ? AND is_deleted = 1) +
       (SELECT COUNT(*) FROM folders  WHERE user_id = ? AND is_deleted = 1) +
       (SELECT COUNT(*) FROM notes    WHERE user_id = ? AND is_deleted = 1)
     ) AS count`,
    [userId, userId, userId, userId],
  );
}

// -------------------------------------------------------------------
// restoreItem — undo a trash operation
// -------------------------------------------------------------------
// Restoring an item also restores the children that were trashed as part of
// the same operation, matched on the shared deleted_at stamp. Children
// trashed separately keep their own stamp and stay in the trash.
export async function restoreItem(item: Pick<TrashItem, 'id' | 'type'>): Promise<void> {
  const table = tableFor(item.type);

  const row = await first<{ deleted_at: string | null }>(
    `SELECT deleted_at FROM ${table} WHERE id = ?`,
    [item.id],
  );
  if (!row) throw new Error('That item is no longer in the trash.');
  const stamp = row.deleted_at;

  await transaction(async () => {
    await run(`UPDATE ${table} SET is_deleted = 0, deleted_at = NULL WHERE id = ?`, [item.id]);
    if (!stamp) return;

    switch (item.type) {
      case 'project':
        await run(
          `UPDATE folders SET is_deleted = 0, deleted_at = NULL
            WHERE project_id = ? AND is_deleted = 1 AND deleted_at = ?`,
          [item.id, stamp],
        );
        await run(
          `UPDATE sessions SET is_deleted = 0, deleted_at = NULL
            WHERE project_id = ? AND is_deleted = 1 AND deleted_at = ?`,
          [item.id, stamp],
        );
        break;

      case 'folder':
        await run(
          `${SUBTREE_CTE}
           UPDATE folders SET is_deleted = 0, deleted_at = NULL
            WHERE id IN (SELECT id FROM subtree) AND is_deleted = 1 AND deleted_at = ?`,
          [item.id, stamp],
        );
        await run(
          `${SUBTREE_CTE}
           UPDATE sessions SET is_deleted = 0, deleted_at = NULL
            WHERE folder_id IN (SELECT id FROM subtree) AND is_deleted = 1 AND deleted_at = ?`,
          [item.id, stamp],
        );
        break;

      case 'session':
        await run(
          `UPDATE notes SET is_deleted = 0, deleted_at = NULL
            WHERE session_id = ? AND is_deleted = 1 AND deleted_at = ?`,
          [item.id, stamp],
        );
        break;

      case 'note':
        break;
    }
  });
}

// -------------------------------------------------------------------
// permanentlyDelete — hard delete a single item
// -------------------------------------------------------------------
export async function permanentlyDelete(item: Pick<TrashItem, 'id' | 'type'>): Promise<void> {
  await run(`DELETE FROM ${tableFor(item.type)} WHERE id = ?`, [item.id]);
}

// -------------------------------------------------------------------
// emptyTrash — permanently delete all trashed items for a user
// -------------------------------------------------------------------
export async function emptyTrash(userId: string): Promise<void> {
  await transaction(async () => {
    await purgeTrashed(userId, null);
  });
}

// -------------------------------------------------------------------
// autoCleanTrash — permanently delete items trashed > 30 days ago
// Called fire-and-forget from AuthProvider on mount.
// -------------------------------------------------------------------
export async function autoCleanTrash(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
  await transaction(async () => {
    await purgeTrashed(userId, cutoff);
  });
}

// -------------------------------------------------------------------
// helpers
// -------------------------------------------------------------------

/**
 * Hard-deletes trashed rows for a user, optionally only those trashed
 * before `cutoff`.
 *
 * Children are deleted before their parents so a trashed parent's cascade
 * can't take a still-live child with it (a session restored on its own out
 * of a trashed project, for example).
 */
async function purgeTrashed(userId: string, cutoff: string | null): Promise<void> {
  const filter = cutoff ? ` AND deleted_at < ?` : '';
  const args = cutoff ? [userId, cutoff] : [userId];

  for (const table of ['notes', 'sessions', 'folders', 'projects']) {
    await run(`DELETE FROM ${table} WHERE user_id = ? AND is_deleted = 1${filter}`, args);
  }
}

function tableFor(type: TrashItem['type']): string {
  switch (type) {
    case 'project': return 'projects';
    case 'session': return 'sessions';
    case 'folder':  return 'folders';
    case 'note':    return 'notes';
  }
}
