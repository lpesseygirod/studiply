/**
 * Cancel recording (Lea, 6 Nov): the recordings discarded on this device, so a chunk's upload or
 * transcription that was already on its way can't bring back what Discard removed.
 *
 * - Before a job sends anything: a discarded recording's chunk isn't sent (`isDiscarded`).
 * - After a job wrote to the server (an upload's audio_chunks row; transcribe-chunk upserts the chunk
 *   and its segments): `landed` runs the recording's clean-up again, which deletes by the recording's
 *   range, so the late row goes too.
 *
 * Kept in memory: Discard waits for the jobs in flight, and the clean-up is queued (iPhone) or run
 * (laptop) after them; this covers a job that answers later than that wait. A new recording of the
 * same lecture forgets its earlier discard (`forget`), so its own chunks are never touched.
 */

export interface ChunkRange {
  lectureId: string;
  /** The discarded recording's first chunk number; and the first number after it (null: not known yet). */
  fromSeq: number;
  toSeq: number | null;
}

type CleanUp = () => Promise<void>;

const discarded = new Map<string, { range: ChunkRange; cleanUp: CleanUp | null }>();

/** The recording is being discarded: its chunks are no longer sent. `cleanUp` is set once its range is known. */
export function markDiscarded(range: ChunkRange, cleanUp: CleanUp | null = null): void {
  discarded.set(range.lectureId, { range, cleanUp });
}

const inRange = (r: ChunkRange, seq: number) => seq >= r.fromSeq && (r.toSeq === null || seq < r.toSeq);

export function isDiscarded(ref: { lectureId: string; seq: number }): boolean {
  const d = discarded.get(ref.lectureId);
  return !!d && inRange(d.range, ref.seq);
}

/** A job of a discarded recording wrote to the server after all: the clean-up runs again. */
export async function landed(ref: { lectureId: string; seq: number }): Promise<void> {
  const d = discarded.get(ref.lectureId);
  if (!d || !inRange(d.range, ref.seq) || !d.cleanUp) return;
  await d.cleanUp().catch((err) => console.warn('[recorder] could not remove a part that arrived after Discard', err));
}

/** A new recording of this lecture: its earlier discard no longer applies. */
export function forget(lectureId: string): void {
  discarded.delete(lectureId);
}

export function resetDiscardedForTests(): void {
  discarded.clear();
}
