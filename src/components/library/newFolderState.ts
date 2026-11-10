import { useSyncExternalStore } from 'react';

/**
 * New folder outside a course (Lea, 10 Nov): "+ New" → New folder, the iPhone Library's round +, and
 * ⌥⇧N anywhere but a course open "New folder in…" (NewFolderHost, drawn once by the app's layout).
 * Choosing a course or folder opens it with the new folder started there, named in place: the course
 * screen's own New folder (`?newFolder=1`), so there is one way of making a folder.
 */

let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function openNewFolderPicker(): void {
  open = true;
  emit();
}

export function closeNewFolderPicker(): void {
  if (!open) return;
  open = false;
  emit();
}

export function useNewFolderPicker(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => open,
    () => open,
  );
}

/** The course (and folder) screen with its New folder started. */
export function newFolderHref(target: { courseId: string; folderId: string | null }) {
  return {
    pathname: '/project/[id]' as const,
    params: { id: target.courseId, ...(target.folderId && { folder: target.folderId }), newFolder: '1' },
  };
}
