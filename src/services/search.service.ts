import { all } from '../lib/db';
import { escapeLike } from '../lib/mappers';
import type { SearchResult } from '../types/database';

// -------------------------------------------------------------------
// searchAll
// Case-insensitive partial search across projects, sessions, and notes.
// Order: projects → notes (by title/summary) → sessions.
// Note results use session_id as their id so navigation can go straight
// to /note/[sessionId].
// -------------------------------------------------------------------
export async function searchAll(userId: string, query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  // Escaped so a literal % or _ in the query doesn't act as a wildcard —
  // typing "50%" should look for "50%", not match every row.
  const like = `%${escapeLike(q)}%`;

  const [projects, sessions, notesByTitle, notesBySummary] = await Promise.all([
    all<{ id: string; name: string }>(
      `SELECT id, name FROM projects
        WHERE user_id = ? AND is_archived = 0 AND is_deleted = 0
          AND name LIKE ? ESCAPE '\\'
        LIMIT 10`,
      [userId, like],
    ),
    all<{ id: string; title: string }>(
      `SELECT id, title FROM sessions
        WHERE user_id = ? AND is_deleted = 0
          AND title LIKE ? ESCAPE '\\'
        LIMIT 10`,
      [userId, like],
    ),
    all<{ session_id: string; title: string }>(
      `SELECT session_id, title FROM notes
        WHERE user_id = ? AND is_confirmed = 1 AND is_deleted = 0
          AND title LIKE ? ESCAPE '\\'
        LIMIT 10`,
      [userId, like],
    ),
    all<{ session_id: string; title: string }>(
      `SELECT session_id, title FROM notes
        WHERE user_id = ? AND is_confirmed = 1 AND is_deleted = 0
          AND summary IS NOT NULL AND summary LIKE ? ESCAPE '\\'
        LIMIT 10`,
      [userId, like],
    ),
  ]);

  const projectResults: SearchResult[] = projects.map((p) => ({
    id: p.id,
    type: 'project' as const,
    title: p.name,
  }));

  const sessionResults: SearchResult[] = sessions.map((s) => ({
    id: s.id,
    type: 'session' as const,
    title: s.title,
  }));

  // Deduplicate notes by session_id (title match takes priority over summary match).
  const noteMap = new Map<string, SearchResult>();
  for (const n of notesByTitle) {
    noteMap.set(n.session_id, {
      id: n.session_id,
      type: 'note' as const,
      title: n.title,
    });
  }
  for (const n of notesBySummary) {
    if (!noteMap.has(n.session_id)) {
      noteMap.set(n.session_id, {
        id: n.session_id,
        type: 'note' as const,
        title: n.title,
        subtitle: 'Matched in summary',
      });
    }
  }

  return [...projectResults, ...Array.from(noteMap.values()), ...sessionResults];
}
