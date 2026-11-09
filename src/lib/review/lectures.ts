/**
 * The lectures to review today (step 9.2), from rows as Supabase returns them (online) or as the
 * iPhone keeps them (offline): the same function both ways, so the sidebar badge, the Library chip,
 * the Review header and the lectures card always agree.
 *
 * - Every live lecture (not in the trash; not the hidden "Project Files" one) with study reminders on:
 *   its own switch (lectures.study_reminders), else its course's default, else on (Lea, 9 Nov).
 * - Its day: when it was recorded, else when it was made. Its course's exam date steers the plan.
 * - Its last review: its review row (review_schedule.file_id); two rows for one lecture (the
 *   iPhone's copy before the server's arrives) count as the later review.
 */

import { daysBetween, lectureState, localDay, reviewSessions, sessionLabel, type Day, type Session } from './lecturePlan';
import type { ScheduleRow } from './deck';

/** The hidden lecture of photos and PDFs from before step 3.4 (session.service's PROJECT_FILES_TITLE). */
const PROJECT_FILES_TITLE = 'Project Files';

export interface PlanFileRow {
  id: string;
  title: string;
  kind: string;
  course_id: string | null;
  deleted_at?: string | null;
  created_at: string;
}
export interface PlanLectureRow {
  id: string;
  recorded_at: string | null;
  study_reminders?: boolean | null;
}
export interface CourseSettingsRow {
  course_id: string;
  exam_date: string | null;
  study_reminders?: boolean | null;
}
export interface PlanCourseRow {
  id: string;
  name: string;
}

export interface PlanRows {
  files: PlanFileRow[];
  lectures: PlanLectureRow[];
  schedules: ScheduleRow[];
  settings: CourseSettingsRow[];
  courses: PlanCourseRow[];
}

export interface DueLecture {
  fileId: string;
  title: string;
  courseId: string | null;
  course: string | null;
  session: Session;
  /** "Day 3", "A week before the exam", "Day before the exam". */
  label: string;
  /** Its review row (null before the first review) and the last review's time, for Undo. */
  scheduleId: string | null;
  lastReviewedAt: string | null;
  /** The session after this one, or null (Mark reviewed notes it as due_at). */
  next: Session | null;
}

/** Whether a lecture has study reminders: its own switch, else its course's default, else on. */
export function remindersOn(lecture: Pick<PlanLectureRow, 'study_reminders'> | null | undefined, course: Pick<CourseSettingsRow, 'study_reminders'> | null | undefined): boolean {
  if (typeof lecture?.study_reminders === 'boolean') return lecture.study_reminders;
  if (typeof course?.study_reminders === 'boolean') return course.study_reminders;
  return true;
}

/** A lecture's review row: the latest review when there are two (the iPhone's copy and the server's). */
export function lectureReviewRow(schedules: ScheduleRow[], fileId: string): ScheduleRow | null {
  let best: ScheduleRow | null = null;
  for (const s of schedules) {
    if (s.flashcard_id || s.file_id !== fileId) continue;
    if (!best || (s.last_reviewed_at ?? '') > (best.last_reviewed_at ?? '')) best = s;
  }
  return best;
}

/** The lectures due today, the longest-waiting session first, then by title. */
export function dueLectures(rows: PlanRows, now: Date, since?: Day): DueLecture[] {
  const today = localDay(now);
  const lectureById = new Map(rows.lectures.map((l) => [l.id, l]));
  const settingsByCourse = new Map(rows.settings.map((s) => [s.course_id, s]));
  const courseById = new Map(rows.courses.map((c) => [c.id, c]));
  const out: DueLecture[] = [];
  for (const f of rows.files) {
    if (f.kind !== 'lecture' || f.deleted_at || f.title === PROJECT_FILES_TITLE) continue;
    const lecture = lectureById.get(f.id);
    const settings = f.course_id ? settingsByCourse.get(f.course_id) : undefined;
    if (!remindersOn(lecture, settings)) continue;
    const review = lectureReviewRow(rows.schedules, f.id);
    const state = lectureState(
      localDay(lecture?.recorded_at ?? f.created_at),
      settings?.exam_date ?? null,
      today,
      review?.last_reviewed_at ? localDay(review.last_reviewed_at) : null,
      since,
    );
    if (!state.due) continue;
    out.push({
      fileId: f.id,
      title: f.title,
      courseId: f.course_id,
      course: f.course_id ? (courseById.get(f.course_id)?.name ?? null) : null,
      session: state.due,
      label: sessionLabel(state.due),
      scheduleId: review?.id ?? null,
      lastReviewedAt: review?.last_reviewed_at ?? null,
      next: state.next,
    });
  }
  return out.sort((a, b) => a.session.day.localeCompare(b.session.day) || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------------
// Step 9.2-2: a course's review plan, as its settings screen previews it
// ---------------------------------------------------------------------

export interface CoursePlanLecture {
  fileId: string;
  title: string;
  /** The lecture's day. */
  day: Day;
  /** Its study reminders (its own switch, else the course's default being shown). */
  on: boolean;
  /** Its sessions from today on. */
  upcoming: Session[];
}

/**
 * The course's lectures, newest first (at most `limit`), with their sessions from today on, under the
 * exam date and the default being edited (the settings screen shows them as they're saved).
 */
export function coursePlan(rows: PlanRows, courseId: string, examDay: Day | null, onDefault: boolean, now: Date, limit = 5): CoursePlanLecture[] {
  const today = localDay(now);
  const lectureById = new Map(rows.lectures.map((l) => [l.id, l]));
  return rows.files
    .filter((f) => f.kind === 'lecture' && !f.deleted_at && f.course_id === courseId && f.title !== PROJECT_FILES_TITLE)
    .map((f) => {
      const lecture = lectureById.get(f.id);
      const day = localDay(lecture?.recorded_at ?? f.created_at);
      return {
        fileId: f.id,
        title: f.title,
        day,
        on: remindersOn(lecture, { study_reminders: onDefault }),
        upcoming: reviewSessions(day, examDay).filter((s) => daysBetween(today, s.day) >= 0),
      };
    })
    .sort((a, b) => b.day.localeCompare(a.day) || a.title.localeCompare(b.title))
    .slice(0, limit);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Tomorrow", "13 Nov" (with the year when it isn't this one: "13 Jan 2027"). */
export function shortDay(day: Day, now: Date): string {
  const n = daysBetween(localDay(now), day);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${y !== now.getFullYear() ? ` ${y}` : ''}`;
}

/** A session in the preview: "13 Nov", "13 Nov (day before the exam)", "6 Nov (a week before the exam)". */
export function sessionDate(s: Session, now: Date): string {
  const when = shortDay(s.day, now);
  return s.kind === 'examEve' ? `${when} (day before the exam)` : s.kind === 'examWeek' ? `${when} (a week before the exam)` : when;
}
