// The live transcript from the chunks' transcripts, the words of
// each 500 ms overlap kept once (the shared rule; the full transcript's rows
// are tested in src/lib/__tests__/transcriptRows.test.ts).
import { joinTranscript, type ChunkTranscript } from '../../../../supabase/functions/_shared/transcriptJoin';

const seg = (startMs: number, endMs: number, text: string) => ({ startMs, endMs, text });
const texts = (chunks: ChunkTranscript[]) => joinTranscript(chunks).map((s) => s.text);

// Two 10-second chunks; the second starts 500 ms before the first ends (overlap 9.5–10 s, middle 9.75 s).
const A = (segments: ChunkTranscript['segments']): ChunkTranscript => ({ seq: 0, startMs: 0, durationMs: 10000, segments });
const B = (segments: ChunkTranscript['segments']): ChunkTranscript => ({ seq: 1, startMs: 9500, durationMs: 10000, segments });

describe('the live transcript', () => {
  it('is the chunks in order; no overlap, nothing removed', () => {
    const chunks: ChunkTranscript[] = [
      { seq: 1, startMs: 10000, durationMs: 10000, segments: [seg(10000, 12000, 'the derivative')] },
      { seq: 0, startMs: 0, durationMs: 10000, segments: [seg(500, 3000, 'Today:'), seg(8000, 10000, 'the derivative')] },
    ];
    expect(texts(chunks)).toEqual(['Today:', 'the derivative', 'the derivative']);
  });

  it('keeps the words heard by both chunks once', () => {
    const chunks = [A([seg(7000, 9950, 'and so the derivative is')]), B([seg(9600, 12000, 'derivative is zero here.')])];
    expect(texts(chunks)).toEqual(['and so the derivative is', 'zero here.']);
    // The later segment now starts at the overlap's middle.
    expect(joinTranscript(chunks)[1].startMs).toBe(9750);
  });

  it('ignores case, accents and punctuation when matching', () => {
    const chunks = [A([seg(7000, 9950, 'la dérivée est,')]), B([seg(9600, 12000, 'Derivee est nulle.')])];
    expect(texts(chunks)).toEqual(['la dérivée est,', 'nulle.']);
  });

  it('allows for a word cut off at either edge when two or more words match', () => {
    // A heard "deriv" (cut), B heard "the" from its middle only ("he").
    const cutA = [A([seg(7000, 10000, 'so the slope is the deriv')]), B([seg(9500, 12000, 'is the derivative of f.')])];
    expect(texts(cutA)).toEqual(['so the slope is the', 'derivative of f.']);
    const cutB = [A([seg(7000, 10000, 'so the slope is the')]), B([seg(9500, 12000, 'he slope is the derivative.')])];
    expect(texts(cutB)).toEqual(['so the slope is the', 'derivative.']);
  });

  it('a single matching word next to a fragment is not enough', () => {
    const chunks = [A([seg(7000, 10000, 'we take the deriv')]), B([seg(9500, 12000, 'the derivative')])];
    // "the" + a fragment needs two matching words; only the exact one-word run at the edge counts.
    expect(texts(chunks)).toEqual(['we take the deriv', 'the derivative']);
  });

  it('drops a segment that lies wholly on the other chunk’s half of the overlap', () => {
    const chunks = [
      A([seg(5000, 9000, 'First sentence.'), seg(9800, 9990, 'Okay.')]),
      B([seg(9500, 9700, 'ence.'), seg(9800, 9990, 'Okay.'), seg(10500, 12000, 'Next one.')]),
    ];
    // A's "Okay." starts after the middle (it's B's); B's "ence." ends before it (it's A's).
    expect(texts(chunks)).toEqual(['First sentence.', 'Okay.', 'Next one.']);
  });

  it('leaves both when nothing matches', () => {
    const chunks = [A([seg(7000, 9900, 'the limit exists')]), B([seg(9600, 12000, 'because the function is continuous')])];
    expect(texts(chunks)).toEqual(['the limit exists', 'because the function is continuous']);
  });

  it('after a pause the next chunk starts where the previous ended: nothing removed', () => {
    const chunks: ChunkTranscript[] = [
      { seq: 0, startMs: 0, durationMs: 4000, segments: [seg(1000, 4000, 'one two three')] },
      { seq: 1, startMs: 4000, durationMs: 4000, segments: [seg(4000, 6000, 'three four')] },
    ];
    expect(texts(chunks)).toEqual(['one two three', 'three four']);
  });

  it('a chunk not transcribed yet: its neighbours are left as they are, and joined once it arrives', () => {
    const waiting = [A([seg(7000, 9950, 'and so the derivative is')]), B(null)];
    expect(texts(waiting)).toEqual(['and so the derivative is']);
    const both = [A([seg(7000, 9950, 'and so the derivative is')]), B([seg(9600, 12000, 'derivative is zero.')])];
    expect(texts(both)).toEqual(['and so the derivative is', 'zero.']);
  });

  it('out of order, a chunk listed twice, or a gap: the same transcript', () => {
    const a = A([seg(7000, 9950, 'and so the derivative is')]);
    const b = B([seg(9600, 12000, 'derivative is zero.')]);
    const d: ChunkTranscript = { seq: 3, startMs: 28500, durationMs: 10000, segments: [seg(28500, 30000, 'zero. Next')] };
    expect(texts([d, b, a, b])).toEqual(['and so the derivative is', 'zero.', 'zero. Next']);
  });

  it('a later segment that was only the shared words disappears', () => {
    const chunks = [A([seg(7000, 9950, 'and that is all')]), B([seg(9550, 9900, 'is all'), seg(10500, 12000, 'Questions?')])];
    expect(texts(chunks)).toEqual(['and that is all', 'Questions?']);
  });
});
