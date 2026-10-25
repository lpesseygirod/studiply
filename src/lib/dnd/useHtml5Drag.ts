import { useCallback, useRef, useState } from 'react';

import type { PickedFile } from '../../services/library-upload.service';
import { attachDraggable, attachDropTarget } from './html5';
import type { DropCheck, Dragged, DropTarget } from './rules';

/**
 * The laptop's drag and drop (step 3.3, the browser's own drag) for React
 * components: ref callbacks that make a view draggable or a drop target.
 * On the iPhone they do nothing (html5.ts); the gesture drag is there.
 */

export interface DropHandlers {
  check: (dragged: Dragged, target: DropTarget) => DropCheck;
  drop: (dragged: Dragged, target: DropTarget) => void;
  /** Files dragged in from the computer (Finder), to upload into the target. */
  filesFromComputer: (target: DropTarget, files: PickedFile[]) => void;
}

/** For views that take no drops. */
export const NO_DROP: DropHandlers = {
  check: () => ({ ok: false, reason: '' }),
  drop: () => {},
  filesFromComputer: () => {},
};

/** `null`, or the drag is over this target: allowed (`'ok'`) or not (`'refused'`). */
export type DropHover = 'ok' | 'refused' | null;

type RefCallback = (node: unknown) => void;

/** One ref callback for several (the menu's, the double-click's, the drag's). */
export function mergeRefs(...refs: (RefCallback | undefined | null)[]): RefCallback {
  return (node) => refs.forEach((ref) => ref?.(node));
}

/** Attaches DOM listeners to the node a ref gets, and detaches them when it changes. */
function useAttach(attach: (node: unknown) => () => void): RefCallback {
  const node = useRef<unknown>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const attachRef = useRef(attach);
  attachRef.current = attach;
  return useCallback((next: unknown) => {
    if (next === node.current) return;
    cleanup.current?.();
    cleanup.current = null;
    node.current = next;
    if (next) cleanup.current = attachRef.current(next);
  }, []);
}

/** Makes the view draggable; `dragged` null (e.g. while its name is edited) cancels a drag. */
export function useDragSource(dragged: Dragged | null): RefCallback {
  const current = useRef(dragged);
  current.current = dragged;
  return useAttach((node) => attachDraggable(node, () => current.current));
}

/** Makes the view a drop target for `target` (null: not one right now). */
export function useDropZone(target: DropTarget | null, handlers: DropHandlers): { ref: RefCallback; hover: DropHover } {
  const [hover, setHover] = useState<DropHover>(null);
  const latest = useRef({ target, handlers });
  latest.current = { target, handlers };
  const ref = useAttach((node) =>
    attachDropTarget(node, {
      accepts: (dragged, fromComputer) => {
        const { target: t, handlers: h } = latest.current;
        if (!t) return false;
        if (fromComputer) return t.kind === 'place'; // uploaded there; never onto Trash
        return !!dragged && h.check(dragged, t).ok;
      },
      onHover: (dragged, fromComputer) => {
        const { target: t, handlers: h } = latest.current;
        if (!t) return setHover(null);
        if (fromComputer) return setHover(t.kind === 'place' ? 'ok' : 'refused');
        if (!dragged) return setHover(null);
        setHover(h.check(dragged, t).ok ? 'ok' : 'refused');
      },
      onLeave: () => setHover(null),
      onDrop: (dragged, files) => {
        const { target: t, handlers: h } = latest.current;
        if (!t) return;
        if (dragged) h.drop(dragged, t);
        else if (files.length) h.filesFromComputer(t, files);
      },
    }),
  );
  return { ref, hover };
}
