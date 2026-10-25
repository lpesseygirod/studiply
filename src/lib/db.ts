/**
 * db.ts
 * The earlier version's database on the iPhone (`studiply.db`).
 *
 * Before step 1.7 this was the app's only storage. Now the app uses
 * Supabase (and the 1.8 cache, a separate file), and this database is only
 * read by step 1.9 to upload what is in it (src/services/legacyImport), and
 * removed when the student chooses to. Development can use a sample copy of
 * the same schema in its own file (SAMPLE_DB_NAME) so the real one is never
 * touched while testing.
 *
 * Storage conventions of the old schema:
 *
 *   - booleans are INTEGER 0/1
 *   - jsonb / text[] columns are TEXT holding a JSON string
 *   - timestamps are TEXT holding an ISO-8601 UTC string
 */

import * as SQLite from 'expo-sqlite';

export const DB_NAME = 'studiply.db';
/** Development only: sample earlier-version data, never the real database. */
export const SAMPLE_DB_NAME = 'studiply-sample.db';

const dbPromises = new Map<string, Promise<SQLite.SQLiteDatabase>>();

/** The database file's URI, to check that it exists without opening (and so creating) it. */
export function databaseFileUri(name: string = DB_NAME): string {
  const dir = String(SQLite.defaultDatabaseDirectory).replace(/\/$/, '');
  return `${dir.startsWith('file://') ? dir : `file://${dir}`}/${name}`;
}

