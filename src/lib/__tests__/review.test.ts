/**
 * @jest-environment node
 */
// Flashcards in review. The rating rule (Again · Hard · Good · Easy, the mockups' 1 min /
// 1 day / 3 days / 7 days for a new card), the cards a summary gives (key terms, its flashcards, its
// self-test; each once), the due deck and its counts, the Quiz me decks (the mark chip, the order),
// and a session's order (Again comes back, a skip stays due).
import { frontKey, marksOf, marksText, markChipText, newCards, quizQuestions, summaryCards } from '../review/cards';
import { deckMarks, dueDeck, dueTodayCount, quizDecks, reviewedTodayCount, withState, type CardRow, type ScheduleRow, type SummaryRow } from '../review/deck';
import { intervalLabel, MIN_EASE, nextReview, START_EASE } from '../review/schedule';
import { cardProgress, currentCard, deckEndsHere, flip, nextQuestion, quizProgress, rated, removeCurrent, showAnswer, skip, startCards, startQuiz } from '../review/session';
import short from '../../test-utils/summary-synthetic-30.json';

const NOW = new Date('2026-11-02T10:00:00Z');
const DAY = 86_400_000;
const NEW = { intervalDays: 0, ease: START_EASE, reps: 0 };
const days = (iso: string) => Math.round((Date.parse(iso) - NOW.getTime()) / DAY);
const S30 = short.result as unknown as Record<string, unknown>;

describe('the rating rule', () => {
  it('a new card: Again 1 min, Hard 1 day, Good 3 days, Easy 7 days (the mockup’s labels)', () => {
    expect(Date.parse(nextReview(NEW, 'again', NOW).dueAt) - NOW.getTime()).toBe(60_000);
    expect(days(nextReview(NEW, 'hard', NOW).dueAt)).toBe(1);
    expect(days(nextReview(NEW, 'good', NOW).dueAt)).toBe(3);
    expect(days(nextReview(NEW, 'easy', NOW).dueAt)).toBe(7);
    expect(['again', 'hard', 'good', 'easy'].map((g) => intervalLabel(NEW, g as never, NOW))).toEqual(['1 min', '1 day', '3 days', '7 days']);
  });

  it('after that: Hard × 1.2 (at least a day more), Good × ease, Easy × ease × 1.3; whole days', () => {
    const s = { intervalDays: 3, ease: 2.5, reps: 1 };
    expect(nextReview(s, 'hard', NOW).intervalDays).toBe(4);
    expect(nextReview(s, 'good', NOW).intervalDays).toBe(8);
    expect(nextReview(s, 'easy', NOW).intervalDays).toBe(10);
    expect(nextReview({ intervalDays: 10, ease: 2.5, reps: 3 }, 'hard', NOW).intervalDays).toBe(12);
    expect(nextReview({ intervalDays: 300, ease: 3, reps: 9 }, 'easy', NOW).intervalDays).toBe(365);
  });

  it('ease: Again −0.20, Hard −0.15, Good the same, Easy +0.15, never under 1.3; Again starts the card over', () => {
    const s = { intervalDays: 8, ease: 2.5, reps: 2 };
    expect(nextReview(s, 'again', NOW)).toMatchObject({ ease: 2.3, intervalDays: 0, reps: 0, lastGrade: 'again', lastReviewedAt: NOW.toISOString() });
    expect(nextReview(s, 'hard', NOW).ease).toBe(2.35);
    expect(nextReview(s, 'good', NOW)).toMatchObject({ ease: 2.5, reps: 3 });
    expect(nextReview(s, 'easy', NOW).ease).toBe(2.65);
    expect(nextReview({ ...s, ease: 1.35 }, 'again', NOW).ease).toBe(MIN_EASE);
    // Started over: Good is a new card's 3 days again.
    expect(nextReview(nextReview(s, 'again', NOW), 'good', NOW).intervalDays).toBe(3);
  });
});

describe('a summary’s cards', () => {
  it('key terms (TERM), its flashcards, its self-test (QUESTION); ** gone; empty ones and repeats left out', () => {
    const cards = summaryCards({
      glossary: [{ term: 'Conducta', definition: 'Lo que hace un organismo.' }, { term: '', definition: 'x' }],
      flashcards: [{ front: '**Conducta**', back: 'otra' }, { front: 'Filogenia', back: 'Historia evolutiva.' }],
      selfTest: [{ question: '¿Qué es la filogenia?', answer: 'La historia **evolutiva**.' }],
    });
    expect(cards).toEqual([
      { front: 'Conducta', back: 'Lo que hace un organismo.', kind: 'term' },
      { front: 'Filogenia', back: 'Historia evolutiva.', kind: 'card' },
      { front: '¿Qué es la filogenia?', back: 'La historia evolutiva.', kind: 'question' },
    ]);
    expect(frontKey('  **Conducta**  ')).toBe('conducta');
  });

  it('each once per lecture: a front the lecture has is left out (a summary written again, one saved before cards existed)', () => {
    const all = summaryCards(S30);
    expect(all.length).toBeGreaterThan(4);
    expect(newCards(all, all.map((c) => c.front))).toEqual([]);
    const before = all.filter((c) => c.kind === 'card').map((c) => c.front);
    expect(newCards(all, before).map((c) => c.kind)).not.toContain('card');
  });
});

