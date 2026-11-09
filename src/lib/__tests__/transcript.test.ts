import { CONSENT_POLICY_VERSION, DAILY_LIMIT_SECONDS } from '../../../supabase/functions/_shared/policy';
import {
  TRANSCRIBE_MODELS,
  costUsd,
  fromScribe,
  fromWhisper,
  languageCode,
  toSegments,
  transcribeProvider,
  validateBody,
  wordsToSegments,
  type ScribeAnswer,
} from '../../../supabase/functions/_shared/transcript';

const USER = 'aaaaaaaa-0000-4000-8000-000000000000';
const LECTURE = 'd0000000-0000-4000-8000-000000000001';
const body = { lectureId: LECTURE, seq: 0, storagePath: `${USER}/${LECTURE}/0000.m4a`, startMs: 0 };

describe('validateBody', () => {
  it('accepts a chunk in the caller’s own folder', () => {
    expect(validateBody(body, USER)).toEqual({ ok: true, value: body });
  });

  it('refuses audio in someone else’s folder with 403', () => {
    const other = { ...body, storagePath: `bbbbbbbb-0000-4000-8000-000000000000/${LECTURE}/0000.m4a` };
    expect(validateBody(other, USER)).toMatchObject({ ok: false, status: 403, code: 'forbidden_path' });
  });

  it.each([
    ['no body', null],
    ['a lecture id that is not a uuid', { ...body, lectureId: 'lecture-1' }],
    ['a negative seq', { ...body, seq: -1 }],
    ['a fractional start time', { ...body, startMs: 1.5 }],
    ['a start time as text', { ...body, startMs: '0' }],
    ['an empty path', { ...body, storagePath: '' }],
    ['a path with ..', { ...body, storagePath: `${USER}/../x.m4a` }],
    ['a path with an empty segment', { ...body, storagePath: `${USER}//x.m4a` }],
    ['only the user folder', { ...body, storagePath: USER }],
  ])('refuses %s with 400', (_label, value) => {
    expect(validateBody(value, USER)).toMatchObject({ ok: false, status: 400, code: 'invalid_request' });
  });
});

describe('toSegments', () => {
  it('shifts Whisper’s seconds by the chunk start and stores milliseconds', () => {
    const rows = toSegments(
      {
        duration: 9.5,
        segments: [
          { start: 0, end: 3.2, text: ' Supply meets demand. ', avg_logprob: -0.2, no_speech_prob: 0.01 },
          { start: 6.04, end: 9.5, text: 'Prices adjust.', avg_logprob: 0, no_speech_prob: 0.01 },
        ],
      },
      60_000,
    );
    expect(rows).toEqual([
      { start_ms: 60_000, end_ms: 63_200, text: 'Supply meets demand.', confidence: Math.exp(-0.2) },
      { start_ms: 66_040, end_ms: 69_500, text: 'Prices adjust.', confidence: 1 },
    ]);
  });

  it('drops empty segments and the ones Whisper invents during silence', () => {
    const rows = toSegments(
      {
        duration: 30,
        segments: [
          { start: 0, end: 2, text: '   ' },
          { start: 2, end: 5, text: 'Real speech.', avg_logprob: -0.3, no_speech_prob: 0.7 },
          { start: 20, end: 30, text: 'Thanks for watching!', avg_logprob: -1.4, no_speech_prob: 0.9 },
        ],
      },
      0,
    );
    expect(rows.map((r) => r.text)).toEqual(['Real speech.']);
  });

  it('keeps times inside the chunk and never ends before it starts', () => {
    const [row] = toSegments({ duration: 10, segments: [{ start: 9.8, end: 9.1, text: 'x' }] }, 1000);
    expect(row).toMatchObject({ start_ms: 10_800, end_ms: 10_800 });
    const [late] = toSegments({ duration: 10, segments: [{ start: 9, end: 12.3, text: 'y' }] }, 0);
    expect(late).toMatchObject({ start_ms: 9000, end_ms: 10_000 });
  });

  it('makes one segment for the whole chunk when Whisper returns text without segments', () => {
    expect(toSegments({ duration: 4, text: ' Hello. ' }, 30_000)).toEqual([
      { start_ms: 30_000, end_ms: 34_000, text: 'Hello.', confidence: null },
    ]);
    expect(toSegments({ duration: 4, text: '' }, 0)).toEqual([]);
  });
});