// -------------------------------------------------------------------
// Schema
// -------------------------------------------------------------------
// Written as one script so a fresh install lands fully-formed. Every
// statement is IF NOT EXISTS, so re-running on an existing db is a no-op.
const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  id           TEXT PRIMARY KEY NOT NULL,
  username     TEXT NOT NULL,
  display_name TEXT,
  initials     TEXT NOT NULL,
  avatar_url   TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY NOT NULL,
  user_id     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6C63FF',
  icon        TEXT NOT NULL DEFAULT 'folder',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  deleted_at  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id               TEXT PRIMARY KEY NOT NULL,
  user_id          TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_deleted       INTEGER NOT NULL DEFAULT 0,
  deleted_at       TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT PRIMARY KEY NOT NULL,
  user_id          TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id       TEXT REFERENCES projects(id) ON DELETE SET NULL,
  folder_id        TEXT REFERENCES folders(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  recording_mode   TEXT NOT NULL DEFAULT 'standard'
                     CHECK (recording_mode IN ('lecture','standard','discussion')),
  language         TEXT NOT NULL DEFAULT 'en',
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','recording','transcribing','processing','review','completed','failed')),
  duration_seconds INTEGER,
  is_deleted       INTEGER NOT NULL DEFAULT 0,
  deleted_at       TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_files (
  id                    TEXT PRIMARY KEY NOT NULL,
  user_id               TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id            TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  file_type             TEXT NOT NULL CHECK (file_type IN ('audio','photo','pdf')),
  file_path             TEXT NOT NULL,
  file_size_bytes       INTEGER,
  mime_type             TEXT,
  retention_policy      TEXT NOT NULL DEFAULT 'delete_3_days'
                          CHECK (retention_policy IN ('delete_now','delete_3_days','delete_manually','keep_permanently')),
  scheduled_deletion_at TEXT,
  is_deleted            INTEGER NOT NULL DEFAULT 0,
  storage_path          TEXT,
  is_uploaded           INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transcripts (
  id               TEXT PRIMARY KEY NOT NULL,
  user_id          TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  language         TEXT NOT NULL,
  full_text        TEXT NOT NULL,
  segments         TEXT,
  confidence_score REAL,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id                 TEXT PRIMARY KEY NOT NULL,
  user_id            TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  summary_level      TEXT NOT NULL DEFAULT 'standard'
                       CHECK (summary_level IN ('minimal','standard','extra')),
  summary            TEXT,
  key_concepts       TEXT NOT NULL DEFAULT '[]',
  formulas           TEXT NOT NULL DEFAULT '[]',
  definitions        TEXT NOT NULL DEFAULT '[]',
  tags               TEXT NOT NULL DEFAULT '[]',
  unclear_parts      TEXT NOT NULL DEFAULT '[]',
  manual_annotations TEXT,
  is_confirmed       INTEGER NOT NULL DEFAULT 0,
  is_deleted         INTEGER NOT NULL DEFAULT 0,
  deleted_at         TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage (
  id                 TEXT PRIMARY KEY NOT NULL,
  user_id            TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id         TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  operation          TEXT NOT NULL
                       CHECK (operation IN ('transcription','summarization','ocr','photo_analysis')),
  tokens_input       INTEGER NOT NULL DEFAULT 0,
  tokens_output      INTEGER NOT NULL DEFAULT 0,
  audio_seconds      INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  model_used         TEXT,
  created_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id                  TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  default_recording_mode   TEXT NOT NULL DEFAULT 'standard',
  lecture_mode_default     INTEGER NOT NULL DEFAULT 1,
  default_summary_level    TEXT NOT NULL DEFAULT 'standard',
  auto_title               INTEGER NOT NULL DEFAULT 1,
  auto_tags                INTEGER NOT NULL DEFAULT 1,
  include_unclear_parts    INTEGER NOT NULL DEFAULT 1,
  include_formulas         INTEGER NOT NULL DEFAULT 1,
  include_definitions      INTEGER NOT NULL DEFAULT 1,
  default_retention_policy TEXT NOT NULL DEFAULT 'delete_3_days',
  default_language         TEXT NOT NULL DEFAULT 'en',
  openai_budget            REAL NOT NULL DEFAULT 10.0,
  anthropic_budget         REAL NOT NULL DEFAULT 10.0,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_user      ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_project    ON folders(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user      ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project   ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_folder    ON sessions(folder_id);
CREATE INDEX IF NOT EXISTS idx_source_files_sess  ON source_files(session_id);
CREATE INDEX IF NOT EXISTS idx_notes_session      ON notes(session_id);
CREATE INDEX IF NOT EXISTS idx_notes_user         ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_sess   ON transcripts(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user      ON ai_usage(user_id);
`;

// -------------------------------------------------------------------
// Connection
// -------------------------------------------------------------------

/**
 * Opens (and on first call, initialises) the database. The promise is
 * memoised, so concurrent callers share one connection and the schema
 * script runs exactly once per app launch.
 */
export function getDb(name: string = DB_NAME): Promise<SQLite.SQLiteDatabase> {
  let promise = dbPromises.get(name);
  if (!promise) {
    promise = (async () => {
      const db = await SQLite.openDatabaseAsync(name);
      await db.execAsync(SCHEMA);
      return db;
    })();
    dbPromises.set(name, promise);
    // A failed init must not be cached, or every later call rejects with a
    // stale error and the app can never recover.
    promise.catch(() => {
      dbPromises.delete(name);
    });
  }
  return promise;
}

// -------------------------------------------------------------------
// Query helpers (the last parameter picks the database; default studiply.db)
// -------------------------------------------------------------------

export type SqlParam = string | number | null;

/** Runs a statement that returns no rows (INSERT/UPDATE/DELETE). */
export async function run(sql: string, params: SqlParam[] = [], name?: string): Promise<void> {
  const db = await getDb(name);
  await db.runAsync(sql, params);
}

/** Returns every matching row. */
export async function all<T>(sql: string, params: SqlParam[] = [], name?: string): Promise<T[]> {
  const db = await getDb(name);
  return db.getAllAsync<T>(sql, params);
}

/** Returns the first matching row, or null when there are none. */
export async function first<T>(sql: string, params: SqlParam[] = [], name?: string): Promise<T | null> {
  const db = await getDb(name);
  const row = await db.getFirstAsync<T>(sql, params);
  return row ?? null;
}

/** Returns the count from a `SELECT COUNT(*) AS count ...` query. */
export async function count(sql: string, params: SqlParam[] = [], name?: string): Promise<number> {
  const row = await first<{ count: number }>(sql, params, name);
  return row?.count ?? 0;
}

/** Runs `fn` inside a transaction, rolling back if it throws. */
export async function transaction(fn: () => Promise<void>, name?: string): Promise<void> {
  const db = await getDb(name);
  await db.withTransactionAsync(fn);
}

/**
 * Deletes the entire database file ("Remove the old copy", or the sample).
 * The next getDb() call would recreate an empty database from SCHEMA.
 */
export async function resetDb(name: string = DB_NAME): Promise<void> {
  const promise = dbPromises.get(name);
  if (promise) {
    const db = await promise;
    await db.closeAsync();
    dbPromises.delete(name);
  }
  await SQLite.deleteDatabaseAsync(name);
}