describe('Quiz me questions', () => {
  it('the self-test in order, each with the mark that asked for it (type, level, its time), else none', () => {
    const result = {
      sections: [{ timestamp: '0:00', markChips: [{ markId: 'm1', type: 'exam', level: 9 }, { markId: 'assistant:q1', type: 'confused', level: 6 }] }, { timestamp: '20:00', markChips: [{ markId: 'm2', type: 'confused', level: 7 }] }],
      examSignals: [{ text: 'x', timestamp: '6:40', source: 'studentMark', markId: 'm1', level: 9 }],
      selfTest: [
        { question: 'Q1', answer: 'A1', fromMarkId: 'm1' },
        { question: 'Q2', answer: 'A2', fromMarkId: 'm2' },
        { question: 'Q3', answer: 'A3', fromMarkId: '' },
        { question: 'Q4', answer: 'A4', fromMarkId: 'assistant:q1' },
      ],
    };
    const q = quizQuestions(result);
    expect(q.map((x) => x.mark)).toEqual([{ type: 'exam', level: 9, t: '06:40' }, { type: 'confused', level: 7, t: '20:00' }, null, null]);
    expect(markChipText(q[0].mark!)).toBe('Exam 9/10 · from 06:40');
    expect(marksText(marksOf(result))).toBe('From your marks: 1 Exam · 1 Confused');
    expect(marksText({ exam: 0, confused: 0 })).toBe('');
  });
});

describe('the due deck and its counts', () => {
  const sched = (id: string, flashcard: string | null, due: string, more: Partial<ScheduleRow> = {}): ScheduleRow => ({
    id,
    user_id: 'u',
    flashcard_id: flashcard,
    file_id: flashcard ? null : 'f1',
    due_at: due,
    interval_days: 0,
    ease: 2.5,
    reps: 0,
    last_grade: null,
    last_reviewed_at: null,
    ...more,
  });
  const card = (id: string, more: Partial<CardRow> = {}): CardRow => ({ id, front: `F${id}`, back: `B${id}`, kind: 'term', file_id: 'f1', course_id: null, deleted_at: null, ...more });
  const schedules = [
    sched('s1', 'c1', '2026-11-02T09:00:00Z'),
    sched('s2', 'c2', '2026-11-01T09:00:00Z'),
    sched('s3', 'c3', '2026-11-02T18:00:00Z'),
    sched('s4', 'c4', '2026-10-30T09:00:00Z'),
    sched('s5', null, '2026-11-02T08:00:00Z'),
    sched('s6', 'c6', '2026-11-05T09:00:00Z', { last_reviewed_at: '2026-11-02T08:30:00Z' }),
  ];
  const cards = [card('c1'), card('c2', { kind: null }), card('c3'), card('c4', { deleted_at: '2026-11-01T00:00:00Z' }), card('c6')];
  const files = [{ id: 'f1', title: 'Tema 1', course_id: 'k1' }];
  const courses = [{ id: 'k1', name: 'Psicobiología' }];

  it('live cards due by now, the longest-waiting first, with their lecture and course; no kind is a card', () => {
    const deck = dueDeck(schedules, cards, files, courses, NOW);
    expect(deck.map((c) => c.id)).toEqual(['c2', 'c1']);
    expect(deck[0]).toMatchObject({ kind: 'card', lecture: 'Tema 1', course: 'Psicobiología', state: { reps: 0, ease: 2.5 } });
  });

  it('Review today’s cards: live cards due by the end of the day (a lecture’s row counts by its plan); reviewed today', () => {
    const local = new Date(NOW);
    expect(dueTodayCount(schedules, cards, local)).toBe(3);
    expect(reviewedTodayCount(schedules, local)).toBe(1);
  });

  it('a rating as the row the iPhone keeps until it is sent', () => {
    const state = nextReview(NEW, 'good', NOW);
    expect(withState(schedules[0], state, NOW)).toMatchObject({ due_at: state.dueAt, interval_days: 3, reps: 1, last_grade: 'good', last_reviewed_at: NOW.toISOString(), updated_at: NOW.toISOString() });
  });

  const summary = (id: string, file: string, created: string, selfTest: unknown[] = [{ question: 'Q', answer: 'A', fromMarkId: '' }]): SummaryRow => ({ id, file_id: file, status: 'done', created_at: created, result: { selfTest, sections: [{ markChips: [{ markId: 'm', type: 'exam', level: 8 }] }] } });

  it('Quiz me decks: each document’s newest summary with a self-test; the due cards’ lectures first, then newest first', () => {
    const sums = [summary('a', 'f1', '2026-10-01'), summary('b', 'f2', '2026-10-20'), summary('c', 'f3', '2026-10-10'), summary('d', 'f1', '2026-10-05'), summary('e', 'f4', '2026-10-25', [])];
    const fs = ['f1', 'f2', 'f3', 'f4'].map((id) => ({ id, title: id, course_id: null }));
    const decks = quizDecks(sums, fs, [], ['f3']);
    expect(decks.map((d) => d.fileId)).toEqual(['f3', 'f2', 'f1']);
    expect(decks[0]).toMatchObject({ marks: 'From your marks: 1 Exam', questions: [{ question: 'Q', answer: 'A', mark: null }] });
  });

  it('"From your marks" on cards only when they are one lecture’s', () => {
    const deck = dueDeck(schedules, cards, files, courses, NOW);
    expect(deckMarks(deck, [summary('a', 'f1', '2026-10-01')])).toBe('From your marks: 1 Exam');
    expect(deckMarks([...deck, { ...deck[0], fileId: 'f9' }], [summary('a', 'f1', '2026-10-01')])).toBe('');
  });
});

