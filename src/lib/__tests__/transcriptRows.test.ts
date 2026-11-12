// A lecture's full transcript assembled from its transcript_segments
// rows as stored (each chunk's raw text), the 500 ms overlaps' duplicated
// words removed by the shared rule; rows in any order, chunks missing.
import { joinSegmentRows, type ChunkPlace } from '../../../supabase/functions/_shared/transcriptJoin';
import { segmentsToTranscript, withChunkPlaces, type SegmentRow } from '../cloudRows';

// Three 10-second chunks, each starting 500 ms before the previous one ends.
const C0: ChunkPlace = { seq: 0, start_ms: 0, duration_ms: 10000 };
const C1: ChunkPlace = { seq: 1, start_ms: 9500, duration_ms: 10000 };
const C2: ChunkPlace = { seq: 2, start_ms: 19000, duration_ms: 10000 };
const row = (chunk: ChunkPlace | null, start_ms: number, end_ms: number, text: string, confidence: number | null = 0.9): SegmentRow => ({
  start_ms,
  end_ms,
  text,
  confidence,
  chunk,
});
const texts = (rows: SegmentRow[]) => joinSegmentRows(rows).map((r) => r.text);

const lecture = { id: 'lec', user_id: 'u1', language: 'en', created_at: '2026-10-30T10:00:00Z' };
const stored = [
  row(C0, 1000, 4000, 'Today we look at slopes.'),
  row(C0, 7000, 9950, 'and so the derivative is'),
  row(C1, 9600, 12000, 'derivative is zero here.'),
  row(C1, 15000, 19400, 'At a maximum the slope'),
  row(C2, 19100, 21000, 'the slope changes sign.'),
];

describe('the full transcript, assembled', () => {
  it('removes the words each overlap has twice, keeping every row’s other columns', () => {
    const joined = joinSegmentRows(stored);
    expect(joined.map((r) => r.text)).toEqual([
      'Today we look at slopes.',
      'and so the derivative is',
      'zero here.',
      'At a maximum the slope',
      'changes sign.',
    ]);
    expect(joined.every((r) => r.confidence === 0.9 && r.chunk)).toBe(true);
    // Rows left alone are the same objects; a shortened one is a copy.
    expect(joined[0]).toBe(stored[0]);
    expect(stored[2].text).toBe('derivative is zero here.');
  });

  it('gives the same transcript whatever order the rows (or chunks) arrive in', () => {
    const shuffled = [stored[4], stored[2], stored[0], stored[3], stored[1]];
    expect(texts(shuffled)).toEqual(texts(stored));
  });

  it('a missing chunk leaves its neighbours as they are', () => {
    // Chunk 1 not transcribed yet (or lost): 0 and 2 don't overlap, nothing to remove.
    const withoutMiddle = stored.filter((r) => r.chunk?.seq !== 1);
    expect(texts(withoutMiddle)).toEqual(['Today we look at slopes.', 'and so the derivative is', 'the slope changes sign.']);
  });

  it('keeps segments without a chunk (typed or imported transcripts) as they are, in time order', () => {
    const rows = [row(null, 5000, 6000, 'is is'), row(null, 1000, 2000, 'Hello')];
    expect(texts(rows)).toEqual(['Hello', 'is is']);
    // Mixed: the placed ones joined, the others kept.
    expect(texts([...stored, row(null, 30000, 31000, 'Typed later.')])).toEqual([
      'Today we look at slopes.',
      'and so the derivative is',
      'zero here.',
      'At a maximum the slope',
      'changes sign.',
      'Typed later.',
    ]);
  });

  it('places segments by their chunk_id from the lecture’s audio_chunks rows', () => {
    const read = [
      { start_ms: 7000, end_ms: 9950, text: 'and so the derivative is', confidence: null, chunk_id: 'a' },
      { start_ms: 9600, end_ms: 12000, text: 'derivative is zero here.', confidence: null, chunk_id: 'b' },
      { start_ms: 0, end_ms: 500, text: 'Mock.', confidence: null, chunk_id: null },
      { start_ms: 600, end_ms: 900, text: 'Unknown chunk.', confidence: null, chunk_id: 'gone' },
    ];
    const placed = withChunkPlaces(read, [
      { id: 'a', seq: 0, start_ms: 0, duration_ms: 10000 },
      { id: 'b', seq: 1, start_ms: 9500, duration_ms: 10000 },
    ]);
    expect(placed.map((s) => s.chunk?.seq ?? null)).toEqual([0, 1, null, null]);
    expect(placed.every((s) => !('chunk_id' in s))).toBe(true);
    expect(texts(placed)).toEqual(['Mock.', 'Unknown chunk.', 'and so the derivative is', 'zero here.']);
  });

  it('segmentsToTranscript (the Transcript tab, the notes, the clarifications) uses it', () => {
    const transcript = segmentsToTranscript(lecture, [stored[2], stored[1]])!;
    expect(transcript.full_text).toBe('and so the derivative is zero here.');
    expect(transcript.segments).toEqual([
      { id: 0, start: 7, end: 9.95, text: 'and so the derivative is' },
      { id: 1, start: 9.75, end: 12, text: 'zero here.' },
    ]);
  });

  it('a transcript cached before chunks were placed reads as before', () => {
    const old = stored.map(({ chunk: _chunk, ...r }) => r);
    expect(segmentsToTranscript(lecture, old)!.full_text).toBe(old.map((r) => r.text).join(' '));
  });
});
