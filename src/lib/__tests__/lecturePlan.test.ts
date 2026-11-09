/**
 * @jest-environment node
 */
// Step 9.2-1: spaced review of lectures (the approved plan, docs/reports/plan-9.2.md). The sessions
// (1 · 3 · 7 · 21; steered by the exam: E−7 and E−1, nothing on or after it, two sessions 0–1 days
// apart become the later one), what is due today (the current session, lapses, the last one's 7 days,
// reviewed on or after the session, nothing before 9.2), the study reminders switch (Lea, 9 Nov) and
// the lectures due today from rows (both devices' function).
import { addDays, daysBetween, lectureState, localDay, reviewSessions, sessionLabel, PLAN_START } from '../review/lecturePlan';
import { dueLectures, lectureReviewRow, remindersOn, type PlanRows } from '../review/lectures';
import type { ScheduleRow } from '../review/deck';

const L = '2026-11-10';
const offsets = (exam: string | null) => reviewSessions(L, exam).map((s) => s.offset);
const kinds = (exam: string | null) => reviewSessions(L, exam).map((s) => s.kind);

describe('the sessions', () => {
  it('no exam: days 1, 3, 7 and 21 after the lecture', () => {
    expect(offsets(null)).toEqual([1, 3, 7, 21]);
    expect(reviewSessions(L, null).map((s) => s.day)).toEqual(['2026-11-11', '2026-11-13', '2026-11-17', '2026-12-01']);
  });

  it('an exam in 14 days: 1 · 3 · 7 · 13 (a week before merges with day 7, the eve replaces day 21)', () => {
    expect(offsets(addDays(L, 14))).toEqual([1, 3, 7, 13]);
    expect(kinds(addDays(L, 14))).toEqual(['after', 'after', 'examWeek', 'examEve']);
  });

  it('an exam in 60 days: 1 · 3 · 7 · 21 · 53 · 59', () => {
    expect(offsets(addDays(L, 60))).toEqual([1, 3, 7, 21, 53, 59]);
  });

  it('an exam in 22 days: the eve replaces day 21 (one day apart)', () => {
    expect(offsets(addDays(L, 22))).toEqual([1, 3, 7, 15, 21]);
    expect(kinds(addDays(L, 22)).at(-1)).toBe('examEve');
  });

  it('an exam in 8 days: a week before is day 1; the eve is day 7', () => {
    expect(offsets(addDays(L, 8))).toEqual([1, 3, 7]);
    expect(kinds(addDays(L, 8))).toEqual(['examWeek', 'after', 'examEve']);
  });

  it('an exam in 4 days: 1 · 3 (the eve is day 3)', () => {
    expect(offsets(addDays(L, 4))).toEqual([1, 3]);
    expect(kinds(addDays(L, 4))).toEqual(['after', 'examEve']);
  });

  it('an exam in 2 days: the eve only (day 1)', () => {
    expect(offsets(addDays(L, 2))).toEqual([1]);
  });

  it('an exam tomorrow: one session, today', () => {
    expect(reviewSessions(L, addDays(L, 1))).toEqual([{ day: L, offset: 0, kind: 'examEve' }]);
  });

  it('an exam on the lecture’s day or before it (past): the standard plan', () => {
    expect(offsets(L)).toEqual([1, 3, 7, 21]);
    expect(offsets(addDays(L, -30))).toEqual([1, 3, 7, 21]);
  });

  it('a malformed exam date is no exam', () => {
    expect(offsets('next week')).toEqual([1, 3, 7, 21]);
  });

  it('nothing on or after the exam’s day', () => {
    for (const n of [1, 2, 3, 5, 9, 14, 21, 22, 30, 60, 120]) {
      const exam = addDays(L, n);
      for (const s of reviewSessions(L, exam)) expect(daysBetween(s.day, exam)).toBeGreaterThan(0);
    }
  });

  it('calendar days across the change of hour (no 23- or 25-hour days)', () => {
    expect(reviewSessions('2026-10-20', null).map((s) => s.day)).toEqual(['2026-10-21', '2026-10-23', '2026-10-27', '2026-11-10']);
    expect(reviewSessions('2027-03-20', null).map((s) => s.day)).toEqual(['2027-03-21', '2027-03-23', '2027-03-27', '2027-04-10']);
  });

  it('labels: Day n, A week before the exam, Day before the exam', () => {
    expect(reviewSessions(L, addDays(L, 14)).map(sessionLabel)).toEqual(['Day 1', 'Day 3', 'A week before the exam', 'Day before the exam']);
  });
});

