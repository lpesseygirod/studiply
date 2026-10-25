/**
 * pull.ts
 * Downloading the student's library into the iPhone's cache, so everything
 * opens offline, not only what was viewed before.
 *
 * Each table is downloaded incrementally: rows changed since the last pull
 * (by the server's updated_at), plus the list of ids, so rows deleted on
 * another device leave the cache too. Rows changed on this iPhone that
 * haven't synced yet are never replaced or dropped. Transcripts are
 * downloaded for the most recent lectures.
 *
 * `pullTable` takes its reads and writes as parameters so it is unit tested;
 * `pullLibrary` wires it to Supabase and the SQLite store.
 */

import type { SegmentRow } from '../cloudRows';
import type { CacheableRow, CachedTable } from './store';

export const PULL_TABLES: CachedTable[] = [
  'courses',
  'folders',
  'files',
  'lectures',
  'summaries',
  'media',
  'audio_chunks',
];

export const PAGE = 1000;

/**
 * A row written in a long transaction can carry an updated_at slightly
 * older than rows already downloaded, so each pull re-reads a minute back.
 */
export const OVERLAP_MS = 60_000;

export interface PullTableDeps<T extends CacheableRow> {
  /** Rows with updated_at >= since (null = all), ordered, one page. */
  fetchChanged: (since: string | null, from: number, to: number) => Promise<T[]>;
  /** Every id the server has for this table, one page. */
  fetchIds: (from: number, to: number) => Promise<{ id: string }[]>;
  cachedIds: () => Promise<string[]>;
  dirtyIds: () => Promise<Set<string>>;
  save: (rows: T[]) => Promise<void>;
  drop: (ids: string[]) => Promise<void>;
  getSince: () => Promise<string | null>;
  setSince: (since: string) => Promise<void>;
}

async function allPages<R>(fetch: (from: number, to: number) => Promise<R[]>): Promise<R[]> {
  const all: R[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await fetch(from, from + PAGE - 1);
    all.push(...page);
    if (page.length < PAGE) return all;
  }
}

/** Brings one table up to date. Returns how many rows were saved or dropped. */
export async function pullTable<T extends CacheableRow>(deps: PullTableDeps<T>): Promise<number> {
  const watermark = await deps.getSince();
  const since = watermark ? new Date(Date.parse(watermark) - OVERLAP_MS).toISOString() : null;

  const changed = await allPages((from, to) => deps.fetchChanged(since, from, to));
  const serverIds = await allPages(deps.fetchIds);
  const dirty = await deps.dirtyIds();

  const toSave = changed.filter((r) => !dirty.has(r.id));
  const onServer = new Set(serverIds.map((r) => r.id));
  const toDrop = (await deps.cachedIds()).filter((id) => !onServer.has(id) && !dirty.has(id));

  await deps.save(toSave);
  await deps.drop(toDrop);

  const newest = changed.reduce<string | null>(
    (max, r) => (r.updated_at && (!max || r.updated_at > max) ? r.updated_at : max),
    watermark,
  );
  if (newest && newest !== watermark) await deps.setSince(newest);
  return toSave.length + toDrop.length;
}

/** Recent lectures whose transcript isn't cached, or changed since it was. */
export function transcriptsToFetch(
  lectures: { id: string; status: string; updated_at: string }[],
  fetchedAt: Map<string, string>,
  limit: number,
): string[] {
  return [...lectures]
    .filter((l) => l.status === 'ready')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, limit)
    .filter((l) => {
      const at = fetchedAt.get(l.id);
      return !at || at < l.updated_at;
    })
    .map((l) => l.id);
}

export type SegmentPage = (lectureId: string, from: number, to: number) => Promise<SegmentRow[]>;

export function fetchAllSegments(lectureId: string, page: SegmentPage): Promise<SegmentRow[]> {
  return allPages((from, to) => page(lectureId, from, to));
}
