/**
 * The review reminders (step 9.2-3; the approved plan, docs/reports/plan-9.2.md), pure: from the same
 * rows as Review today, the notifications for the next 30 days, at most one a day, at her time.
 *
 * - A day gets one when something is due that day: the lectures due by their plan (their study
 *   reminders on: the lecture's switch, else its course's default) and the flashcards due by the end
 *   of it, as things stand now (rescheduled whenever they change).
 * - Today's is left out once its time has passed.
 * - The texts are English; lecture titles and course names as written (in their own language):
 *   "Time to review" · "Tema 1 · La Psicobiología (3 days since the lecture) · 12 flashcards";
 *   "3 lectures (Tema 1 and 2 more) · 12 flashcards"; "12 flashcards to review today";
 *   the day before an exam: "Psicobiología exam tomorrow" · "5 lectures to review before it".
 */

import type { CardRow, ScheduleRow } from './deck';
import { addDays, daysBetween, localDay, type Day } from './lecturePlan';
import { dueLectures, type DueLecture, type PlanRows } from './lectures';

/** Reminders are planned this many days ahead (iOS keeps at most 64 pending). */
export const REMINDER_DAYS = 30;
export const DEFAULT_REMINDER_TIME = '19:00';
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface Reminder {
  /** The day it is for. */
  day: Day;
  at: Date;
  title: string;
  body: string;
  /** Tapping it opens Review. */
  data: { url: '/review'; day: Day };
}

export function isReminderTime(value: unknown): value is string {
  return typeof value === 'string' && TIME.test(value);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A day's notification text, or null when nothing is due. */
export function reminderText(lectures: DueLecture[], cards: number, day: Day): { title: string; body: string } | null {
  if (!lectures.length && !cards) return null;
  const withCards = (s: string) => (cards ? `${s} · ${plural(cards, 'flashcard')}` : s);
  const eves = lectures.filter((l) => l.session.kind === 'examEve');
  if (eves.length) {
    const courses = [...new Set(eves.map((l) => l.course).filter((c): c is string => !!c))];
    const title = courses.length === 1 ? `${courses[0]} exam tomorrow` : courses.length > 1 ? `${courses.length} exams tomorrow` : 'Exam tomorrow';
    return { title, body: withCards(`${plural(lectures.length, 'lecture')} to review before ${courses.length > 1 ? 'them' : 'it'}`) };
  }
  if (lectures.length === 1) {
    const l = lectures[0];
    const since = daysBetween(addDays(l.session.day, -l.session.offset), day);
    return { title: 'Time to review', body: withCards(`${l.title} (${plural(since, 'day')} since the lecture)`) };
  }
  if (lectures.length > 1) return { title: 'Time to review', body: withCards(`${lectures.length} lectures (${lectures[0].title} and ${lectures.length - 1} more)`) };
  return { title: 'Time to review', body: `${plural(cards, 'flashcard')} to review today` };
}

/** Live cards due by the end of `day`. */
function cardsDueBy(schedules: ScheduleRow[], cards: CardRow[], day: Day): number {
  const [y, m, d] = day.split('-').map(Number);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  const live = new Set(cards.filter((c) => !c.deleted_at).map((c) => c.id));
  return schedules.filter((s) => s.flashcard_id && live.has(s.flashcard_id) && Date.parse(s.due_at) <= end).length;
}

/** The reminders to schedule now: at most one a day for `days` days, at `time` (HH:MM, local). */
export function planReminders({ plan, cards, now, time, days = REMINDER_DAYS }: { plan: PlanRows; cards: CardRow[]; now: Date; time: string; days?: number }): Reminder[] {
  const [hh, mm] = (isReminderTime(time) ? time : DEFAULT_REMINDER_TIME).split(':').map(Number);
  const today = localDay(now);
  const out: Reminder[] = [];
  for (let n = 0; n < days; n++) {
    const day = addDays(today, n);
    const [y, m, d] = day.split('-').map(Number);
    const at = new Date(y, m - 1, d, hh, mm);
    if (at.getTime() <= now.getTime()) continue;
    const text = reminderText(dueLectures(plan, new Date(y, m - 1, d, 12)), cardsDueBy(plan.schedules, cards, day), day);
    if (text) out.push({ day, at, ...text, data: { url: '/review', day } });
  }
  return out;
}

/** The times she can choose: every 30 minutes from 06:00 to 23:30. */
export const REMINDER_TIMES: string[] = Array.from({ length: 36 }, (_, i) => `${String(6 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
