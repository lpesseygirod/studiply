/**
 * memoryStore.ts
 * A queue store that lives in memory: for tests, and for checking the queue
 * rules without SQLite.
 */

import type { QueueStore, SyncOp } from './queue';

export function createMemoryStore(): QueueStore & { ops: SyncOp[] } {
  const ops: SyncOp[] = [];
  return {
    ops,
    async list(userId) {
      return ops.filter((o) => o.userId === userId).map((o) => ({ ...o }));
    },
    async add(op) {
      ops.push({ ...op });
    },
    async update(op) {
      const i = ops.findIndex((o) => o.id === op.id);
      if (i >= 0) ops[i] = { ...op };
    },
    async remove(id) {
      const i = ops.findIndex((o) => o.id === id);
      if (i >= 0) ops.splice(i, 1);
    },
  };
}
