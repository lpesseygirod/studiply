/**
 * localSearch.ts
 * Search on the iPhone without a connection: the same hits as the
 * database's public.search_library (migration 20261026090700), answered from
 * the cached rows. Only what is on this iPhone can be found: every title and
 * note, and the transcripts of the lectures whose transcript was downloaded.
 * Pure, so it is unit tested without SQLite.
 */

import type { CourseRow, FileRow, FolderRow, SegmentRow, SummaryRow } from '../cloudRows';
import { normalize, searchQuery } from '../../utils/searchText';
import { isActiveCourse, isConfirmedNote, latestNote } from './localQueries';

export type SearchHitKind = 'course' | 'folder' | 'file' | 'note' | 'term' | 'transcript';

export interface SearchHit {
  kind: SearchHitKind;
  /** What opens: the course, the folder or the file (a lecture for note, term and transcript hits). */
  itemId: string;
  /** files.kind for file, note, term and transcript hits. */
  fileKind: string | null;
  courseId: string | null;
  /** Where it is (a folder: its parent). */
  folderId: string | null;
  courseName: string | null;
  courseColor: string | null;
  /** The course, folder or file name (note, term, transcript: the lecture's). */
  title: string;
  /** The text the query was found in. */
  matched: string;
  field: 'title' | 'summary' | 'concept' | 'definition' | 'formula' | 'transcript';
  /** A transcript hit's time. */
  tMs: number | null;
  rank: number;
}

export interface SearchSource {
  courses: CourseRow[];
  folders: FolderRow[];
  files: FileRow[];
  summaries: SummaryRow[];
  /** Cached transcripts by lecture id. */
  segments: Map<string, SegmentRow[]>;
}

/** The library's hidden holder for an earlier version's uploads (see session.service). */
const HOLDER_TITLE = 'Project Files';
const TITLE_HITS = 20;
const NOTE_HITS = 30;
const TRANSCRIPT_HITS = 30;
const PER_LECTURE = 3;
const MAX_HITS = 60;

type Hit = Omit<SearchHit, 'courseName' | 'courseColor' | 'rank'> & { base: number; n?: number };

/** A note's list: an array, or an array saved as a JSON string by older versions. */
function jsonList(value: unknown): Record<string, unknown>[] {
  let v = value;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [];
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

interface NotePart {
  field: 'title' | 'summary' | 'concept' | 'definition' | 'formula';
  term: string | null;
  body: string | null;
}

/** search.note_fields: title, summary, key concepts, definitions, formulas, in order. */
export function noteParts(result: unknown): NotePart[] {
  const r = (result ?? {}) as Record<string, unknown>;
  return [
    { field: 'title', term: null, body: str(r.title) },
    { field: 'summary', term: null, body: str(r.summary) },
    ...jsonList(r.keyConcepts).map((e) => ({ field: 'concept' as const, term: str(e.term), body: str(e.explanation) })),
    ...jsonList(r.definitions).map((e) => ({ field: 'definition' as const, term: str(e.term), body: str(e.definition) })),
    ...jsonList(r.formulas).map((e) => ({
      field: 'formula' as const,
      term: str(e.name),
      body: [str(e.expression), str(e.description)].filter(Boolean).join(' ') || null,
    })),
  ];
}

const joined = (...parts: (string | null)[]) => parts.filter((p): p is string => !!p).join(' ');

export function searchRows(source: SearchSource, query: string): SearchHit[] {
  const q = searchQuery(query);
  if (!q) return [];
  const has = (text: string | null | undefined) => !!text && normalize(text).includes(q);
  const titleBase = (text: string) => 3 + (normalize(text).startsWith(q) ? 0.5 : 0);

  const liveFiles = source.files.filter((f) => f.deleted_at === null && !(f.kind === 'lecture' && f.title === HOLDER_TITLE));

  const titles: Hit[] = [
    ...source.courses
      .filter((c) => isActiveCourse(c) && has(c.name))
      .map((c): Hit => ({ kind: 'course', itemId: c.id, fileKind: null, courseId: c.id, folderId: null, title: c.name, matched: c.name, field: 'title', tMs: null, base: titleBase(c.name) })),
    ...source.folders
      .filter((f) => f.deleted_at === null && has(f.name))
      .map((f): Hit => ({ kind: 'folder', itemId: f.id, fileKind: null, courseId: f.course_id, folderId: f.parent_id, title: f.name, matched: f.name, field: 'title', tMs: null, base: titleBase(f.name) })),
    ...liveFiles
      .filter((f) => has(f.title))
      .map((f): Hit => ({ kind: 'file', itemId: f.id, fileKind: f.kind, courseId: f.course_id, folderId: f.folder_id, title: f.title, matched: f.title, field: 'title', tMs: null, base: titleBase(f.title) })),
  ]
    .sort((a, b) => b.base - a.base || a.title.localeCompare(b.title))
    .slice(0, TITLE_HITS);

  const notes: Hit[] = [];
  for (const file of liveFiles) {
    const note = latestNote(source.summaries, file);
    if (!note || !isConfirmedNote(note)) continue;
    let terms = 0;
    let noteHit = false;
    for (const part of noteParts(note.result)) {
      if (!has(joined(part.term, part.body))) continue;
      const isTerm = (part.field === 'concept' || part.field === 'definition') && has(part.term);
      if (isTerm ? terms >= PER_LECTURE : noteHit) continue;
      if (isTerm) terms += 1;
      else noteHit = true;
      const withTerm = part.field === 'concept' || part.field === 'definition' || part.field === 'formula';
      notes.push({
        kind: isTerm ? 'term' : 'note',
        itemId: file.id,
        fileKind: file.kind,
        courseId: file.course_id,
        folderId: file.folder_id,
        title: file.title,
        matched: withTerm ? [part.term, part.body].filter(Boolean).join(' — ') : (part.body ?? ''),
        field: part.field,
        tMs: null,
        base: isTerm ? 2.5 : 2,
        n: isTerm ? terms : 1,
      });
    }
  }
  notes.sort((a, b) => b.base - a.base || a.title.localeCompare(b.title) || (a.n ?? 0) - (b.n ?? 0));

  const transcripts: Hit[] = [];
  for (const file of liveFiles) {
    const segments = source.segments.get(file.id);
    if (!segments) continue;
    [...segments]
      .sort((a, b) => a.start_ms - b.start_ms)
      .filter((s) => has(s.text))
      .slice(0, PER_LECTURE)
      .forEach((s, i) =>
        transcripts.push({
          kind: 'transcript',
          itemId: file.id,
          fileKind: file.kind,
          courseId: file.course_id,
          folderId: file.folder_id,
          title: file.title,
          matched: s.text,
          field: 'transcript',
          tMs: s.start_ms,
          base: 1,
          n: i + 1,
        }),
      );
  }
  transcripts.sort((a, b) => a.title.localeCompare(b.title) || (a.n ?? 0) - (b.n ?? 0));

  const courses = new Map(source.courses.map((c) => [c.id, c]));
  return [...titles, ...notes.slice(0, NOTE_HITS), ...transcripts.slice(0, TRANSCRIPT_HITS)]
    .map(({ base, n: _n, ...hit }): SearchHit => {
      const course = hit.courseId ? courses.get(hit.courseId) : undefined;
      return { ...hit, courseName: course?.name ?? null, courseColor: course?.color ?? null, rank: base };
    })
    .sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title) || (a.tMs ?? -1) - (b.tMs ?? -1))
    .slice(0, MAX_HITS);
}
