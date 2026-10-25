/**
 * cloudRows.ts
 * Translation between Supabase rows (src/types/supabase.ts) and the app's
 * own types (src/types/database.ts).
 *
 * The step 1.2 schema is shaped differently from the old SQLite tables:
 * a project is a course, a session is a `files` row (kind lecture) plus its
 * `lectures` row, an old structured note is a `summaries` row whose result
 * holds the note, and a transcript is the lecture's segments. The services
 * keep returning the old types so the screens don't change until Phases 2–4
 * rebuild them; this file is where the two shapes meet. Everything here is
 * pure so it can be unit tested.
 */

import type { Json, Tables } from '../types/supabase';
import type { Folder, Note, Project, Session, Transcript } from '../types/database';

export type CourseRow = Tables<'courses'>;
export type FolderRow = Tables<'folders'>;
export type FileRow = Tables<'files'>;
export type LectureRow = Tables<'lectures'>;
export type SummaryRow = Tables<'summaries'>;
export type SegmentRow = Pick<Tables<'transcript_segments'>, 'start_ms' | 'end_ms' | 'text' | 'confidence'>;

/** A lecture file with its lecture row, as `files.select('*, lectures(*)')` returns it. */
export type LectureFileRow = FileRow & { lectures: LectureRow | null };

// -------------------------------------------------------------------
// Courses and folders
// -------------------------------------------------------------------

