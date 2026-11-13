// The summarize panel's words: every slider named with its ends
// (DESIGN.md's list), the presets in the mockup's order, the counts line
// (laptop and iPhone, desktop-02 / iphone-05), the photos' times and the
// preview line before any transcript.

import { PRESETS, SLIDER_DEFAULTS, SLIDER_KEYS, planSummary } from '../../../../supabase/functions/_shared/summary-plan';
import { PRESET_ORDER, SLIDER_LABELS, clock, countsLine, previewLine, timesText } from '../sliderLabels';

describe('the summarize panel’s words', () => {
  it('the 10 sliders as DESIGN.md lists them', () => {
    expect(SLIDER_KEYS.map((k) => `${SLIDER_LABELS[k].name} — ${SLIDER_LABELS[k].low} → ${SLIDER_LABELS[k].high}`)).toEqual([
      'Your starting point — start from zero → I already know it',
      'Length — one page → everything',
      'Explanation depth — just the facts → every why and how',
      'Examples — none → one per idea',
      'Visuals & graphs — text only → visual-heavy',
      'Exam focus — understand it → only what’s on the exam',
      'Self-test questions — none → full practice set',
      'Language — plain words → technical terms',
      'Extra resources — lecture only → lean on slides & readings',
      'Follow my marks — ignore them → follow them closely',
    ]);
    // iphone-05's short ends.
    expect([SLIDER_LABELS.startingPoint.shortHigh, SLIDER_LABELS.depth.shortLow, SLIDER_LABELS.depth.shortHigh]).toEqual(['I know it', 'just facts', 'every why']);
  });

  it('the presets in the mockup’s order', () => {
    expect(PRESET_ORDER.map((k) => PRESETS[k].label)).toEqual(['First time learning', 'Quick review', 'Exam tomorrow', 'Reset']);
  });

  it('the counts: the laptop’s line and the iPhone’s', () => {
    const c = { minutes: 34, noteLines: 14, marks: 6, questions: 1 };
    expect(countsLine(c, false)).toBe('34 min recorded · 14 note lines · 6 marks · 1 question to the assistant');
    expect(countsLine(c, true)).toBe('34 min · 14 note lines · 6 marks · 1 question');
    expect(countsLine({ minutes: 0, noteLines: 1, marks: 1, questions: 0 }, true)).toBe('0 min · 1 note line · 1 mark · 0 questions');
  });

  it('the photos’ times', () => {
    expect(timesText([29 * 60_000 + 10_000, 12 * 60_000 + 40_000])).toBe('12:40 and 29:10');
    expect(timesText([60_000])).toBe('1:00');
    expect(timesText([60_000, 120_000, 180_000, 240_000, 300_000])).toBe('1:00, 2:00, 3:00 and 2 more');
    expect(clock(3_725_000)).toBe('1:02:05');
  });

  it('the preview line: the calculator’s; "≈ — words" before any transcript', () => {
    const plan = (words: number) => planSummary({ sliders: SLIDER_DEFAULTS, transcript: { wordCount: words, durationMs: 0 }, marks: [], assistant: [], noteLines: [], examFormat: null });
    expect(previewLine(plan(12_000), 12_000)).toBe('≈ 1,440 words · 4 takeaways · 7 questions');
    expect(previewLine(plan(0), 0)).toBe('≈ — words · 4 takeaways · 7 questions');
  });
});
