/**
 * @jest-environment node
 */
// Step 6.1: assistant-chat's answer (supabase/functions/_shared/assistant-answer.ts)
// with the lecture's reads, the saved messages and Claude faked: what is sent
// to Claude, the events the app gets, what is saved to assistant_messages with
// its window, and the cost logged once. No real call is made.
import { stamp, type MarkAt, type MessageRow, type NoteLine, type TimedSegment } from '../../../supabase/functions/_shared/assistant';
import {
  prepareQuestion,
  streamAnswer,
  type AnswerFields,
  type ClaudeStream,
  type FinalMessage,
  type LectureReads,
  type MessageStore,
} from '../../../supabase/functions/_shared/assistant-answer';

const LECTURE = 'd0000000-0000-4000-8000-000000000001';
const MIN = 60_000;
const MODEL = 'claude-sonnet-5-5';

/** 30 min in Spanish: photosynthesis until 20:00, then cellular respiration. */
const segments: TimedSegment[] = Array.from({ length: 60 }, (_, i) => ({
  startMs: i * 30_000,
  endMs: (i + 1) * 30_000,
  text: i < 40 ? `La clorofila del cloroplasto capta la luz (${stamp(i * 30_000)}).` : `La mitocondria produce ATP a partir de glucosa (${stamp(i * 30_000)}).`,
}));
const notes: NoteLine[] = [
  { tMs: 5 * MIN, text: 'fotosíntesis = luz → glucosa' },
  { tMs: 24 * MIN, text: 'ATP = energía' },
];
const marks: MarkAt[] = [{ type: 'confused', level: 7, tMs: 25 * MIN, note: '¿ciclo de Krebs?' }];

function fakeDb(history: MessageRow[] = []) {
  const saved: Record<string, unknown>[] = [];
  const finished: { answerId: string; fields: AnswerFields }[] = [];
  const reads: LectureReads = {
    segments: async () => segments,
    notes: async () => notes,
    marks: async () => marks,
    language: async () => 'es',
    history: async () => history,
  };
  const store: MessageStore = {
    start: async (p) => {
      saved.push(p);
      return { questionId: 'q-1', answerId: 'a-1' };
    },
    finish: async (answerId, fields) => {
      finished.push({ answerId, fields });
    },
  };
  return { reads, store, saved, finished };
}

/** Claude, faked: says `pieces` one by one, then ends as `final` says (or fails). */
function fakeClaude(pieces: string[], end: { stop?: string; fail?: Error } = {}): ClaudeStream & { started: Promise<void> } {
  let listener: (text: string) => void = () => {};
  let current: FinalMessage | undefined;
  const message = (text: string): FinalMessage => ({ model: MODEL, stop_reason: end.stop ?? 'end_turn', content: [{ type: 'thinking' }, { type: 'text', text }] });
  let ready!: () => void;
  const started = new Promise<void>((r) => (ready = r));
  return {
    started,
    on: (_event, fn) => {
      listener = fn;
      ready();
    },
    get currentMessage() {
      return current;
    },
    finalMessage: async () => {
      await started;
      let text = '';
      for (const p of pieces) {
        await Promise.resolve();
        text += p;
        current = message(text);
        listener(p);
      }
      if (end.fail) throw end.fail;
      return message(end.stop === 'refusal' ? '' : text);
    },
  };
}

function run(stream: ClaudeStream, extra: { meta?: boolean; finish?: (f: AnswerFields) => Promise<void> } = {}) {
  const events: { name: string; data: unknown }[] = [];
  const costs: FinalMessage[] = [];
  const logs: string[] = [];
  let closed = 0;
  const done = streamAnswer({
    lectureId: LECTURE,
    stream,
    send: (name, data) => events.push({ name, data }),
    close: () => closed++,
    logCost: async (m) => {
      costs.push(m);
      return { costUsd: 0.0123, tokensInput: 1200, tokensOutput: 300 };
    },
    failure: () => ({ code: 'http_529' }),
    log: (event) => logs.push(event),
    meta: extra.meta === false ? undefined : { questionId: 'q-1', answerId: 'a-1', window: { startMs: 20 * MIN, endMs: 30 * MIN }, knownUpToMs: 30 * MIN },
    finish: extra.finish,
  });
  return { done, events, costs, logs, closed: () => closed };
}