describe('what is due today', () => {
  const at = (n: number) => addDays(L, n);
  const due = (today: number, last: number | null = null, exam: string | null = null) => lectureState(L, exam, at(today), last === null ? null : at(last), '2026-01-01').due?.offset ?? null;

  it('nothing on the lecture’s own day; day 1 the next day', () => {
    expect(due(0)).toBeNull();
    expect(due(1)).toBe(1);
  });

  it('a missed session stays until the next one comes, then lapses (counted once)', () => {
    expect(due(2)).toBe(1);
    expect(due(3)).toBe(3);
    expect(due(6)).toBe(3);
    expect(due(20)).toBe(7);
  });

  it('the last session stays due for 7 days', () => {
    expect(due(21)).toBe(21);
    expect(due(27)).toBe(21);
    expect(due(28)).toBeNull();
  });

  it('reviewed on or after the session’s day: done; before it: not', () => {
    expect(due(3, 3)).toBeNull();
    expect(due(4, 3)).toBeNull();
    expect(due(3, 2)).toBe(3);
    expect(due(7, 4)).toBe(7);
  });

  it('the exam re-plans at once (an exam set two weeks away: day 13 is the eve)', () => {
    expect(due(13, 7)).toBeNull();
    expect(due(13, 7, at(14))).toBe(13);
    expect(lectureState(L, at(14), at(13), at(7), '2026-01-01').next).toBeNull();
  });

  it('after the exam: no more sessions for the lectures before it', () => {
    expect(due(16, 13, at(14))).toBeNull();
    expect(due(30, null, at(14))).toBeNull();
  });

  it('the next session', () => {
    expect(lectureState(L, null, at(3), null, '2026-01-01').next?.offset).toBe(7);
    expect(lectureState(L, null, at(25), null, '2026-01-01').next).toBeNull();
  });

  it('decision 3: sessions before the plan started never count; later ones do', () => {
    const before = '2026-10-30';
    expect(lectureState(before, null, '2026-11-09', null, PLAN_START).due).toBeNull();
    expect(lectureState(before, null, '2026-11-20', null, PLAN_START).due?.offset).toBe(21);
    expect(lectureState('2026-09-01', null, '2026-11-09', null, PLAN_START).due).toBeNull();
  });

  it('local days', () => {
    expect(localDay(new Date(2026, 10, 9, 23, 59))).toBe('2026-11-09');
    expect(localDay(new Date(2026, 10, 10, 0, 1))).toBe('2026-11-10');
  });
});

describe('study reminders for a lecture (Lea, 9 Nov)', () => {
  it('its own switch, else its course’s default, else on', () => {
    expect(remindersOn({ study_reminders: false }, { study_reminders: true })).toBe(false);
    expect(remindersOn({ study_reminders: true }, { study_reminders: false })).toBe(true);
    expect(remindersOn({ study_reminders: null }, { study_reminders: false })).toBe(false);
    expect(remindersOn({ study_reminders: null }, null)).toBe(true);
    expect(remindersOn(undefined, undefined)).toBe(true);
  });
});

