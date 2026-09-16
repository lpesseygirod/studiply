import { all, count, first, run } from '../lib/db';
import {
  buildSet,
  mapProject,
  mapSession,
  newId,
  now,
  type ProjectRow,
  type SessionRow,
} from '../lib/mappers';
import type { Project, Session } from '../types/database';

export type ProjectWithCount = Project & { sessionCount: number };

/**
 * Projects plus their session counts.
 *
 * The count is a correlated subquery that skips trashed sessions, so a
 * project's badge matches what the project screen actually lists.
 */
const PROJECTS_WITH_COUNT = `
  SELECT p.*,
         (SELECT COUNT(*) FROM sessions s
           WHERE s.project_id = p.id AND s.is_deleted = 0) AS session_count
    FROM projects p
   WHERE p.user_id = ? AND p.is_archived = 0 AND p.is_deleted = 0
   ORDER BY p.updated_at DESC
`;

type ProjectWithCountRow = ProjectRow & { session_count: number };

function mapProjectWithCount(row: ProjectWithCountRow): ProjectWithCount {
  const { session_count, ...projectRow } = row;
  return { ...mapProject(projectRow), sessionCount: session_count ?? 0 };
}

// -------------------------------------------------------------------
// getProjects
// All non-archived projects for a user, newest first.
// -------------------------------------------------------------------
export async function getProjects(userId: string): Promise<ProjectWithCount[]> {
  const rows = await all<ProjectWithCountRow>(PROJECTS_WITH_COUNT, [userId]);
  return rows.map(mapProjectWithCount);
}

// -------------------------------------------------------------------
// getRecentProjects
// Most recently updated projects, limited to `limit` (default 6).
// -------------------------------------------------------------------
export async function getRecentProjects(
  userId: string,
  limit = 6,
): Promise<ProjectWithCount[]> {
  const rows = await all<ProjectWithCountRow>(`${PROJECTS_WITH_COUNT} LIMIT ?`, [
    userId,
    limit,
  ]);
  return rows.map(mapProjectWithCount);
}

// -------------------------------------------------------------------
// getProject
// Single project by ID.
// -------------------------------------------------------------------
export async function getProject(projectId: string): Promise<Project> {
  const row = await first<ProjectRow>(`SELECT * FROM projects WHERE id = ?`, [projectId]);
  if (!row) throw new Error('Project not found.');
  return mapProject(row);
}

// -------------------------------------------------------------------
// createProject
// -------------------------------------------------------------------
export async function createProject(
  userId: string,
  name: string,
  color = '#F5E0D8',
  icon = 'folder',
): Promise<Project> {
  const id = newId();
  const timestamp = now();

  await run(
    `INSERT INTO projects (id, user_id, name, color, icon, sort_order, is_archived, is_deleted, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, 0, NULL, ?, ?)`,
    [id, userId, name.trim(), color, icon, timestamp, timestamp],
  );

  return getProject(id);
}

// -------------------------------------------------------------------
// updateProject
// -------------------------------------------------------------------
export async function updateProject(
  projectId: string,
  updates: Partial<Pick<Project, 'name' | 'color' | 'icon' | 'sort_order'>>,
): Promise<Project> {
  const set = buildSet({
    name: updates.name,
    color: updates.color,
    icon: updates.icon,
    sort_order: updates.sort_order,
    updated_at: now(),
  });
  if (set) {
    await run(`UPDATE projects SET ${set.clause} WHERE id = ?`, [...set.values, projectId]);
  }
  return getProject(projectId);
}

// -------------------------------------------------------------------
// archiveProject
// Soft delete — sets is_archived = true.
// -------------------------------------------------------------------
export async function archiveProject(projectId: string): Promise<void> {
  await run(`UPDATE projects SET is_archived = 1, updated_at = ? WHERE id = ?`, [
    now(),
    projectId,
  ]);
}

// -------------------------------------------------------------------
// getProjectSessions
// All sessions inside a project, newest first.
// -------------------------------------------------------------------
export async function getProjectSessions(projectId: string): Promise<Session[]> {
  const rows = await all<SessionRow>(
    `SELECT * FROM sessions
      WHERE project_id = ? AND is_deleted = 0
      ORDER BY updated_at DESC`,
    [projectId],
  );
  return rows.map(mapSession);
}

// -------------------------------------------------------------------
// getProjectSessionCount
// -------------------------------------------------------------------
export async function getProjectSessionCount(projectId: string): Promise<number> {
  return count(
    `SELECT COUNT(*) AS count FROM sessions WHERE project_id = ? AND is_deleted = 0`,
    [projectId],
  );
}
