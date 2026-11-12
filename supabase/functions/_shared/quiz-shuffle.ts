/**
 * quiz-shuffle.ts
 * The one fixed shuffle quizzes use (here so the app uses it too): the
 * questions' places and the multiple-choice options when a quiz is saved (quiz-pipeline.ts), an
 * attempt's question order, and the order match pairs and put-in-order steps are shown in
 * (src/lib/quiz/session.ts). The same seed always gives the same order, on every device. No imports.
 */

/** A number from a string (an id, or ids joined), for the shuffle's seed. */
function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The same order every time for the same seed (mulberry32, Fisher–Yates). */
export function seededShuffle<T>(list: readonly T[], seed: string): T[] {
  let a = seedOf(seed);
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
