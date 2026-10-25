import { Colors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import {
  courseToProject,
  lectureToSession,
  serviceError,
  type CourseRow,
  type FileRow,
  type LectureFileRow,
  type LectureRow,
} from '../lib/cloudRows';
import { notifyLibraryUpdated, readRow, readRows, readThrough, remember, rememberLectureFiles, rememberScope } from '../lib/cache';
import { cleanName } from '../utils/names';
import { activeCourses, inLectureScope, isActiveCourse, itemCounts, lectureCounts, lecturesIn } from '../lib/cache/localQueries';
import type { Project, Session } from '../types/database';

/**
 * Projects are `courses` in the database (step 1.2 schema). Row Level
 * Security limits every query to the signed-in student, so the `userId`
 * parameters are kept for the callers but not needed as filters.
 *
 * Reads go through the iPhone's cache (src/lib/cache): what Supabase returns
 * is kept, and offline the same answer is built from the cached rows.
 */

export type ProjectWithCount = Project & {
  sessionCount: number;
  /** Files of every kind (lectures, PDFs, images, …), as the sidebar shows. */
  itemCount: number;
};

/**
 * Courses plus their lecture and item counts. Trashed files aren't counted,
 * so a course's badge matches what the course screen actually lists.
 */
async function projectsWithCount(limit?: number): Promise<ProjectWithCount[]> {
  return readThrough(
    () => remoteProjectsWithCount(limit),
    async () => {
      const [courses, files] = await Promise.all([readRows<CourseRow>('courses'), readRows<FileRow>('files')]);
      const counts = lectureCounts(files);
      const items = itemCounts(files);
      return activeCourses(courses, limit).map((c) => ({
        ...courseToProject(c),
        sessionCount: counts.get(c.id) ?? 0,
        itemCount: items.get(c.id) ?? 0,
      }));
    },
  );
}

async function remoteProjectsWithCount(limit?: number): Promise<ProjectWithCount[]> {
  let query = supabase
    .from('courses')
    .select('*')
    .eq('is_archived', false)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  if (limit !== undefined) query = query.limit(limit);

  const { data: courses, error } = await query;
  if (error) throw serviceError(error, 'Could not load your courses.');
  if (limit === undefined) rememberScope('courses', courses, isActiveCourse);
  else remember('courses', courses);
  if (courses.length === 0) return [];

  const { data: files, error: countError } = await supabase
    .from('files')
    .select('course_id, kind')
    .is('deleted_at', null)
    .in('course_id', courses.map((c) => c.id));
  if (countError) throw serviceError(countError, 'Could not load your courses.');

  const counts = new Map<string, number>();
  const items = new Map<string, number>();
  for (const f of files) {
    if (!f.course_id) continue;
    items.set(f.course_id, (items.get(f.course_id) ?? 0) + 1);
    if (f.kind === 'lecture') counts.set(f.course_id, (counts.get(f.course_id) ?? 0) + 1);
  }
  return courses.map((c) => ({
    ...courseToProject(c),
    sessionCount: counts.get(c.id) ?? 0,
    itemCount: items.get(c.id) ?? 0,
  }));
}

// -------------------------------------------------------------------
// getProjects
// All non-archived projects for a user, newest first.
// -------------------------------------------------------------------
export async function getProjects(_userId: string): Promise<ProjectWithCount[]> {
  return projectsWithCount();
}

// -------------------------------------------------------------------
// getRecentProjects
// Most recently updated projects, limited to `limit` (default 6).
// -------------------------------------------------------------------
export async function getRecentProjects(
  _userId: string,
  limit = 6,
): Promise<ProjectWithCount[]> {
  return projectsWithCount(limit);
}

// -------------------------------------------------------------------
// getProject
// Single project by ID.
// -------------------------------------------------------------------
export async function getProject(projectId: string): Promise<Project> {
  const row = await readThrough(
    async () => {
      const { data, error } = await supabase.from('courses').select('*').eq('id', projectId).maybeSingle();
      if (error) throw serviceError(error, 'Could not load this course.');
      if (data) remember('courses', [data]);
      return data;
    },
    () => readRow<CourseRow>('courses', projectId),
  );
  if (!row) throw new Error('Course not found.');
  return courseToProject(row);
}

// -------------------------------------------------------------------
// createProject
// The database also creates the course's settings row (default sliders).
// -------------------------------------------------------------------
export async function createProject(
  _userId: string,
  name: string,
  color: string = Colors.courseColors[0],
  icon = 'folder',
): Promise<Project> {
  const clean = cleanName(name);
  const { data, error } = await supabase.from('courses').insert({ name: clean, color, icon }).select('*').single();
  if (error) throw serviceError(error, 'Could not create the course.');
  remember('courses', [data]);
  notifyLibraryUpdated();
  return courseToProject(data);
}

// -------------------------------------------------------------------
// updateProject
// -------------------------------------------------------------------
export async function updateProject(
  projectId: string,
  updates: Partial<Pick<Project, 'name' | 'color' | 'icon' | 'sort_order'>>,
): Promise<Project> {
  if (Object.values(updates).every((v) => v === undefined)) return getProject(projectId);

  // Keys left undefined aren't sent, so those columns stay as they are.
  const { color, icon, sort_order } = updates;
  const name = updates.name === undefined ? undefined : cleanName(updates.name);
  const { data, error } = await supabase
    .from('courses')
    .update({ name, color, icon, sort_order })
    .eq('id', projectId)
    .select('*')
    .single();
  if (error) throw serviceError(error, 'Could not save the course.');
  return courseToProject(data);
}

// -------------------------------------------------------------------
// archiveProject
// Hides a project without trashing it — sets is_archived = true.
// -------------------------------------------------------------------
export async function archiveProject(projectId: string): Promise<void> {
  const { error } = await supabase.from('courses').update({ is_archived: true }).eq('id', projectId);
  if (error) throw serviceError(error, 'Could not archive the course.');
}

// -------------------------------------------------------------------
// getProjectSessions
// All lectures inside a project, newest first.
// -------------------------------------------------------------------
export async function getProjectSessions(projectId: string): Promise<Session[]> {
  const rows = await readThrough(
    async () => {
      const { data, error } = await supabase
        .from('files')
        .select('*, lectures(*)')
        .eq('kind', 'lecture')
        .eq('course_id', projectId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw serviceError(error, 'Could not load the lectures.');
      rememberLectureFiles(data as LectureFileRow[], (f) => inLectureScope(f, { courseId: projectId }));
      return data as LectureFileRow[];
    },
    async () => {
      const [files, lectures] = await Promise.all([readRows<FileRow>('files'), readRows<LectureRow>('lectures')]);
      return lecturesIn(files, lectures, { courseId: projectId });
    },
  );
  return rows.map((row) => lectureToSession(row));
}


// -------------------------------------------------------------------
// getProjectSessionCount
// -------------------------------------------------------------------
export async function getProjectSessionCount(projectId: string): Promise<number> {
  const { count, error } = await supabase
    .from('files')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'lecture')
    .eq('course_id', projectId)
    .is('deleted_at', null);
  if (error) throw serviceError(error, 'Could not load the lectures.');
  return count ?? 0;
}
