import { supabase } from '../lib/supabase';
import {
  serviceError,
  type CourseRow,
  type FileRow,
  type FolderRow,
  type SegmentRow,
  type SummaryRow,
} from '../lib/cloudRows';
import { readRows, readSegments, readThrough, segmentsFetchedAt } from '../lib/cache';
import { searchRows, type SearchHit, type SearchHitKind } from '../lib/cache/localSearch';
import { searchQuery } from '../utils/searchText';

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
