/**
 * signals.ts
 * Step 10.2-2: "her credits may have changed" (a function answered 402 no_credits, a summary or quiz
 * was started), without the caller knowing the credits store (lib/functions.ts stays free of it).
 */

const listeners = new Set<() => void>();

export function creditsMayHaveChanged(): void {
  listeners.forEach((fn) => fn());
}

export function onCreditsMayHaveChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
