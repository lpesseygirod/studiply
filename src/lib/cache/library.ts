/**
 * library.ts
 * When the iPhone downloads the library (./pull), and telling screens that
 * fresher data is there.
 *
 * A pull runs when the session becomes usable (sign-in, or the refresh after
 * an offline start), when the backend is reachable again, and when the app
 * comes to the foreground (at most every two minutes). Screens that show
 * library data reload on `onLibraryUpdated`. Nothing runs on the web.
 */

import { AppState } from 'react-native';
import { useEffect, useRef } from 'react';

import { supabase } from '../supabase';
import { onBackOnline } from '../connectivity';
import { SEGMENT_COLUMNS, withChunkPlaces, type SegmentRow } from '../cloudRows';
import { cursorColumn, fetchAllSegments, pullTable, PULL_TABLES, transcriptsToFetch } from './pull';
import {
  cacheEnabled,
  cacheUser,
  cachedIds,
  dirtyIds,
  dropRows,
  getMeta,
  readRows,
  saveRows,
  saveSegments,
  segmentsFetchedAt,
  setMeta,
  type CacheableRow,
  type CachedTable,
} from './store';

const MIN_INTERVAL_MS = 2 * 60_000;
/** Transcripts kept ready for offline: the most recent lectures. */
const RECENT_TRANSCRIPTS = 20;

const listeners = new Set<() => void>();
let running: Promise<void> | null = null;
let lastPull = 0;
let live = false;

async function pullOne(userId: string, tbl: CachedTable): Promise<number> {
  const sinceKey = `${userId}:pull:${tbl}`;
  const cursor = cursorColumn(tbl);
  return pullTable<CacheableRow>({
    cursor,
    fetchChanged: async (since, from, to) => {
      let query = supabase.from(tbl).select('*');
      if (since) query = query.gte(cursor, since);
      const { data, error } = await query.order(cursor).order('id').range(from, to);
      if (error) throw error;
      return data as CacheableRow[];
    },
    fetchIds: async (from, to) => {
      const { data, error } = await supabase.from(tbl).select('id').order('id').range(from, to);
      if (error) throw error;
      return data;
    },
    cachedIds: () => cachedIds(tbl),
    dirtyIds: () => dirtyIds(tbl),
    save: (rows) => saveRows(tbl, rows),
    drop: (ids) => dropRows(tbl, ids),
    getSince: () => getMeta(sinceKey),
    setSince: (since) => setMeta(sinceKey, since),
  });
}

async function pullTranscripts(userId: string): Promise<number> {
  const lectures = await readRows<{ id: string; status: string; updated_at: string }>('lectures');
  const ids = transcriptsToFetch(lectures, await segmentsFetchedAt(), RECENT_TRANSCRIPTS);
  for (const id of ids) {
    const read = await fetchAllSegments(id, async (lectureId, from, to) => {
      const { data, error } = await supabase
        .from('transcript_segments')
        .select(SEGMENT_COLUMNS)
        .eq('lecture_id', lectureId)
        .order('start_ms', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);
      if (error) throw error;
      return data as (SegmentRow & { chunk_id: string | null })[];
    });
    // With their chunks' places, so the transcript read offline is joined like the online one.
    const { data: chunks, error } = await supabase.from('audio_chunks').select('id, seq, start_ms, duration_ms').eq('lecture_id', id);
    if (error) throw error;
    await saveSegments(id, userId, withChunkPlaces(read as (SegmentRow & { chunk_id: string | null })[], chunks));
  }
  return ids.length;
}

async function pullLibrary(): Promise<void> {
  const userId = cacheUser();
  if (!userId) return;
  let changes = 0;
  for (const tbl of PULL_TABLES) changes += await pullOne(userId, tbl);
  changes += await pullTranscripts(userId);
  lastPull = Date.now();
  if (changes > 0) listeners.forEach((fn) => fn());
}

/** Starts a pull unless one ran recently (`force` skips that check). */
export function requestPull(force = false): Promise<void> {
  if (!cacheEnabled || !live || !cacheUser()) return Promise.resolve();
  if (running) return running;
  if (!force && Date.now() - lastPull < MIN_INTERVAL_MS) return Promise.resolve();
  running = pullLibrary()
    .catch((err) => {
      if (__DEV__) console.warn('[cache] library download stopped', err?.message ?? err);
    })
    .finally(() => {
      running = null;
    });
  return running;
}

/** Called by setCacheSession: pulls start once the session is usable. */
export function setPullsEnabled(enabled: boolean): void {
  const was = live;
  live = enabled;
  if (enabled && !was) {
    lastPull = 0;
    requestPull(true);
  }
}

/** Screens reload when a pull brought changes (or a synced change came back). */
export function onLibraryUpdated(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function notifyLibraryUpdated(): void {
  listeners.forEach((fn) => fn());
}

/** Runs `reload` whenever the library was updated in the background. */
export function useLibraryUpdates(reload: () => void): void {
  const ref = useRef(reload);
  ref.current = reload;
  useEffect(() => onLibraryUpdated(() => ref.current()), []);
}

// Removed again when a development reload runs this file a second time.
const g = globalThis as { __studiplyPullDispose?: () => void };
g.__studiplyPullDispose?.();
if (cacheEnabled) {
  const offBackOnline = onBackOnline(() => {
    requestPull(true);
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') requestPull();
  });
  g.__studiplyPullDispose = () => {
    offBackOnline();
    appState.remove();
  };
}
