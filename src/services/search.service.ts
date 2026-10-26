import { supabase } from '../lib/supabase';
import {
  LEGACY_NOTE_FORMAT,
  serviceError,
  type CourseRow,
  type FileRow,
  type FolderRow,
  type SegmentRow,
  type SummaryRow,
} from '../lib/cloudRows';
import { escapeLike } from '../lib/mappers';
import { readRows, readSegments, readThrough, segmentsFetchedAt } from '../lib/cache';
import { searchRows, type SearchHit, type SearchHitKind } from '../lib/cache/localSearch';
import { searchQuery } from '../utils/searchText';
import type { SearchResult } from '../types/database';

export type { SearchHit, SearchHitKind } from '../lib/cache/localSearch';

// -------------------------------------------------------------------
// searchLibrary (step 3.5)
// Titles, notes, terms and transcripts, without caring about case or
// accents. Online: public.search_library (owner RLS, never the trash).
// Offline on the iPhone: the same search over what is on this iPhone
// (localSearch), and `offline` says so. The web always searches online.
// -------------------------------------------------------------------

const MAX_HITS = 60;

export interface SearchAnswer {
  hits: SearchHit[];
  /** Searched only what is on this iPhone. */
  offline: boolean;
}

type SearchRow = {
  kind: string;
  item_id: string;
  file_kind: string | null;
  course_id: string | null;
  folder_id: string | null;
  course_name: string | null;
  course_color: string | null;
  title: string;
  matched: string | null;
  field: string;
  t_ms: number | null;
  rank: number;
};

function hitFromRow(r: SearchRow): SearchHit {
  return {
    kind: r.kind as SearchHitKind,
    itemId: r.item_id,
    fileKind: r.file_kind,
    courseId: r.course_id,
    folderId: r.folder_id,
    courseName: r.course_name,
    courseColor: r.course_color,
    title: r.title,
    matched: r.matched ?? '',
    field: r.field as SearchHit['field'],
    tMs: r.t_ms,
    rank: r.rank,
  };
}

async function cachedSegments(): Promise<Map<string, SegmentRow[]>> {
  const segments = new Map<string, SegmentRow[]>();
  for (const lectureId of (await segmentsFetchedAt()).keys()) {
    const rows = await readSegments(lectureId);
    if (rows) segments.set(lectureId, rows);
  }
  return segments;
}

export async function searchLibrary(query: string): Promise<SearchAnswer> {
  if (!searchQuery(query)) return { hits: [], offline: false };
  return readThrough<SearchAnswer>(
    async () => {
      const { data, error } = await supabase.rpc('search_library', { q: query.trim(), max_results: MAX_HITS });
      if (error) throw serviceError(error, 'Search failed. Please try again.');
      return { hits: ((data ?? []) as SearchRow[]).map(hitFromRow), offline: false };
    },
    async () => {
      const [courses, folders, files, summaries, segments] = await Promise.all([
        readRows<CourseRow>('courses'),
        readRows<FolderRow>('folders'),
        readRows<FileRow>('files'),
        readRows<SummaryRow>('summaries'),
        cachedSegments(),
      ]);
      if (courses.length === 0 && files.length === 0) return null;
      return { hits: searchRows({ courses, folders, files, summaries, segments }, query), offline: true };
    },
  );
}

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
