/**
 * sync/index.ts
 * The iPhone's sync queue (./queue) with its SQLite store, and when it runs:
 * as soon as something is added, when the session becomes usable, when the
 * backend is reachable again, and when the app comes to the foreground.
 *
 * Services register a handler per kind of operation (see
 * src/services/sync-handlers.ts). The web build uses ./index.web.ts: the
 * browser sends every change straight to Supabase.
 */

import { AppState } from 'react-native';
import { useEffect, useState } from 'react';

import { cacheUser, isSessionLive, onSessionLive } from '../cache';
import { getConnection, onBackOnline } from '../connectivity';
import { newId } from '../mappers';
import { supabase } from '../supabase';
import { createSyncQueue, type AnyHandler, type SyncEvent, type SyncHandler, type SyncOp } from './queue';
import { sqliteStore } from './sqliteStore';

export { PermanentSyncError, SyncHttpError } from './queue';
export type { SyncEvent, SyncOp } from './queue';

export const syncEnabled = true;

const handlers: Record<string, AnyHandler> = {};

export function registerSyncHandler<P>(kind: string, handler: SyncHandler<P>): void {
  handlers[kind] = handler;
}

const queue = createSyncQueue({
  store: sqliteStore,
  handlers,
  userId: cacheUser,
  canSync: () => getConnection() === 'online' && isSessionLive(),
  refresh: async () => !(await supabase.auth.refreshSession()).error,
  newId,
  // In the Metro terminal while testing.
  log: __DEV__ ? (message) => console.log(`[sync] ${message}`) : undefined,
});

export const enqueue = queue.enqueue;
export const flushSync = queue.flush;
export const syncCounts = queue.counts;
export const pendingSyncFor = queue.pendingFor;
export const retryFailedSync = queue.retryFailed;
export const discardSync = queue.discard;
export const onSyncEvent = queue.subscribe;
export const syncOps = queue.list;

/**
 * Sends everything now: failed changes are tried again and waiting ones
 * don't wait out their backoff (Settings → "Try again", dev "Sync now").
 */
export const syncNow = queue.retryFailed;

// The connection or the session just came back, or the app was opened:
// whatever waits is sent at once instead of after its backoff.
const flushSoon = () => {
  queue.flush({ now: true }).catch((err) => {
    if (__DEV__) console.warn('[sync] flush stopped', err?.message ?? err);
  });
};

onSessionLive(flushSoon);
onBackOnline(flushSoon);
AppState.addEventListener('change', (state) => {
  if (state === 'active') flushSoon();
});

/** Waiting and failed changes, kept up to date. */
export function useSyncCounts(): { pending: number; failed: number } {
  const [counts, setCounts] = useState({ pending: 0, failed: 0 });
  useEffect(() => {
    let alive = true;
    const load = () => {
      queue
        .counts()
        .then((c) => {
          if (alive) setCounts(c);
        })
        .catch(() => {});
    };
    load();
    const off = queue.subscribe((e: SyncEvent) => {
      if (e.type === 'changed') load();
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  return counts;
}

/** Is anything still waiting to sync for this key (a note, a lecture)? */
export async function hasPendingSync(key: string): Promise<boolean> {
  const ops: SyncOp[] = await queue.pendingFor(key);
  return ops.length > 0;
}

/** How many operations for this key (e.g. a lecture's uploads) are still waiting. */
export function usePendingSync(key: string | undefined): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const load = () => {
      queue
        .pendingFor(key)
        .then((ops) => {
          if (alive) setCount(ops.length);
        })
        .catch(() => {});
    };
    load();
    const off = queue.subscribe((e: SyncEvent) => {
      if (e.type === 'changed') load();
    });
    return () => {
      alive = false;
      off();
    };
  }, [key]);
  return count;
}
