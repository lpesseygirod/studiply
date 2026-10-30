import { answerFromSse, createSseReader, errorFromResponse, FunctionError, networkError, parseSse } from '../functionResult';
import { canFallBackToMock, mockAiForced } from '../aiMode';
import { sseEvent } from '../../../supabase/functions/_shared/claude';

describe('errorFromResponse', () => {
  it("uses the function's own message and code", () => {
    const error = errorFromResponse(429, JSON.stringify({ code: 'daily_limit', error: 'Try again tomorrow.' }));
    expect(error).toBeInstanceOf(FunctionError);
    expect(error).toMatchObject({ status: 429, code: 'daily_limit', message: 'Try again tomorrow.', unreachable: false });
  });

  it('treats a gateway 401 as signed out', () => {
    expect(errorFromResponse(401, '{"msg":"Invalid JWT"}')).toMatchObject({ code: 'not_signed_in' });
  });

  it.each([502, 503, 504])('treats a bare %i as unreachable', (status) => {
    expect(errorFromResponse(status, '<html>')).toMatchObject({ unreachable: true });
  });

  it('keeps a 502 from the function itself reachable', () => {
    const body = JSON.stringify({ code: 'transcription_failed', error: 'Transcription failed.' });
    expect(errorFromResponse(502, body)).toMatchObject({ code: 'transcription_failed', unreachable: false });
  });

  it('falls back to a generic message', () => {
    expect(errorFromResponse(500, 'oops')).toMatchObject({ code: 'server_error', unreachable: false });
  });
});

describe('parseSse', () => {
  it('reads the frames the server writes', () => {
    const text = sseEvent('delta', { text: 'Hi' }) + sseEvent('done', { model: 'm' });
    expect(parseSse(text)).toEqual([
      { event: 'delta', data: { text: 'Hi' } },
      { event: 'done', data: { model: 'm' } },
    ]);
  });

  it('skips a frame cut off mid-way', () => {
    expect(parseSse(sseEvent('delta', { text: 'a' }) + 'event: delta\ndata: {"te')).toHaveLength(1);
  });
});

describe('answerFromSse', () => {
  const done = { model: 'claude-opus-5-5', stopReason: 'end_turn', usage: { input: 1, output: 2 }, costUsd: 0.01 };

  it('joins the deltas once done arrives', () => {
    const text = sseEvent('delta', { text: 'Hel' }) + sseEvent('delta', { text: 'lo' }) + sseEvent('done', done);
    expect(answerFromSse(text)).toEqual({ text: 'Hello', done });
  });

  it('throws on an error event, discarding the pieces', () => {
    const text = sseEvent('delta', { text: 'Hel' }) + sseEvent('error', { code: 'refused', error: 'No.' });
    expect(() => answerFromSse(text)).toThrow(expect.objectContaining({ code: 'refused', message: 'No.' }));
  });

  it('throws when the stream ends without done', () => {
    expect(() => answerFromSse(sseEvent('delta', { text: 'Hel' }))).toThrow(expect.objectContaining({ code: 'incomplete' }));
  });
});

describe('mock AI', () => {
  it('is forced only in development with the flag', () => {
    expect(mockAiForced({ isDev: true, flag: '1' })).toBe(true);
    expect(mockAiForced({ isDev: true, flag: undefined })).toBe(false);
    expect(mockAiForced({ isDev: false, flag: '1' })).toBe(false);
  });

  it('falls back only for an unreachable server, in development', () => {
    expect(canFallBackToMock(networkError(), true)).toBe(true);
    expect(canFallBackToMock(networkError(), false)).toBe(false);
    expect(canFallBackToMock(errorFromResponse(429, '{"code":"daily_limit","error":"x"}'), true)).toBe(false);
    expect(canFallBackToMock(new Error('x'), true)).toBe(false);
  });
});

describe('createSseReader (step 6.2: the answer streams in)', () => {
  const stream =
    sseEvent('meta', { answerId: 'a-1', window: { startMs: 0, endMs: 60_000 }, knownUpToMs: 60_000 }) +
    sseEvent('delta', { text: 'La mito' }) +
    sseEvent('delta', { text: 'condria\n[0:30]' }) +
    sseEvent('done', { model: 'claude-sonnet-5-5' });

  it('hands over whole frames in order, wherever the network cuts the text', () => {
    for (const size of [1, 2, 3, 7, 16, stream.length]) {
      const reader = createSseReader();
      const frames = [];
      for (let i = 0; i < stream.length; i += size) frames.push(...reader.push(stream.slice(i, i + size)));
      frames.push(...reader.end());
      expect(frames.map((f) => f.event)).toEqual(['meta', 'delta', 'delta', 'done']);
      expect(frames.filter((f) => f.event === 'delta').map((f) => (f.data as { text: string }).text).join('')).toBe('La mitocondria\n[0:30]');
    }
  });

  it('keeps a frame cut before its blank line until the rest arrives, and reads \\r\\n endings', () => {
    const reader = createSseReader();
    expect(reader.push('event: delta\r\ndata: {"text":"a"}\r')).toEqual([]);
    expect(reader.push('\n\r\n')).toEqual([{ event: 'delta', data: { text: 'a' } }]);
    expect(reader.push('event: done\ndata: {}')).toEqual([]);
    expect(reader.end()).toEqual([{ event: 'done', data: {} }]);
  });
});
