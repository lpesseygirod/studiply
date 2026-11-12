/**
 * transcriptJoin.ts — a lecture's transcript assembled from its chunks'
 * transcripts, the words spoken in each overlap kept once.
 *
 * Pure and without imports, so the app (src/lib/cloudRows,
 * src/services/recorder) and the Edge Functions can both use it. Each
 * chunk's own segments stay in transcript_segments as transcribe-chunk
 * stored them; the duplicates are removed only where the transcript is put
 * together.
 *
 * On the web the chunks overlap by 500 ms, so the words of an
 * overlap are in both chunks' transcripts. Where chunk B starts before chunk
 * A (the one before it) ends:
 * 1. each half of the overlap belongs to one chunk: a segment of A that
 *    starts in the second half is B's, a segment of B that ends in the first
 *    half is A's (each is in the other chunk whole);
 * 2. the words heard by both: A's last words are matched against B's first
 *    words (up to 10, ignoring case, accents and punctuation) and kept once.
 *    A word cut off at either chunk's edge is allowed for when at least two
 *    words match around it ("… the deriv" + "derivative is zero").
 * Only neighbouring chunks are joined (seq n and n + 1): chunks may arrive in
 * any order, and one missing (not transcribed yet, or lost) leaves its
 * neighbours as they are. A chunk after a pause starts where the one before
 * ended: no overlap. Segments with no chunk (typed or imported transcripts)
 * are kept as they are.
 */

export interface TimedText {
  startMs: number;
  endMs: number;
  text: string;
}

export interface ChunkTranscript {
  seq: number;
  startMs: number;
  durationMs: number;
  /** null: not transcribed yet. */
  segments: TimedText[] | null;
}

/** Where a segment's chunk sits in the recording (audio_chunks.seq, start_ms, duration_ms). */
export interface ChunkPlace {
  seq: number;
  start_ms: number;
  duration_ms: number;
}

/** A transcript_segments row (any other columns are kept), with its chunk's place when known. */
export interface SegmentLike {
  start_ms: number;
  end_ms: number;
  text: string;
  chunk?: ChunkPlace | null;
}

const MAX_WORDS = 10;

const norm = (word: string) =>
  word
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]/gu, '');

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);

/** How many words both sides share at the join, and the cut-off fragments around them. */
function sharedRun(a: string[], b: string[]): { k: number; i: number; j: number } | null {
  const na = a.map(norm);
  const nb = b.map(norm);
  for (let k = Math.min(MAX_WORDS, a.length, b.length); k >= 1; k--) {
    // i: a fragment after the run at A's end; j: a fragment before it at B's start.
    for (const [i, j] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      if ((i || j) && k < 2) continue;
      if (k + i > a.length || k + j > b.length) continue;
      let same = true;
      for (let t = 0; t < k && same; t++) {
        const x = na[a.length - i - k + t];
        same = x !== '' && x === nb[j + t];
      }
      if (same) return { k, i, j };
    }
  }
  return null;
}

interface Piece<R> extends TimedText {
  row: R;
}

/** The core: chunks' pieces joined, in chunk order, each chunk's pieces by time. */
function joinPieces<R>(chunks: { seq: number; startMs: number; durationMs: number; pieces: Piece<R>[] | null }[]): Piece<R>[] {
  // One entry per chunk number (the first wins if a chunk came twice).
  const bySeq = new Map<number, (typeof chunks)[number]>();
  for (const c of chunks) if (!bySeq.has(c.seq)) bySeq.set(c.seq, c);
  const sorted = [...bySeq.values()].sort((x, y) => x.seq - y.seq);
  const lists = sorted.map((c) => (c.pieces ?? []).map((p) => ({ ...p })).sort((x, y) => x.startMs - y.startMs));

  for (let n = 1; n < sorted.length; n++) {
    const A = sorted[n - 1];
    const B = sorted[n];
    if (B.seq !== A.seq + 1 || !A.pieces || !B.pieces) continue;
    const from = B.startMs;
    const to = A.startMs + A.durationMs;
    if (to <= from) continue;
    const mid = (from + to) / 2;

    lists[n - 1] = lists[n - 1].filter((s) => s.startMs < mid);
    lists[n] = lists[n].filter((s) => s.endMs > mid);

    const a = lists[n - 1].at(-1);
    const b = lists[n][0];
    // Only segments that reach into the overlap can share words.
    if (!a || !b || a.endMs <= from || b.startMs >= to) continue;
    const aw = wordsOf(a.text);
    const bw = wordsOf(b.text);
    const run = sharedRun(aw, bw);
    if (!run) continue;

    if (run.i) {
      a.text = aw.slice(0, aw.length - run.i).join(' ');
      a.endMs = Math.max(a.startMs, Math.min(a.endMs, mid));
    }
    b.text = bw.slice(run.j + run.k).join(' ');
    b.startMs = Math.min(b.endMs, Math.max(b.startMs, mid));
    if (!b.text) lists[n].shift();
  }

  return lists.flat();
}

/** The live transcript from chunks with their segments (the recorder's). */
export function joinTranscript(chunks: ChunkTranscript[]): TimedText[] {
  return joinPieces(
    chunks.map((c) => ({ ...c, pieces: c.segments ? c.segments.map((s) => ({ ...s, row: null })) : null })),
  ).map(({ startMs, endMs, text }) => ({ startMs, endMs, text }));
}

/**
 * Rows read with their `chunk_id`, each given its chunk's place from the
 * lecture's audio_chunks rows (`chunk_id` itself is dropped). A row whose
 * chunk isn't among them stays unplaced, and is kept as it is when joined.
 */
export function placeSegments<R extends { chunk_id?: string | null }>(
  rows: R[],
  chunks: { id: string; seq: number; start_ms: number; duration_ms: number }[],
): (Omit<R, 'chunk_id'> & { chunk: ChunkPlace | null })[] {
  const places = new Map(chunks.map((c) => [c.id, { seq: c.seq, start_ms: c.start_ms, duration_ms: c.duration_ms }]));
  return rows.map(({ chunk_id, ...row }) => ({ ...row, chunk: (chunk_id && places.get(chunk_id)) || null }));
}

/**
 * A lecture's transcript_segments rows, in any order, as one transcript:
 * the overlaps de-duplicated, ordered by time. Each row keeps its other
 * columns; a shortened one gets its new text and times.
 */
export function joinSegmentRows<R extends SegmentLike>(rows: R[]): R[] {
  const chunks = new Map<number, { seq: number; startMs: number; durationMs: number; pieces: Piece<R>[] }>();
  const loose: R[] = [];
  for (const row of rows) {
    const place = row.chunk;
    if (!place) {
      loose.push(row);
      continue;
    }
    let chunk = chunks.get(place.seq);
    if (!chunk) {
      chunk = { seq: place.seq, startMs: place.start_ms, durationMs: place.duration_ms, pieces: [] };
      chunks.set(place.seq, chunk);
    }
    chunk.pieces.push({ startMs: row.start_ms, endMs: row.end_ms, text: row.text, row });
  }
  const joined = joinPieces([...chunks.values()]).map((p) =>
    p.text === p.row.text && p.startMs === p.row.start_ms && p.endMs === p.row.end_ms
      ? p.row
      : { ...p.row, start_ms: p.startMs, end_ms: p.endMs, text: p.text },
  );
  // By time; the sort is stable, so chunks keep their own order at equal times.
  return [...joined, ...loose].sort((x, y) => x.start_ms - y.start_ms);
}
