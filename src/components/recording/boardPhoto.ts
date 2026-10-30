import { useSyncExternalStore } from 'react';

import { showAlert } from '../dialogs/dialogs';
import { isNetworkError } from '../../lib/cloudRows';
import { addDocPhoto } from '../../services/doc-photo.service';
import type { PickedFile } from '../../services/library-upload.service';
import { placeAtMoment } from '../../services/moment-placement';
import { errorMessage } from '../../utils/errors';
import type { Moment } from './markPanelState';

/**
 * Board photos (step 5.6), shared by both devices: a photo taken while
 * recording is a `media` row of the lecture with its time (doc-photo.service)
 * and a thumbnail on a stamped line of My notes (moment-placement). The
 * iPhone takes it with its camera (./photoBoard), the laptop with its webcam
 * or from files (./photoBoard.web). The time is the moment Photo was
 * pressed (while paused, the paused moment).
 */

/** Saves one photo taken at `m`; false (and the student told why) if it couldn't be. */
export async function saveBoardPhoto(m: Moment, picked: PickedFile): Promise<boolean> {
  try {
    const mediaId = await addDocPhoto(m.lectureId, picked, { moment: { tMs: m.ms } });
    await placeAtMoment(m.lectureId, { kind: 'photo', mediaId, ms: m.ms });
    return true;
  } catch (err) {
    // addDocPhoto's messages are written for the student (as the 4.5 photo button shows them); the connection's as usual.
    showAlert('The photo wasn’t saved', isNetworkError(err) ? errorMessage(err, '') : err instanceof Error ? err.message : 'Please try again.');
    return false;
  }
}

/** The laptop offline (Lea's advisor, 30 Oct: A): Photo board is greyed out with this; the recording goes on. */
export const PHOTO_OFFLINE_NOTE = 'Photos need a connection on the laptop';

/** Photo can be used: while recording (or paused); on the web only online (the iPhone keeps photos and sends them later). */
export function photoBoardUsable({ web, online, recording }: { web: boolean; online: boolean; recording: boolean }): boolean {
  return recording && (!web || online);
}

// The laptop's webcam panel: open for one moment at a time.
let webcam: Moment | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function openWebcam(m: Moment): void {
  webcam = m;
  emit();
}

export function closeWebcam(): void {
  if (!webcam) return;
  webcam = null;
  emit();
}

export function useWebcam(): Moment | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => webcam,
    () => webcam,
  );
}
