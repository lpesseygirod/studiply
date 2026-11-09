/**
 * consent-gate.ts
 * Step 10.1: a run that makes several Claude calls (a summary: classify, generate, the long parts,
 * the checks…) asks again before each one whether the student still allows AI. If she switched it off
 * in Settings → AI & privacy meanwhile, the call never starts: nothing more is sent. Without imports,
 * so Jest tests it.
 */

/** The call that wasn't made: AI was switched off. Status 403, so the runs don't try it again. */
export class ConsentWithdrawnError extends Error {
  readonly status = 403;
  readonly code = 'consent_withdrawn';
  constructor() {
    super('AI was switched off: nothing more is sent.');
    this.name = 'ConsentWithdrawnError';
  }
}

interface Call<M> {
  finalMessage(): Promise<M>;
  readonly currentMessage?: M;
}

/**
 * A call that starts only once `allowed()` says so (checked when its answer is first asked for). Not
 * allowed: `onBlocked()` and a ConsentWithdrawnError; `start` is never run.
 */
export function gatedCall<M>(allowed: () => Promise<boolean>, start: () => Call<M>, onBlocked: () => void): Call<M> {
  let inner: Call<M> | null = null;
  let answer: Promise<M> | null = null;
  return {
    finalMessage() {
      answer ??= allowed().then((ok) => {
        if (!ok) {
          onBlocked();
          throw new ConsentWithdrawnError();
        }
        inner = start();
        return inner.finalMessage();
      });
      return answer;
    },
    get currentMessage() {
      return inner?.currentMessage;
    },
  };
}
