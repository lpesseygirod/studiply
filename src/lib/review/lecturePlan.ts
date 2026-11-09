/**
 * Spaced review of lectures (step 9.2; the approved plan, docs/reports/plan-9.2.md), pure so both
 * devices, the count, the Review screen and (9.2-3) the reminders share it. Calendar days, local.
 *
 * Sessions of a lecture recorded on day L, its course's exam on day E (or none):
 * 1. No exam, or an exam on or before the lecture's day (a past exam doesn't steer new lectures):
 *    L+1, L+3, L+7, L+21.
 * 2. An exam after the lecture: those of them before E, plus E−7 and E−1 when on or after L; two
 *    sessions 0–1 days apart become the later one. Nothing on or after the exam's day.
 *    (Exam in 14 days: 1 · 3 · 7 · 13; in 60: 1 · 3 · 7 · 21 · 53 · 59; in 4: 1 · 3; tomorrow: today.)
 *
 * Due: the lecture's current session (its latest one dated today or before) while it wasn't reviewed
 * on or after that day. A missed session isn't stacked: it lapses when the next one's day comes, and
 * the last one after 7 days, so a lecture counts once. Sessions dated before the plan started
 * (PLAN_START, decision 3: lectures recorded before 9.2 keep their remaining sessions only) never count.
 */

/** "2026-11-09" */
export type Day = string;

export type SessionKind = 'after' | 'examWeek' | 'examEve';

export interface Session {
  day: Day;
  /** Days after the lecture. */
  offset: number;
  kind: SessionKind;
}

export const STANDARD_OFFSETS = [1, 3, 7, 21] as const;
/** The last session stays due this many days (its own day included). */
export const LAST_SESSION_DAYS = 7;
/** Step 9.2 shipped: sessions before this day never count (decision 3). */
export const PLAN_START: Day = '2026-11-09';

const DAY_MS = 86_400_000;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The local calendar day of a time. */
export function localDay(at: Date | string): Day {
  const d = typeof at === 'string' ? new Date(at) : at;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A day as a number of days (UTC arithmetic on the date alone: no time zone or daylight saving). */
function dayNumber(day: Day): number {
  const m = DAY.exec(day);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
}

function dayOf(n: number): Day {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(day: Day, n: number): Day {
  return dayOf(dayNumber(day) + n);
}

export function daysBetween(from: Day, to: Day): number {
  return dayNumber(to) - dayNumber(from);
}

export function isDay(value: unknown): value is Day {
  return typeof value === 'string' && DAY.test(value) && !Number.isNaN(dayNumber(value));
}

/** A lecture's review sessions, in order. */
export function reviewSessions(lectureDay: Day, examDay: Day | null): Session[] {
  const exam = examDay && isDay(examDay) && daysBetween(lectureDay, examDay) > 0 ? examDay : null;
  const at = (offset: number, kind: SessionKind): Session => ({ day: addDays(lectureDay, offset), offset, kind });
  if (!exam) return STANDARD_OFFSETS.map((o) => at(o, 'after'));
  const toExam = daysBetween(lectureDay, exam);
  const all: Session[] = [
    ...STANDARD_OFFSETS.filter((o) => o < toExam).map((o) => at(o, 'after')),
    ...(toExam - 7 >= 0 ? [at(toExam - 7, 'examWeek')] : []),
    at(toExam - 1, 'examEve'),
  ].sort((a, b) => a.offset - b.offset || (a.kind === 'after' ? -1 : 1));
  // Two sessions 0–1 days apart: the later one.
  const kept: Session[] = [];
  for (const s of all) {
    const last = kept[kept.length - 1];
    if (last && s.offset - last.offset <= 1) kept.pop();
    kept.push(s);
  }
  return kept;
}

export interface LectureState {
  sessions: Session[];
  /** The session she should do now, or null (none yet, all done or lapsed). */
  due: Session | null;
  /** The next session after today, or null. */
  next: Session | null;
}

/**
 * Where a lecture is in its plan today. `lastReviewed`: the day of its last review (or null);
 * `since`: sessions before it never count.
 */
export function lectureState(lectureDay: Day, examDay: Day | null, today: Day, lastReviewed: Day | null, since: Day = PLAN_START): LectureState {
  const sessions = reviewSessions(lectureDay, examDay);
  const past = sessions.filter((s) => daysBetween(s.day, today) >= 0);
  const next = sessions.find((s) => daysBetween(s.day, today) < 0) ?? null;
  const current = past[past.length - 1] ?? null;
  const isLast = !!current && current === sessions[sessions.length - 1];
  const open =
    !!current &&
    daysBetween(since, current.day) >= 0 &&
    !(isLast && daysBetween(current.day, today) >= LAST_SESSION_DAYS) &&
    !(lastReviewed && daysBetween(current.day, lastReviewed) >= 0);
  return { sessions, due: open ? current : null, next };
}

/** "Day 3", "A week before the exam", "Day before the exam". */
export function sessionLabel(s: Session): string {
  if (s.kind === 'examEve') return 'Day before the exam';
  if (s.kind === 'examWeek') return 'A week before the exam';
  return `Day ${s.offset}`;
}
