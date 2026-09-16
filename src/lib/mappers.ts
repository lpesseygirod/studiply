/**
 * mappers.ts
 * Translation between SQLite's storage types and the app's row types.
 *
 * SQLite has no boolean, no jsonb and no array type, so those columns are
 * stored as INTEGER 0/1 and TEXT-encoded JSON. Every service reads and
 * writes rows through these mappers, which keeps the types in
 * src/types/database.ts accurate at the service boundary — callers still
 * get real booleans, real arrays and parsed JSON.
 */

import * as Crypto from 'expo-crypto';
import type {
  AiUsage,
  Folder,
  Json,
  Note,
  Profile,
  Project,
  Session,
  SourceFile,
  Transcript,
  UserSettings,
} from '../types/database';

// -------------------------------------------------------------------
// Primitives
// -------------------------------------------------------------------

/** Fresh UUID for a new row (Postgres used to do this for us). */
export function newId(): string {
  return Crypto.randomUUID();
}

/** Current time in the ISO-8601 UTC form every timestamp column uses. */
export function now(): string {
  return new Date().toISOString();
}

/** JS boolean -> SQLite INTEGER. */
export function toBool(value: boolean): number {
  return value ? 1 : 0;
}

/** SQLite INTEGER -> JS boolean. */
export function fromBool(value: number | null): boolean {
  return value === 1;
}

/** Value -> TEXT column. Undefined and null both store as SQL NULL. */
export function toJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

/**
 * TEXT column -> value, falling back to `fallback` when the column is null
 * or holds text that isn't valid JSON. A corrupt cell degrades to a default
 * rather than throwing inside a list render.
 */
export function fromJson<T>(value: string | null, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// -------------------------------------------------------------------
// Raw row shapes — exactly what SQLite hands back
// -------------------------------------------------------------------

type ProfileRow = Omit<Profile, never>;

interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  is_archived: number;
  is_deleted: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface FolderRow {
  id: string;
  user_id: string;
  project_id: string;
  parent_folder_id: string | null;
  name: string;
  sort_order: number;
  is_deleted: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  project_id: string | null;
  folder_id: string | null;
  title: string;
  recording_mode: Session['recording_mode'];
  language: string;
  status: Session['status'];
  duration_seconds: number | null;
  is_deleted: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SourceFileRow {
  id: string;
  user_id: string;
  session_id: string;
  file_type: SourceFile['file_type'];
  file_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  retention_policy: SourceFile['retention_policy'];
  scheduled_deletion_at: string | null;
  is_deleted: number;
  storage_path: string | null;
  is_uploaded: number;
  created_at: string;
}

interface TranscriptRow {
  id: string;
  user_id: string;
  session_id: string;
  language: string;
  full_text: string;
  segments: string | null;
  confidence_score: number | null;
  created_at: string;
}

interface NoteRow {
  id: string;
  user_id: string;
  session_id: string;
  title: string;
  summary_level: Note['summary_level'];
  summary: string | null;
  key_concepts: string | null;
  formulas: string | null;
  definitions: string | null;
  tags: string | null;
  unclear_parts: string | null;
  manual_annotations: string | null;
  is_confirmed: number;
  is_deleted: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AiUsageRow {
  id: string;
  user_id: string;
  session_id: string | null;
  operation: AiUsage['operation'];
  tokens_input: number;
  tokens_output: number;
  audio_seconds: number;
  estimated_cost_usd: number;
  model_used: string | null;
  created_at: string;
}

interface UserSettingsRow {
  user_id: string;
  default_recording_mode: string;
  lecture_mode_default: number;
  default_summary_level: string;
  auto_title: number;
  auto_tags: number;
  include_unclear_parts: number;
  include_formulas: number;
  include_definitions: number;
  default_retention_policy: string;
  default_language: string;
  openai_budget: number;
  anthropic_budget: number;
  created_at: string;
  updated_at: string;
}

export type {
  AiUsageRow,
  FolderRow,
  NoteRow,
  ProfileRow,
  ProjectRow,
  SessionRow,
  SourceFileRow,
  TranscriptRow,
  UserSettingsRow,
};

// -------------------------------------------------------------------
// Row -> app type
// -------------------------------------------------------------------

export function mapProfile(row: ProfileRow): Profile {
  return row;
}

export function mapProject(row: ProjectRow): Project {
  return {
    ...row,
    is_archived: fromBool(row.is_archived),
    is_deleted: fromBool(row.is_deleted),
  };
}

export function mapFolder(row: FolderRow): Folder {
  return {
    ...row,
    is_deleted: fromBool(row.is_deleted),
  };
}

export function mapSession(row: SessionRow): Session {
  return {
    ...row,
    is_deleted: fromBool(row.is_deleted),
  };
}

export function mapSourceFile(row: SourceFileRow): SourceFile {
  return {
    ...row,
    is_deleted: fromBool(row.is_deleted),
    is_uploaded: fromBool(row.is_uploaded),
  };
}

export function mapTranscript(row: TranscriptRow): Transcript {
  return {
    ...row,
    segments: fromJson<Json | null>(row.segments, null),
  };
}

export function mapNote(row: NoteRow): Note {
  return {
    ...row,
    key_concepts: fromJson<Json>(row.key_concepts, []),
    formulas: fromJson<Json>(row.formulas, []),
    definitions: fromJson<Json>(row.definitions, []),
    tags: fromJson<string[]>(row.tags, []),
    unclear_parts: fromJson<Json>(row.unclear_parts, []),
    is_confirmed: fromBool(row.is_confirmed),
    is_deleted: fromBool(row.is_deleted),
  };
}

export function mapAiUsage(row: AiUsageRow): AiUsage {
  return row;
}

export function mapUserSettings(row: UserSettingsRow): UserSettings {
  return {
    ...row,
    lecture_mode_default: fromBool(row.lecture_mode_default),
    auto_title: fromBool(row.auto_title),
    auto_tags: fromBool(row.auto_tags),
    include_unclear_parts: fromBool(row.include_unclear_parts),
    include_formulas: fromBool(row.include_formulas),
    include_definitions: fromBool(row.include_definitions),
  };
}

// -------------------------------------------------------------------
// Dynamic UPDATE builder
// -------------------------------------------------------------------

/**
 * Builds the `SET` clause for a partial update from a column -> value map.
 *
 * Only keys whose value is not `undefined` are included, so callers can pass
 * a patch object straight through and have absent keys leave the column
 * alone while an explicit `null` clears it — matching how the services
 * behaved when they sent partial objects to PostgREST.
 *
 * Returns null when there is nothing to update, letting callers skip the
 * write instead of emitting invalid `SET` -less SQL.
 */
export function buildSet(
  patch: Record<string, SqlValue | undefined>,
): { clause: string; values: SqlValue[] } | null {
  const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (keys.length === 0) return null;
  return {
    clause: keys.map((k) => `${k} = ?`).join(', '),
    values: keys.map((k) => patch[k] as SqlValue),
  };
}

export type SqlValue = string | number | null;

/** Escapes a user-supplied LIKE pattern so `%` and `_` match literally. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}
