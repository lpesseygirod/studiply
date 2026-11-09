/**
 * audioRetention.ts
 * What the app says about a lecture's recording (step 10.1b-3): deleted 3 days after it has been
 * transcribed by default (the server sets the date, 20261029152600, and the nightly job deletes
 * it; the transcript stays). Used by the lecture's Source Files and the after-recording review.
 */

export type AudioRetention = 'delete_now' | 'delete_3_days' | 'delete_manually' | 'keep_permanently';

export interface LectureAudio {
  retention: AudioRetention;
  /** The server's date (3 days after transcription), while it is on "Delete in 3 days". */
  deleteAfter: string | null;
  /** When the recording was deleted (the nightly job, or "Delete now"). */
  deletedAt: string | null;
}

/** The choices, in the order the review screen and Settings list them; the default first. */
export const AUDIO_RETENTION_CHOICES: { value: AudioRetention; label: string; sub: string }[] = [
  { value: 'delete_3_days', label: 'Delete in 3 days', sub: 'Deleted 3 days after it is transcribed; the transcript stays' },
  { value: 'delete_now', label: 'Delete now', sub: 'Remove the recording now; the transcript stays' },
  { value: 'delete_manually', label: 'Delete manually', sub: "I'll delete it when I'm ready" },
  { value: 'keep_permanently', label: 'Keep forever', sub: 'Keep the recording' },
];

export const DEFAULT_AUDIO_RETENTION: AudioRetention = 'delete_3_days';

export function asAudioRetention(value: string | null | undefined): AudioRetention | null {
  return AUDIO_RETENTION_CHOICES.some((c) => c.value === value) ? (value as AudioRetention) : null;
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** "Deleted on 14 Nov 2026", "Deletes on 17 Nov 2026", "Deletes 3 days after it is transcribed"… */
export function audioStatusLine(audio: LectureAudio): string {
  if (audio.deletedAt) return `Deleted on ${day(audio.deletedAt)}`;
  switch (audio.retention) {
    case 'delete_3_days':
      return audio.deleteAfter ? `Deletes on ${day(audio.deleteAfter)}` : 'Deletes 3 days after it is transcribed';
    case 'delete_now':
      return 'Being deleted';
    case 'keep_permanently':
      return 'Kept permanently';
    default:
      return 'Kept until you delete it';
  }
}
