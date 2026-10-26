import { useCallback, useEffect, useRef } from 'react';

import { showAlert } from '../components/dialogs/dialogs';
import type { DropHandlers } from '../lib/dnd/useHtml5Drag';
import { dragLog } from '../lib/dnd/dragDebug';
import { canDrop, draggedTitle, type DropCheck, type Dragged, type DropTarget } from '../lib/dnd/rules';
import { notifyLibraryUpdated, useLibraryUpdates } from '../lib/cache';
import { getFolderLinks } from '../services/folder.service';
import { MoveError, moveItem, moveMediaToLibrary, saveMediaToLibrary } from '../services/move.service';
import { getClip, forgetClip, setClip } from '../lib/clipboard';
import { movableItem } from '../utils/itemMenu';
import { nameWithoutExtension } from '../utils/fileNames';
import { libraryFile } from './useItemMenu';
import { restoreItem, trashFolder, trashSession } from '../services/trash.service';
import { errorMessage } from '../utils/errors';
import type { ShowUndo } from '../utils/star';
import type { Place } from '../utils/moveRules';
import type { PickedFile } from '../services/library-upload.service';
import { useLibraryUpload } from './useLibraryUpload';

type FolderLinks = { id: string; parent_id: string | null }[];

/**
 * Drag and drop's one drop (step 3.3), for the laptop's browser drag and
 * the iPhone's gesture: `check` while hovering (canDrop with every folder's
 * parent), `drop` to move into a course or folder or onto Trash, with the
 * screen's Undo toast (also ⌘Z's). Files dragged from the computer are
 * uploaded where they are dropped (`filesFromComputer`, step 3.4).
 */
export function useLibraryDrop({
  showUndo,
  upload,
}: {
  showUndo: ShowUndo;
  /** The screen's own uploader (its toolbar shows the progress); otherwise one of its own. */
  upload?: (place: Place, files: PickedFile[]) => Promise<void>;
}) {
  const ownUploader = useLibraryUpload({ showUndo });
  const uploadFiles = upload ?? ownUploader.upload;
  const links = useRef<FolderLinks>([]);
  const loadLinks = useCallback(() => {
    getFolderLinks()
      .then((list) => (links.current = list))
      .catch(() => {});
  }, []);
  useEffect(loadLinks, [loadLinks]);
  useLibraryUpdates(loadLinks);

  const check = useCallback((dragged: Dragged, target: DropTarget): DropCheck => canDrop(dragged, target, links.current), []);

  /** Moves it there (or to the Trash), with the toast. True when it moved. */
  const drop = useCallback(
    async (dragged: Dragged, target: DropTarget): Promise<boolean> => {
      const verdict = check(dragged, target);
      if (!verdict.ok) {
        dragLog(`not moved: ${verdict.reason}`);
        return false;
      }
      const title = draggedTitle(dragged);
      try {
        if (target.kind === 'trash') {
          if (dragged.kind !== 'item') return false;
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
          forgetClip(item.id);
          return true;
        }
        const result =
          dragged.kind === 'item'
            ? await moveItem(dragged.item, target.place)
            : await moveMediaToLibrary(dragged.file, dragged.name, target.place);
        dragLog(`moved to ${target.place.label}`);
        showUndo(`Moved '${title}' to ${target.place.label}`, () => {
          result.undo().catch((err) => showAlert('Could not undo', errorMessage(err, 'Please try again.')));
        });
        return true;
      } catch (err) {
        dragLog(`move failed: ${err instanceof Error ? err.message : String(err)}`);
        showAlert('Could not move it', err instanceof MoveError ? err.message : errorMessage(err, 'Please try again.'));
        return false;
      }
    },
    [check, showUndo],
  );

  /**
   * Paste (step 3.4) into a course or folder: a cut item moves there (the
   * same checks and toast as a drop; the clipboard empties); a copied PDF or
   * photo is copied there ("Notas copy.pdf", its own Storage object; Undo
   * deletes the copy; the clipboard stays, to paste again).
   */
  const pasteHere = useCallback(
    async (place: Place) => {
      const clip = getClip();
      if (!clip) return;
      const target: DropTarget = { id: `paste-${place.folderId ?? place.courseId}`, kind: 'place', place };
      if (clip.mode === 'cut') {
        const movable = movableItem(clip.item);
        if (!movable) return;
        const dragged: Dragged = { kind: 'item', item: movable };
        const verdict = check(dragged, target);
        if (!verdict.ok) {
          showAlert(`Can't paste '${clip.item.title}' here`, verdict.reason);
          return;
        }
        if (await drop(dragged, target)) setClip(null);
        return;
      }
      try {
        const file = await libraryFile(clip.item);
        if (!file.media) throw new MoveError("This file can't be copied right now. Check your connection.");
        const name = `${nameWithoutExtension(file.title)} copy`;
        const result = await saveMediaToLibrary(file.media, name, place);
        showUndo(`Copied '${clip.item.title}' to ${place.label}`, () => {
          result.undo().catch((err) => showAlert('Could not undo', errorMessage(err, 'Please try again.')));
        });
      } catch (err) {
        showAlert('Could not paste it', err instanceof MoveError ? err.message : errorMessage(err, 'Please try again.'));
      }
    },
    [check, drop, showUndo],
  );

  /** Files dragged in from the computer (Finder): uploaded into the course or folder they were dropped on. */
  const filesFromComputer = useCallback(
    (target: DropTarget, files: PickedFile[]) => {
      if (target.kind === 'place') uploadFiles(target.place, files);
    },
    [uploadFiles],
  );

  return { check, drop, filesFromComputer, pasteHere } satisfies DropHandlers & { pasteHere: unknown };
}
