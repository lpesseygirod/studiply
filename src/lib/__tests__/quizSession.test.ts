/**
 * @jest-environment node
 */
// Step 9.1b-3: taking a quiz without React (src/lib/quiz/session.ts): each attempt's own question
// order (the same on resume), match pairs and steps shown shuffled but fixed per question (never in
// the right order), where an attempt resumes, the time left, the laptop's keys, the score as the
// database computes it, the list's Resume / Last, the grade-change line.
import {
  attemptOrder,
  attemptScore,
  changedLine,
  clock,
  hasDraft,
  keyChoice,
  latestAttempts,
  leftText,
  msLeft,
  resumeIndex,
  scoreLine,
  shownOrder,
  unanswered,
  type AnswerRow,
  type AttemptRow,
  type TakeQuestion,
} from '../quiz/session';

const q = (id: string, position: number, over: Partial<TakeQuestion> = {}): TakeQuestion => ({
  id,
  quiz_id: 'quiz-1',
  position,
  type: 'multiple_choice',
  prompt: `Q${position}`,
  data: { options: ['a', 'b', 'c', 'd'], correct: 0 },
  answer_text: 'a',
  explanation: '',
  hint: '',
  added_context: '',
  source_file_id: null,
  source_ms: null,
  source_page: null,
  mark_id: null,
  focus: '',
  difficulty: 'medium',
  ...over,
});
const questions = Array.from({ length: 8 }, (_, i) => q(`q${i}`, i));
const answer = (questionId: string, over: Partial<AnswerRow> = {}): AnswerRow => ({
  id: `a-${questionId}`,
  user_id: 'u',
  attempt_id: 'att-1',
  question_id: questionId,
  response: { choice: 0 },
  verdict: 'correct',
  points: 1,
  reason: '',
  graded_by: 'code',
  original_verdict: null,
  hint_used: false,
  time_ms: 1000,
  answered_at: '2026-11-08T10:00:00Z',
  ...over,
});
const attempt = (over: Partial<AttemptRow> = {}): AttemptRow => ({
  id: 'att-1',
  user_id: 'u',
  quiz_id: 'quiz-1',
  status: 'in_progress',
  started_at: '2026-11-08T10:00:00Z',
  finished_at: null,
  duration_ms: null,
  grading: 'score',
  pass_threshold: 60,
  max_points: 8,
  points: 0,
  score: 0,
  passed: null,
  ...over,
});

describe('the order', () => {
  it('each attempt its own order of all the questions; the same attempt always the same (resume)', () => {
    const a = attemptOrder(questions, 'att-1').map((x) => x.id);
    expect(attemptOrder([...questions].reverse(), 'att-1').map((x) => x.id)).toEqual(a);
    expect([...a].sort()).toEqual(questions.map((x) => x.id));
    expect(attemptOrder(questions, 'att-2').map((x) => x.id)).not.toEqual(a);
  });

  it('match pairs and steps: shuffled, fixed per question, never shown in the right order', () => {
    for (let i = 0; i < 40; i++) {
      const pairs = q(`p${i}`, 0, { type: 'match_pairs', data: { pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }, { left: 'c', right: '3' }] } });
      const order = shownOrder(pairs);
      expect([...order].sort()).toEqual([0, 1, 2]);
      expect(order).not.toEqual([0, 1, 2]);
      expect(shownOrder(pairs)).toEqual(order);
    }
    const steps = q('s', 0, { type: 'order_steps', data: { steps: ['x', 'y'] } });
    expect(shownOrder(steps)).toEqual([1, 0]);
    expect(shownOrder(q('m', 0))).toEqual([]);
  });
});

describe('resume and finish', () => {
  it('goes on at the first question without an answer; all answered: the end', () => {
    const order = attemptOrder(questions, 'att-1');
    const answers = new Map([order[0], order[1], order[3]].map((x) => [x.id, answer(x.id)]));
    expect(resumeIndex(order, answers)).toBe(2);
    expect(unanswered(order, answers).map((x) => x.id)).toEqual(order.filter((_, i) => ![0, 1, 3].includes(i)).map((x) => x.id));
    expect(resumeIndex(order, new Map(order.map((x) => [x.id, answer(x.id)])))).toBe(order.length);
  });
});

