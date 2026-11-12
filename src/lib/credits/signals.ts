/**
 * signals.ts
 * Step 10.2-2: "her credits may have changed" (a function answered 402 no_credits, a summary or quiz
 * was started), without the caller knowing the credits store (lib/functions.ts stays free of it).
 */

const listeners = new Set<(force: boolean) => void>();

/** `force`: read now, past the 30 s between reads (a refusal: the screens must follow at once). */
export function creditsMayHaveChanged(force = false): void {
  listeners.forEach((fn) => fn(force));
}

export function onCreditsMayHaveChanged(fn: (force: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
