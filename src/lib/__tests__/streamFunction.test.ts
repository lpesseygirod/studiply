/**
 * @jest-environment node
 */
// assistant-chat's answer read as it arrives (lib/functions
// streamFunction), with a fake fetch whose body comes in pieces. Nothing is sent.
import { sseEvent } from '../../../supabase/functions/_shared/claude';
import { FunctionError, streamFunction } from '../functions';
import type { SseFrame } from '../functionResult';

jest.mock('../supabase', () => ({
  supabaseUrl: 'http://127.0.0.1:54321',
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'token' } } }),
      refreshSession: async () => ({ error: null }),
    },
  },
}));

const encoder = new TextEncoder();

/** A Response whose body arrives in these pieces, one per read; `failAfter` pieces, then the connection drops. */
function streamed(pieces: string[], options: { status?: number; type?: string; failAfter?: number } = {}): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (options.failAfter !== undefined && i === options.failAfter) {
        controller.error(new TypeError('Network request failed'));
        return;
      }
      if (i < pieces.length) controller.enqueue(encoder.encode(pieces[i++]));
      else controller.close();
    },
  });
  return new Response(body, { status: options.status ?? 200, headers: { 'content-type': options.type ?? 'text/event-stream; charset=utf-8' } });
}

const answer = [
  sseEvent('meta', { questionId: 'q', answerId: 'a', window: { startMs: 0, endMs: 600_000 }, knownUpToMs: 600_000 }),
  sseEvent('delta', { text: 'La mitocondria ' }),
  sseEvent('delta', { text: 'produce **ATP** [5:30].' }),
  sseEvent('done', { model: 'claude-sonnet-5-5' }),
].join('');

describe('streamFunction', () => {
  it('hands each frame over as its piece arrives, with the token and the body', async () => {
    const calls: { url: string; init: { headers: Record<string, string>; body: string } }[] = [];
    const seen: SseFrame[] = [];
    // The rest of the answer is sent only once the meta frame has been handed over: had the frames
    // waited for the end of the stream, this would never finish.
    let metaSeen!: () => void;
    const gate = new Promise<void>((resolve) => (metaSeen = resolve));
    let piece = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(c) {
        // The first piece holds the meta frame and the start of the first delta.
        if (piece === 0) c.enqueue(encoder.encode(answer.slice(0, 130)));
        else if (piece === 1) {
          await gate;
          c.enqueue(encoder.encode(answer.slice(130)));
        } else c.close();
        piece++;
      },
    });
    await streamFunction(
      'assistant-chat',
      { lectureId: 'l', quickPrompt: 'last_10_min' },
      (frame) => {
        seen.push(frame);
        if (frame.event === 'meta') metaSeen();
      },
      {
        fetch: async (url, init) => {
          calls.push({ url, init });
          return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
        },
      },
    );
    expect(calls[0].url).toBe('http://127.0.0.1:54321/functions/v1/assistant-chat');
    expect(calls[0].init.headers.Authorization).toBe('Bearer token');
    expect(JSON.parse(calls[0].init.body)).toEqual({ lectureId: 'l', quickPrompt: 'last_10_min' });
    expect(seen.map((f) => f.event)).toEqual(['meta', 'delta', 'delta', 'done']);
  });

  it('a refusal before the stream (JSON error) rejects with its message', async () => {
    const res = new Response(JSON.stringify({ code: 'daily_limit', error: 'You have reached today’s limit.' }), { status: 429, headers: { 'content-type': 'application/json' } });
    await expect(streamFunction('assistant-chat', {}, () => {}, { fetch: async () => res })).rejects.toMatchObject({ code: 'daily_limit', status: 429 });
  });

  it('a connection lost mid-answer rejects as a network error after the frames already read', async () => {
    const seen: string[] = [];
    await expect(
      streamFunction('assistant-chat', {}, (f) => seen.push(f.event), { fetch: async () => streamed([answer.slice(0, 200), answer.slice(200)], { failAfter: 1 }) }),
    ).rejects.toBeInstanceOf(FunctionError);
    expect(seen).toContain('meta');
    expect(seen).not.toContain('done');
  });
});