describe('the lectures due today (the badge, the chip, the header and the card)', () => {
  const NOW = new Date(2026, 10, 13, 9, 0);
  const file = (id: string, title: string, course: string | null = 'k1', more: object = {}) => ({ id, title, kind: 'lecture', course_id: course, deleted_at: null, created_at: '2026-11-10T09:00:00', ...more });
  const sched = (id: string, fileId: string, reviewed: string | null): ScheduleRow => ({ id, user_id: 'u', flashcard_id: null, file_id: fileId, due_at: reviewed ?? '2026-11-10T00:00:00Z', interval_days: 0, ease: 2.5, reps: 1, last_grade: null, last_reviewed_at: reviewed });
  const rows = (over: Partial<PlanRows> = {}): PlanRows => ({
    files: [
      file('a', 'Tema 1'),
      file('b', 'Tema 2', 'k1', { created_at: '2026-11-12T09:00:00' }),
      file('off', 'Tema 3'),
      file('trash', 'Tema 4', 'k1', { deleted_at: '2026-11-12T00:00:00Z' }),
      file('pf', 'Project Files'),
      file('doc', 'Apuntes', 'k1', { kind: 'document' }),
      file('free', 'Charla', null),
      file('k2l', 'Lecture 1', 'k2'),
    ],
    lectures: [
      { id: 'a', recorded_at: '2026-11-10T10:00:00', study_reminders: null },
      { id: 'b', recorded_at: null, study_reminders: true },
      { id: 'off', recorded_at: '2026-11-10T10:00:00', study_reminders: false },
      { id: 'free', recorded_at: '2026-11-12T10:00:00', study_reminders: null },
      { id: 'k2l', recorded_at: '2026-11-10T10:00:00', study_reminders: null },
    ],
    schedules: [],
    settings: [
      { course_id: 'k1', exam_date: null, study_reminders: true },
      { course_id: 'k2', exam_date: null, study_reminders: false },
    ],
    courses: [{ id: 'k1', name: 'Psicobiología' }, { id: 'k2', name: 'Macro' }],
    ...over,
  });

  it('live lectures with reminders on (in no course: on), their course and session; by session day, then title', () => {
    const due = dueLectures(rows(), NOW, '2026-01-01');
    expect(due.map((d) => [d.fileId, d.label, d.course])).toEqual([
      ['free', 'Day 1', null],
      ['a', 'Day 3', 'Psicobiología'],
      ['b', 'Day 1', 'Psicobiología'],
    ]);
    expect(due.find((d) => d.fileId === 'a')).toMatchObject({ scheduleId: null, lastReviewedAt: null, next: { offset: 7 } });
  });

  it('a missed session waits: the longest-waiting first', () => {
    const due = dueLectures(rows(), new Date(2026, 10, 15, 9, 0), '2026-01-01');
    // a: day 3 (the 13th); b and free: day 3 (the 15th).
    expect(due.map((d) => [d.fileId, d.session.day])).toEqual([
      ['a', '2026-11-13'],
      ['free', '2026-11-15'],
      ['b', '2026-11-15'],
    ]);
  });

  it('left out: its switch off, its course’s default off, the trash, Project Files, documents', () => {
    const ids = dueLectures(rows(), NOW, '2026-01-01').map((d) => d.fileId);
    for (const id of ['off', 'k2l', 'trash', 'pf', 'doc']) expect(ids).not.toContain(id);
  });

  it('a lecture reviewed today is done; two review rows (this iPhone’s and the server’s): the later review', () => {
    const schedules = [sched('s1', 'a', '2026-11-11T18:00:00'), sched('s2', 'a', '2026-11-13T08:00:00')];
    expect(lectureReviewRow(schedules, 'a')?.id).toBe('s2');
    expect(dueLectures(rows({ schedules }), NOW, '2026-01-01').map((d) => d.fileId)).not.toContain('a');
    const older = [sched('s1', 'a', '2026-11-11T18:00:00')];
    expect(dueLectures(rows({ schedules: older }), NOW, '2026-01-01').find((d) => d.fileId === 'a')).toMatchObject({ scheduleId: 's1', lastReviewedAt: '2026-11-11T18:00:00' });
  });

  it('a card’s row is never a lecture’s', () => {
    const card: ScheduleRow = { ...sched('c', 'a', '2026-11-13T08:00:00'), flashcard_id: 'card-1' };
    expect(lectureReviewRow([card], 'a')).toBeNull();
  });

  it('the course’s exam date steers it: an exam on the 14th makes the 13th the eve', () => {
    const due = dueLectures(rows({ settings: [{ course_id: 'k1', exam_date: '2026-11-14', study_reminders: true }] }), NOW, '2026-01-01');
    expect(due.find((d) => d.fileId === 'a')?.label).toBe('Day before the exam');
  });
});
