/**
 * courseSettings.service.ts
 * A course's settings screen (step 9.2-2; the approved plan, docs/reports/plan-9.2.md): the exam date
 * and format, the summary language, the 10 summary slider defaults and the course's study reminders
 * default (9.2-1). No subject type: Claude identifies each lecture's subject (Lea, 9 Nov).
 *
 * Online only, on both devices: offline it says so and nothing can be changed. Each field is saved on
 * its own. The iPhone's copy of the row is replaced by the saved one at once, so its review plan (the
 * Review today count, the lectures card) follows a new exam date straight away, offline later too.
 */

import { NetworkError, serviceError } from '../lib/cloudRows';
import { cacheEnabled, saveRows } from '../lib/cache/store';
import { asCacheRow } from '../lib/cache/pull';
import { notifyLibraryUpdated } from '../lib/cache';
import { isOffline } from '../lib/connectivity';
import { supabase } from '../lib/supabase';
import { isDay } from '../lib/review/lecturePlan';
import type { Database } from '../types/supabase';
import { fromCourseSettings, SLIDER_DEFAULTS, type ExamFormat, type Sliders } from '../../supabase/functions/_shared/summary-plan';

export const EXAM_FORMATS: { value: ExamFormat | null; label: string }[] = [
  { value: null, label: 'Not set' },
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'essay', label: 'Essay' },
  { value: 'problem_solving', label: 'Problem-solving' },
  { value: 'open_book', label: 'Open book' },
  { value: 'oral', label: 'Oral' },
];

export interface CourseSettings {
  courseId: string;
  courseName: string;
  /** YYYY-MM-DD, or null. */
  examDate: string | null;
  examFormat: ExamFormat | null;
  /** A language code, or null: each lecture's own language. */
  summaryLanguage: string | null;
  sliders: Sliders;
  /** The default of "Study reminders for this lecture" for the course's lectures. */
  studyReminders: boolean;
}

export type CourseSettingsPatch = Partial<Pick<CourseSettings, 'examDate' | 'examFormat' | 'summaryLanguage' | 'sliders' | 'studyReminders'>>;

const FORMATS = new Set(EXAM_FORMATS.map((f) => f.value).filter(Boolean));

type Row = Record<string, unknown> & { course_id: string };

/** The row as the screen shows it (a value the screen can't show is shown as not set). */
export function fromRow(row: Row | null, courseId: string, courseName: string): CourseSettings {
  return {
    courseId,
    courseName,
    examDate: isDay(row?.exam_date) ? (row!.exam_date as string) : null,
    examFormat: FORMATS.has(row?.exam_format as ExamFormat) ? (row!.exam_format as ExamFormat) : null,
    summaryLanguage: typeof row?.summary_language === 'string' && row.summary_language ? row.summary_language : null,
    sliders: row ? fromCourseSettings(row as unknown as Parameters<typeof fromCourseSettings>[0]) : SLIDER_DEFAULTS,
    studyReminders: row?.study_reminders !== false,
  };
}

type Update = Database['public']['Tables']['course_settings']['Update'];

/** The columns a patch writes. */
export function toColumns(patch: CourseSettingsPatch): Update {
  const out: Update = {};
  if (patch.examDate !== undefined) {
    if (patch.examDate !== null && !isDay(patch.examDate)) throw new Error('Choose a date.');
    out.exam_date = patch.examDate;
  }
  if (patch.examFormat !== undefined) out.exam_format = patch.examFormat;
  if (patch.summaryLanguage !== undefined) out.summary_language = patch.summaryLanguage;
  if (patch.studyReminders !== undefined) out.study_reminders = patch.studyReminders;
  const s = patch.sliders;
  if (s) {
    Object.assign(out, {
      slider_starting_point: s.startingPoint,
      slider_length: s.length,
      slider_depth: s.depth,
      slider_examples: s.examples,
      slider_visuals: s.visuals,
      slider_exam_focus: s.examFocus,
      slider_self_test: s.selfTest,
      slider_language: s.language,
      slider_extra_resources: s.extraResources,
      slider_follow_marks: s.followMarks,
    });
  }
  return out;
}

/** The course's settings. Needs a connection (NetworkError offline). */
export async function getCourseSettings(courseId: string): Promise<CourseSettings> {
  if (isOffline()) throw new NetworkError();
  const [settings, course] = await Promise.all([
    supabase.from('course_settings').select('*').eq('course_id', courseId).maybeSingle(),
    supabase.from('courses').select('id, name').eq('id', courseId).maybeSingle(),
  ]);
  if (settings.error) throw serviceError(settings.error, 'Could not load the course’s settings.');
  if (course.error) throw serviceError(course.error, 'Could not load the course.');
  if (!course.data) throw new Error('This course is no longer in your library.');
  return fromRow(settings.data as Row | null, courseId, (course.data as { name: string }).name);
}

/** Saves one change. Needs a connection; the iPhone's copy and the screens (the count) follow at once. */
export async function saveCourseSettings(courseId: string, patch: CourseSettingsPatch): Promise<void> {
  if (isOffline()) throw new NetworkError();
  const columns = toColumns(patch);
  if (!Object.keys(columns).length) return;
  const { data, error } = await supabase.from('course_settings').update(columns).eq('course_id', courseId).select('*');
  if (error) throw serviceError(error, 'Could not save the course’s settings.');
  const row = (data as Row[] | null)?.[0];
  if (!row) throw new Error('This course is no longer in your library.');
  if (cacheEnabled) await saveRows('course_settings', [asCacheRow('course_settings', row)]);
  notifyLibraryUpdated();
}
