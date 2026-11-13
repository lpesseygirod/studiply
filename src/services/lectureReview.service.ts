/**
 * lectureReview.service.ts
 * Spaced review of lectures: the lectures due today (lib/review/lectures.ts), Mark
 * reviewed with Undo, and a lecture's "Study reminders" switch (Lea, 9 Nov: the summarize panel and
 * the lecture's menu; off = no review sessions for it).
 *
 * - The laptop reads Supabase and writes at once (review_lecture: the later review wins).
 * - The iPhone reads its own copy (files, lectures, review_schedule, course_settings, courses: the
 *   library download keeps them), so the plan and the count work offline. A review or a switch is
 *   saved there and queued (`review_lecture`, `lecture_study_reminders`), sent when it can be.
 */

import { serviceError, NetworkError } from '../lib/cloudRows';
import { cacheEnabled, cacheUser, markClean, readRow, readRows, saveLocalRow, type CacheableRow } from '../lib/cache/store';
import { isOffline } from '../lib/connectivity';
import { newId } from '../lib/mappers';
import { enqueue, registerSyncHandler, syncEnabled } from '../lib/sync';
import { supabase } from '../lib/supabase';
import type { ScheduleRow } from '../lib/review/deck';
import { addDays, localDay } from '../lib/review/lecturePlan';
import { dueLectures, remindersOn, type CourseSettingsRow, type DueLecture, type PlanCourseRow, type PlanFileRow, type PlanLectureRow, type PlanRows } from '../lib/review/lectures';
import { ensureLectureOnServer } from './session.service';

export type { DueLecture } from '../lib/review/lectures';

const SCHEDULE_COLUMNS = 'id, user_id, flashcard_id, file_id, due_at, interval_days, ease, reps, last_grade, last_reviewed_at, updated_at';

/** What the plan reads: the iPhone's copy, else Supabase. */
export async function readPlanRows(): Promise<PlanRows> {
  if (cacheEnabled) {
    const [files, lectures, schedules, settings, courses] = await Promise.all([
      readRows<PlanFileRow>('files'),
      readRows<PlanLectureRow>('lectures'),
      readRows<ScheduleRow>('review_schedule'),
      readRows<CourseSettingsRow>('course_settings'),
      readRows<PlanCourseRow>('courses'),
    ]);
    return { files, lectures, schedules, settings, courses };
  }
  const [files, lectures, schedules, settings, courses] = await Promise.all([
    supabase.from('files').select('id, title, kind, course_id, deleted_at, created_at').eq('kind', 'lecture').is('deleted_at', null),
    supabase.from('lectures').select('id, recorded_at, study_reminders'),
    supabase.from('review_schedule').select(SCHEDULE_COLUMNS).not('file_id', 'is', null),
    supabase.from('course_settings').select('course_id, exam_date, study_reminders'),
    supabase.from('courses').select('id, name'),
  ]);
  for (const r of [files, lectures, schedules, settings, courses]) if (r.error) throw serviceError(r.error, 'Could not load your review plan.');
  return {
    files: (files.data ?? []) as PlanFileRow[],
    lectures: (lectures.data ?? []) as PlanLectureRow[],
    schedules: (schedules.data ?? []) as ScheduleRow[],
    settings: (settings.data ?? []) as CourseSettingsRow[],
    courses: (courses.data ?? []) as PlanCourseRow[],
  };
}

/** The lectures to review today. */
export async function lecturesDueToday(now: Date = new Date()): Promise<DueLecture[]> {
  return dueLectures(await readPlanRows(), now);
}

// -------------------------------------------------------------------
// Mark reviewed (also: its Quiz me deck finished), with Undo
// -------------------------------------------------------------------

type ReviewOp =
  | { op: 'review'; id: string; fileId: string; reviewedAt: string; nextDue: string }
  | { op: 'undo'; id: string; fileId: string; reviewedAt: string; previous: string | null };

async function send(p: ReviewOp): Promise<void> {
  const { error } =
    p.op === 'review'
      ? await supabase.rpc('review_lecture', { p_id: p.id, p_file_id: p.fileId, p_reviewed_at: p.reviewedAt, p_next_due: p.nextDue })
      : await supabase.rpc('undo_lecture_review', { p_file_id: p.fileId, p_reviewed_at: p.reviewedAt, p_previous: p.previous as string });
  if (error) throw serviceError(error, 'Could not save the review.');
}

/** The iPhone's copy of the lecture's review row after `p`. */
async function saveLocal(p: ReviewOp, lecture: DueLecture, now: Date): Promise<void> {
  const userId = cacheUser();
  if (!userId) throw new Error('Could not save the review.');
  const had = await readRow<ScheduleRow>('review_schedule', p.id);
  const base: ScheduleRow = had ?? { id: p.id, user_id: userId, flashcard_id: null, file_id: lecture.fileId, due_at: now.toISOString(), interval_days: 0, ease: 2.5, reps: 0, last_grade: null, last_reviewed_at: null };
  const row: ScheduleRow =
    p.op === 'review'
      ? { ...base, due_at: p.nextDue, reps: base.reps + 1, last_reviewed_at: p.reviewedAt, updated_at: now.toISOString() }
      : { ...base, reps: Math.max(0, base.reps - 1), last_reviewed_at: p.previous, updated_at: now.toISOString() };
  await saveLocalRow('review_schedule', row as unknown as CacheableRow);
}

