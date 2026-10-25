import { useState } from 'react';

import MoveToModal, { type MoveTarget, type PickedLecture } from '../components/MoveToModal';
import { showAlert } from '../components/dialogs/dialogs';
import { useAuth } from './useAuth';
import {
  MoveError,
  moveItem,
  moveMediaToLecture,
  saveMediaToLibrary,
  type LibraryItem,
  type MoveResult,
  type Place,
} from '../services/move.service';
import type { SourceFile } from '../types/database';
import { errorMessage } from '../utils/errors';

/**
 * "Move to…", "Move to another lecture…" and "Save to library…" for any
 * screen: opens the picker, runs the move (src/services/move.service.ts),
 * shows what went wrong, and offers Undo in the screen's toast.
 *
 *   const move = useMoveFlow({ showUndo, onChanged: reload });
 *   … { text: 'Move to…', onPress: () => move.openMove(item) } …
 *   {move.modal}
 */

type Request =
  | { mode: 'move'; item: LibraryItem }
  | { mode: 'media'; file: SourceFile; name: string }
  | { mode: 'save'; file: SourceFile; name: string };

function placeFrom(target: MoveTarget): Place {
  return { courseId: target.projectId, folderId: target.folderId, label: target.label };
}

export function useMoveFlow({
  showUndo,
  onChanged,
}: {
  showUndo: (message: string, onUndo: () => void) => void;
  onChanged: () => void;
}) {
  const { profile } = useAuth();
  const [request, setRequest] = useState<Request | null>(null);

  async function run<R extends MoveResult>(work: () => Promise<R>, message: (result: R) => string, failure: string) {
    setRequest(null);
    try {
      const result = await work();
      onChanged();
      showUndo(message(result), () => {
        result
          .undo()
          .then(onChanged)
          .catch((err) => showAlert('Could not undo', errorMessage(err, 'Please try again.')));
      });
    } catch (err) {
      showAlert('Error', err instanceof MoveError ? err.message : errorMessage(err, failure));
    }
  }

  function onMove(target: MoveTarget) {
    if (!request) return;
    const to = placeFrom(target);
    if (request.mode === 'move') {
      const { item } = request;
      run(() => moveItem(item, to), (r) => `Moved ‘${item.title}’ to ${r.to.label}`, 'Could not move it.');
    } else if (request.mode === 'save') {
      const { file, name } = request;
      run(
        () => saveMediaToLibrary(file, name, to),
        (r) => `Saved ‘${r.title}’ to ${r.to.label}`,
        'Could not save the file.',
      );
    }
  }

  function onPickLecture(lecture: PickedLecture) {
    if (request?.mode !== 'media') return;
    const { file, name } = request;
    run(() => moveMediaToLecture(file, lecture), () => `Moved ‘${name}’ to ${lecture.label}`, 'Could not move the file.');
  }

  const item = request?.mode === 'move' ? request.item : null;
  const title =
    request?.mode === 'move'
      ? `Move ‘${request.item.title}’ to…`
      : request?.mode === 'media'
        ? `Move ‘${request.name}’ to…`
        : request?.mode === 'save'
          ? `Save ‘${request.name}’ to…`
          : undefined;

  const modal = (
    <MoveToModal
      visible={request !== null}
      title={title}
      userId={profile?.id ?? ''}
      pick={request?.mode === 'media' ? 'lecture' : 'place'}
      confirmLabel={request?.mode === 'save' ? 'Save' : 'Move'}
      excludeFolderIds={item?.type === 'folder' ? [item.id] : []}
      excludeLectureIds={request?.mode === 'media' ? [request.file.session_id] : []}
      current={
        item
          ? { projectId: item.courseId, folderId: item.type === 'folder' ? item.parentId : item.folderId }
          : undefined
      }
      onMove={onMove}
      onPickLecture={onPickLecture}
      onClose={() => setRequest(null)}
    />
  );

  return {
    /** A lecture, folder or library file. */
    openMove: (target: LibraryItem) => setRequest({ mode: 'move', item: target }),
    /** A lecture's photo or PDF, to another lecture. */
    openMoveMedia: (file: SourceFile, name: string) => setRequest({ mode: 'media', file, name }),
    /** A copy of a lecture's photo or PDF, as its own library file. */
    openSaveToLibrary: (file: SourceFile, name: string) => setRequest({ mode: 'save', file, name }),
    modal,
  };
}
