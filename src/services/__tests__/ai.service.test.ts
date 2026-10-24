// How ai.service reaches the Edge Functions: consent first, only the
// chunks that still need it, and the development-only simulation.
import { callFunction, callStreamingFunction } from '../../lib/functions';
import { networkError, errorFromResponse } from '../../lib/functionResult';
import { ensureConsent } from '../consent.service';
import { getAudioChunks } from '../source-file.service';
import { createTranscript, getTranscriptBySession } from '../transcript.service';
import { clarifyContent, generateNotes, transcribeAudio } from '../ai.service';

jest.mock('../../lib/functions', () => ({ callFunction: jest.fn(), callStreamingFunction: jest.fn() }));
jest.mock('../consent.service', () => ({ ensureConsent: jest.fn(async () => {}) }));
jest.mock('../source-file.service', () => ({ getAudioChunks: jest.fn() }));
jest.mock('../transcript.service', () => ({ getTranscriptBySession: jest.fn(), createTranscript: jest.fn() }));

const transcript = {
  id: 'l1',
  user_id: 'u',
  session_id: 'l1',
  language: 'en',
  full_text: 'Hello world.',
  segments: [{ id: 0, start: 0, end: 2.5, text: 'Hello world.' }],
  confidence_score: null,
  created_at: '2026-10-24T10:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_MOCK_AI;
  jest.mocked(getTranscriptBySession).mockResolvedValue(transcript);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('transcribeAudio', () => {
  it('asks for consent, then transcribes only the chunks not done yet, in order', async () => {
    jest.mocked(getAudioChunks).mockResolvedValue([
      { seq: 0, startMs: 0, storagePath: 'u/l1/0000.m4a', transcribed: true },
      { seq: 1, startMs: 1_200_000, storagePath: 'u/l1/0001.m4a', transcribed: false },
    ]);
    const progress: [number, number][] = [];

    const result = await transcribeAudio({ lectureId: 'l1', onProgress: (d, t) => progress.push([d, t]) });

    expect(ensureConsent).toHaveBeenCalledWith('transcription');
    expect(jest.mocked(callFunction).mock.calls).toEqual([
      ['transcribe-chunk', { lectureId: 'l1', seq: 1, storagePath: 'u/l1/0001.m4a', startMs: 1_200_000 }],
    ]);
    expect(progress).toEqual([[1, 2], [2, 2]]);
    expect(result).toEqual({ text: 'Hello world.', language: 'en', duration: 2.5, segments: transcript.segments });
  });

  it('asks nothing and sends nothing when everything is transcribed', async () => {
    jest.mocked(getAudioChunks).mockResolvedValue([{ seq: 0, startMs: 0, storagePath: 'p', transcribed: true }]);
    await transcribeAudio({ lectureId: 'l1' });
    expect(ensureConsent).not.toHaveBeenCalled();
    expect(callFunction).not.toHaveBeenCalled();
  });

  it('says so when there is no recording', async () => {
    jest.mocked(getAudioChunks).mockResolvedValue([]);
    jest.mocked(getTranscriptBySession).mockResolvedValue(null);
    await expect(transcribeAudio({ lectureId: 'l1' })).rejects.toThrow('No recording was found');
  });

  it('passes the server’s message on (e.g. the daily limit)', async () => {
    jest.mocked(getAudioChunks).mockResolvedValue([{ seq: 0, startMs: 0, storagePath: 'p', transcribed: false }]);
    jest.mocked(callFunction).mockRejectedValue(errorFromResponse(429, '{"code":"daily_limit","error":"Try again tomorrow."}'));
    await expect(transcribeAudio({ lectureId: 'l1' })).rejects.toThrow('Try again tomorrow.');
    expect(createTranscript).not.toHaveBeenCalled();
  });
});

describe('generateNotes', () => {
  const note = { suggestedTitle: 'T', summary: 'S', keyConcepts: [], formulas: [], definitions: [], tags: [], unclearParts: [], transcriptPreview: '' };

  it('asks for assistant and images consent when photos or PDFs go along', async () => {
    jest.mocked(callFunction).mockResolvedValue({ note });

    const result = await generateNotes({ lectureId: 'l1', summaryLevel: 'extra', title: 'Week 3', recordingMode: 'discussion', includeMedia: true });

    expect(ensureConsent).toHaveBeenCalledWith('assistant_summary', 'images');
    expect(callFunction).toHaveBeenCalledWith('summarize', {
      lectureId: 'l1',
      task: 'notes',
      summaryLevel: 'extra',
      recordingMode: 'discussion',
      title: 'Week 3',
      includeMedia: true,
    });
    expect(result).toBe(note);
  });

  it('asks only for assistant consent without media', async () => {
    jest.mocked(callFunction).mockResolvedValue({ note });
    await generateNotes({ lectureId: 'l1', summaryLevel: 'standard', title: 'T' });
    expect(ensureConsent).toHaveBeenCalledWith('assistant_summary');
  });
});

describe('clarifyContent', () => {
  it('sends the summary and parts in clarify mode and returns the whole answer', async () => {
    jest.mocked(callStreamingFunction).mockResolvedValue({ text: 'Explained.', done: {} as never });
    await expect(clarifyContent({ lectureId: 'l1', originalSummary: 'S', highlightedParts: ['a'] })).resolves.toBe('Explained.');
    expect(callStreamingFunction).toHaveBeenCalledWith('assistant-chat', { lectureId: 'l1', mode: 'clarify', highlightedParts: ['a'], summary: 'S' });
  });
});

describe('simulated pipeline (development only)', () => {
  it('with EXPO_PUBLIC_MOCK_AI=1 sends nothing and asks nothing', async () => {
    process.env.EXPO_PUBLIC_MOCK_AI = '1';
    const note = await generateNotes({ lectureId: 'l1', summaryLevel: 'minimal', title: 'Week 3' });
    expect(note.summary).toContain('Simulated');
    expect(ensureConsent).not.toHaveBeenCalled();
    expect(callFunction).not.toHaveBeenCalled();
  });

  it('falls back when the functions cannot be reached', async () => {
    jest.mocked(callStreamingFunction).mockRejectedValue(networkError());
    await expect(clarifyContent({ lectureId: 'l1', originalSummary: 'S', highlightedParts: ['a'] })).resolves.toContain('[Simulated clarification]');
  });

  it('never hides a real error behind the simulation', async () => {
    jest.mocked(callStreamingFunction).mockRejectedValue(errorFromResponse(403, '{"code":"consent_required","error":"Allow it first."}'));
    await expect(clarifyContent({ lectureId: 'l1', originalSummary: 'S', highlightedParts: ['a'] })).rejects.toThrow('Allow it first.');
  });

  it('writes a simulated transcript once, and reuses an existing one', async () => {
    process.env.EXPO_PUBLIC_MOCK_AI = '1';
    jest.mocked(getTranscriptBySession).mockResolvedValueOnce(null);
    jest.mocked(createTranscript).mockResolvedValue(transcript);
    await transcribeAudio({ lectureId: 'l1' });
    expect(createTranscript).toHaveBeenCalledTimes(1);
    expect(getAudioChunks).not.toHaveBeenCalled();

    await transcribeAudio({ lectureId: 'l1' });
    expect(createTranscript).toHaveBeenCalledTimes(1);
  });
});
