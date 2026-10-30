import type { PresetKey, SliderKey, SummaryPlan } from '../../../supabase/functions/_shared/summary-plan';

/**
 * The 10 sliders' names and ends (DESIGN.md, Stop & summarize; SUMMARY-SPEC
 * The 10 sliders). The laptop shows "1 · start from zero" / "10 · I already
 * know it"; the iPhone the short words under the track (docs/design
 * iphone-05: "start from zero" / "I know it").
 */
export const SLIDER_LABELS: Record<SliderKey, { name: string; low: string; high: string; shortLow: string; shortHigh: string }> = {
  startingPoint: { name: 'Your starting point', low: 'start from zero', high: 'I already know it', shortLow: 'start from zero', shortHigh: 'I know it' },
  length: { name: 'Length', low: 'one page', high: 'everything', shortLow: 'one page', shortHigh: 'everything' },
  depth: { name: 'Explanation depth', low: 'just the facts', high: 'every why and how', shortLow: 'just facts', shortHigh: 'every why' },
  examples: { name: 'Examples', low: 'none', high: 'one per idea', shortLow: 'none', shortHigh: 'one per idea' },
  visuals: { name: 'Visuals & graphs', low: 'text only', high: 'visual-heavy', shortLow: 'text only', shortHigh: 'visual-heavy' },
  examFocus: { name: 'Exam focus', low: 'understand it', high: 'only what’s on the exam', shortLow: 'understand it', shortHigh: 'exam only' },
  selfTest: { name: 'Self-test questions', low: 'none', high: 'full practice set', shortLow: 'none', shortHigh: 'full set' },
  language: { name: 'Language', low: 'plain words', high: 'technical terms', shortLow: 'plain words', shortHigh: 'technical terms' },
  extraResources: { name: 'Extra resources', low: 'lecture only', high: 'lean on slides & readings', shortLow: 'lecture only', shortHigh: 'slides & readings' },
  followMarks: { name: 'Follow my marks', low: 'ignore them', high: 'follow them closely', shortLow: 'ignore them', shortHigh: 'follow closely' },
};

export const PRESET_ORDER: PresetKey[] = ['firstTimeLearning', 'quickReview', 'examTomorrow', 'reset'];

/** The preview line; before any transcript the words aren't known yet ("≈ — words · …"). */
export function previewLine(plan: SummaryPlan, transcriptWords: number): string {
  return transcriptWords > 0 ? plan.preview : plan.preview.replace(/^≈ [\d,]+ words/, '≈ — words');
}

/** "12:40", "1:02:05" */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** "12:40 and 29:10", "1:00, 2:00 and 3:00", "… and 2 more" past three. */
export function timesText(times: number[]): string {
  const shown = [...times].sort((a, b) => a - b).slice(0, 3).map(clock);
  const more = times.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  return shown.length <= 1 ? shown.join('') : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The header's counts: the laptop's long form, the iPhone's short one. */
export function countsLine(c: { minutes: number; noteLines: number; marks: number; questions: number }, short: boolean): string {
  return short
    ? `${c.minutes} min · ${plural(c.noteLines, 'note line')} · ${plural(c.marks, 'mark')} · ${plural(c.questions, 'question')}`
    : `${c.minutes} min recorded · ${plural(c.noteLines, 'note line')} · ${plural(c.marks, 'mark')} · ${plural(c.questions, 'question')} to the assistant`;
}

export { plural };
