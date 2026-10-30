import { useSyncExternalStore } from 'react';

import { showAlert } from '../dialogs/dialogs';
import type { MarkKind } from '../../editor/schema/markChip';
import { newId } from '../../lib/mappers';
import { placeMark } from '../../services/mark-placement';
import { recorder } from '../../services/recorder';
import { errorMessage } from '../../utils/errors';

/**
 * The new-mark panel (step 5.5), shared by the laptop's strip (inline under
 * it) and the iPhone's bar (a small sheet): which mark, and the recording
 * time when its button was pressed (while paused, the paused moment).
 */
export interface MarkDraft {
  kind: MarkKind;
  ms: number;
  lectureId: string;
}

let draft: MarkDraft | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function openMarkPanel(kind: MarkKind): void {
  const now = recorder.state();
  if (!now.lectureId || (now.status !== 'recording' && now.status !== 'paused')) return;
  draft = { kind, ms: Math.max(0, Math.round(recorder.elapsedMs())), lectureId: now.lectureId };
  emit();
}

export function closeMarkPanel(): void {
  if (!draft) return;
  draft = null;
  emit();
}

/** Save mark: the chip into My notes (its row follows the save); the panel closes. */
export async function saveNewMark(d: MarkDraft, level: number, note: string | null): Promise<void> {
  closeMarkPanel();
  try {
    await placeMark(d.lectureId, { markId: newId(), kind: d.kind, level, ms: d.ms, note });
  } catch (err) {
    showAlert('The mark wasn’t saved', errorMessage(err, 'Please try again.'));
  }
}

export function useMarkPanel(): MarkDraft | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => draft,
    () => draft,
  );
}
