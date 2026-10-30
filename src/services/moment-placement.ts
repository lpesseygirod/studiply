/**
 * Where something made at a moment of the recording goes (step 5.5 marks,
 * step 5.6 board photos): into the lecture's My notes. When that document
 * is open on this device, through its editor (the document screen registers
 * itself while it is on screen): a mark at the end of the line being
 * written, a photo on a line of its own after it, or either on a new
 * stamped last line. Otherwise (the laptop's strip is on every screen) a
 * new last line is saved into My notes directly. A mark's `marks` row
 * follows the save (marks.service); a photo's `media` row is written when
 * it is taken (doc-photo.service).
 */

import { withMarkLine, type LinkedMark } from '../editor/schema/markChip';
import { withPhotoLine } from '../editor/schema/photo';
import { mediaSrc } from '../editor/media/photoSource';
import { openDocument, saveDocument } from './document.service';

export type MomentItem = { kind: 'mark'; mark: LinkedMark } | { kind: 'photo'; mediaId: string; ms: number };

export interface MomentTarget {
  place: (item: MomentItem) => void;
}

const targets = new Map<string, MomentTarget>();

/** The document screen showing a lecture's My notes; returns the way to let go. */
export function registerMomentTarget(lectureId: string, target: MomentTarget): () => void {
  targets.set(lectureId, target);
  return () => {
    if (targets.get(lectureId) === target) targets.delete(lectureId);
  };
}

export async function placeAtMoment(lectureId: string, item: MomentItem): Promise<void> {
  const target = targets.get(lectureId);
  if (target) {
    target.place(item);
    return;
  }
  const opened = await openDocument(lectureId, 'notes');
  const next = item.kind === 'mark' ? withMarkLine(opened.content, item.mark) : withPhotoLine(opened.content, mediaSrc(item.mediaId), item.ms);
  await saveDocument({ fileId: lectureId, tab: 'notes', base: opened.content, next });
}