async function apply(p: ReviewOp, lecture: DueLecture, now: Date): Promise<void> {
  if (syncEnabled) {
    await saveLocal(p, lecture, now);
    await enqueue<ReviewOp>({ kind: 'review_lecture', key: `lecture-review:${p.fileId}`, payload: p });
    return;
  }
  if (isOffline()) throw new NetworkError();
  await send(p);
}

/** The start of a session's day (local), as its row notes the next session. */
function dayStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

/** Mark reviewed: the lecture done for today's session. Resolves with its Undo. */
export async function markLectureReviewed(lecture: DueLecture, now: Date = new Date()): Promise<() => Promise<void>> {
  const reviewedAt = now.toISOString();
  const p: ReviewOp = {
    op: 'review',
    id: lecture.scheduleId ?? newId(),
    fileId: lecture.fileId,
    reviewedAt,
    nextDue: dayStart(lecture.next?.day ?? addDays(localDay(now), 1)),
  };
  await apply(p, lecture, now);
  return () => apply({ op: 'undo', id: p.id, fileId: lecture.fileId, reviewedAt, previous: lecture.lastReviewedAt }, lecture, new Date());
}

registerSyncHandler<ReviewOp>('review_lecture', {
  run: async (p) => {
    await ensureLectureOnServer(p.fileId);
    await send(p);
    // Sent (or a later review was there): the next download may replace the copy here.
    await markClean('review_schedule', p.id);
  },
  // A review and its Undo waiting: the Undo (it finds nothing to undo on the server, as it should).
  merge: (_earlier, later) => later,
});

// -------------------------------------------------------------------
// Study reminders for a lecture (Lea, 9 Nov)
// -------------------------------------------------------------------

export interface StudyReminders {
  /** Whether the lecture has review sessions now. */
  on: boolean;
  /** Its own switch (null: it follows the course's default). */
  own: boolean | null;
  /** The course's default (on when the lecture is in no course). */
  courseDefault: boolean;
}

/** A lecture's study reminders: its own switch, else its course's default. */
export async function studyRemindersOf(lectureId: string, courseId: string | null): Promise<StudyReminders> {
  let lecture: PlanLectureRow | null = null;
  let settings: CourseSettingsRow | null = null;
  if (cacheEnabled) {
    [lecture, settings] = await Promise.all([readRow<PlanLectureRow>('lectures', lectureId), courseId ? readRow<CourseSettingsRow>('course_settings', courseId) : null]);
  } else {
    const [l, s] = await Promise.all([
      supabase.from('lectures').select('id, recorded_at, study_reminders').eq('id', lectureId).maybeSingle(),
      courseId ? supabase.from('course_settings').select('course_id, exam_date, study_reminders').eq('course_id', courseId).maybeSingle() : null,
    ]);
    if (l.error) throw serviceError(l.error, 'Could not load the lecture.');
    lecture = l.data as PlanLectureRow | null;
    settings = (s?.data ?? null) as CourseSettingsRow | null;
  }
  const courseDefault = remindersOn(null, settings);
  return { on: remindersOn(lecture, settings), own: typeof lecture?.study_reminders === 'boolean' ? lecture.study_reminders : null, courseDefault };
}

interface RemindersPayload {
  lectureId: string;
  on: boolean;
}

async function sendReminders(p: RemindersPayload): Promise<void> {
  const { error } = await supabase.from('lectures').update({ study_reminders: p.on }).eq('id', p.lectureId);
  if (error) throw serviceError(error, 'Could not save the study reminders.');
}

/** Turns a lecture's study reminders on or off (the laptop at once; the iPhone here, then queued). */
export async function setStudyReminders(lectureId: string, on: boolean): Promise<void> {
  if (syncEnabled) {
    const row = await readRow<PlanLectureRow & CacheableRow>('lectures', lectureId);
    if (row) await saveLocalRow('lectures', { ...row, study_reminders: on, updated_at: new Date().toISOString() } as CacheableRow);
    // Keyed by the lecture: it waits behind the lecture's own creation if that is still queued.
    await enqueue<RemindersPayload>({ kind: 'lecture_study_reminders', key: lectureId, payload: { lectureId, on } });
    return;
  }
  if (isOffline()) throw new NetworkError();
  await sendReminders({ lectureId, on });
}

registerSyncHandler<RemindersPayload>('lecture_study_reminders', {
  run: async (p) => {
    await ensureLectureOnServer(p.lectureId);
    await sendReminders(p);
    const { data } = await supabase.from('lectures').select('*').eq('id', p.lectureId).maybeSingle();
    if (data) await markClean('lectures', p.lectureId, data as unknown as CacheableRow);
  },
  merge: (_earlier, later) => later,
});
