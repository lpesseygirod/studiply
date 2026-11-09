// Step 10.1b-3: what the app says about a lecture's recording, and the default choice.
import { asAudioRetention, AUDIO_RETENTION_CHOICES, audioStatusLine, DEFAULT_AUDIO_RETENTION } from '../audioRetention';

describe('audioStatusLine', () => {
  it('deleted: when', () => {
    // Midday UTC: the same day in every time zone the tests run in.
    expect(audioStatusLine({ retention: 'delete_3_days', deleteAfter: null, deletedAt: '2026-11-14T12:00:00Z' })).toBe('Deleted on 14 Nov 2026');
    expect(audioStatusLine({ retention: 'delete_now', deleteAfter: null, deletedAt: '2026-11-09T12:00:00Z' })).toBe('Deleted on 9 Nov 2026');
  });

  it('Delete in 3 days: the server’s date, or when it will have one', () => {
    expect(audioStatusLine({ retention: 'delete_3_days', deleteAfter: '2026-11-17T12:00:00Z', deletedAt: null })).toBe('Deletes on 17 Nov 2026');
    expect(audioStatusLine({ retention: 'delete_3_days', deleteAfter: null, deletedAt: null })).toBe('Deletes 3 days after it is transcribed');
  });

  it('kept', () => {
    expect(audioStatusLine({ retention: 'keep_permanently', deleteAfter: null, deletedAt: null })).toBe('Kept permanently');
    expect(audioStatusLine({ retention: 'delete_manually', deleteAfter: null, deletedAt: null })).toBe('Kept until you delete it');
  });
});

describe('the choices', () => {
  it('Delete in 3 days is the default, listed first', () => {
    expect(DEFAULT_AUDIO_RETENTION).toBe('delete_3_days');
    expect(AUDIO_RETENTION_CHOICES[0].value).toBe('delete_3_days');
    expect(AUDIO_RETENTION_CHOICES.map((c) => c.value).sort()).toEqual(['delete_3_days', 'delete_manually', 'delete_now', 'keep_permanently']);
  });

  it('reads stored values, and nothing else', () => {
    expect(asAudioRetention('keep_permanently')).toBe('keep_permanently');
    expect(asAudioRetention('forever')).toBeNull();
    expect(asAudioRetention(undefined)).toBeNull();
  });
});
