// Step 6.2: the study assistant's conversation (hooks/useAssistant): the
// earlier questions load, an answer streams into its turn, an error drops
// what was shown (the streaming contract), Retry asks again in place, and the
// recording's time goes along only while this lecture records here.
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { askAssistant, loadConversation, transcribedUpTo, type AskHandlers, type AskInput, type ChatTurn } from '../../services/assistant.service';
import { useAssistant, type AssistantChat } from '../useAssistant';

const mockRecorder = { lectureId: null as string | null, status: 'idle', elapsed: 0 };
jest.mock('../../services/recorder', () => ({
  recorder: {
    state: () => ({ lectureId: mockRecorder.lectureId, status: mockRecorder.status, microphoneLost: false }),
    elapsedMs: () => mockRecorder.elapsed,
    subscribe: () => () => {},
    snapshot: async () => ({ meta: null, chunks: [], transcript: [{ startMs: 0, endMs: 1_750_000, text: 'x' }] }),
  },
}));
jest.mock('../../services/recording.service', () => ({ recordingFlow: { subscribe: () => () => {}, getState: () => ({ saving: null, interrupted: [] }) } }));
jest.mock('../../services/consent.service', () => ({ ConsentDeclinedError: class ConsentDeclinedError extends Error {} }));
jest.mock('../../services/assistant.service', () => {
  const actual = jest.requireActual('../../../supabase/functions/_shared/assistant');
  return {
    QUICK_PROMPTS: actual.QUICK_PROMPTS,
    askAssistant: jest.fn(),
    loadConversation: jest.fn(),
    transcribedUpTo: jest.fn(),
  };
});

/** askAssistant, faked: the test drives each answer through its handlers. */
let pending: { input: AskInput; handlers: AskHandlers; resolve: () => void; reject: (e: Error) => void }[] = [];
const earlier: ChatTurn = { id: 'q0', question: '¿Qué es el ATP?', quickPrompt: null, window: { startMs: 0, endMs: 600_000 }, answer: 'La moneda energética.', status: 'done' };

let chat!: AssistantChat;
function Probe({ id }: { id: string | null }) {
  chat = useAssistant(id);
  return null;
}
const flush = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
});

let root: ReactTestRenderer;
beforeEach(async () => {
  pending = [];
  mockRecorder.lectureId = null;
  mockRecorder.status = 'idle';
  (loadConversation as jest.Mock).mockResolvedValue([earlier]);
  (transcribedUpTo as jest.Mock).mockResolvedValue(1_200_000);
  (askAssistant as jest.Mock).mockImplementation(
    (input: AskInput, handlers: AskHandlers) => new Promise<void>((resolve, reject) => pending.push({ input, handlers, resolve, reject })),
  );
  await act(async () => {
    root = create(<Probe id="lecture-1" />);
  });
  await flush();
});
afterEach(() => act(() => root.unmount()));

describe('useAssistant', () => {
  it('loads the earlier questions and how far the lecture is transcribed', () => {
    expect(chat.status).toBe('ready');
    expect(chat.turns).toEqual([earlier]);
    expect(chat.knownUpToMs).toBe(1_200_000);
    expect(chat.busy).toBe(false);
  });

  it('a quick prompt: its turn streams in (window from meta, pieces, done); after class no time is sent', async () => {
    await act(async () => chat.ask('', 'last_10_min'));
    expect(pending[0].input).toEqual({ lectureId: 'lecture-1', message: '', quickPrompt: 'last_10_min', nowMs: null });
    expect(chat.busy).toBe(true);
    expect(chat.turns[1]).toMatchObject({ question: 'Explain the last 10 min', status: 'streaming', answer: '' });

    await act(async () => {
      pending[0].handlers.meta({ questionId: 'q', answerId: 'a', window: { startMs: 600_000, endMs: 1_200_000 }, knownUpToMs: 1_250_000 });
      pending[0].handlers.delta('La mito');
      pending[0].handlers.delta('condria [15:00].');
    });
    expect(chat.turns[1]).toMatchObject({ window: { startMs: 600_000, endMs: 1_200_000 }, answer: 'La mitocondria [15:00].', status: 'streaming' });
    expect(chat.knownUpToMs).toBe(1_250_000);

    await act(async () => {
      pending[0].handlers.done();
      pending[0].resolve();
    });
    expect(chat.turns[1].status).toBe('done');
    expect(chat.busy).toBe(false);
  });

  it('nothing is sent while an answer streams, nor an empty question; a typed question empties the draft', async () => {
    await act(async () => chat.setDraft('  ¿Qué es la glucólisis?  '));
    await act(async () => chat.ask(chat.draft, null));
    expect(pending[0].input.message).toBe('¿Qué es la glucólisis?');
    expect(chat.draft).toBe('');
    await act(async () => chat.ask('otra', null));
    await act(async () => chat.ask('   ', null));
    expect(pending).toHaveLength(1);
  });

  it('an error drops the pieces already shown and says why; Retry asks the same again in its place', async () => {
    await act(async () => chat.ask('', 'just_said'));
    await act(async () => {
      pending[0].handlers.delta('La mito');
      pending[0].reject(new Error('You have reached today’s limit for the assistant and summaries. Try again tomorrow.'));
    });
    expect(chat.turns[1]).toMatchObject({ status: 'error', answer: '', error: 'You have reached today’s limit for the assistant and summaries. Try again tomorrow.' });

    const failed = chat.turns[1].id;
    await act(async () => chat.retry(failed));
    expect(pending[1].input).toMatchObject({ message: '', quickPrompt: 'just_said' });
    expect(chat.turns).toHaveLength(2);
    expect(chat.turns[1]).toMatchObject({ question: 'What did she just say?', status: 'streaming' });
  });

  it('step 10.2-1b: refused because the allowance is used up: only “Nothing was sent.” under it (why is said above the composer)', async () => {
    await act(async () => chat.ask('¿Y la neurona?', null));
    await act(async () => {
      pending[0].reject(Object.assign(new Error('You’ve used the assistant for now. It grows with each lecture you record and frees up over 30 days.'), { status: 429, code: 'extras_limit' }));
    });
    expect(chat.turns.at(-1)).toMatchObject({ status: 'error', answer: '', error: 'Nothing was sent.' });
  });

  it('while this lecture records here: the recording’s time goes along, and the live transcript counts for “Knows up to”', async () => {
    mockRecorder.lectureId = 'lecture-1';
    mockRecorder.status = 'recording';
    mockRecorder.elapsed = 1_800_000;
    await act(async () => {
      root.update(<Probe id="lecture-2" />);
    });
    await act(async () => {
      root.update(<Probe id="lecture-1" />);
    });
    await flush();
    expect(chat.knownUpToMs).toBe(1_750_000);
    await act(async () => chat.ask('', 'last_10_min'));
    expect(pending.at(-1)!.input.nowMs).toBe(1_800_000);
  });

  it('no lecture: nothing to ask about', async () => {
    await act(async () => {
      root.update(<Probe id={null} />);
    });
    expect(chat.status).toBe('idle');
    await act(async () => chat.ask('hola', null));
    expect(pending).toHaveLength(0);
  });
});
