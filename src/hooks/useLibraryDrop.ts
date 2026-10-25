import { useCallback, useEffect, useRef } from 'react';

import { showAlert } from '../components/dialogs/dialogs';
import { canDrop, draggedTitle, type DropCheck, type Dragged, type DropTarget } from '../lib/dnd/rules';
import { notifyLibraryUpdated, useLibraryUpdates } from '../lib/cache';
import { getFolderLinks } from '../services/folder.service';
import { MoveError, moveItem, moveMediaToLibrary } from '../services/move.service';
import { restoreItem, trashFolder, trashSession } from '../services/trash.service';
import { errorMessage } from '../utils/errors';
import type { ShowUndo } from '../utils/star';

type FolderLinks = { id: string; parent_id: string | null }[];

/**
 * Drag and drop's one drop (step 3.3), for the laptop's browser drag and
 * the iPhone's gesture: `check` while hovering (canDrop with every folder's
 * parent), `drop` to move into a course or folder or onto Trash, with the
 * screen's Undo toast (also ⌘Z's). Files dragged from the computer wait for
 * step 3.4 (`filesFromComputer`).
 */
export function useLibraryDrop({ showUndo }: { showUndo: ShowUndo }) {
  const links = useRef<FolderLinks>([]);
  const loadLinks = useCallback(() => {
    getFolderLinks()
      .then((list) => (links.current = list))
      .catch(() => {});
  }, []);
  useEffect(loadLinks, [loadLinks]);
  useLibraryUpdates(loadLinks);

  const check = useCallback((dragged: Dragged, target: DropTarget): DropCheck => canDrop(dragged, target, links.current), []);

  const drop = useCallback(
    async (dragged: Dragged, target: DropTarget) => {
      if (!check(dragged, target).ok) return;
      const title = draggedTitle(dragged);
      try {
        if (target.kind === 'trash') {
          if (dragged.kind !== 'item') return;
          const { item } = dragged;
          const type = item.type === 'folder' ? 'folder' : 'session';
          if (type === 'folder') await trashFolder(item.id);
          else await trashSession(item.id);
          notifyLibraryUpdated();
          showUndo(`Moved '${title}' to Trash`, () => {
            restoreItem({ id: item.id, type })
              .then(notifyLibraryUpdated)
              .catch((err) => showAlert('Could not undo', errorMessage(err, 'Please try again.')));
          });
          return;
        }
        const result =
          dragged.kind === 'item'
            ? await moveItem(dragged.item, target.place)
            : await moveMediaToLibrary(dragged.file, dragged.name, target.place);
        showUndo(`Moved '${title}' to ${target.place.label}`, () => {
          result.undo().catch((err) => showAlert('Could not undo', errorMessage(err, 'Please try again.')));
        });
      } catch (err) {
        showAlert('Could not move it', err instanceof MoveError ? err.message : errorMessage(err, 'Please try again.'));
      }
    },
    [check, showUndo],
  );

  /** Files dragged in from the computer (Finder): step 3.4. */
  const filesFromComputer = useCallback(() => {
    showAlert('Coming soon', 'Dropping files from your computer comes in the next update. For now, use Upload.');
  }, []);

  return { check, drop, filesFromComputer };
}
