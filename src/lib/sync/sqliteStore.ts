/**
 * sqliteStore.ts
 * The sync queue's operations in the iPhone's cache database (table
 * `outbox`), so they survive the app being closed. iPhone only: the web
 * build never loads it (see ./index.web.ts).
 */

import { getCacheDb } from '../cache/store';
import type { QueueStore, SyncOp } from './queue';

interface OutboxRow {
  id: string;
  user_id: string;
  kind: string;
  key: string;
  payload: string;
  created_at: string;
  attempts: number;
  next_attempt_at: string | null;
  status: string;
  last_error: string | null;
}

function fromRow(r: OutboxRow): SyncOp {
  return {
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    key: r.key,
    payload: JSON.parse(r.payload),
    createdAt: r.created_at,
    attempts: r.attempts,
    nextAttemptAt: r.next_attempt_at,
    status: r.status === 'failed' ? 'failed' : 'pending',
    lastError: r.last_error,
  };
}

export const sqliteStore: QueueStore = {
  async list(userId) {
    const db = await getCacheDb();
    const rows = await db.getAllAsync<OutboxRow>(`SELECT * FROM outbox WHERE user_id = ? ORDER BY seq`, [userId]);
    return rows.map(fromRow);
  },

  async add(op) {
    const db = await getCacheDb();
    await db.runAsync(
      `INSERT INTO outbox (id, user_id, kind, key, payload, created_at, attempts, next_attempt_at, status, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        op.id,
        op.userId,
        op.kind,
        op.key,
        JSON.stringify(op.payload),
        op.createdAt,
        op.attempts,
        op.nextAttemptAt,
        op.status,
        op.lastError,
      ],
    );
  },

  async update(op) {
    const db = await getCacheDb();
    await db.runAsync(
      `UPDATE outbox SET payload = ?, attempts = ?, next_attempt_at = ?, status = ?, last_error = ? WHERE id = ?`,
      [JSON.stringify(op.payload), op.attempts, op.nextAttemptAt, op.status, op.lastError, op.id],
    );
  },

  async remove(id) {
    const db = await getCacheDb();
    await db.runAsync(`DELETE FROM outbox WHERE id = ?`, [id]);
  },
};
