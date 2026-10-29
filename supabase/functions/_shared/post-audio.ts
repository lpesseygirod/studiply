/**
 * post-audio.ts
 * Sends one audio file to a transcription service, for openai.ts and
 * elevenlabs.ts.
 *
 * Retries only what can fix itself: no connection, rate limiting (429) and
 * server errors (5xx), twice, after about 1 s and 2 s. Anything else fails
 * at once; a 401 here means the server's key is wrong, so unlike the app's
 * upload retries (src/lib/retry.ts) there is nothing to refresh.
 */

const RETRY_WAITS_MS = [1000, 2000];
const TIMEOUT_MS = 120_000;

export type PostResult<T> = { ok: true; answer: T } | { ok: false; status: number; code: string };

export async function postAudio<T>(
  url: string,
  headers: Record<string, string>,
  /** A new form each attempt: a sent body can't be sent again. */
  makeForm: () => FormData,
  /** The service's error code from its JSON error answer, if it has one. */
  errorCode: (answer: unknown) => string | undefined,
): Promise<PostResult<T>> {
  for (let attempt = 0; ; attempt++) {
    let status = 0;
    let code = 'network_error';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: makeForm(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return { ok: true, answer: (await res.json()) as T };
      status = res.status;
      const answer = await res.json().catch(() => ({}));
      code = errorCode(answer) ?? `http_${status}`;
    } catch (err) {
      // A timeout isn't retried: the request may still be running on the service's side.
      if (err instanceof DOMException && err.name === 'TimeoutError') return { ok: false, status: 0, code: 'timeout' };
    }

    const retryable = status === 0 || status === 429 || status >= 500;
    if (!retryable || attempt >= RETRY_WAITS_MS.length) return { ok: false, status, code };
    await new Promise((resolve) => setTimeout(resolve, RETRY_WAITS_MS[attempt]));
  }
}
