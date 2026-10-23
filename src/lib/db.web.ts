/**
 * db.web.ts
 * Web build of db.ts: there is no local SQLite database in the browser.
 *
 * expo-sqlite can't be bundled for web without extra Metro and COOP/COEP
 * setup, and by decision (PROGRESS, Phase 1) the web app reads Supabase
 * directly instead, from step 1.7. Until then reads return nothing, so the
 * library shows as empty, and writes fail with a clear message rather than
 * pretending to save.
 */

export type SqlParam = string | number | null;

const UNAVAILABLE = 'Saving in the web app comes in a later update. Use the iPhone app for now.';

export async function getDb(): Promise<never> {
  throw new Error(UNAVAILABLE);
}

export async function run(_sql: string, _params: SqlParam[] = []): Promise<void> {
  throw new Error(UNAVAILABLE);
}

export async function all<T>(_sql: string, _params: SqlParam[] = []): Promise<T[]> {
  return [];
}

export async function first<T>(_sql: string, _params: SqlParam[] = []): Promise<T | null> {
  return null;
}

export async function count(_sql: string, _params: SqlParam[] = []): Promise<number> {
  return 0;
}

export async function transaction(_fn: () => Promise<void>): Promise<void> {
  throw new Error(UNAVAILABLE);
}

export async function resetDb(): Promise<void> {}
