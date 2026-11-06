import type { RecordingOrigin } from '../../services/recorder/types';
import { clock } from '../../utils/clock';

/**
 * Cancel recording (Lea, 6 Nov; DESIGN "Discard recording"): the question's words. `title`: the
 * lecture's or the document's own title; `offlineHere`: the iPhone without a connection (its audio not
 * uploaded yet is deleted from it).
 */
export const DISCARD_TITLE = 'Discard this recording?';
export const DISCARD_CONFIRM = 'Discard';
export const DISCARD_LABEL = 'Discard recording';

export function discardMessage(p: { origin: RecordingOrigin; title: string; fromMs: number; offlineHere: boolean }): string {
  const main =
    p.origin === 'new'
      ? `The recording stops and “${p.title}” moves to Recently Deleted with its notes and marks (kept 30 days). No summary is made.`
      : p.origin === 'document'
        ? `The recording stops and its audio is deleted. “${p.title}” stays a document with all your notes; marks become text. No summary is made.`
        : `The recording stops and the audio recorded since ${clock(p.fromMs)} is deleted. Earlier audio and your notes stay. No summary is made.`;
  return p.offlineHere ? `${main}\n\nAudio not uploaded yet is deleted from this iPhone.` : main;
}

/** After Discard: a new lecture's toast (with Undo); the notice in the document cases. */
export const discardedToast = (title: string) => `“${title}” discarded`;
export const DISCARDED_NOTICE_TITLE = 'Recording discarded';
export const DISCARDED_NOTICE = 'Your notes are in version history as “Before discarding the recording”.';
