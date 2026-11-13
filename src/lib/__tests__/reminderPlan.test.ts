/**
 * @jest-environment node
 */
// The review reminders' plan. One a day at most, at her time, for 30 days; a day only
// when something is due (lectures by their plan and their study reminders, cards by the end of it);
// today's left out once its time has passed; the texts (one lecture, several, cards only, the day
// before an exam), lecture titles as written.
import { planReminders, reminderText, REMINDER_DAYS, REMINDER_TIMES, isReminderTime } from '../review/reminderPlan';
import type { DueLecture, PlanRows } from '../review/lectures';
import type { CardRow, ScheduleRow } from '../review/deck';

const NOW = new Date(2026, 10, 10, 9, 0);
const due = (title: string, over: Partial<DueLecture> = {}): DueLecture => ({
  fileId: title,
  title,
  courseId: 'k1',
  course: 'Psicobiología',
  session: { day: '2026-11-10', offset: 3, kind: 'after' },
  label: 'Day 3',
  scheduleId: null,
  lastReviewedAt: null,
  next: null,
  ...over,
});

describe('the texts', () => {
  it('one lecture: its title as written, the days since it, the cards', () => {
    expect(reminderText([due('Tema 1 · La Psicobiología')], 12, '2026-11-10')).toEqual({ title: 'Time to review', body: 'Tema 1 · La Psicobiología (3 days since the lecture) · 12 flashcards' });
    expect(reminderText([due('Tema 1', { session: { day: '2026-11-09', offset: 1, kind: 'after' } })], 0, '2026-11-10')?.body).toBe('Tema 1 (2 days since the lecture)');
    expect(reminderText([due('Tema 1', { session: { day: '2026-11-10', offset: 1, kind: 'after' } })], 1, '2026-11-10')?.body).toBe('Tema 1 (1 day since the lecture) · 1 flashcard');
  });

  it('several lectures: how many, the first and how many more', () => {
    expect(reminderText([due('Tema 1'), due('Tema 2'), due('Tema 3')], 12, '2026-11-10')).toEqual({ title: 'Time to review', body: '3 lectures (Tema 1 and 2 more) · 12 flashcards' });
  });

  it('cards only', () => {
    expect(reminderText([], 12, '2026-11-10')).toEqual({ title: 'Time to review', body: '12 flashcards to review today' });
  });

  it('the day before an exam: the course, the lectures to review before it', () => {
    const eve = { day: '2026-11-10', offset: 5, kind: 'examEve' as const };
    expect(reminderText([due('Tema 1', { session: eve }), ...['2', '3', '4', '5'].map((n) => due(`Tema ${n}`))], 0, '2026-11-10')).toEqual({ title: 'Psicobiología exam tomorrow', body: '5 lectures to review before it' });
    expect(reminderText([due('Tema 1', { session: eve }), due('Macro 1', { session: eve, course: 'Macroeconomics' })], 3, '2026-11-10')).toEqual({ title: '2 exams tomorrow', body: '2 lectures to review before them · 3 flashcards' });
  });

  it('nothing due: no notification', () => {
    expect(reminderText([], 0, '2026-11-10')).toBeNull();
  });
});

