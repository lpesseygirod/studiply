import {
  cutoffFor,
  REMOVE_BATCH,
  removalBatches,
  RETENTION_DAYS,
  sameSecret,
} from '../../../supabase/functions/_shared/purge';
import { RETENTION_DAYS as APP_RETENTION_DAYS } from '../../utils/trash';

describe('purge-trash rules', () => {
  it('keeps the same 30 days the app shows', () => {
    expect(RETENTION_DAYS).toBe(APP_RETENTION_DAYS);
    expect(cutoffFor(new Date('2026-11-30T03:15:00Z'))).toBe('2026-10-31T03:15:00.000Z');
  });

  it('removes each object once, per bucket, in batches', () => {
    const plan = [
      { bucket: 'photos', path: 'u/a/1.jpg' },
      { bucket: 'audio-chunks', path: 'u/a/0000.m4a' },
      { bucket: 'photos', path: 'u/a/1.jpg' },
      { bucket: 'photos', path: '' },
    ];
    expect(removalBatches(plan)).toEqual([
      { bucket: 'photos', paths: ['u/a/1.jpg'] },
      { bucket: 'audio-chunks', paths: ['u/a/0000.m4a'] },
    ]);

    const many = Array.from({ length: REMOVE_BATCH + 1 }, (_, i) => ({ bucket: 'slides', path: `u/f/${i}.pdf` }));
    expect(removalBatches(many).map((b) => b.paths.length)).toEqual([REMOVE_BATCH, 1]);
    expect(removalBatches([])).toEqual([]);
  });

  it('accepts only the exact secret, and never an empty one', () => {
    expect(sameSecret('s3cret-value', 's3cret-value')).toBe(true);
    expect(sameSecret('s3cret-valuf', 's3cret-value')).toBe(false);
    expect(sameSecret('s3cret', 's3cret-value')).toBe(false);
    expect(sameSecret('', '')).toBe(false);
  });
});
