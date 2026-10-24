import {
  CONSENT_POLICY_VERSION,
  DAILY_LIMIT_SECONDS,
  costUsd,
  languageCode,
  toSegments,
  validateBody,
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

describe('costUsd', () => {
  it('charges whisper-1’s per-minute price, rounded to 6 decimals', () => {
    expect(costUsd(60)).toBe(0.006);
    expect(costUsd(30)).toBe(0.003);
    expect(costUsd(7.33)).toBe(0.000733);
  });
});

describe('languageCode', () => {
  it('turns Whisper’s language names into ISO codes', () => {
    expect(languageCode('english')).toBe('en');
    expect(languageCode('Spanish')).toBe('es');
    expect(languageCode('catalan')).toBe('ca');
    expect(languageCode('fr')).toBe('fr');
  });

  it('returns null when nothing usable was detected', () => {
    expect(languageCode(undefined)).toBeNull();
    expect(languageCode('klingon')).toBeNull();
  });
});

describe('constants', () => {
  it('match the decisions in docs/PROGRESS.md', () => {
    expect(DAILY_LIMIT_SECONDS).toBe(21_600);
    expect(CONSENT_POLICY_VERSION).toBe('dev-2026-10');
  });
});