export function courseToProject(row: CourseRow): Project {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    sort_order: row.sort_order,
    is_archived: row.is_archived,
    is_deleted: row.deleted_at !== null,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function folderFromRow(row: FolderRow): Folder {
  return {
    id: row.id,
    user_id: row.user_id,
    // Folders at the "My library" root have no course; the old screens
    // always open folders from inside a course.
    project_id: row.course_id ?? '',
    parent_folder_id: row.parent_id,
    name: row.name,
    sort_order: row.sort_order,
    is_deleted: row.deleted_at !== null,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Ids of a folder and every folder below it, from the user's (id, parent)
 * pairs. Stops on a cycle instead of looping (the database refuses cycles,
 * but a list render must never hang).
 */
export function folderSubtree(rootId: string, folders: { id: string; parent_id: string | null }[]): string[] {
  const children = new Map<string, string[]>();
  for (const f of folders) {
    if (!f.parent_id) continue;
    const list = children.get(f.parent_id) ?? [];
    list.push(f.id);
    children.set(f.parent_id, list);
  }
  const seen = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const child of children.get(id) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  return [...seen];
}

// -------------------------------------------------------------------
// Lectures (old: sessions)
// -------------------------------------------------------------------

type SessionStatus = Session['status'];
type LectureStatus = 'draft' | 'recording' | 'uploading' | 'transcribing' | 'ready' | 'failed';

/** Old session status -> lectures.status. Steps after transcription have no own status. */
export function statusToDb(status: SessionStatus): LectureStatus {
  switch (status) {
    case 'processing':
    case 'review':
      return 'transcribing';
    case 'completed':
      return 'ready';
    default:
      return status;
  }
}

/** lectures.status -> old session status (uploading shows as in progress). */
export function statusFromDb(status: string): SessionStatus {
  switch (status) {
    case 'draft':
    case 'recording':
    case 'transcribing':
    case 'failed':
      return status;
    case 'uploading':
      return 'transcribing';
    case 'ready':
      return 'completed';
    default:
      return 'draft';
  }
}

/** The old app's 'auto' is null in the new schema: Whisper detects the language. */
export function languageToDb(language: string | null | undefined): string | null {
  if (!language || language === 'auto') return null;
  return language;
}

export function languageFromDb(language: string | null): string {
  return language ?? 'auto';
}

export function lectureToSession(
  row: LectureFileRow,
  recordingMode: Session['recording_mode'] = 'lecture',
): Session {
  const lecture = row.lectures;
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: row.course_id,
    folder_id: row.folder_id,
    title: row.title,
    recording_mode: recordingMode,
    language: languageFromDb(lecture?.language ?? null),
    status: statusFromDb(lecture?.status ?? 'draft'),
    duration_seconds: lecture?.duration_ms == null ? null : Math.round(lecture.duration_ms / 1000),
    is_deleted: row.deleted_at !== null,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// -------------------------------------------------------------------
// Old structured notes, kept in summaries.result
// -------------------------------------------------------------------

export const LEGACY_NOTE_FORMAT = 'legacy-note-v1';

export interface LegacyNoteResult {
  format: typeof LEGACY_NOTE_FORMAT;
  title: string;
  summaryLevel: Note['summary_level'];
  recordingMode: Session['recording_mode'] | null;
  summary: string | null;
  keyConcepts: Json;
  formulas: Json;
  definitions: Json;
  tags: string[];
  unclearParts: Json;
  manualAnnotations: string | null;
  isConfirmed: boolean;
  /**
   * Who last wrote each block of the note and when (step 1.8), for the
   * conflict rule in ../lib/noteBlocks. Older notes don't have it.
   */
  blocks?: Partial<Record<string, NoteBlockMeta>>;
}

export interface NoteBlockMeta {
  origin: 'ai' | 'student';
  /** The device clock when the block was written, ISO. */
  editedAt: string;
  /** The device that wrote it (random id per install), for breaking ties. */
  device: string | null;
}

function readBlockMeta(value: unknown): LegacyNoteResult['blocks'] {
  if (!isRecord(value)) return undefined;
  const blocks: Partial<Record<string, NoteBlockMeta>> = {};
  for (const [key, meta] of Object.entries(value)) {
    if (!isRecord(meta) || typeof meta.editedAt !== 'string') continue;
    blocks[key] = {
      origin: meta.origin === 'student' ? 'student' : 'ai',
      editedAt: meta.editedAt,
      device: typeof meta.device === 'string' ? meta.device : null,
    };
  }
  return blocks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A summaries.result that holds an old note, or null for anything else. */
export function readLegacyNote(result: Json | null): LegacyNoteResult | null {
  if (!isRecord(result) || result.format !== LEGACY_NOTE_FORMAT) return null;
  const level = result.summaryLevel;
  const mode = result.recordingMode;
  return {
    format: LEGACY_NOTE_FORMAT,
    title: typeof result.title === 'string' ? result.title : '',
    summaryLevel: level === 'minimal' || level === 'extra' ? level : 'standard',
    recordingMode: mode === 'lecture' || mode === 'standard' || mode === 'discussion' ? mode : null,
    summary: typeof result.summary === 'string' ? result.summary : null,
    keyConcepts: Array.isArray(result.keyConcepts) ? (result.keyConcepts as Json) : [],
    formulas: Array.isArray(result.formulas) ? (result.formulas as Json) : [],
    definitions: Array.isArray(result.definitions) ? (result.definitions as Json) : [],
    tags: Array.isArray(result.tags) ? result.tags.filter((t): t is string => typeof t === 'string') : [],
    unclearParts: Array.isArray(result.unclearParts) ? (result.unclearParts as Json) : [],
    manualAnnotations: typeof result.manualAnnotations === 'string' ? result.manualAnnotations : null,
    isConfirmed: result.isConfirmed === true,
    ...(isRecord(result.blocks) && { blocks: readBlockMeta(result.blocks) }),
  };
}

export function summaryToNote(row: SummaryRow): Note | null {
  const note = readLegacyNote(row.result);
  if (!note) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    session_id: row.file_id,
    title: note.title,
    summary_level: note.summaryLevel,
    summary: note.summary,
    key_concepts: note.keyConcepts,
    formulas: note.formulas,
    definitions: note.definitions,
    tags: note.tags,
    unclear_parts: note.unclearParts,
    manual_annotations: note.manualAnnotations,
    is_confirmed: note.isConfirmed,
    // A note goes to Trash with its lecture; the services filter on the file.
    is_deleted: false,
    deleted_at: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// -------------------------------------------------------------------
// Transcripts, from the lecture's segments
// -------------------------------------------------------------------

export function segmentsToTranscript(
  lecture: Pick<LectureRow, 'id' | 'user_id' | 'language' | 'created_at'>,
  segments: SegmentRow[],
): Transcript | null {
  if (segments.length === 0) return null;
  const ordered = [...segments].sort((a, b) => a.start_ms - b.start_ms);
  const confidences = ordered.map((s) => s.confidence).filter((c): c is number => c !== null);
  return {
    id: lecture.id,
    user_id: lecture.user_id,
    session_id: lecture.id,
    language: languageFromDb(lecture.language),
    full_text: ordered.map((s) => s.text.trim()).filter(Boolean).join(' '),
    // The old Whisper shape the screens and PDF export read: seconds.
    segments: ordered.map((s, i) => ({ id: i, start: s.start_ms / 1000, end: s.end_ms / 1000, text: s.text })),
    confidence_score:
      confidences.length === 0 ? null : confidences.reduce((sum, c) => sum + c, 0) / confidences.length,
    created_at: lecture.created_at,
  };
}

// -------------------------------------------------------------------
// Errors
// -------------------------------------------------------------------

/** Postgres errors the services turn into plain messages. */
export const PgCodes = {
  checkViolation: '23514',
  foreignKeyViolation: '23503',
  permissionDenied: '42501',
} as const;

/**
 * A plain error for a failed database call. The raw Postgres message isn't
 * meant for students, so callers pass the sentence to show; a dropped
 * connection gets its own. Details go to the dev console only.
 */
export function serviceError(error: { code?: string; message?: string } | null, message: string): Error {
  if (__DEV__ && error) console.warn(`[db] ${message}`, error.code ?? '', error.message ?? '');
  if (error?.message && /network request failed|failed to fetch|load failed/i.test(error.message)) {
    return new NetworkError();
  }
  return new Error(message);
}

export const OFFLINE_MESSAGE = "You're offline. Try again when you're back online.";

/** The backend couldn't be reached; the iPhone cache may answer instead. */
export class NetworkError extends Error {
  readonly offline = true;
  constructor(message: string = OFFLINE_MESSAGE) {
    super(message);
    this.name = 'NetworkError';
  }
}

export function isNetworkError(err: unknown): err is NetworkError {
  return err instanceof NetworkError;
}
