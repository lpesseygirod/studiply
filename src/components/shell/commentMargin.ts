import { useSyncExternalStore } from 'react';

/**
 * The laptop's document layout between the shell and the document screen:
 * - the comments margin (step 4.5): the shell knows whether its centre pane
 *   has room for the page and a margin beside it (`room`); the document says
 *   when it shows the margin (`shown`), and the shell then widens the page's
 *   column for it;
 * - Pages (step 4.5b, after test D): the document says when it shows pages
 *   (`pages`), and the shell gives it the whole centre pane, so the pages
 *   sit on the gradient and scroll with it (no column, no scroll box).
 */

export interface CommentMarginState {
  room: boolean;
  shown: boolean;
  pages: boolean;
}

let state: CommentMarginState = { room: false, shown: false, pages: false };
const listeners = new Set<() => void>();

function set(next: Partial<CommentMarginState>) {
  const merged = { ...state, ...next };
  if (merged.room === state.room && merged.shown === state.shown && merged.pages === state.pages) return;
  state = merged;
  listeners.forEach((fn) => fn());
}

export const setCommentMarginRoom = (room: boolean) => set({ room });
export const setCommentMarginShown = (shown: boolean) => set({ shown });
export const setDocumentPages = (pages: boolean) => set({ pages });

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function useCommentMargin(): CommentMarginState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
