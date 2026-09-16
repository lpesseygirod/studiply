import { all, first, run } from '../lib/db';
import { buildSet, mapSession, newId, now, type SessionRow } from '../lib/mappers';
import type { Session } from '../types/database';

// -------------------------------------------------------------------
// createSession
// -------------------------------------------------------------------
export async function createSession(params: {
  userId: string;
  title: string;
  projectId?: string;
  folderId?: string;
  recordingMode: 'lecture' | 'standard' | 'discussion';
  language: string;
}): Promise<Session> {
  const id = newId();
  const timestamp = now();

  await run(
    `INSERT INTO sessions (id, user_id, project_id, folder_id, title, recording_mode, language,
                           status, duration_seconds, is_deleted, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'recording', NULL, 0, NULL, ?, ?)`,
    [
      id,
      params.userId,
      params.projectId ?? null,
      params.folderId ?? null,
      params.title.trim(),
      params.recordingMode,
      params.language,
      timestamp,
      timestamp,
    ],
  );

  return getSession(id);
}

// -------------------------------------------------------------------
// updateSession
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
  const set = buildSet({
    title: updates.title,
    recording_mode: updates.recording_mode,
    language: updates.language,
    status: updates.status,
    duration_seconds: updates.duration_seconds,
    project_id: updates.project_id,
    folder_id: updates.folder_id,
    updated_at: now(),
  });
  if (set) {
    await run(`UPDATE sessions SET ${set.clause} WHERE id = ?`, [...set.values, sessionId]);
  }
  return getSession(sessionId);
}

// -------------------------------------------------------------------
// getSession
// -------------------------------------------------------------------
export async function getSession(sessionId: string): Promise<Session> {
  const row = await first<SessionRow>(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
  if (!row) throw new Error('Session not found.');
  return mapSession(row);
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
  let sql = `SELECT * FROM sessions WHERE project_id = ? AND is_deleted = 0`;
  const params: (string | null)[] = [projectId];

  if (folderId !== undefined) {
    if (folderId === null) {
      sql += ` AND folder_id IS NULL`;
    } else {
      sql += ` AND folder_id = ?`;
      params.push(folderId);
    }
  }

  sql += ` ORDER BY updated_at DESC`;

  const rows = await all<SessionRow>(sql, params);
  return rows.map(mapSession);
}

// -------------------------------------------------------------------
// getSessionsByFolder
// -------------------------------------------------------------------
export async function getSessionsByFolder(folderId: string): Promise<Session[]> {
  const rows = await all<SessionRow>(
    `SELECT * FROM sessions
      WHERE folder_id = ? AND is_deleted = 0
      ORDER BY updated_at DESC`,
    [folderId],
  );
  return rows.map(mapSession);
}

// -------------------------------------------------------------------
// moveSession — move to a different project/folder
// -------------------------------------------------------------------
export async function moveSession(
  sessionId: string,
  projectId: string,
  folderId: string | null,
): Promise<void> {
  await run(
    `UPDATE sessions SET project_id = ?, folder_id = ?, updated_at = ? WHERE id = ?`,
    [projectId, folderId, now(), sessionId],
  );
}

// -------------------------------------------------------------------
// getOrCreateProjectUploadSession
// Returns (or creates) a dedicated 'completed' session used to hold
// files uploaded directly to a project, not tied to any recording.
// -------------------------------------------------------------------
export async function getOrCreateProjectUploadSession(
  userId: string,
  projectId: string,
): Promise<Session> {
  const existing = await first<SessionRow>(
    `SELECT * FROM sessions
      WHERE user_id = ? AND project_id = ? AND status = 'completed'
        AND title = 'Project Files' AND is_deleted = 0
      LIMIT 1`,
    [userId, projectId],
  );
  if (existing) return mapSession(existing);

  const id = newId();
  const timestamp = now();

  await run(
    `INSERT INTO sessions (id, user_id, project_id, folder_id, title, recording_mode, language,
                           status, duration_seconds, is_deleted, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, NULL, 'Project Files', 'standard', 'en', 'completed', NULL, 0, NULL, ?, ?)`,
    [id, userId, projectId, timestamp, timestamp],
  );

  return getSession(id);
}

// -------------------------------------------------------------------
// getRecentSessions
// -------------------------------------------------------------------
export async function getRecentSessions(userId: string, limit = 10): Promise<Session[]> {
  const rows = await all<SessionRow>(
    `SELECT * FROM sessions
      WHERE user_id = ? AND is_deleted = 0
      ORDER BY updated_at DESC
      LIMIT ?`,
    [userId, limit],
  );
  return rows.map(mapSession);
}

// -------------------------------------------------------------------
// deleteSession
// Deletes the session; SQLite foreign keys cascade to transcripts,
// notes and source_files (PRAGMA foreign_keys is ON — see lib/db.ts).
// -------------------------------------------------------------------
export async function deleteSession(sessionId: string): Promise<void> {
  await run(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
}
