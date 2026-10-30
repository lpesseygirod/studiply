// Step 6.2: the study assistant from the app (services/assistant.service):
// earlier questions and answers from assistant_messages, and asking, with the
// answer's events mapped from the stream. The stream is faked; nothing is sent.
import { FunctionError, streamFunction } from '../../lib/functions';
import { askAssistant, turnsFromRows, type AskHandlers } from '../assistant.service';
import { ConsentDeclinedError, ensureConsent, forgetConsent } from '../consent.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../../lib/functions', () => {
  const actual = jest.requireActual('../../lib/functionResult');
  return { FunctionError: actual.FunctionError, streamFunction: jest.fn() };
});
jest.mock('../consent.service', () => ({
  ConsentDeclinedError: class ConsentDeclinedError extends Error {},
  ensureConsent: jest.fn(async () => {}),
  forgetConsent: jest.fn(),
}));

const row = (id: string, role: 'user' | 'assistant', content: string, extra: Record<string, unknown> = {}) => ({
  id,
  role,
  content,
  reply_to: null,
  quick_prompt: null,
  window_start_ms: 0,
  window_end_ms: 600_000,
  status: 'done' as const,
  ...extra,
});

describe('turnsFromRows', () => {
  it('each question with its answer and window; a quick prompt keeps its key', () => {
    expect(
      turnsFromRows([
        row('q1', 'user', 'Explain the last 10 min', { quick_prompt: 'last_10_min', window_start_ms: 1_452_000, window_end_ms: 2_052_000 }),
        row('a1', 'assistant', 'La profesora explicó…', { reply_to: 'q1', window_start_ms: 1_452_000, window_end_ms: 2_052_000 }),
      ]),
    ).toEqual([
      { id: 'q1', answerId: 'a1', question: 'Explain the last 10 min', quickPrompt: 'last_10_min', window: { startMs: 1_452_000, endMs: 2_052_000 }, answer: 'La profesora explicó…', status: 'done', error: undefined },
    ]);
  });

  it('a failed or missing answer shows as not answered (text dropped); asked again right after: the newer pair only', () => {
    const turns = turnsFromRows([
      row('q1', 'user', '¿Qué es el ATP?'),
      row('a1', 'assistant', 'half', { reply_to: 'q1', status: 'error' }),
      row('q2', 'user', '¿Qué es el ATP?'),
      row('a2', 'assistant', 'La moneda energética.', { reply_to: 'q2' }),
      row('q3', 'user', 'Sin respuesta'),
    ]);
    expect(turns.map((t) => [t.id, t.status, t.answer])).toEqual([
      ['q2', 'done', 'La moneda energética.'],
      ['q3', 'error', ''],
    ]);
  });
});

/** The stream, faked: hands over these frames, then ends (or fails). */
function streams(frames: { event: string; data: unknown }[], fail?: Error) {
  (streamFunction as jest.Mock).mockImplementation(async (_name: string, _body: unknown, onFrame: (f: unknown) => void) => {
    frames.forEach(onFrame);
    if (fail) throw fail;
  });
}

function handlers() {
  const events: string[] = [];
  const h: AskHandlers = {
    meta: (m) => events.push(`meta ${m.window.startMs}-${m.window.endMs} ${m.knownUpToMs}`),
    delta: (t) => events.push(`delta ${t}`),
    done: () => events.push('done'),
  };
  return { h, events };
}

const input = { lectureId: 'lecture-1', message: '', quickPrompt: 'last_10_min' as const, nowMs: 1_800_000 };

describe('askAssistant', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks for consent first, sends the quick prompt and the recording time, maps meta, the pieces and done', async () => {
    streams([
      { event: 'meta', data: { questionId: 'q', answerId: 'a', window: { startMs: 1_200_000, endMs: 1_800_000 }, knownUpToMs: 1_790_000 } },
      { event: 'delta', data: { text: 'La ' } },
      { event: 'delta', data: { text: 'mitocondria' } },
      { event: 'done', data: { model: 'claude-sonnet-5-5' } },
    ]);
    const { h, events } = handlers();
    await askAssistant(input, h);
    expect(ensureConsent).toHaveBeenCalledWith('assistant_summary');
    expect((streamFunction as jest.Mock).mock.calls[0][1]).toEqual({ lectureId: 'lecture-1', message: undefined, quickPrompt: 'last_10_min', nowMs: 1_800_000 });
    expect(events).toEqual(['meta 1200000-1800000 1790000', 'delta La ', 'delta mitocondria', 'done']);
  });

  it('after class: a typed question without a time (the server uses the transcript’s end)', async () => {
    streams([{ event: 'done', data: {} }]);
    await askAssistant({ lectureId: 'lecture-1', message: '¿Qué es el ATP?', quickPrompt: null, nowMs: null }, handlers().h);
    expect((streamFunction as jest.Mock).mock.calls[0][1]).toEqual({ lectureId: 'lecture-1', message: '¿Qué es el ATP?', quickPrompt: undefined, nowMs: undefined });
  });

  it('an error event rejects with its message, and done is never called', async () => {
    streams([
      { event: 'delta', data: { text: 'La mito' } },
      { event: 'error', data: { code: 'assistant_failed', error: 'The assistant could not answer. Please try again.' } },
    ]);
    const { h, events } = handlers();
    await expect(askAssistant(input, h)).rejects.toMatchObject({ code: 'assistant_failed', message: 'The assistant could not answer. Please try again.' });
    expect(events).not.toContain('done');
  });

  it('a stream that ends without done is cut off', async () => {
    streams([{ event: 'delta', data: { text: 'La' } }]);
    await expect(askAssistant(input, handlers().h)).rejects.toMatchObject({ code: 'incomplete' });
  });

  it('consent withdrawn on another device: forgotten here, so it is asked again next time', async () => {
    streams([], new FunctionError('Allow the study assistant…', 403, 'consent_required'));
    await expect(askAssistant(input, handlers().h)).rejects.toMatchObject({ code: 'consent_required' });
    expect(forgetConsent).toHaveBeenCalled();
  });

  it('“Not now” to consent: nothing is sent', async () => {
    (ensureConsent as jest.Mock).mockRejectedValueOnce(new ConsentDeclinedError('assistant_summary'));
    await expect(askAssistant(input, handlers().h)).rejects.toBeInstanceOf(ConsentDeclinedError);
    expect(streamFunction).not.toHaveBeenCalled();
  });
});