describe('time', () => {
  it('"12:30 left", never below 0; clocks', () => {
    expect(leftText(750_000)).toBe('12:30 left');
    expect(leftText(400)).toBe('0:01 left');
    expect(msLeft(1000, 5000)).toBe(0);
    expect(clock(400_000)).toBe('6:40');
    expect(clock(3_723_000)).toBe('1:02:03');
  });
});

describe('the laptop’s keys', () => {
  it('A–D and 1–4 choose an option there is; others don’t', () => {
    expect(keyChoice('a', 4)).toBe(0);
    expect(keyChoice('D', 4)).toBe(3);
    expect(keyChoice('3', 4)).toBe(2);
    expect(keyChoice('e', 4)).toBeNull();
    expect(keyChoice('5', 4)).toBeNull();
    expect(keyChoice('b', 2)).toBe(1);
    expect(keyChoice('Enter', 4)).toBeNull();
  });

  it('Check stays off until there is an answer (an order question always has one)', () => {
    expect(hasDraft('multiple_choice', null)).toBe(false);
    expect(hasDraft('multiple_choice', { choice: 0 })).toBe(true);
    expect(hasDraft('short_answer', { text: ' ' })).toBe(false);
    expect(hasDraft('fill_blank', { blanks: ['', 'x'] })).toBe(true);
    expect(hasDraft('match_pairs', { matches: [null, null] })).toBe(false);
    expect(hasDraft('order_steps', { order: [1, 0] })).toBe(true);
    expect(hasDraft('short_answer', {} as never)).toBe(false);
  });
});

describe('the score (as the database trigger)', () => {
  it('points out of 10 with one decimal; a pending answer counts 0 until graded', () => {
    const s = attemptScore([answer('1'), answer('2', { points: 0.5 }), answer('3', { verdict: 'pending', points: 0 }), ...Array.from({ length: 4 }, (_, i) => answer(`w${i}`, { points: 0 })), answer('9')], attempt());
    expect(s).toEqual({ points: 2.5, score: 3.1, passed: null });
    expect(scoreLine(attempt(), s)).toBe('3.1 / 10');
    expect(scoreLine(attempt(), { points: 8, score: 10, passed: null })).toBe('10 / 10');
  });

  it('pass/fail: the share against the threshold', () => {
    const a = attempt({ grading: 'pass_fail', pass_threshold: 60, max_points: 10 });
    const s = attemptScore(Array.from({ length: 10 }, (_, i) => answer(`${i}`, { points: i < 6 ? 1 : 0 })), a);
    expect(s.passed).toBe(true);
    expect(scoreLine(a, s)).toBe('Passed · 60 % (pass at 60 %)');
    expect(scoreLine(a, attemptScore([answer('x')], a))).toBe('Not passed · 10 % (pass at 60 %)');
  });
});

describe('the list', () => {
  it('Resume: the attempt in progress; Last: the latest finished (no attempts browser)', () => {
    const list = [
      attempt({ id: 'old', status: 'finished', started_at: '2026-11-01T10:00:00Z', finished_at: '2026-11-01T10:10:00Z', score: 5 }),
      attempt({ id: 'new', status: 'finished', started_at: '2026-11-05T10:00:00Z', finished_at: '2026-11-05T10:10:00Z', score: 7.5 }),
      attempt({ id: 'now', started_at: '2026-11-08T10:00:00Z' }),
    ];
    expect(latestAttempts(list)).toMatchObject({ resume: { id: 'now' }, last: { id: 'new' } });
    expect(latestAttempts([])).toEqual({ resume: null, last: null });
  });
});

describe('her grade', () => {
  it('"Changed by you (was: Wrong)"; one she gave before any grade: "Graded by you"; code/AI grades: none', () => {
    expect(changedLine({ graded_by: 'student', original_verdict: 'wrong' })).toBe('Changed by you (was: Wrong)');
    expect(changedLine({ graded_by: 'student', original_verdict: null })).toBe('Graded by you');
    expect(changedLine({ graded_by: 'ai', original_verdict: null })).toBeNull();
  });
});
