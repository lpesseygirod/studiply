import {
  cutoffFor,
  dueLectures,
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

  it('recordings: each due lecture once, also one whose files are already gone; its null path is not removed', () => {
    const plan = [
      { lecture_id: 'l1', bucket: 'audio-chunks', path: 'u/l1/0000.m4a' },
      { lecture_id: 'l1', bucket: 'audio-chunks', path: 'u/l1/0001.m4a' },
      { lecture_id: 'l2', bucket: 'audio-chunks', path: null },
    ];
    expect(dueLectures(plan)).toEqual(['l1', 'l2']);
    expect(removalBatches(plan)).toEqual([{ bucket: 'audio-chunks', paths: ['u/l1/0000.m4a', 'u/l1/0001.m4a'] }]);
    expect(dueLectures([])).toEqual([]);
  });

  it('accepts only the exact secret, and never an empty one', () => {
    expect(sameSecret('s3cret-value', 's3cret-value')).toBe(true);
    expect(sameSecret('s3cret-valuf', 's3cret-value')).toBe(false);
    expect(sameSecret('s3cret', 's3cret-value')).toBe(false);
    expect(sameSecret('', '')).toBe(false);
  });
});
