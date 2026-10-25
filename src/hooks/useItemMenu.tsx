import { useRouter } from 'expo-router';

import { promptText, showActionSheet, showAlert, type Anchor, type DialogButton } from '../components/dialogs/dialogs';
import { notifyLibraryUpdated } from '../lib/cache';
import { renameFolder } from '../services/folder.service';
import { updateProject } from '../services/project.service';
import { getSession } from '../services/session.service';
import { getLibraryFiles, type LibraryFile } from '../services/source-file.service';
import { restoreItem, trashFolder, trashProject, trashSession } from '../services/trash.service';
import { confirmAction } from '../utils/confirm';
import { errorMessage } from '../utils/errors';
import { itemActions, itemNoun, movableItem, starTarget, type ItemAction } from '../utils/itemMenu';
import { promptRenameLecture, promptRenameLibraryFile } from '../utils/rename';
import { openTarget, type ShelfItem } from '../utils/shelf';
import { starButton, type ShowUndo } from '../utils/star';
import { useMoveFlow } from './useMoveFlow';

/**
 * One item menu for the course grid, the laptop sidebar and the Library:
 * Open, Rename…, Move to…, Add to / Remove from Favorites, (lectures)
 * Export PDF, Delete — with the confirmations and Undo. Every change calls
 * notifyLibraryUpdated(), so all screens and the sidebar reload.
 *
 *   const itemMenu = useItemMenu({ showUndo });
 *   … menuTriggerProps(anchor => itemMenu.open(item, anchor)) …
 *   {itemMenu.modal}
 */
export function useItemMenu({
  showUndo,
  onOpen,
  renameFolderInPlace,
  onTrashed,
}: {
  showUndo: ShowUndo;
  /** How Open works here (default: go to the item's screen). */
  onOpen?: (item: ShelfItem) => void;
  /** The course grid renames folders on the tile instead of in a dialog. */
  renameFolderInPlace?: (folderId: string) => void;
  /** After an item went to the trash (e.g. leave the course that was open). */
  onTrashed?: (item: ShelfItem) => void;
}) {
  const router = useRouter();
  const move = useMoveFlow({ showUndo, onChanged: notifyLibraryUpdated });

  function open(item: ShelfItem, anchor?: Anchor) {
    const button = (action: ItemAction): DialogButton => {
      switch (action) {
        case 'open':
          return { text: 'Open', onPress: () => (onOpen ? onOpen(item) : router.navigate(openTarget(item))) };
        case 'rename':
          return item.type === 'folder' && renameFolderInPlace
            ? { text: 'Rename', onPress: () => renameFolderInPlace(item.id) }
            : { text: 'Rename…', onPress: () => rename(item) };
        case 'move':
          return { text: 'Move to…', onPress: () => { const m = movableItem(item); if (m) move.openMove(m); } };
        case 'star':
          return starButton(
            starTarget(item),
            item.title,
            item.starredAt,
            showUndo,
            notifyLibraryUpdated,
          );
        case 'export':
          return { text: 'Export PDF', onPress: () => exportPdf(item) };
        case 'delete':
          return { text: 'Delete', style: 'destructive', onPress: () => trash(item) };
      }
    };
    showActionSheet(item.title, itemActions(item.type).map(button), { anchor });
  }

  async function rename(item: ShelfItem) {
    try {
      if (item.type === 'course' || item.type === 'folder') {
        const noun = itemNoun(item.type);
        const name = await promptText(`Rename ${noun}`, { defaultValue: item.title, placeholder: `${noun} name` });
        if (!name || name === item.title) return;
        if (item.type === 'course') await updateProject(item.id, { name });
        else await renameFolder(item.id, name);
      } else if (item.type === 'lecture') {
        if (!(await promptRenameLecture({ id: item.id, title: item.title }))) return;
      } else {
        if (!(await promptRenameLibraryFile(await libraryFile(item)))) return;
      }
      notifyLibraryUpdated();
    } catch (err) {
      showAlert('Could not rename it', errorMessage(err, err instanceof Error ? err.message : 'Please try again.'));
    }
  }

  async function exportPdf(item: ShelfItem) {
    try {
      const { getNoteBySession } = await import('../services/note.service');
      const { exportNoteToPDF } = await import('../services/export.service');
      const [session, note] = await Promise.all([getSession(item.id), getNoteBySession(item.id)]);
      if (!note) {
        showAlert('No notes yet', 'Process this lecture first to generate notes for export.');
        return;
      }
      await exportNoteToPDF({ note, session, transcript: null, projectName: item.courseName });
    } catch (err) {
      showAlert('Export failed', errorMessage(err, 'Could not export the PDF.'));
    }
  }

  async function trash(item: ShelfItem) {
    const noun = itemNoun(item.type);
    const holds = item.type === 'course' || item.type === 'folder';
    const message = `"${item.title}"${holds ? ' and all its contents' : ''} will be moved to Recently Deleted.`;
    if (!(await confirmAction(`Delete ${noun}`, message, 'Delete'))) return;
    const type = item.type === 'course' ? 'project' : item.type === 'folder' ? 'folder' : 'session';
    try {
      if (type === 'project') await trashProject(item.id);
      else if (type === 'folder') await trashFolder(item.id);
      else await trashSession(item.id);
      notifyLibraryUpdated();
      onTrashed?.(item);
      showUndo(`"${item.title}" moved to trash`, () => {
        restoreItem({ id: item.id, type })
          .then(notifyLibraryUpdated)
          .catch((err) => showAlert('Could not undo', errorMessage(err, 'Please try again.')));
      });
    } catch (err) {
      showAlert('Error', errorMessage(err, `Could not delete the ${noun.toLowerCase()}.`));
    }
  }

  return { open, move, modal: move.modal };
}

/** A PDF or photo with its media (its real file ending), for Rename. */
async function libraryFile(item: ShelfItem): Promise<LibraryFile> {
  const found = item.courseId ? (await getLibraryFiles(item.courseId, item.folderId)).find((f) => f.id === item.id) : undefined;
  return (
    found ?? {
      id: item.id,
      title: item.title,
      kind: item.type === 'image' ? 'image' : 'pdf',
      courseId: item.courseId,
      folderId: item.folderId,
      createdAt: item.updatedAt,
      starredAt: item.starredAt,
      media: null,
    }
  );
}
