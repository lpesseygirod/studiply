import { useSyncExternalStore } from 'react';

import type { CombineMode } from '../../services/summaryCombine.service';

/**
 * The lecture picker of Extend with next lecture, Merge lectures and Make exam pack, opened
 * from a lecture's document menu, the green banner's + Extend with next lecture, the iPhone's
 * + Extend with next, and the Library's item menus; drawn once, by the app's layout, over any screen.
 */
export interface PickRequest {
  mode: CombineMode;
  /** The course (and folder) whose lectures are listed. */
  courseId: string | null;
  folderId: string | null;
  /** Extend: the lecture whose summary is extended (listed first, always in). */
  baseLectureId?: string;
}

let current: PickRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function openLecturePicker(request: PickRequest): void {
  current = request;
  emit();
}

export function closeLecturePicker(): void {
  if (!current) return;
  current = null;
  emit();
}

export function useLecturePicker(): PickRequest | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => current,
  );
}
