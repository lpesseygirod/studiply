import {
  LEGACY_NOTE_FORMAT,
  courseToProject,
  folderFromRow,
  folderSubtree,
  languageFromDb,
  languageToDb,
  lectureToSession,
  readLegacyNote,
  segmentsToTranscript,
  statusFromDb,
  statusToDb,
  summaryToNote,
  type CourseRow,
  type LectureFileRow,
  type SummaryRow,
} from '../cloudRows';

const USER = 'u0000000-0000-4000-8000-000000000001';
const T = '2026-10-24T10:00:00.000Z';

const course: CourseRow = {
  id: 'c1',
  user_id: USER,
  name: 'Macroeconomics',
  color: '#F5E0D8',
  icon: 'folder',
  sort_order: 0,
  is_archived: false,
  starred_at: null,
  deleted_at: null,
  created_at: T,
  updated_at: T,
  changed_at: T,
};

const lectureFile: LectureFileRow = {
  id: 'l1',
  user_id: USER,
  course_id: 'c1',
  folder_id: null,
  kind: 'lecture',
  title: 'Week 3',
  sort_order: 0,
  starred_at: null,
  last_opened_at: null,
  past_exam_format: null,
  deleted_at: null,
  created_at: T,
  updated_at: T,
  changed_at: T,
  lectures: {
    id: 'l1',
    user_id: USER,
    lecture_number: null,
    recorded_at: T,
    duration_ms: 61_600,
    language: null,
    status: 'ready',
    transcript_quality: null,
    avg_confidence: null,
    audio_retention: 'delete_3_days',
    audio_delete_after: null,
    created_at: T,
    updated_at: T,
  },
};

describe('courseToProject', () => {
  it('maps a course and derives is_deleted from deleted_at', () => {
    expect(courseToProject(course)).toMatchObject({ id: 'c1', name: 'Macroeconomics', is_deleted: false });
    expect(courseToProject({ ...course, deleted_at: T }).is_deleted).toBe(true);
  });
});

describe('folderFromRow', () => {
  it('renames course_id and parent_id to the old names', () => {
    const folder = folderFromRow({
      id: 'f1',
      user_id: USER,
      course_id: 'c1',
      parent_id: 'f0',
      name: 'Exams',
      sort_order: 0,
      starred_at: null,
      deleted_at: null,
      created_at: T,
      updated_at: T,
      changed_at: T,
    });
    expect(folder).toMatchObject({ project_id: 'c1', parent_folder_id: 'f0', is_deleted: false });
  });
});

describe('stars (step 2.2)', () => {
  it('courses, folders and lectures keep starred_at', () => {
    expect(courseToProject({ ...course, starred_at: T }).starred_at).toBe(T);
    expect(lectureToSession({ ...lectureFile, starred_at: T }).starred_at).toBe(T);
    expect(lectureToSession(lectureFile).starred_at).toBeNull();
    const folder = folderFromRow({
      id: 'f1', user_id: USER, course_id: 'c1', parent_id: null, name: 'Exams', sort_order: 0,
      starred_at: T, deleted_at: null, created_at: T, updated_at: T, changed_at: T,
    });
    expect(folder.starred_at).toBe(T);
  });
});

describe('folderSubtree', () => {
  const folders = [
    { id: 'a', parent_id: null },
    { id: 'b', parent_id: 'a' },
    { id: 'c', parent_id: 'b' },
    { id: 'd', parent_id: null },
  ];

  it('returns the folder and everything below it', () => {
    expect(folderSubtree('a', folders).sort()).toEqual(['a', 'b', 'c']);
    expect(folderSubtree('c', folders)).toEqual(['c']);
  });

  it('stops on a cycle', () => {
    expect(folderSubtree('x', [{ id: 'x', parent_id: 'y' }, { id: 'y', parent_id: 'x' }]).sort()).toEqual(['x', 'y']);
  });
});

describe('lecture status', () => {
  it.each([
    ['draft', 'draft'],
    ['recording', 'recording'],
    ['transcribing', 'transcribing'],
    ['processing', 'transcribing'],
    ['review', 'transcribing'],
    ['completed', 'ready'],
    ['failed', 'failed'],
  ] as const)('%s is stored as %s', (app, db) => expect(statusToDb(app)).toBe(db));

  it.each([
    ['uploading', 'transcribing'],
    ['ready', 'completed'],
    ['recording', 'recording'],
    ['unknown', 'draft'],
  ])('%s reads as %s', (db, app) => expect(statusFromDb(db)).toBe(app));
});

