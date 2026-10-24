/**
 * openai.ts
 * Sends one audio file to OpenAI's transcription endpoint.
 *
 * Retries only what can fix itself: no connection, rate limiting (429) and
 * server errors (5xx), twice, after about 1 s and 2 s. Anything else fails
 * at once; a 401 here means the server's key is wrong, so unlike the app's
 * upload retries (src/lib/retry.ts) there is nothing to refresh.
 */

import { TRANSCRIBE_MODEL, type WhisperVerbose } from './transcript.ts';

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const RETRY_WAITS_MS = [1000, 2000];
const TIMEOUT_MS = 120_000;

export type TranscribeResult =
  | { ok: true; verbose: WhisperVerbose }
  | { ok: false; status: number; code: string };

export async function transcribe(
  apiKey: string,
  audio: Blob,
  fileName: string,
  language: string | null,
  model = TRANSCRIBE_MODEL,
): Promise<TranscribeResult> {
  for (let attempt = 0; ; attempt++) {
    const form = new FormData();
    form.append('file', audio, fileName);
    form.append('model', model);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    if (language) form.append('language', language);

    let status = 0;
    let code = 'network_error';
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return { ok: true, verbose: (await res.json()) as WhisperVerbose };
      status = res.status;
      const answer = await res.json().catch(() => ({}));
      code = answer?.error?.code ?? answer?.error?.type ?? `http_${status}`;
    } catch (err) {
      // A timeout isn't retried: the request may still be running on OpenAI's side.
      if (err instanceof DOMException && err.name === 'TimeoutError') return { ok: false, status: 0, code: 'timeout' };
    }

    const retryable = status === 0 || status === 429 || status >= 500;
    if (!retryable || attempt >= RETRY_WAITS_MS.length) return { ok: false, status, code };
    await new Promise((resolve) => setTimeout(resolve, RETRY_WAITS_MS[attempt]));
  }
}
