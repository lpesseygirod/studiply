/**
 * errors.ts
 * Turning a failed Supabase call inside a sync handler into what the queue
 * understands: try again later (no connection, expired session, server
 * trouble) or give up and keep the change as failed (refused by the
 * database).
 */

import { NetworkError } from '../cloudRows';
import { PermanentSyncError, SyncHttpError } from './queue';

export function syncError(error: { code?: string; message?: string } | null, message: string): Error {
  const text = error?.message ?? '';
  if (/network request failed|failed to fetch|load failed/i.test(text)) return new NetworkError();
  // The database's own words, e.g. "23503 insert or update on table … violates foreign key …".
  const detail = [error?.code, text].filter(Boolean).join(' ');
  if (error?.code === 'PGRST301' || /jwt expired|invalid jwt/i.test(text)) return new SyncHttpError(message, 401, detail);
  // Postgres refused it: constraint, permission, missing row (23xxx, 42xxx).
  if (error?.code && /^(23|42)/.test(error.code)) return new PermanentSyncError(message, detail);
  return new SyncHttpError(message, 503, detail);
}
