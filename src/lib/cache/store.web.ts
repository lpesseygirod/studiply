/**
 * store.web.ts
 * Web build of store.ts: the browser keeps no offline copy (see PROGRESS
 * decisions), so the cache is switched off and holds nothing.
 */

import type { SegmentRow } from '../cloudRows';

export const cacheEnabled = false;

export type CachedTable =
  | 'courses'
  | 'folders'
  | 'files'
  | 'lectures'
  | 'summaries'
  | 'media'
  | 'audio_chunks'
  | 'documents'
  | 'flashcards'
  | 'review_schedule'
  | 'quizzes'
  | 'quiz_questions'
  | 'quiz_attempts'
  | 'quiz_answers'
  | 'course_settings';

export interface CacheableRow {
  id: string;
  user_id: string;
  updated_at?: string;
}

export function setCacheUser(_userId: string | null): void {}

export function cacheUser(): string | null {
  return null;
}

export async function saveRows(_tbl: CachedTable, _rows: CacheableRow[]): Promise<void> {}

export async function saveLocalRow(_tbl: CachedTable, _row: CacheableRow): Promise<void> {}

export async function markClean(_tbl: CachedTable, _id: string, _row?: CacheableRow): Promise<void> {}

export async function readRows<T>(_tbl: CachedTable, _parent?: string): Promise<T[]> {
  return [];
}

export async function readRow<T>(_tbl: CachedTable, _id: string): Promise<T | null> {
  return null;
}

export async function cachedIds(_tbl: CachedTable): Promise<string[]> {
  return [];
}

export async function dirtyIds(_tbl: CachedTable): Promise<Set<string>> {
  return new Set();
}

export async function dropRows(_tbl: CachedTable, _ids: string[]): Promise<void> {}

export async function saveSegments(_lectureId: string, _userId: string, _segments: SegmentRow[]): Promise<void> {}

export async function readSegments(_lectureId: string): Promise<SegmentRow[] | null> {
  return null;
}

export async function segmentsFetchedAt(): Promise<Map<string, string>> {
  return new Map();
}

export async function getMeta(_key: string): Promise<string | null> {
  return null;
}

export async function setMeta(_key: string, _value: string): Promise<void> {}

export async function deleteMeta(_key: string): Promise<void> {}

export async function clearCache(_userId: string): Promise<void> {}
