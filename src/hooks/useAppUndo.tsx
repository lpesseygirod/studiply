import { createContext, useContext } from 'react';

import type { ShowUndo } from '../utils/star';

/**
 * The app's own Undo toast (rendered once by app/(main)/_layout.tsx), for
 * actions that leave the screen they started on: deleting the course or
 * folder you're in goes up a level, and its Undo must still be visible.
 */
const AppUndoContext = createContext<ShowUndo>(() => {});

export const AppUndoProvider = AppUndoContext.Provider;

export function useAppUndo(): ShowUndo {
  return useContext(AppUndoContext);
}