describe('a session’s order', () => {
  const c = (id: string) => ({ id, front: id, back: id, kind: 'card' as const, fileId: null, lecture: null, course: null, state: { dueAt: '', intervalDays: 0, ease: 2.5, reps: 0, lastGrade: null, lastReviewedAt: null }, schedule: {} as ScheduleRow });

  it('a rating moves on; Again comes back at the end; Card n of N counts its return', () => {
    let s = startCards([c('a'), c('b')]);
    expect(cardProgress(s)).toEqual({ n: 1, total: 2, done: 0 });
    s = flip(s);
    expect(s.flipped).toBe(true);
    s = rated(s, 'again', nextReview(NEW, 'again', NOW));
    expect(s.queue.map((x) => x.id)).toEqual(['a', 'b', 'a']);
    expect(s.flipped).toBe(false);
    expect(currentCard(s)?.id).toBe('b');
    s = rated(rated(s, 'good', nextReview(NEW, 'good', NOW)), 'good', nextReview(NEW, 'good', NOW));
    expect(currentCard(s)).toBeNull();
    expect(s.reviewed).toBe(3);
  });

  it('a skip moves the card to the end unrated (the last one stays); Delete takes it out', () => {
    let s = startCards([c('a'), c('b'), c('c')]);
    s = skip(s);
    expect(s.queue.map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(s.reviewed).toBe(0);
    s = removeCurrent(s);
    expect(s.queue.map((x) => x.id)).toEqual(['c', 'a']);
    const last = startCards([c('z')]);
    expect(skip(last).queue.map((x) => x.id)).toEqual(['z']);
  });

  it('Quiz me: the decks’ questions one after the other; Show answer, then Next question', () => {
    const deck = (id: string, n: number) => ({ fileId: id, lecture: id, course: null, marks: '', questions: Array.from({ length: n }, (_, i) => ({ question: `${id}${i}`, answer: 'x', mark: null })) });
    let q = startQuiz([deck('t1', 2), deck('t2', 1)]);
    expect(quizProgress(q)).toEqual({ n: 1, total: 3, done: 0 });
    q = showAnswer(q);
    expect(q.shown).toBe(true);
    q = nextQuestion(q);
    expect(q).toMatchObject({ at: 1, shown: false });
    q = nextQuestion(nextQuestion(q));
    expect(quizProgress(q)).toEqual({ n: 3, total: 3, done: 1 });
  });

  it('Next question on a lecture’s last question finishes its deck (that lecture is reviewed)', () => {
    const deck = (id: string, n: number) => ({ fileId: id, lecture: id, course: null, marks: '', questions: Array.from({ length: n }, (_, i) => ({ question: `${id}${i}`, answer: 'x', mark: null })) });
    let q = startQuiz([deck('t1', 2), deck('t2', 1)]);
    expect(deckEndsHere(q)).toBeNull();
    q = nextQuestion(q);
    expect(deckEndsHere(q)).toBe('t1');
    q = nextQuestion(q);
    expect(deckEndsHere(q)).toBe('t2');
    expect(deckEndsHere(nextQuestion(q))).toBeNull();
  });
});
