/**
 * functions.ts
 * Calls to the Supabase Edge Functions (transcribe-chunk, summarize,
 * assistant-chat), the only way the app reaches OpenAI or Anthropic. The
 * keys live on the server; the app sends only the student's own token.
 *
 * Requests match scripts/check-*.mjs: POST, JSON body, `Authorization:
 * Bearer <token>`. A token read fresh for each attempt, refreshed once on
 * 401 (as cloud-storage.service does for uploads).
 */

import { Platform } from 'react-native';

import { isSimulatedOffline, reportFailure, reportReachable } from './connectivity';
import { supabase, supabaseUrl } from './supabase';
import { answerFromSse, createSseReader, errorFromResponse, networkError, type SseDone, type SseFrame } from './functionResult';

export { FunctionError } from './functionResult';

export type FunctionName = 'transcribe-chunk' | 'summarize' | 'assistant-chat';

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<Response>;

/**
 * A fetch whose answer can be read as it arrives (step 6.2): the browser's on the web; on the iPhone
 * expo/fetch (part of the expo package), since React Native's own fetch only gives the whole body.
 */
function streamingFetch(): Fetch {
  if (Platform.OS === 'web') return (url, init) => fetch(url, init);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { fetch: expoFetch } = require('expo/fetch') as typeof import('expo/fetch');
  return (url, init) => expoFetch(url, init) as unknown as Promise<Response>;
}

async function post(name: FunctionName, body: unknown, options: { fetch?: Fetch; signal?: AbortSignal } = {}): Promise<Response> {
  const fetchImpl: Fetch = options.fetch ?? ((url, init) => fetch(url, init));
  const send = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw errorFromResponse(401, '');
    if (isSimulatedOffline()) throw networkError();
    // Not connectedFetch: summarize can take minutes, longer than its timeout.
    try {
      const res = await fetchImpl(`${supabaseUrl}/functions/v1/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: options.signal,
      });
      reportReachable();
      return res;
    } catch (err) {
      if (options.signal?.aborted) throw err;
      reportFailure();
      throw networkError();
    }
  };

  let res = await send();
  if (res.status === 401 && !(await supabase.auth.refreshSession()).error) res = await send();
  if (!res.ok) throw errorFromResponse(res.status, await res.text().catch(() => ''));
  return res;
}

/** A function that answers JSON (transcribe-chunk, summarize). */
export async function callFunction<T>(name: FunctionName, body: unknown): Promise<T> {
  const res = await post(name, body);
  return (await res.json()) as T;
}

/**
 * A function that answers server-sent events (assistant-chat), each frame
 * handed to `onFrame` as it arrives (step 6.2: the study assistant's answer
 * streams in). Resolves when the stream ends; a lost connection mid-way
 * rejects with a network error. Non-2xx answers reject before any frame.
 */
export async function streamFunction(
  name: FunctionName,
  body: unknown,
  onFrame: (frame: SseFrame) => void,
  options: { signal?: AbortSignal; fetch?: Fetch } = {},
): Promise<void> {
  const res = await post(name, body, { fetch: options.fetch ?? streamingFetch(), signal: options.signal });
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('text/event-stream')) throw errorFromResponse(500, await res.text().catch(() => ''));
  const reader = createSseReader();
  const decoder = new TextDecoder();
  const stream = res.body?.getReader();
  try {
    if (!stream) {
      // No readable body (an old runtime): the frames all at once, at the end.
      reader.push(await res.text()).forEach(onFrame);
    } else {
      for (;;) {
        const { done, value } = await stream.read();
        if (done) break;
        reader.push(decoder.decode(value, { stream: true })).forEach(onFrame);
      }
    }
  } catch (err) {
    if (options.signal?.aborted) throw err;
    reportFailure();
    throw networkError();
  }
  reader.end().forEach(onFrame);
}

/**
 * A function that answers server-sent events (assistant-chat), read to the
 * end (clarify, step 1.7).
 */
export async function callStreamingFunction(
  name: FunctionName,
  body: unknown,
): Promise<{ text: string; done: SseDone }> {
  const res = await post(name, body);
  const type = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (!type.startsWith('text/event-stream')) throw errorFromResponse(500, text);
  return answerFromSse(text);
}
