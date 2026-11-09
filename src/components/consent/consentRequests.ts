/**
 * consentRequests.ts
 * Step 10.1: the AI consent screen asked from anywhere (services/consent.service.ts), drawn by
 * <AiConsentHost /> (mounted once in app/_layout.tsx). One question at a time: a second ask while the
 * screen is open waits for the same answer.
 */

/** Where it is asked from: before a recording ("Before you record") or before any other AI action. */
export type ConsentContext = 'record' | 'ai';

export interface ConsentRequest {
  id: number;
  context: ConsentContext;
}

let current: (ConsentRequest & { answer: Promise<boolean>; resolve: (allowed: boolean) => void }) | null = null;
let nextId = 1;
const listeners = new Set<(request: ConsentRequest | null) => void>();
const notify = () => listeners.forEach((fn) => fn(current ? { id: current.id, context: current.context } : null));

/** Shows the consent screen; resolves true on "Allow and continue", false on "Not now". */
export function requestAiConsent(context: ConsentContext): Promise<boolean> {
  if (current) return current.answer;
  let resolve!: (allowed: boolean) => void;
  const answer = new Promise<boolean>((r) => (resolve = r));
  current = { id: nextId++, context, answer, resolve };
  notify();
  return answer;
}

export function answerConsentRequest(id: number, allowed: boolean): void {
  if (!current || current.id !== id) return;
  const { resolve } = current;
  current = null;
  notify();
  resolve(allowed);
}

export function subscribeConsentRequests(fn: (request: ConsentRequest | null) => void): () => void {
  listeners.add(fn);
  fn(current ? { id: current.id, context: current.context } : null);
  return () => listeners.delete(fn);
}

export const isConsentScreenOpen = () => current !== null;
