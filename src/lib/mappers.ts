/**
 * mappers.ts
 * Small helpers the services share. (Until step 1.7 this file also mapped
 * SQLite rows; the Supabase rows are mapped in ./cloudRows.ts.)
 */

import * as Crypto from 'expo-crypto';

/** Fresh UUID for a row whose id must be known before it is written. */
export function newId(): string {
  return Crypto.randomUUID();
}

/** Current time in the ISO-8601 UTC form every timestamp column uses. */
export function now(): string {
  return new Date().toISOString();
}

/** Escapes a user-supplied LIKE pattern so `%` and `_` match literally. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}