describe('the plan', () => {
  const file = (id: string, title: string, course: string | null = 'k1') => ({ id, title, kind: 'lecture', course_id: course, deleted_at: null, created_at: '2026-11-01T09:00:00' });
  const rows = (over: Partial<PlanRows> = {}): PlanRows => ({
    files: [file('a', 'Tema 1'), file('off', 'Tema 2')],
    lectures: [
      { id: 'a', recorded_at: '2026-11-09T10:00:00', study_reminders: null },
      { id: 'off', recorded_at: '2026-11-09T10:00:00', study_reminders: false },
    ],
    schedules: [],
    settings: [{ course_id: 'k1', exam_date: null, study_reminders: true }],
    courses: [{ id: 'k1', name: 'Psicobiología' }],
    ...over,
  });
  const days = (r: { day: string }[]) => r.map((x) => x.day);

  it('a lecture recorded yesterday: its sessions (day 1, 3, 7, 21), each missed one waiting until the next: at her time', () => {
    const r = planReminders({ plan: rows(), cards: [], now: NOW, time: '19:00' });
    expect(r[0]).toMatchObject({ day: '2026-11-10', title: 'Time to review', body: 'Tema 1 (1 day since the lecture)', data: { url: '/review', day: '2026-11-10' } });
    expect(r[0].at).toEqual(new Date(2026, 10, 10, 19, 0));
    // Not reviewed: due every day until the plan's last session lapses (day 21 + 6 = 6 Dec): 27 of the 30 days.
    expect(days(r)).toHaveLength(27);
    expect(days(r).at(-1)).toBe('2026-12-06');
    expect(r.every((x) => x.body.startsWith('Tema 1 ('))).toBe(true);
  });

  it('reviewed today: the next one on its next session (day 3), not before', () => {
    const schedules: ScheduleRow[] = [{ id: 's', user_id: 'u', flashcard_id: null, file_id: 'a', due_at: '2026-11-12T00:00:00', interval_days: 0, ease: 2.5, reps: 1, last_grade: null, last_reviewed_at: '2026-11-10T08:00:00' }];
    expect(days(planReminders({ plan: rows({ schedules }), cards: [], now: NOW, time: '19:00' })).slice(0, 2)).toEqual(['2026-11-12', '2026-11-13']);
  });

  it('today’s is left out once its time has passed', () => {
    expect(days(planReminders({ plan: rows(), cards: [], now: new Date(2026, 10, 10, 19, 30), time: '19:00' }))[0]).toBe('2026-11-11');
    expect(days(planReminders({ plan: rows(), cards: [], now: new Date(2026, 10, 10, 19, 30), time: '21:30' }))[0]).toBe('2026-11-10');
  });

  it('at most one a day, 30 days ahead (iOS keeps 64)', () => {
    const cards: CardRow[] = [{ id: 'c', front: 'F', back: 'B', kind: 'term', file_id: null, course_id: null, deleted_at: null }];
    const schedules: ScheduleRow[] = [{ id: 'sc', user_id: 'u', flashcard_id: 'c', file_id: null, due_at: '2026-11-01T00:00:00', interval_days: 0, ease: 2.5, reps: 0, last_grade: null, last_reviewed_at: null }];
    const r = planReminders({ plan: rows({ schedules }), cards, now: NOW, time: '20:00' });
    expect(r).toHaveLength(REMINDER_DAYS);
    expect(new Set(days(r)).size).toBe(r.length);
    expect(r[0].body).toBe('Tema 1 (1 day since the lecture) · 1 flashcard');
  });

  it('study reminders: a lecture switched off, or its course’s default off, gets none; nothing due: none', () => {
    expect(planReminders({ plan: rows({ settings: [{ course_id: 'k1', exam_date: null, study_reminders: false }] }), cards: [], now: NOW, time: '19:00' })).toEqual([]);
    expect(planReminders({ plan: rows({ files: [file('off', 'Tema 2')] }), cards: [], now: NOW, time: '19:00' })).toEqual([]);
  });

  it('an exam: the day before says so', () => {
    const r = planReminders({ plan: rows({ settings: [{ course_id: 'k1', exam_date: '2026-11-14', study_reminders: true }] }), cards: [], now: NOW, time: '19:00' });
    expect(r.find((x) => x.day === '2026-11-13')).toMatchObject({ title: 'Psicobiología exam tomorrow', body: '1 lecture to review before it' });
    expect(r.some((x) => x.day >= '2026-11-14')).toBe(false);
  });

  it('the times she can choose: every 30 minutes, 06:00 to 23:30', () => {
    expect(REMINDER_TIMES).toHaveLength(36);
    expect([REMINDER_TIMES[0], REMINDER_TIMES[26], REMINDER_TIMES.at(-1)]).toEqual(['06:00', '19:00', '23:30']);
    expect([isReminderTime('19:00'), isReminderTime('7:00'), isReminderTime('24:00')]).toEqual([true, false, false]);
  });
});
