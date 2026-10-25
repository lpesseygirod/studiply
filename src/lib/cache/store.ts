/**
 * store.ts
 * The iPhone's offline copy of the student's library (SQLite).
 *
 * Rows are kept exactly as Supabase returned them (JSON in `data`), so the
 * same mappers in ../cloudRows turn them into the app's types online and
 * offline. A row the student changed on this iPhone that hasn't synced yet is
 * `dirty`; downloads never overwrite it.
 *
 * This is a separate database file from the old `studiply.db`, which keeps
 * the data from before step 1.7 until step 1.9 uploads it. The web build uses
 * store.web.ts: there is no cache in the browser.
 */

import * as SQLite from 'expo-sqlite';

import type { SegmentRow } from '../cloudRows';

export const cacheEnabled = true;

export type CachedTable = 'courses' | 'folders' | 'files' | 'lectures' | 'summaries' | 'media' | 'audio_chunks';

/** The fields every cached row has. */
export interface CacheableRow {
  id: string;
  user_id: string;
  updated_at?: string;
}

const DB_NAME = 'studiply-cache.db';

// One entry per schema version; PRAGMA user_version records how many ran.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE rows (
    tbl        TEXT NOT NULL,
    id         TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    parent     TEXT,
    data       TEXT NOT NULL,
    updated_at TEXT,
    dirty      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tbl, id)
  );
  CREATE INDEX rows_user_idx ON rows (tbl, user_id);
  CREATE INDEX rows_parent_idx ON rows (tbl, parent);

  CREATE TABLE segments (
    lecture_id TEXT PRIMARY KEY NOT NULL,
    user_id    TEXT NOT NULL,
    data       TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );

  CREATE TABLE meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let currentUser: string | null = null;

export function getCacheDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL;');
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      const version = row?.user_version ?? 0;
      for (let v = version; v < MIGRATIONS.length; v++) {
        await db.withTransactionAsync(async () => {
          await db.execAsync(MIGRATIONS[v]);
          await db.execAsync(`PRAGMA user_version = ${v + 1}`);
        });
      }
      return db;
    })();
    // A failed open must not be cached, or the cache could never recover.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

/** The signed-in student; every read and write is limited to them. */
export function setCacheUser(userId: string | null): void {
  currentUser = userId;
}

export function cacheUser(): string | null {
  return currentUser;
}

/** The row a child belongs to, for loading one lecture's rows. */
function parentOf(tbl: CachedTable, row: Record<string, unknown>): string | null {
  const key = tbl === 'summaries' ? 'file_id' : tbl === 'media' || tbl === 'audio_chunks' ? 'lecture_id' : null;
  const value = key ? row[key] : null;
  return typeof value === 'string' ? value : null;
}

async function writeRows(tbl: CachedTable, rows: CacheableRow[], dirty: boolean): Promise<void> {
  if (rows.length === 0) return;
  const db = await getCacheDb();
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      const params = [
        tbl,
        row.id,
        row.user_id,
        parentOf(tbl, row as unknown as Record<string, unknown>),
        JSON.stringify(row),
        row.updated_at ?? null,
      ];
      if (dirty) {
        await db.runAsync(
          `INSERT INTO rows (tbl, id, user_id, parent, data, updated_at, dirty) VALUES (?, ?, ?, ?, ?, ?, 1)
           ON CONFLICT (tbl, id) DO UPDATE SET user_id = excluded.user_id, parent = excluded.parent,
             data = excluded.data, updated_at = excluded.updated_at, dirty = 1`,
          params,
        );
      } else {
        // Downloads never replace a change that hasn't synced yet.
        await db.runAsync(
          `INSERT INTO rows (tbl, id, user_id, parent, data, updated_at, dirty) VALUES (?, ?, ?, ?, ?, ?, 0)
           ON CONFLICT (tbl, id) DO UPDATE SET user_id = excluded.user_id, parent = excluded.parent,
             data = excluded.data, updated_at = excluded.updated_at
           WHERE rows.dirty = 0`,
          params,
        );
      }
    }
  });
}

/** Stores rows downloaded from Supabase. */
export function saveRows(tbl: CachedTable, rows: CacheableRow[]): Promise<void> {
  return writeRows(tbl, rows, false);
}

/** Stores a row changed on this iPhone, to be synced (see ../sync). */
export function saveLocalRow(tbl: CachedTable, row: CacheableRow): Promise<void> {
  return writeRows(tbl, [row], true);
}