describe('preparing a question', () => {
  it('“Explain the last 10 min” at 30:00: only 20:00–30:00 goes to Claude, in Spanish, and the question is saved with its window first', async () => {
    const db = fakeDb();
    const prepared = await prepareQuestion({ lectureId: LECTURE, message: '', quickPrompt: 'last_10_min', nowMs: 30 * MIN }, db.reads, db.store, MODEL);

    expect(db.saved).toEqual([{ question: 'Explain the last 10 min', quickPrompt: 'last_10_min', askedAtMs: 30 * MIN, window: { startMs: 20 * MIN, endMs: 30 * MIN }, model: MODEL }]);
    expect(prepared.meta).toEqual({ questionId: 'q-1', answerId: 'a-1', window: { startMs: 20 * MIN, endMs: 30 * MIN }, knownUpToMs: 30 * MIN });
    expect(prepared.system).toContain('Always answer in Spanish');
    expect(prepared.messages).toHaveLength(1);
    const sent = prepared.messages[0].content;
    expect(sent).toContain('[20:00] La mitocondria');
    expect(sent).not.toContain('clorofila');
    expect(sent).toContain('[24:00] ATP = energía');
    expect(sent).not.toContain('fotosíntesis');
    expect(sent).toContain('[25:00] confused 7/10: ¿ciclo de Krebs?');
  });

  it('without nowMs the window ends where the transcript does; earlier answers go along as turns', async () => {
    const db = fakeDb([
      { id: 'q0', role: 'user', content: '¿Qué es el ATP?', reply_to: null, status: 'done' },
      { id: 'a0', role: 'assistant', content: 'Es la moneda energética [21:00].', reply_to: 'q0', status: 'done' },
    ]);
    const prepared = await prepareQuestion({ lectureId: LECTURE, message: 'Explícalo más simple', quickPrompt: null, nowMs: null }, db.reads, db.store, MODEL);
    expect(prepared.meta.window).toEqual({ startMs: 0, endMs: 30 * MIN });
    expect(db.saved[0]).toMatchObject({ question: 'Explícalo más simple', quickPrompt: null, askedAtMs: 30 * MIN });
    expect(prepared.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(prepared.messages[0].content).toBe('¿Qué es el ATP?');
    // A typed question: the whole lecture.
    expect(prepared.messages[2].content).toContain('[0:00] La clorofila');
  });

  it('a read that fails stops before anything is saved (assistant-chat answers 500)', async () => {
    const db = fakeDb();
    db.reads.marks = async () => {
      throw new Error('denied');
    };
    await expect(prepareQuestion({ lectureId: LECTURE, message: 'q', quickPrompt: null, nowMs: null }, db.reads, db.store, MODEL)).rejects.toThrow('denied');
    expect(db.saved).toEqual([]);
  });
});

describe('streaming the answer', () => {
  it('meta, the pieces, then done; the answer saved as done with its text; the cost logged once', async () => {
    const finished: AnswerFields[] = [];
    const r = run(fakeClaude(['La mitocondria ', 'produce ATP ', '[25:30].']), { finish: async (f) => void finished.push(f) });
    await r.done;
    expect(r.events.map((e) => e.name)).toEqual(['meta', 'delta', 'delta', 'delta', 'done']);
    expect(r.events[0].data).toMatchObject({ answerId: 'a-1', window: { startMs: 20 * MIN, endMs: 30 * MIN } });
    expect(r.events.filter((e) => e.name === 'delta').map((e) => (e.data as { text: string }).text).join('')).toBe('La mitocondria produce ATP [25:30].');
    expect(r.events.at(-1)!.data).toEqual({ model: MODEL, stopReason: 'end_turn', usage: { input: 1200, output: 300 }, costUsd: 0.0123 });
    expect(finished).toEqual([{ content: 'La mitocondria produce ATP [25:30].', status: 'done', model: MODEL }]);
    expect(r.costs).toHaveLength(1);
    expect(r.closed()).toBe(1);
  });

  it('Claude failing mid-answer: an error event, the answer saved as error with what was written, the partial cost logged', async () => {
    const finished: AnswerFields[] = [];
    const r = run(fakeClaude(['La mito'], { fail: new Error('overloaded') }), { finish: async (f) => void finished.push(f) });
    await r.done;
    expect(r.events.map((e) => e.name)).toEqual(['meta', 'delta', 'error']);
    expect(r.events.at(-1)!.data).toMatchObject({ code: 'assistant_failed' });
    expect(finished).toEqual([{ content: 'La mito', status: 'error', model: MODEL }]);
    expect(r.costs).toHaveLength(1);
    expect(r.logs).toContain('claude_failed');
  });

  it('a refusal: an error event and the answer saved as error, still logged', async () => {
    const finished: AnswerFields[] = [];
    const r = run(fakeClaude([], { stop: 'refusal' }), { finish: async (f) => void finished.push(f) });
    await r.done;
    expect(r.events.map((e) => e.name)).toEqual(['meta', 'error']);
    expect(r.events.at(-1)!.data).toMatchObject({ code: 'refused' });
    expect(finished).toEqual([{ content: '', status: 'error', model: MODEL }]);
    expect(r.costs).toHaveLength(1);
  });

  it('saving the answer failing never stops the answer reaching the student', async () => {
    const r = run(fakeClaude(['Hola']), {
      finish: async () => {
        throw new Error('db down');
      },
    });
    await r.done;
    expect(r.events.map((e) => e.name)).toEqual(['meta', 'delta', 'done']);
    expect(r.logs).toContain('save_failed');
  });

  it('clarify: no meta and nothing saved, the same pieces and done', async () => {
    const r = run(fakeClaude(['Un tutor ', 'explica.']), { meta: false });
    await r.done;
    expect(r.events.map((e) => e.name)).toEqual(['delta', 'delta', 'done']);
  });
});
