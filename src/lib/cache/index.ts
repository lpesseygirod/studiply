/**
 * cache/index.ts
 * What the services use to read through the iPhone's offline copy.
 *
 * Online, a service asks Supabase as before and keeps what came back
 * (`remember` / `rememberScope`). Without a connection, `readThrough` answers
 * from the cached rows instead (see ./localQueries). On the web the cache is
 * off (./store.web.ts) and every read goes to Supabase.
 */

import { isNetworkError, NetworkError, type FileRow, type LectureFileRow } from '../cloudRows';
import { getConnection, waitUntilKnown } from '../connectivity';
import { setAiPauseUser } from '../consentGate';
import { setPullsEnabled } from './library';
import { missingFrom } from './localQueries';
import {
  cacheEnabled,
  dirtyIds,
  dropRows,
  readRow,
  readRows,
  saveRows,
  setCacheUser,
  type CacheableRow,
  type CachedTable,
} from './store';

export * from './store';
export { notifyLibraryUpdated, onLibraryUpdated, requestPull, useLibraryUpdates } from './library';

let sessionLive = false;

/**
 * Set by AuthProvider. `live` is false while signed in offline: Supabase
 * would then answer as an anonymous visitor (no rows), so reads stay on the
 * cache until the session has been refreshed.
 */
export function setCacheSession(userId: string | null, live: boolean): void {
  const was = sessionLive;
  setCacheUser(userId);
  // "AI is off" belongs to this account.
  setAiPauseUser(userId);
  sessionLive = !!userId && live;
  setPullsEnabled(sessionLive);
  if (sessionLive && !was) liveListeners.forEach((fn) => fn());
}

const liveListeners = new Set<() => void>();

/** Online requests can be made for the signed-in student (Supabase has a valid session). */
export function isSessionLive(): boolean {
  return sessionLive;
}

/** Runs `fn` each time the session becomes usable (sign-in, refresh after offline). */
export function onSessionLive(fn: () => void): () => void {
  liveListeners.add(fn);
  return () => {
    liveListeners.delete(fn);
  };
}

/** How long a cold start waits for the first probe before trying the server. */
const FIRST_PROBE_WAIT_MS = 4_000;

/**
 * Supabase when it can be reached, otherwise the cache. `local` returns
 * null when the cache has nothing for this read, which shows the offline
 * message instead of an empty screen.
 */
export async function readThrough<T>(
  remote: () => Promise<T>,
  local: () => Promise<T | null>,
): Promise<T> {
  if (!cacheEnabled) return remote();
  if (getConnection() === 'unknown') await waitUntilKnown(FIRST_PROBE_WAIT_MS);

  const fromCache = async (cause: unknown): Promise<T> => {
    const value = await local().catch(() => null);
    if (value !== null) return value;
    throw cause;
  };

  if (getConnection() === 'offline' || !sessionLive) return fromCache(new NetworkError());
  try {
    return await remote();
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    return fromCache(err);
  }
}

/** Keeps downloaded rows. Never fails the read that downloaded them. */
export function remember(tbl: CachedTable, rows: CacheableRow[]): void {
  if (!cacheEnabled || rows.length === 0) return;
  saveRows(tbl, rows).catch((err) => {
    if (__DEV__) console.warn(`[cache] could not save ${tbl}`, err);
  });
}

/**
 * Keeps a complete answer for a scope (e.g. one folder's lectures) and drops
 * cached rows of that scope the answer no longer has.
 */
export function rememberScope<T extends CacheableRow>(
  tbl: CachedTable,
  rows: T[],
  inScope: (row: T) => boolean,
): void {
  if (!cacheEnabled) return;
  (async () => {
    await saveRows(tbl, rows);
    const cached = await readRows<T>(tbl);
    await dropRows(tbl, missingFrom(cached, inScope, rows));
  })().catch((err) => {
    if (__DEV__) console.warn(`[cache] could not save ${tbl}`, err);
  });
}

/**
 * Keeps lecture files (`files.select('*, lectures(*)')`) and their lecture
 * rows. With `inScope` the answer was complete for that scope.
 */
export function rememberLectureFiles(rows: LectureFileRow[], inScope?: (f: FileRow) => boolean): void {
  const files = rows.map(({ lectures: _lecture, ...file }) => file);
  if (inScope) rememberScope('files', files, inScope);
  else remember('files', files);
  remember(
    'lectures',
    rows.flatMap((r) => (r.lectures ? [r.lectures] : [])),
  );
}

/**
 * Rows changed on this iPhone and not synced yet replace what Supabase
 * returned, so a screen shows the student's own latest version.
 */
export async function withLocalChanges<T extends { id: string }>(tbl: CachedTable, rows: T[]): Promise<T[]> {
  if (!cacheEnabled || rows.length === 0) return rows;
  const dirty = await dirtyIds(tbl).catch(() => new Set<string>());
  if (dirty.size === 0) return rows;
  return Promise.all(rows.map(async (r) => (dirty.has(r.id) ? ((await readRow<T>(tbl, r.id)) ?? r) : r)));
}

/**
 * A server answer with this iPhone's unsynced rows put in: changed rows
 * replace the server's, and rows made here (not on the server yet) are added
 * when they belong to the answer's scope. Returns `rows` itself when there
 * is nothing local.
 */
export async function withLocalRows<T extends { id: string }>(
  tbl: CachedTable,
  rows: T[],
  inScope: (row: T) => boolean,
): Promise<T[]> {
  if (!cacheEnabled) return rows;
  const dirty = await dirtyIds(tbl).catch(() => new Set<string>());
  if (dirty.size === 0) return rows;
  const byId = new Map(rows.map((r) => [r.id, r]));
  let changed = false;
  for (const id of dirty) {
    const local = await readRow<T>(tbl, id);
    if (!local || (!byId.has(id) && !inScope(local))) continue;
    byId.set(id, local);
    changed = true;
  }
  return changed ? [...byId.values()] : rows;
}
