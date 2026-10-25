import { supabase } from '../lib/supabase';
import { LEGACY_NOTE_FORMAT, serviceError } from '../lib/cloudRows';
import { escapeLike } from '../lib/mappers';
import type { SearchResult } from '../types/database';

// -------------------------------------------------------------------
// searchAll
// Case-insensitive partial search across projects, sessions, and notes.
// Order: projects → notes (by title/summary) → sessions.
// Note results use session_id as their id so navigation can go straight
// to /note/[sessionId].
// Courses, lecture files and notes (summaries.result) are matched with
// ilike: Postgres LIKE is case-sensitive, SQLite's wasn't.
// -------------------------------------------------------------------
export async function searchAll(_userId: string, query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  // Escaped so a literal % or _ in the query doesn't act as a wildcard —
  // typing "50%" should look for "50%", not match every row.
  const like = `%${escapeLike(q)}%`;

  const notes = () =>
    supabase
      .from('summaries')
      .select('file_id, title:result->>title, files!inner(deleted_at)')
      .eq('result->>format', LEGACY_NOTE_FORMAT)
      .eq('result->>isConfirmed', 'true')
      .is('files.deleted_at', null);

  const [projects, sessions, notesByTitle, notesBySummary] = await Promise.all([
    supabase
      .from('courses')
      .select('id, name')
      .eq('is_archived', false)
      .is('deleted_at', null)
      .ilike('name', like)
      .limit(10),
    supabase
      .from('files')
      .select('id, title')
      .eq('kind', 'lecture')
      .is('deleted_at', null)
      .ilike('title', like)
      .limit(10),
    notes().ilike('result->>title', like).limit(10),
    notes().ilike('result->>summary', like).limit(10),
  ]);
  const error = projects.error ?? sessions.error ?? notesByTitle.error ?? notesBySummary.error;
  if (error) throw serviceError(error, 'Search failed. Please try again.');

  const projectResults: SearchResult[] = (projects.data ?? []).map((p) => ({
    id: p.id,
    type: 'project' as const,
    title: p.name,
  }));

  const sessionResults: SearchResult[] = (sessions.data ?? []).map((s) => ({
    id: s.id,
    type: 'session' as const,
    title: s.title,
  }));

  // Deduplicate notes by session_id (title match takes priority over summary match).
  const noteMap = new Map<string, SearchResult>();
  for (const n of notesByTitle.data ?? []) {
    noteMap.set(n.file_id, {
      id: n.file_id,
      type: 'note' as const,
      title: String(n.title ?? ''),
    });
  }
  for (const n of notesBySummary.data ?? []) {
    if (!noteMap.has(n.file_id)) {
      noteMap.set(n.file_id, {
        id: n.file_id,
        type: 'note' as const,
        title: String(n.title ?? ''),
        subtitle: 'Matched in summary',
      });
    }
  }

  return [...projectResults, ...Array.from(noteMap.values()), ...sessionResults];
}
