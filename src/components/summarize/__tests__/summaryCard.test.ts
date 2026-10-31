/**
 * @jest-environment node
 */
// Step 7.4: the Summary tab card's words by status: saved but not started, being written, ready (its
// counts and takeaways), failed (why, and what to do).
import { bannerText, checksLine, summaryCardText } from '../summaryCard';
import type { LectureSummary } from '../../../services/summarize.service';
import type { CheckReport } from '../../../../supabase/functions/_shared/summary-checks';

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
      '4 sections · 7 questions · 1 flashcard · 14 of 14 note lines and 6 of 6 marks used\n\n• Uno.\n• Dos.\n\nWriting it into this document…',
    );
  });

  describe('the checks line (step 7.5)', () => {
    const report = (over: Partial<CheckReport> = {}): CheckReport => ({
      version: 1,
      schema: { pass: true, errors: [] },
      notes: { pass: true, total: 6, used: 6, missing: [], fixedByCode: ['p3'] },
      marks: { pass: true, total: 6, used: 6, missing: [], fixedByCode: [], effects: [] },
      length: { pass: true, words: 1400, target: 1440, min: 1224, max: 1656 },
      faithfulness: { pass: true, checked: 12, found: 12, unverified: [], corrected: 0, labelled: 0 },
      language: { pass: true, expected: 'es', detected: 'es', offBlocks: [] },
      regenerations: [],
      ...over,
    });

    it('a summary made before 7.5 has none', () => expect(checksLine(undefined)).toBe(''));
    it('all passed', () => expect(checksLine(report())).toBe('All checks passed.'));
    it('all passed, with details moved under Added context', () => {
      expect(checksLine(report({ faithfulness: { pass: true, checked: 12, found: 10, unverified: [], corrected: 1, labelled: 2 } }))).toBe(
        'All checks passed. 2 details not said in class are under “Added context”.',
      );
    });
    it('names each check that failed', () => {
      const c = report({
        marks: { pass: false, total: 6, used: 5, missing: ['m1'], fixedByCode: [], effects: [{ markId: 'm2', need: 'selfTest' }] },
        length: { pass: false, words: 2016, target: 1440, min: 1224, max: 1656 },
        faithfulness: { pass: false, checked: 12, found: 11, unverified: [{} as CheckReport['faithfulness']['unverified'][number]], corrected: 0, labelled: 0 },
        language: { pass: false, expected: 'es', detected: 'en', offBlocks: [] },
      });
      expect(checksLine(c)).toBe('Checks: 1 mark left out · 1 mark without what it asks for · 2,016 words (aim 1,224–1,656) · 1 detail not found in the lecture · parts in another language.');
    });
    it('is on the ready card, under the counts', () => {
      const result = { format: 'studiply-summary-v1', coverage: { noteLines: 6, noteLinesUsed: 6, marks: 6, marksUsed: 6 }, sections: [{}], checks: report() } as unknown as LectureSummary['result'];
      expect(summaryCardText(summary({ status: 'done', result })).text).toBe(
        '1 section · 0 questions · 0 flashcards · 6 of 6 note lines and 6 of 6 marks used\n\nAll checks passed.\n\nWriting it into this document…',
      );
    });
  });

  it.each([
    ['too_long', 'The summary got too long and was cut off. Try a lower Length.', 'retry'],
    ['refused', 'Claude can’t summarize this lecture.', 'retry'],
    ['part_failed', 'A part of this long lecture couldn’t be written. Nothing was changed.', 'retry'],
    ['unreadable', 'Something went wrong. Nothing was changed.', 'retry'],
  ])('failed (%s): why, and what to do', (error, text, action) => {
    expect(summaryCardText(summary({ status: 'failed', error }))).toEqual({ label: 'The summary wasn’t written', text, action });
  });

  it('the green banner’s line (step 7.7, desktop-03): her notes and marks, the audio, what else it was built from', () => {
    const header = { course: '', title: '', number: 1, date: '', professor: '', durationMin: 34, builtFrom: ['notes', 'audio', 'slides', 'photos', 'assistant'] };
    expect(bannerText({ coverage: { noteLines: 14, noteLinesUsed: 14, marks: 6, marksUsed: 6 }, header })).toBe(
      'Built from your notes (all 14 lines, 6 marks) + 34 min of audio · slides · board photos · your questions to the assistant',
    );
    expect(bannerText({ coverage: { noteLines: 1, noteLinesUsed: 0, marks: 1, marksUsed: 1 }, header: { ...header, builtFrom: ['notes', 'audio'] } })).toBe(
      'Built from your notes (0 of 1 line, 1 mark) + 34 min of audio',
    );
  });

  it('failed, over 3 hours (step 7.6): why, and no button (nothing on the card helps)', () => {
    expect(summaryCardText(summary({ status: 'failed', error: 'long_lecture' }))).toEqual({ label: 'The summary wasn’t written', text: 'Lectures over 3 hours can’t be summarized yet.' });
  });
});
