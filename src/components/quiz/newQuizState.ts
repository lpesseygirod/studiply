import { useSyncExternalStore } from 'react';

/**
 * New quiz: whether the panel is open, and on which course. Opened by Review's Quiz me
 * tab (+ New quiz); drawn once, by the app's layout, over any screen (as the summarize panel).
 */
export interface NewQuizRequest {
  /** The course to start on; null: the newest quiz's course, else the first. */
  courseId: string | null;
  /** A new panel each time it is opened. */
  at: number;
}

let current: NewQuizRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function openNewQuiz(courseId: string | null = null): void {
  current = { courseId, at: Date.now() };
  emit();
}

export function closeNewQuiz(): void {
  if (!current) return;
  current = null;
  emit();
}

export function useNewQuizPanel(): NewQuizRequest | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => current,
  );
}
