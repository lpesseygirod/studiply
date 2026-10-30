/**
 * functionResult.ts
 * Reading Edge Function answers: errors and server-sent events. Pure, so it
 * can be unit tested; the requests themselves are in ./functions.ts.
 *
 * Every function error is JSON `{ error, code }` with a message written for
 * the student (supabase/functions/_shared/http.ts). The API gateway can also
 * answer before the function runs (expired token, function not served),
 * without that body, so those cases get messages here.
 */

/** A failed function call; `message` is safe to show to the student. */
export class FunctionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    /** The server couldn't be reached at all (no network, function not running). */
    readonly unreachable = false,
  ) {
    super(message);
    this.name = 'FunctionError';
  }
}

export const NETWORK_MESSAGE = 'Could not reach Studiply. Check your connection and try again.';

export function networkError(): FunctionError {
  return new FunctionError(NETWORK_MESSAGE, 0, 'network', true);
}

/** The error for a non-2xx answer, from its status and body text. */
export function errorFromResponse(status: number, body: string): FunctionError {
  let code: string | undefined;
  let message: string | undefined;
  try {
    const parsed = JSON.parse(body) as { code?: unknown; error?: unknown };
    if (typeof parsed.code === 'string') code = parsed.code;
    if (typeof parsed.error === 'string') message = parsed.error;
  } catch {
    // Not JSON: the gateway answered, not the function.
  }
  if (code && message) return new FunctionError(message, status, code);

  if (status === 401) return new FunctionError('Your session has expired. Sign in again and retry.', 401, 'not_signed_in');
  // 502–504 without our body: the function isn't being served.
  if (status >= 502 && status <= 504) return new FunctionError(NETWORK_MESSAGE, status, 'unreachable', true);
  return new FunctionError('Something went wrong on the server. Please try again.', status, code ?? 'server_error');
}

// -------------------------------------------------------------------
// Server-sent events (assistant-chat)
// -------------------------------------------------------------------

export interface SseFrame {
  event: string;
  data: unknown;
}

/** Splits an event-stream body into frames; incomplete or unreadable frames are skipped. */
export function parseSse(text: string): SseFrame[] {
  const frames: SseFrame[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const event = /^event: ?(.*)$/m.exec(block)?.[1]?.trim();
    const dataLines = [...block.matchAll(/^data: ?(.*)$/gm)].map((m) => m[1]);
    if (!event || dataLines.length === 0) continue;
    try {
      frames.push({ event, data: JSON.parse(dataLines.join('\n')) });
    } catch {
      // A frame cut off mid-way; the stream's last word decides anyway.
    }
  }
  return frames;
}

/**
 * Reads an event stream as it arrives (step 6.2): `push` each piece of
 * text; whole frames come out in order, and a frame cut between two pieces
 * waits for the rest. `end` gives what was left without a blank line after it.
 */
export function createSseReader(): { push: (text: string) => SseFrame[]; end: () => SseFrame[] } {
  let buffer = '';
  return {
    push(text) {
      // A "\r" at the end of one piece meets its "\n" in the next, so the whole buffer is normalised.
      buffer = (buffer + text).replace(/\r\n/g, '\n');
      const last = buffer.lastIndexOf('\n\n');
      if (last === -1) return [];
      const whole = buffer.slice(0, last + 2);
      buffer = buffer.slice(last + 2);
      return parseSse(whole);
    },
    end() {
      const rest = buffer;
      buffer = '';
      return parseSse(rest);
    },
  };
}

export interface SseDone {
  model: string;
  stopReason: string | null;
  usage: { input: number; output: number };
  costUsd: number | null;
}

/**
 * The whole answer of a finished stream: its deltas joined, once `done`
 * arrived. An `error` event, or a stream that ended without `done`, throws,
 * and the pieces already received are discarded (the streaming contract).
 */
export function answerFromSse(text: string): { text: string; done: SseDone } {
  let answer = '';
  for (const frame of parseSse(text)) {
    const data = (frame.data ?? {}) as Record<string, unknown>;
    if (frame.event === 'delta' && typeof data.text === 'string') answer += data.text;
    if (frame.event === 'error') {
      throw new FunctionError(
        typeof data.error === 'string' ? data.error : 'The answer could not be written. Please try again.',
        200,
        typeof data.code === 'string' ? data.code : 'assistant_failed',
      );
    }
    if (frame.event === 'done') return { text: answer, done: data as unknown as SseDone };
  }
  throw new FunctionError('The answer was cut off. Please try again.', 200, 'incomplete');
}
