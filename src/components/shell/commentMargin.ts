import { useSyncExternalStore } from 'react';

/**
 * The laptop's comments margin (step 4.5) between the shell and the
 * document screen: the shell knows whether its centre pane has room for
 * the page and a margin beside it (`room`); the document says when it shows
 * the margin (`shown`), and the shell then widens the page's column for it.
 */

export interface CommentMarginState {
  room: boolean;
  shown: boolean;
}

let state: CommentMarginState = { room: false, shown: false };
const listeners = new Set<() => void>();

function set(next: Partial<CommentMarginState>) {
  const merged = { ...state, ...next };
  if (merged.room === state.room && merged.shown === state.shown) return;
  state = merged;
  listeners.forEach((fn) => fn());
}

export const setCommentMarginRoom = (room: boolean) => set({ room });
export const setCommentMarginShown = (shown: boolean) => set({ shown });

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function useCommentMargin(): CommentMarginState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
