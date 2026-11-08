// Step 9.1b-2: what a quiz's row says while it is written (src/lib/quiz/status.ts): writing, ready
// (with fewer when some couldn't be checked), saved but not started (and why), failed in plain words,
// and "It took too long" for one left "generating" (display only: Try again claims it on the server).
import { FAILED_WORDS, quizRowState } from '../quiz/status';
import { QUIZ_STALE_MS } from '../../../supabase/functions/_shared/quiz-settings';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const quiz = (over: Partial<Parameters<typeof quizRowState>[0]> = {}) => ({ status: 'generating' as const, questionCount: 25, requested: 25, error: null, updatedAt: new Date(NOW - 10_000).toISOString(), note: null, ...over });

describe('a quiz’s row while it is written', () => {
  it('writing: its count, the spinner, about 1–2 minutes; no button but Take (greyed)', () => {
    expect(quizRowState(quiz(), NOW)).toEqual({ line: '25 questions · Writing your quiz…', sub: 'About 1–2 minutes, you can keep working', action: null, writing: true, ready: false });
  });

  it('left “generating” longer than QUIZ_STALE_MS: It took too long, with Try again', () => {
    const stale = quizRowState(quiz({ updatedAt: new Date(NOW - QUIZ_STALE_MS - 1).toISOString() }), NOW);
    expect(stale).toEqual({ line: 'Couldn’t be written', sub: 'It took too long', action: 'retry', writing: false, ready: false });
    expect(quizRowState(quiz({ updatedAt: new Date(NOW - QUIZ_STALE_MS + 1000).toISOString() }), NOW).writing).toBe(true);
  });

  it('ready: its count; with fewer, how many couldn’t be checked', () => {
    expect(quizRowState(quiz({ status: 'ready' }), NOW)).toMatchObject({ line: '25 questions · Ready', sub: null, ready: true });
    expect(quizRowState(quiz({ status: 'ready', questionCount: 24 }), NOW)).toMatchObject({ line: '24 of 25 questions · Ready', sub: '1 couldn’t be checked', ready: true });
    expect(quizRowState(quiz({ status: 'ready', questionCount: 1, requested: 1 }), NOW).line).toBe('1 question · Ready');
  });

  it('saved, not started: Start, and why when it was tried this session', () => {
    expect(quizRowState(quiz({ status: 'pending' }), NOW)).toEqual({ line: '25 questions · Saved · not started', sub: null, action: 'start', writing: false, ready: false });
    expect(quizRowState(quiz({ status: 'pending', note: 'Today’s limit is reached; try again tomorrow' }), NOW).sub).toBe('Today’s limit is reached; try again tomorrow');
  });

  it('failed: its reason in plain words, with Try again; an unknown code: Please try again', () => {
    expect(quizRowState(quiz({ status: 'failed', error: 'stopped' }), NOW)).toMatchObject({ line: 'Couldn’t be written', sub: FAILED_WORDS.stopped, action: 'retry' });
    expect(quizRowState(quiz({ status: 'failed', error: 'odd' }), NOW).sub).toBe('Please try again');
  });
});
