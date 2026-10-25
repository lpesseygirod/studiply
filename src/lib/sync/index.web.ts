/**
 * sync/index.web.ts
 * Web build of sync/index.ts: the browser keeps no queue (no offline
 * editing on the web), so every change goes straight to Supabase and these
 * are no-ops.
 */

import type { SyncEvent, SyncHandler, SyncOp } from './queue';

export { PermanentSyncError, SyncHttpError } from './queue';
export type { SyncEvent, SyncOp } from './queue';

export const syncEnabled = false;

export function registerSyncHandler<P>(_kind: string, _handler: SyncHandler<P>): void {}

export async function enqueue<P>(_input: { kind: string; key: string; payload: P }): Promise<SyncOp<P>> {
  throw new Error('The web app sends changes directly.');
}

export async function flushSync(): Promise<void> {}

export async function syncCounts(): Promise<{ pending: number; failed: number }> {
  return { pending: 0, failed: 0 };
}

export async function pendingSyncFor(_key: string): Promise<SyncOp[]> {
  return [];
}

export async function retryFailedSync(): Promise<void> {}

export async function discardSync(_id: string): Promise<void> {}

export function onSyncEvent(_fn: (e: SyncEvent) => void): () => void {
  return () => {};
}

export function useSyncCounts(): { pending: number; failed: number } {
  return { pending: 0, failed: 0 };
}

export async function hasPendingSync(_key: string): Promise<boolean> {
  return false;
}

export function usePendingSync(_key: string | undefined): number {
  return 0;
}
