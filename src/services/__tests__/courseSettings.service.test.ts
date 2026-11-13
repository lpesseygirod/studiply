// A course's settings (courseSettings.service). Load: the row as the screen shows it (a
// value it can't show is "not set"; no row: the spec's defaults); each field saved on its own (the exam
// date, cleared too; the format; the summary language; the 10 sliders; the study reminders default);
// a bad date refused; online only; the iPhone's copy replaced at once (keyed by its course_id) and the
// screens told (the Review today count follows a new exam date).
import { resetTables, rowsOf, serverWrite } from '../../test-utils/fakeTables';
import { NetworkError } from '../../lib/cloudRows';
import { PRESETS, SLIDER_DEFAULTS } from '../../../supabase/functions/_shared/summary-plan';
import { EXAM_FORMATS, fromRow, getCourseSettings, saveCourseSettings, toColumns } from '../courseSettings.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/fakeTables').module);
jest.mock('../../lib/connectivity', () => ({ isOffline: jest.fn(() => false) }));
jest.mock('../../lib/cache', () => ({ notifyLibraryUpdated: jest.fn() }));
jest.mock('../../lib/cache/store', () => {
  const state = { enabled: false };
  return {
    state,
    get cacheEnabled() {
      return state.enabled;
    },
    saveRows: jest.fn(async () => {}),
  };
});

const connectivity = jest.requireMock('../../lib/connectivity') as { isOffline: jest.Mock };
const cache = jest.requireMock('../../lib/cache') as { notifyLibraryUpdated: jest.Mock };
const store = jest.requireMock('../../lib/cache/store') as { state: { enabled: boolean }; saveRows: jest.Mock };

const SLIDERS = Object.fromEntries(
  ['starting_point', 'length', 'depth', 'examples', 'visuals', 'exam_focus', 'self_test', 'language', 'extra_resources', 'follow_marks'].map((k, i) => [`slider_${k}`, [2, 5, 6, 5, 4, 5, 5, 4, 6, 7][i]]),
);
const row = (over: object = {}) => ({ id: 'cs', course_id: 'k1', subject_type: null, exam_format: null, exam_date: null, summary_language: null, study_reminders: true, ...SLIDERS, ...over });

beforeEach(() => {
  resetTables();
  connectivity.isOffline.mockReturnValue(false);
  cache.notifyLibraryUpdated.mockClear();
  store.saveRows.mockClear();
  store.state.enabled = false;
  serverWrite('courses', { id: 'k1', name: 'Psicobiología' });
});

describe('loading', () => {
  it('the row as the screen shows it, with the course’s name', async () => {
    serverWrite('course_settings', row({ exam_date: '2027-01-20', exam_format: 'essay', summary_language: 'es', study_reminders: false, slider_length: 9 }));
    expect(await getCourseSettings('k1')).toEqual({
      courseId: 'k1',
      courseName: 'Psicobiología',
      examDate: '2027-01-20',
      examFormat: 'essay',
      summaryLanguage: 'es',
      sliders: { ...SLIDER_DEFAULTS, length: 9 },
      studyReminders: false,
    });
  });

  it('a value it can’t show is not set; no row: the spec’s defaults, reminders on', () => {
    expect(fromRow(row({ exam_date: 'soon', exam_format: 'quiz', summary_language: '' }) as never, 'k1', 'X')).toMatchObject({ examDate: null, examFormat: null, summaryLanguage: null });
    expect(fromRow(null, 'k1', 'X')).toMatchObject({ examDate: null, sliders: SLIDER_DEFAULTS, studyReminders: true });
  });

  it('never asks for a subject type (Lea, 9 Nov): no such field', async () => {
    serverWrite('course_settings', row({ subject_type: 'law' }));
    expect(Object.keys(await getCourseSettings('k1'))).not.toContain('subjectType');
    expect(EXAM_FORMATS.map((f) => f.label)).toEqual(['Not set', 'Multiple choice', 'Essay', 'Problem-solving', 'Open book', 'Oral']);
  });

  it('a course no longer there: said; offline: NetworkError', async () => {
    await expect(getCourseSettings('gone')).rejects.toThrow('no longer in your library');
    connectivity.isOffline.mockReturnValue(true);
    await expect(getCourseSettings('k1')).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('saving, one field at a time', () => {
  beforeEach(() => serverWrite('course_settings', row()));

  it('the exam date, then cleared; the screens are told at once', async () => {
    await saveCourseSettings('k1', { examDate: '2026-11-23' });
    expect(rowsOf('course_settings')[0]).toMatchObject({ exam_date: '2026-11-23', exam_format: null });
    expect(cache.notifyLibraryUpdated).toHaveBeenCalledTimes(1);
    await saveCourseSettings('k1', { examDate: null });
    expect(rowsOf('course_settings')[0].exam_date).toBeNull();
  });

  it('the format, the summary language, the study reminders default, the 10 sliders', async () => {
    await saveCourseSettings('k1', { examFormat: 'oral' });
    await saveCourseSettings('k1', { summaryLanguage: 'fr' });
    await saveCourseSettings('k1', { studyReminders: false });
    await saveCourseSettings('k1', { sliders: PRESETS.examTomorrow.sliders });
    expect(fromRow(rowsOf('course_settings')[0] as never, 'k1', 'X')).toMatchObject({ examFormat: 'oral', summaryLanguage: 'fr', studyReminders: false, sliders: PRESETS.examTomorrow.sliders });
  });

  it('only the field changed is written', () => {
    expect(toColumns({ examFormat: null })).toEqual({ exam_format: null });
    expect(Object.keys(toColumns({ sliders: SLIDER_DEFAULTS }))).toHaveLength(10);
    expect(toColumns({})).toEqual({});
  });

  it('a bad date is refused, nothing written', async () => {
    await expect(saveCourseSettings('k1', { examDate: '23/11/2026' })).rejects.toThrow('Choose a date.');
    expect(rowsOf('course_settings')[0].exam_date).toBeNull();
  });

  it('offline: refused, nothing written', async () => {
    connectivity.isOffline.mockReturnValue(true);
    await expect(saveCourseSettings('k1', { examFormat: 'essay' })).rejects.toBeInstanceOf(NetworkError);
    expect(rowsOf('course_settings')[0].exam_format).toBeNull();
    expect(cache.notifyLibraryUpdated).not.toHaveBeenCalled();
  });

  it('the iPhone: its copy replaced by the saved row, keyed by the course (its plan follows at once)', async () => {
    store.state.enabled = true;
    await saveCourseSettings('k1', { examDate: '2026-11-23' });
    expect(store.saveRows).toHaveBeenCalledWith('course_settings', [expect.objectContaining({ id: 'k1', course_id: 'k1', exam_date: '2026-11-23' })]);
  });
});
