import { TIMESTAMP_CHIP } from './schema/timestampChip';
import type { DocJSON } from './types';

/**
 * A lecture's Transcript tab, made once from its transcript: one
 * paragraph per segment, starting with its timestamp chip, origin `media`.
 * Each block's id comes from the segment's start time, so two devices
 * making it at the same moment make the same blocks (the merge then sees
 * nothing to change). After that the student can correct it like any
 * document; Search keeps reading transcript_segments.
 */
export function transcriptDoc(segments: { start: number; text: string }[]): DocJSON {
  const seen = new Set<number>();
  const content = segments
    .filter((s) => typeof s.start === 'number' && typeof s.text === 'string' && s.text.trim())
    .map((s) => {
      let ms = Math.max(0, Math.round(s.start * 1000));
      while (seen.has(ms)) ms++;
      seen.add(ms);
      return {
        type: 'paragraph',
        attrs: { blockId: `t-${ms}`, origin: 'media', editedAt: null },
        content: [
          { type: TIMESTAMP_CHIP, attrs: { ms } },
          { type: 'text', text: ` ${s.text.trim()}` },
        ],
      };
    });
  return { type: 'doc', content };
}