describe('language', () => {
  it("stores 'auto' and empty as null", () => {
    expect(languageToDb('auto')).toBeNull();
    expect(languageToDb('')).toBeNull();
    expect(languageToDb('fr')).toBe('fr');
  });

  it("reads null as 'auto'", () => {
    expect(languageFromDb(null)).toBe('auto');
    expect(languageFromDb('de')).toBe('de');
  });
});

describe('lectureToSession', () => {
  it('combines the file and its lecture', () => {
    expect(lectureToSession(lectureFile)).toMatchObject({
      id: 'l1',
      project_id: 'c1',
      title: 'Week 3',
      recording_mode: 'lecture',
      language: 'auto',
      status: 'completed',
      duration_seconds: 62,
      is_deleted: false,
    });
  });

  it('copes with a missing lecture row', () => {
    expect(lectureToSession({ ...lectureFile, lectures: null })).toMatchObject({ status: 'draft', duration_seconds: null });
  });

  it('keeps a recording mode passed in', () => {
    expect(lectureToSession(lectureFile, 'discussion').recording_mode).toBe('discussion');
  });
});

describe('legacy notes', () => {
  const result = {
    format: LEGACY_NOTE_FORMAT,
    title: 'Supply and demand',
    summaryLevel: 'extra',
    recordingMode: 'lecture',
    summary: 'Prices balance supply and demand.',
    keyConcepts: [{ title: 'Equilibrium', explanation: '…' }],
    formulas: [],
    definitions: [],
    tags: ['#econ', 3],
    unclearParts: [],
    manualAnnotations: null,
    isConfirmed: true,
  };

  const summary: SummaryRow = {
    id: 's1',
    user_id: USER,
    file_id: 'l1',
    mode: 'new',
    source_lecture_ids: ['l1'],
    sliders: { summaryLevel: 'extra' },
    applied_settings: null,
    result,
    note_lines_total: null,
    note_lines_used: null,
    marks_total: null,
    marks_used: null,
    status: 'done',
    model: null,
    error: null,
    created_at: T,
    updated_at: T,
  };

  it('reads a legacy note and drops values of the wrong type', () => {
    expect(readLegacyNote(result)).toMatchObject({ title: 'Supply and demand', summaryLevel: 'extra', tags: ['#econ'] });
  });

  it('ignores results in any other format', () => {
    expect(readLegacyNote({ format: 'summary-v2' })).toBeNull();
    expect(readLegacyNote(null)).toBeNull();
    expect(readLegacyNote([])).toBeNull();
  });

  it('maps a summary row to the old Note', () => {
    expect(summaryToNote(summary)).toMatchObject({
      id: 's1',
      session_id: 'l1',
      summary_level: 'extra',
      is_confirmed: true,
      is_deleted: false,
    });
    expect(summaryToNote({ ...summary, result: null })).toBeNull();
  });
});

describe('segmentsToTranscript', () => {
  const lecture = { id: 'l1', user_id: USER, language: 'en', created_at: T };

  it('joins segments in time order, in seconds', () => {
    const transcript = segmentsToTranscript(lecture, [
      { start_ms: 2000, end_ms: 4000, text: ' world.', confidence: 0.5 },
      { start_ms: 0, end_ms: 2000, text: 'Hello', confidence: 0.9 },
    ]);
    expect(transcript).toMatchObject({ session_id: 'l1', language: 'en', full_text: 'Hello world.' });
    expect(transcript?.segments).toEqual([
      { id: 0, start: 0, end: 2, text: 'Hello' },
      { id: 1, start: 2, end: 4, text: ' world.' },
    ]);
    expect(transcript?.confidence_score).toBeCloseTo(0.7);
  });

  it('is null without segments', () => {
    expect(segmentsToTranscript(lecture, [])).toBeNull();
  });

  it('has no confidence when no segment has one', () => {
    expect(segmentsToTranscript(lecture, [{ start_ms: 0, end_ms: 1, text: 'a', confidence: null }])?.confidence_score).toBeNull();
  });
});
