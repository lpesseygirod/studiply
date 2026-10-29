import { deleteScribeTranscript, transcribeScribe } from '../../../supabase/functions/_shared/elevenlabs';
import { transcribe } from '../../../supabase/functions/_shared/openai';

// What transcribe-chunk sends to each provider and how it reads the answer;
// fetch is mocked, so nothing leaves the machine and no key is needed.

const audio = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' });
const fetchMock = jest.fn();

function answer(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, body: null } as unknown as Response;
}

function sent(call = 0) {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  const form = init.body as FormData;
  const fields = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string'));
  return { url, init, form, fields };
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
  // The retry waits (1 s, 2 s) pass at once
  jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
    fn();
    return 0;
  }) as unknown as typeof setTimeout);
});

afterEach(() => jest.restoreAllMocks());

describe('transcribeScribe', () => {
  it('asks Scribe v2 for word times only, with the lecture language', async () => {
    const body = { language_code: 'spa', words: [], transcription_id: 't1' };
    fetchMock.mockResolvedValue(answer(200, body));

    await expect(transcribeScribe('key', audio, '0001.m4a', 'es')).resolves.toEqual({ ok: true, answer: body });
    const { url, init, form, fields } = sent();
    expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect(init.headers).toEqual({ 'xi-api-key': 'key' });
    expect(fields).toEqual({
      model_id: 'scribe_v2',
      timestamps_granularity: 'word',
      tag_audio_events: 'false',
      diarize: 'false',
      language_code: 'es',
    });
    expect((form.get('file') as File).name).toBe('0001.m4a');
  });

  it('lets Scribe detect the language when the lecture has none', async () => {
    fetchMock.mockResolvedValue(answer(200, { words: [] }));
    await transcribeScribe('key', audio, '0001.m4a', null);
    expect(sent().fields).not.toHaveProperty('language_code');
  });

  it('retries server errors and rate limits twice, with a new form each time', async () => {
    fetchMock
      .mockResolvedValueOnce(answer(503, {}))
      .mockResolvedValueOnce(answer(429, { detail: { status: 'too_many_concurrent_requests' } }))
      .mockResolvedValueOnce(answer(200, { words: [] }));
    await expect(transcribeScribe('key', audio, 'a.webm', null)).resolves.toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sent(0).form).not.toBe(sent(2).form);
  });

  it('gives up after three tries and reports ElevenLabs’ code', async () => {
    fetchMock.mockResolvedValue(answer(500, { detail: { status: 'internal_error', message: 'x' } }));
    await expect(transcribeScribe('key', audio, 'a.m4a', null)).resolves.toEqual({
      ok: false,
      status: 500,
      code: 'internal_error',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fails at once on a wrong key or a refused file', async () => {
    fetchMock.mockResolvedValueOnce(answer(401, { detail: { status: 'invalid_api_key' } }));
    await expect(transcribeScribe('bad', audio, 'a.m4a', null)).resolves.toEqual({
      ok: false,
      status: 401,
      code: 'invalid_api_key',
    });
    fetchMock.mockResolvedValueOnce(answer(422, { detail: [{ type: 'value_error', msg: 'bad file' }] }));
    await expect(transcribeScribe('key', audio, 'a.m4a', null)).resolves.toEqual({
      ok: false,
      status: 422,
      code: 'value_error',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a lost connection but not a timeout', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(answer(200, { words: [] }));
    await expect(transcribeScribe('key', audio, 'a.m4a', null)).resolves.toMatchObject({ ok: true });

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    await expect(transcribeScribe('key', audio, 'a.m4a', null)).resolves.toEqual({ ok: false, status: 0, code: 'timeout' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('deleteScribeTranscript', () => {
  it('deletes ElevenLabs’ copy of the transcript', async () => {
    fetchMock.mockResolvedValue(answer(200, {}));
    await expect(deleteScribeTranscript('key', 'abc/1')).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text/transcripts/abc%2F1');
    expect(init).toMatchObject({ method: 'DELETE', headers: { 'xi-api-key': 'key' } });
  });

  it('says so when the copy could not be deleted, without throwing', async () => {
    fetchMock.mockResolvedValueOnce(answer(404, {}));
    await expect(deleteScribeTranscript('key', 't1')).resolves.toBe(false);
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(deleteScribeTranscript('key', 't1')).resolves.toBe(false);
  });
});

describe('transcribe (whisper-1)', () => {
  it('still asks for verbose_json with segment times, as before', async () => {
    fetchMock.mockResolvedValue(answer(200, { duration: 1, segments: [] }));
    await expect(transcribe('key', audio, '0001.m4a', 'en')).resolves.toEqual({
      ok: true,
      answer: { duration: 1, segments: [] },
    });
    const { url, init, fields } = sent();
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(init.headers).toEqual({ Authorization: 'Bearer key' });
    expect(fields).toEqual({
      model: 'whisper-1',
      response_format: 'verbose_json',
      'timestamp_granularities[]': 'segment',
      language: 'en',
    });
  });

  it('reports OpenAI’s error code', async () => {
    fetchMock.mockResolvedValue(answer(400, { error: { code: 'invalid_value', type: 'invalid_request_error' } }));
    await expect(transcribe('key', audio, 'a.m4a', null)).resolves.toEqual({ ok: false, status: 400, code: 'invalid_value' });
  });
});
