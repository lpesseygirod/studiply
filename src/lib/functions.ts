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

import { isSimulatedOffline, reportFailure, reportReachable } from './connectivity';
import { supabase, supabaseUrl } from './supabase';
import { answerFromSse, errorFromResponse, networkError, type SseDone } from './functionResult';

export { FunctionError } from './functionResult';

export type FunctionName = 'transcribe-chunk' | 'summarize' | 'assistant-chat';

async function post(name: FunctionName, body: unknown): Promise<Response> {
  const send = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw errorFromResponse(401, '');
    if (isSimulatedOffline()) throw networkError();
    // Not connectedFetch: summarize can take minutes, longer than its timeout.
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      reportReachable();
      return res;
    } catch {
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
 * A function that answers server-sent events (assistant-chat), read to the
 * end. Live streaming into the UI comes with the assistant in Phase 6.
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