/** Scribe's word list for a sentence: words with a space between, like ElevenLabs sends. */
function words(...items: [text: string, start: number, end: number, logprob?: number][]): ScribeAnswer['words'] {
  return items.flatMap(([text, start, end, logprob = 0], i) => [
    ...(i ? [{ text: ' ', type: 'spacing' as const, start: items[i - 1][2], end: start }] : []),
    { text, type: 'word' as const, start, end, logprob },
  ]);
}

describe('wordsToSegments', () => {
  it('makes one segment per sentence, shifted by the chunk start', () => {
    const rows = wordsToSegments(
      {
        audio_duration_secs: 10,
        words: words(['La', 0.1, 0.3], ['oferta', 0.35, 0.8], ['sube.', 0.85, 1.2], ['¿Por', 1.5, 1.7], ['qué?', 1.75, 2.1]),
      },
      60_000,
    );
    expect(rows).toEqual([
      { start_ms: 60_100, end_ms: 61_200, text: 'La oferta sube.', confidence: 1 },
      { start_ms: 61_500, end_ms: 62_100, text: '¿Por qué?', confidence: 1 },
    ]);
  });

  it('ends a sentence at ! … and closing quotes too', () => {
    const rows = wordsToSegments(
      { words: words(['Look!', 0, 0.5], ['Well…', 0.6, 1], ['He', 1.1, 1.2], ['said', 1.2, 1.4], ['“stop.”', 1.4, 1.9], ['Then', 2, 2.2]) },
      0,
    );
    expect(rows.map((r) => r.text)).toEqual(['Look!', 'Well…', 'He said “stop.”', 'Then']);
  });

  it('starts a new segment after a pause of a second or more', () => {
    const rows = wordsToSegments({ words: words(['so', 0, 0.4], ['the', 0.5, 0.6], ['market', 1.6, 2]) }, 0);
    expect(rows).toMatchObject([
      { start_ms: 0, end_ms: 600, text: 'so the' },
      { start_ms: 1600, end_ms: 2000, text: 'market' },
    ]);
  });

  it('cuts a sentence that runs past 30 seconds', () => {
    const long = Array.from({ length: 40 }, (_, i) => [`w${i}`, i, i + 0.9] as [string, number, number]);
    const rows = wordsToSegments({ words: words(...long) }, 0);
    expect(rows[0]).toMatchObject({ start_ms: 0, end_ms: 30_900 });
    expect(rows[0].text.split(' ')).toHaveLength(31);
    expect(rows[1]).toMatchObject({ start_ms: 31_000, end_ms: 39_900 });
  });

  it('leaves out sounds Scribe tags and averages the word probabilities', () => {
    const rows = wordsToSegments(
      {
        words: [
          { text: '(laughter)', type: 'audio_event', start: 0, end: 1 },
          { text: ' ', type: 'spacing', start: 1, end: 1.1 },
          { text: 'Yes', type: 'word', start: 1.1, end: 1.4, logprob: -0.2 },
          { text: ' ', type: 'spacing', start: 1.4, end: 1.5 },
          { text: 'indeed.', type: 'word', start: 1.5, end: 2, logprob: -0.6 },
        ],
      },
      0,
    );
    expect(rows).toEqual([{ start_ms: 1100, end_ms: 2000, text: 'Yes indeed.', confidence: Math.exp(-0.4) }]);
  });

  it('keeps times inside the chunk and gives untimed words the time of the sentence before', () => {
    const rows = wordsToSegments(
      {
        audio_duration_secs: 5,
        words: [
          { text: 'Done.', type: 'word', start: 4, end: 6.2 },
          { text: ' ', type: 'spacing' },
          { text: 'Uh.', type: 'word', start: null, end: null },
        ],
      },
      1000,
    );
    expect(rows).toEqual([
      { start_ms: 5000, end_ms: 6000, text: 'Done.', confidence: null },
      { start_ms: 6000, end_ms: 6000, text: 'Uh.', confidence: null },
    ]);
  });

  it('makes one segment for the whole chunk when there are no words, and none for silence', () => {
    expect(wordsToSegments({ audio_duration_secs: 4, text: ' Hola. ' }, 30_000)).toEqual([
      { start_ms: 30_000, end_ms: 34_000, text: 'Hola.', confidence: null },
    ]);
    expect(wordsToSegments({ audio_duration_secs: 4, text: '', words: [] }, 0)).toEqual([]);
  });
});

