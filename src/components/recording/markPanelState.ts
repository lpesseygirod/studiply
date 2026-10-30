import { useSyncExternalStore } from 'react';

import { showAlert } from '../dialogs/dialogs';
import type { MarkKind } from '../../editor/schema/markChip';
import { newId } from '../../lib/mappers';
import { placeAtMoment } from '../../services/moment-placement';
import { recorder } from '../../services/recorder';
import { errorMessage } from '../../utils/errors';

/** A moment of the lecture being recorded: the time now (while paused, the paused moment). */
export interface Moment {
  lectureId: string;
  ms: number;
}

/** Now, if a lecture records (or is paused); null otherwise (no marks or photos outside a recording). */
export function recordingMoment(): Moment | null {
  const now = recorder.state();
  if (!now.lectureId || (now.status !== 'recording' && now.status !== 'paused')) return null;
  return { lectureId: now.lectureId, ms: Math.max(0, Math.round(recorder.elapsedMs())) };
}

/**
 * The new-mark panel (step 5.5), shared by the laptop's strip (inline under
 * it) and the iPhone's bar (a small sheet): which mark, and the recording
 * time when its button was pressed (while paused, the paused moment).
 */
export interface MarkDraft extends Moment {
  kind: MarkKind;
}

let draft: MarkDraft | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function openMarkPanel(kind: MarkKind): void {
  const moment = recordingMoment();
  if (!moment) return;
  draft = { kind, ...moment };
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
    await placeAtMoment(d.lectureId, { kind: 'mark', mark: { markId: newId(), kind: d.kind, level, ms: d.ms, note } });
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