/** The row has synced: later downloads may replace it again. */
export async function markClean(tbl: CachedTable, id: string, row?: CacheableRow): Promise<void> {
  const db = await getCacheDb();
  if (row) {
    await db.runAsync(`UPDATE rows SET data = ?, updated_at = ?, dirty = 0 WHERE tbl = ? AND id = ?`, [
      JSON.stringify(row),
      row.updated_at ?? null,
      tbl,
      id,
    ]);
  } else {
    await db.runAsync(`UPDATE rows SET dirty = 0 WHERE tbl = ? AND id = ?`, [tbl, id]);
  }
}

/** The signed-in student's rows of a table, or only those under `parent`. */
export async function readRows<T>(tbl: CachedTable, parent?: string): Promise<T[]> {
  if (!currentUser) return [];
  const db = await getCacheDb();
  const rows =
    parent === undefined
      ? await db.getAllAsync<{ data: string }>(`SELECT data FROM rows WHERE tbl = ? AND user_id = ?`, [tbl, currentUser])
      : await db.getAllAsync<{ data: string }>(
          `SELECT data FROM rows WHERE tbl = ? AND user_id = ? AND parent = ?`,
          [tbl, currentUser, parent],
        );
  return rows.map((r) => JSON.parse(r.data) as T);
}

export async function readRow<T>(tbl: CachedTable, id: string): Promise<T | null> {
  if (!currentUser) return null;
  const db = await getCacheDb();
  const row = await db.getFirstAsync<{ data: string }>(
    `SELECT data FROM rows WHERE tbl = ? AND id = ? AND user_id = ?`,
    [tbl, id, currentUser],
  );
  return row ? (JSON.parse(row.data) as T) : null;
}

export async function cachedIds(tbl: CachedTable): Promise<string[]> {
  if (!currentUser) return [];
  const db = await getCacheDb();
  const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM rows WHERE tbl = ? AND user_id = ?`, [
    tbl,
    currentUser,
  ]);
  return rows.map((r) => r.id);
}

/** Ids of rows with changes that haven't synced yet. */
export async function dirtyIds(tbl: CachedTable): Promise<Set<string>> {
  if (!currentUser) return new Set();
  const db = await getCacheDb();
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM rows WHERE tbl = ? AND user_id = ? AND dirty = 1`,
    [tbl, currentUser],
  );
  return new Set(rows.map((r) => r.id));
}

/** Removes rows that no longer exist on the server (never unsynced ones). */
export async function dropRows(tbl: CachedTable, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getCacheDb();
  await db.withTransactionAsync(async () => {
    for (const id of ids) {
      await db.runAsync(`DELETE FROM rows WHERE tbl = ? AND id = ? AND dirty = 0`, [tbl, id]);
    }
  });
}

export async function saveSegments(lectureId: string, userId: string, segments: SegmentRow[]): Promise<void> {
  const db = await getCacheDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO segments (lecture_id, user_id, data, fetched_at) VALUES (?, ?, ?, ?)`,
    [lectureId, userId, JSON.stringify(segments), new Date().toISOString()],
  );
}

/** The cached transcript segments, or null if this lecture's were never downloaded. */
export async function readSegments(lectureId: string): Promise<SegmentRow[] | null> {
  if (!currentUser) return null;
  const db = await getCacheDb();
  const row = await db.getFirstAsync<{ data: string }>(
    `SELECT data FROM segments WHERE lecture_id = ? AND user_id = ?`,
    [lectureId, currentUser],
  );
  return row ? (JSON.parse(row.data) as SegmentRow[]) : null;
}

export async function segmentsFetchedAt(): Promise<Map<string, string>> {
  if (!currentUser) return new Map();
  const db = await getCacheDb();
  const rows = await db.getAllAsync<{ lecture_id: string; fetched_at: string }>(
    `SELECT lecture_id, fetched_at FROM segments WHERE user_id = ?`,
    [currentUser],
  );
  return new Map(rows.map((r) => [r.lecture_id, r.fetched_at]));
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getCacheDb();
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM meta WHERE key = ?`, [key]);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getCacheDb();
  await db.runAsync(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`, [key, value]);
}

/** Forgets everything cached for a student (sign-out, "Delete all data"). */
export async function clearCache(userId: string): Promise<void> {
  const db = await getCacheDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM rows WHERE user_id = ?`, [userId]);
    await db.runAsync(`DELETE FROM segments WHERE user_id = ?`, [userId]);
    await db.runAsync(`DELETE FROM meta WHERE key LIKE ?`, [`${userId}:%`]);
  });
}
