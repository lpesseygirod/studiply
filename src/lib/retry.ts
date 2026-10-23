/**
 * retry.ts
 * Retry rules for uploads, kept free of network code so they can be tested.
 *
 * One first try plus up to three retries, waiting about 1 s, 2 s and 4 s.
 * Only failures that can fix themselves are retried: no connection, a
 * timeout, rate limiting or a server error. An expired session (401) is
 * refreshed once and tried again straight away. Anything else (too large,
 * wrong type, not allowed) fails at once, because retrying can't help.
 */

/** What an upload attempt got back from the server. */
export interface HttpResult {
  status: number;
  body: string;
}

export type NextStep = 'done' | 'retry' | 'refresh' | 'fail';

export const MAX_RETRIES = 3;

/** What to do after an attempt answered with this HTTP status. */
export function nextStep(status: number): NextStep {
  if (status >= 200 && status < 300) return 'done';
  if (status === 401) return 'refresh';
  if (status === 0 || status === 408 || status === 429 || status >= 500) return 'retry';
  return 'fail';
}

/** Wait before retry number `retry` (1-based): 1 s, 2 s, 4 s, plus up to 250 ms jitter. */
export function backoffMs(retry: number, random: () => number = Math.random): number {
  return 1000 * 2 ** (retry - 1) + Math.round(random() * 250);
}

export interface RetryOptions {
  /** Refreshes the session; resolves true when a new token is available. */
  refresh: () => Promise<boolean>;
  /** Called before each retry with its number (1-based) and the maximum. */
  onRetry?: (retry: number, maxRetries: number) => void;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `attempt` until it succeeds, fails for good, or runs out of retries.
 * Resolves with the last server answer (successful or not); rejects only
 * when the last try never reached the server.
 */
export async function withRetries(
  attempt: () => Promise<HttpResult>,
  { refresh, onRetry, sleep = defaultSleep, random = Math.random }: RetryOptions,
): Promise<HttpResult> {
  let retries = 0;
  let refreshed = false;

  for (;;) {
    let result: HttpResult | null = null;
    let networkError: unknown = null;
    try {
      result = await attempt();
    } catch (err) {
      networkError = err;
    }

    const step = result ? nextStep(result.status) : 'retry';

    if (step === 'done' || step === 'fail') return result!;

    if (step === 'refresh' && !refreshed) {
      refreshed = true;
      if (await refresh()) continue;
      return result!;
    }
    if (step === 'refresh') return result!;

    if (retries >= MAX_RETRIES) {
      if (result) return result;
      throw networkError;
    }
    retries += 1;
    onRetry?.(retries, MAX_RETRIES);
    await sleep(backoffMs(retries, random));
  }
}