describe('fromWhisper and fromScribe', () => {
  it('turn either answer into the same shape', () => {
    expect(fromWhisper({ duration: 9.876, language: 'spanish', segments: [{ start: 0, end: 1, text: 'Hola.' }] }, 0)).toEqual({
      audioSeconds: 9.88,
      language: 'es',
      segments: [{ start_ms: 0, end_ms: 1000, text: 'Hola.', confidence: null }],
    });
    expect(
      fromScribe({ audio_duration_secs: 9.876, language_code: 'spa', language_probability: 0.97, words: words(['Hola.', 0, 1]) }, 0),
    ).toEqual({
      audioSeconds: 9.88,
      language: 'es',
      segments: [{ start_ms: 0, end_ms: 1000, text: 'Hola.', confidence: 1 }],
    });
  });

  it('takes the chunk length from the last word when ElevenLabs gives none', () => {
    expect(fromScribe({ words: words(['Hi', 0, 0.5], ['there.', 0.6, 2.345]) }, 0).audioSeconds).toBe(2.35);
  });

  it('ignores a language Scribe isn’t sure of', () => {
    expect(fromScribe({ language_code: 'eng', language_probability: 0.3, words: [] }, 0).language).toBeNull();
    expect(fromScribe({ language_code: 'eng', language_probability: 0.5, words: [] }, 0).language).toBe('en');
  });
});

describe('transcribeProvider', () => {
  it('is ElevenLabs unless the server asks for whisper-1 (the consent text names ElevenLabs)', () => {
    expect(transcribeProvider(undefined)).toBe('elevenlabs');
    expect(transcribeProvider('')).toBe('elevenlabs');
    expect(transcribeProvider('openai')).toBe('openai');
    expect(transcribeProvider(' ElevenLabs ')).toBe('elevenlabs');
  });

  it('refuses a name it doesn’t know instead of falling back', () => {
    expect(transcribeProvider('scribe')).toBeNull();
  });
});

describe('costUsd', () => {
  it('charges whisper-1’s per-minute price, rounded to 6 decimals', () => {
    expect(costUsd(60)).toBe(0.006);
    expect(costUsd(30)).toBe(0.003);
    expect(costUsd(7.33)).toBe(0.000733);
  });

  it('charges Scribe v2’s $0.22 an hour', () => {
    expect(costUsd(3600, 'elevenlabs')).toBe(0.22);
    expect(costUsd(60, 'elevenlabs')).toBe(0.003667);
    expect(costUsd(1200, 'openai')).toBe(0.12);
  });
});

describe('languageCode', () => {
  it('turns Whisper’s language names into ISO codes', () => {
    expect(languageCode('english')).toBe('en');
    expect(languageCode('Spanish')).toBe('es');
    expect(languageCode('catalan')).toBe('ca');
    expect(languageCode('fr')).toBe('fr');
  });

  it('turns ElevenLabs’ three-letter codes into the same ISO codes', () => {
    expect(languageCode('spa')).toBe('es');
    expect(languageCode('ENG')).toBe('en');
    expect(languageCode('cmn')).toBe('zh');
    expect(languageCode('yue')).toBe('yue');
    expect(languageCode('xyz')).toBeNull();
  });

  it('returns null when nothing usable was detected', () => {
    expect(languageCode(undefined)).toBeNull();
    expect(languageCode('klingon')).toBeNull();
  });
});

describe('constants', () => {
  it('match the decisions in docs/PROGRESS.md', () => {
    expect(DAILY_LIMIT_SECONDS).toBe(21_600);
    // Step 10.1: the store's consent screen (everyone asked again).
    expect(CONSENT_POLICY_VERSION).toBe('2026-11-store-1');
    expect(TRANSCRIBE_MODELS.openai.model).toBe('whisper-1');
    expect(TRANSCRIBE_MODELS.elevenlabs.model).toBe('scribe_v2');
  });
});
