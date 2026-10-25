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
import { setPullsEnabled } from './library';
import { missingFrom } from './localQueries';
import {
  cacheEnabled,
  dropRows,
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
  setCacheUser(userId);
  sessionLive = !!userId && live;
  setPullsEnabled(sessionLive);
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
