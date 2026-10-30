/**
 * @jest-environment node
 */
// Step 7.4: the Summary tab card's words by status: saved but not started, being written, ready (its
// counts and takeaways), failed (why, and what to do).
import { summaryCardText } from '../summaryCard';
import type { LectureSummary } from '../../../services/summarize.service';

const resources = { slides: false, photos: false, assistant: true, notes: true as const };
const settings = { targetWords: 1440, takeaways: 4, selfTestCount: 7, markStrength: 1, resources, preview: '≈ 1,440 words · 4 takeaways · 7 questions' };
const summary = (over: Partial<LectureSummary>): LectureSummary => ({ id: 's', status: 'pending', error: null, settings, result: null, createdAt: 'x', ...over });

describe('the Summary tab card', () => {
  it('saved, not started: the preview and Summarize now', () => {
    expect(summaryCardText(summary({}))).toEqual({
      label: 'Summary settings saved',
      text: "≈ 1,440 words · 4 takeaways · 7 questions. Not started yet: it needs your permission or the internet, or today's limit was reached.",
      action: 'start',
    });
  });

  it('being written (and checked): no button', () => {
    for (const status of ['generating', 'checking'] as const) {
      expect(summaryCardText(summary({ status }))).toEqual({ label: 'Writing your summary', text: '≈ 1,440 words · 4 takeaways · 7 questions. This takes about 1–2 minutes. You can keep working.' });
    }
  });

  it('ready: the counts, the coverage and the takeaways', () => {
    const result = {
      format: 'studiply-summary-v1',
      coverage: { noteLines: 14, noteLinesUsed: 14, marks: 6, marksUsed: 6 },
      sections: [{}, {}, {}, {}],
      selfTest: Array(7).fill({}),
      flashcards: [{}],
      takeaways: [{ text: 'Uno.' }, { text: 'Dos.' }],
    } as unknown as LectureSummary['result'];
    expect(summaryCardText(summary({ status: 'done', result })).text).toBe(
      '4 sections · 7 questions · 1 flashcard · 14 of 14 note lines and 6 of 6 marks used\n\n• Uno.\n• Dos.\n\nIt\'s written into this tab in the next update.',
    );
  });

  it.each([
    ['too_long', 'The summary got too long and was cut off. Try a lower Length.', 'retry'],
    ['refused', 'Claude can’t summarize this lecture.', 'retry'],
    ['long_lecture', 'Lectures over 60 minutes are summarized in a later update.', 'settings'],
    ['unreadable', 'Something went wrong. Nothing was changed.', 'retry'],
  ])('failed (%s): why, and what to do', (error, text, action) => {
    expect(summaryCardText(summary({ status: 'failed', error }))).toEqual({ label: 'The summary wasn’t written', text, action });
  });
});
