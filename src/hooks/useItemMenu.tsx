import { useRouter } from 'expo-router';

import { openLecturePicker } from '../components/summarize/combineState';
import { promptText, showActionSheet, showAlert, type Anchor, type DialogButton } from '../components/dialogs/dialogs';
import { notifyLibraryUpdated } from '../lib/cache';
import { getFolder, renameFolder } from '../services/folder.service';
import { getProject, updateProject } from '../services/project.service';
import { getSession } from '../services/session.service';
import { getLibraryFiles, type LibraryFile } from '../services/source-file.service';
import { restoreItem, trashFolder, trashProject, trashSession } from '../services/trash.service';
import { confirmAction } from '../utils/confirm';
import { errorMessage } from '../utils/errors';
import { actionHint, itemActions, itemNoun, movableItem, starTarget, type ItemAction } from '../utils/itemMenu';
import { forgetClip, setClip } from '../lib/clipboard';
import { MoveError, moveItem } from '../services/move.service';
import { promptRenameDocument, promptRenameLecture, promptRenameLibraryFile } from '../utils/rename';
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

  /**
   * `skip`: actions to leave out (the title's menu has no Open: you're in
   * it). `dialogRename`: Rename… in a dialog even where folders are renamed
   * in place (the folder you're in has no tile to edit). `extra`: the
   * screen's own items, before Delete (a document's Version history).
   * `section`: a heading over the item's own actions (laptop menus), when
   * the screen's items come under headings of their own: they then come
   * first, and the item's own group (ending with Delete) last. `after`: items after Delete (a document's
   * Recording › Discard recording…, Lea 6 Nov).
   */
  function open(
    item: ShelfItem,
    anchor?: Anchor,
    { skip = [], dialogRename = false, extra = [], section, after = [] }: { skip?: ItemAction[]; dialogRename?: boolean; extra?: DialogButton[]; section?: string; after?: DialogButton[] } = {},
  ) {
    const button = (action: ItemAction): DialogButton => {
      const base = actionButton(action);
      const hint = actionHint(action, item.type);
      return hint ? { ...base, onPress: undefined, disabled: true, hint } : base;
    };
    const actionButton = (action: ItemAction): DialogButton => {
      switch (action) {
        case 'open':
          return { text: 'Open', onPress: () => (onOpen ? onOpen(item) : router.navigate(openTarget(item))) };
        case 'rename':
          return item.type === 'folder' && renameFolderInPlace && !dialogRename
            ? { text: 'Rename', onPress: () => renameFolderInPlace(item.id) }
            : { text: 'Rename…', onPress: () => rename(item) };
        case 'move':
          return { text: 'Move to…', onPress: () => { const m = movableItem(item); if (m) move.openMove(m); } };
        case 'moveOut':
          return { text: 'Move out', onPress: () => moveOut(item) };
        case 'cut':
          return { text: 'Cut', onPress: () => setClip({ mode: 'cut', item }) };
        case 'copy':
          return { text: 'Copy', onPress: () => setClip({ mode: 'copy', item }) };
        case 'summarize':
          // Step 7.3: the lecture's Summary tab with the summarize panel open.
          return { text: 'Summarize', onPress: () => router.navigate({ pathname: '/doc/[id]', params: { id: item.id, tab: 'summary', summarize: '1' } }) };
        // Step 7.9: the lecture picker, then the summarize panel.
        case 'extend':
          return { text: 'Extend with next lecture…', onPress: () => openLecturePicker({ mode: 'extend', courseId: item.courseId, folderId: null, baseLectureId: item.id }) };
        case 'merge':
        case 'examPack':
          return {
            text: action === 'merge' ? 'Merge lectures…' : 'Make exam pack…',
            onPress: () => openLecturePicker({ mode: action === 'merge' ? 'merge' : 'exam_pack', ...(item.type === 'course' ? { courseId: item.id, folderId: null } : { courseId: item.courseId, folderId: item.id }) }),
          };
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
    const buttons = itemActions(item)
      .filter((action) => !skip.includes(action))
      .map(button);
    if (section && buttons[0]) {
      buttons[0] = { ...buttons[0], section };
      buttons.unshift(...extra);
    } else {
      const at = buttons.findIndex((b) => b.style === 'destructive');
      buttons.splice(at < 0 ? buttons.length : at, 0, ...extra);
    }
    buttons.push(...after);
    showActionSheet(item.title, buttons, { anchor });
  }

  /** Move out: up one level (the folder it is in → that folder's parent, or the course's top). */
  async function moveOut(item: ShelfItem) {
    const movable = movableItem(item);
    if (!movable || !item.folderId) return;
    try {
      const parent = await getFolder(item.folderId);
      const courseId = parent.project_id || item.courseId;
      const label = parent.parent_folder_id
        ? (await getFolder(parent.parent_folder_id)).name
        : courseId
          ? (await getProject(courseId)).name
          : 'My library';
      const result = await moveItem(movable, { courseId, folderId: parent.parent_folder_id, label });
      showUndo(`Moved '${item.title}' to ${label}`, () => {
        result.undo().catch((err) => showAlert('Could not undo', errorMessage(err, 'Please try again.')));
      });
    } catch (err) {
      showAlert('Could not move it', err instanceof MoveError ? err.message : errorMessage(err, 'Please try again.'));
    }
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
      } else if (item.type === 'document' || item.type === 'unit_summary' || item.type === 'exam_pack') {
        if (!(await promptRenameDocument({ id: item.id, title: item.title }))) return;
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
      forgetClip(item.id);
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

/** A PDF or photo with its media (its real file ending, its Storage object), for Rename and Copy. */
export async function libraryFile(item: ShelfItem): Promise<LibraryFile> {
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
