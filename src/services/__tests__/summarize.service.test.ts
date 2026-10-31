// Step 7.3: the summarize panel's data and writes (summarize.service), with
// the server as a fake with real rows: the course's defaults (else the
// spec's), Save as course default, the counts from My notes, the request as a
// pending `summaries` row (laptop at once, iPhone saved and queued), and the
// earlier notes (legacy-note-v1 rows of the same table) never mistaken for it.

import { resetTables, rowsOf, serverWrite } from '../../test-utils/fakeTables';
import { latestNote, lecturesWithNotes } from '../../lib/cache/localQueries';
import { readLegacyNote, type FileRow, type SummaryRow } from '../../lib/cloudRows';
import { PRESETS, SLIDER_DEFAULTS, planSummary } from '../../../supabase/functions/_shared/summary-plan';
import {
  addLink,
  addSlides,
  courseDefaults,
  isSummaryRequest,
  latestSummary,
  latestSummaryRequest,
  loadSummarizeInfo,
  requestSummary,
  retrySummary,
  saveCourseDefaults,
  startSummary,
} from '../summarize.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/fakeTables').module);
jest.mock('../../lib/connectivity', () => ({ isOffline: jest.fn(() => false) }));
jest.mock('../../lib/cache', () => {
  const local: Record<string, Record<string, Record<string, unknown>>> = {};
  return {
    local,
    cacheUser: () => 'user-1',
    saveLocalRow: async (tbl: string, row: Record<string, unknown>) => {
      local[tbl] = { ...(local[tbl] ?? {}), [row.id as string]: row };
    },
    readRows: async (tbl: string) => Object.values(local[tbl] ?? {}),
    readThrough: async (remote: () => Promise<unknown>) => remote(),
    remember: () => {},
    markClean: async () => {},
  };
});
jest.mock('../../lib/sync', () => {
  const state = { enabled: false };
  const handlers: Record<string, { run: (p: unknown) => Promise<void> }> = {};
  const queued: { kind: string; key: string; payload: unknown }[] = [];
  return {
    state,
    handlers,
    queued,
    get syncEnabled() {
      return state.enabled;
    },
    registerSyncHandler: (kind: string, handler: { run: (p: unknown) => Promise<void> }) => {
      handlers[kind] = handler;
    },
    enqueue: async (op: { kind: string; key: string; payload: unknown }) => {
      queued.push(op);
      return op;
    },
  };
});
jest.mock('../document.service', () => ({
  getDocumentFile: jest.fn(async (id: string) => ({ id, course_id: id === 'loose' ? null : 'course-1', kind: 'lecture', title: 'Tema 1' })),
  openDocument: jest.fn(async () => ({ content: jest.requireActual('../../test-utils/summarizeFixtures').MY_NOTES })),
}));
jest.mock('../project.service', () => ({ getProject: async () => ({ name: 'Psicobiología' }) }));
jest.mock('../session.service', () => ({ getSession: async () => ({ duration_seconds: 2040 }), ensureLectureOnServer: jest.fn(async () => {}) }));
jest.mock('../transcript.service', () => ({ getTranscriptBySession: async () => ({ segments: [{ text: 'la conducta humana' }, { text: 'es biológica' }] }) }));
jest.mock('../cloud-storage.service', () => ({
  Buckets: { slides: 'slides', photos: 'photos' },
  uploadFile: jest.fn(async ({ path }: { path: string }) => ({ path: `user-1/${path}` })),
  removeFiles: jest.fn(async () => {}),
}));
jest.mock('../../lib/aiMode', () => ({ isMockAiForced: () => false }));
jest.mock('../../lib/functions', () => {
  class FunctionError extends Error {
    code: string;
    constructor(message: string, _httpStatus: number, code: string) {
      super(message);
      this.code = code;
    }
  }
  return { FunctionError, callFunction: jest.fn(async () => ({ status: 'generating' })) };
});
jest.mock('../consent.service', () => {
  class ConsentDeclinedError extends Error {}
  return { ConsentDeclinedError, ensureConsent: jest.fn(async () => {}), forgetConsent: jest.fn(), consentGiven: jest.fn(async () => true) };
});
jest.mock('../library-upload.service', () => ({
  checkUpload: (f: { mimeType: string | null }) => (f.mimeType === 'application/pdf' ? { ok: true, kind: 'pdf' } : { ok: true, kind: 'photo' }),
}));

const sync = jest.requireMock('../../lib/sync') as { state: { enabled: boolean }; handlers: Record<string, { run: (p: unknown) => Promise<void> }>; queued: { kind: string; key: string; payload: unknown }[] };
const local = (jest.requireMock('../../lib/cache') as { local: Record<string, Record<string, Record<string, unknown>>> }).local;
const connectivity = jest.requireMock('../../lib/connectivity') as { isOffline: jest.Mock };

const LECTURE = 'lecture-1';
const SETTINGS = { course_id: 'course-1', ...Object.fromEntries(['starting_point', 'length', 'depth', 'examples', 'visuals', 'exam_focus', 'self_test', 'language', 'extra_resources', 'follow_marks'].map((k, i) => [`slider_${k}`, PRESETS.examTomorrow.sliders[(['startingPoint', 'length', 'depth', 'examples', 'visuals', 'examFocus', 'selfTest', 'language', 'extraResources', 'followMarks'] as const)[i]]])) };
const plan = () => planSummary({ sliders: SLIDER_DEFAULTS, transcript: { wordCount: 12_000, durationMs: 90 * 60_000 }, marks: [], assistant: [], noteLines: [], examFormat: null });
const resources = { slides: true, photos: false, assistant: true, notes: true as const };

beforeEach(() => {
  resetTables();
  sync.state.enabled = false;
  sync.queued.length = 0;
  for (const k of Object.keys(local)) delete local[k];
  connectivity.isOffline.mockReturnValue(false);
});

describe('the starting values', () => {
  it('the course’s defaults; else the spec’s (no course, no row)', async () => {
    serverWrite('course_settings', { id: 'cs', ...SETTINGS });
    expect(await courseDefaults('course-1')).toEqual(PRESETS.examTomorrow.sliders);
    expect(await courseDefaults(null)).toEqual(SLIDER_DEFAULTS);
    expect(await courseDefaults('other')).toEqual(SLIDER_DEFAULTS);
  });

  it('Save as course default writes the 10 columns; offline it refuses', async () => {
    serverWrite('course_settings', { id: 'cs', course_id: 'course-1', slider_length: 5 });
    await saveCourseDefaults('course-1', PRESETS.quickReview.sliders);
    expect(await courseDefaults('course-1')).toEqual(PRESETS.quickReview.sliders);
    connectivity.isOffline.mockReturnValue(true);
    await expect(saveCourseDefaults('course-1', SLIDER_DEFAULTS)).rejects.toThrow();
  });
});

describe('what the panel shows', () => {
  it('counts from My notes (lines with text, mark chips), the questions and answers, photos with times, slides, links, the transcript’s words', async () => {
    serverWrite('course_settings', { id: 'cs', ...SETTINGS });
    serverWrite('assistant_messages', { id: 'q1', lecture_id: LECTURE, role: 'user', status: 'done', asked_at_ms: 2052000, window_start_ms: 1452000, window_end_ms: 2052000 });
    serverWrite('assistant_messages', { id: 'a1', lecture_id: LECTURE, role: 'assistant', status: 'done', asked_at_ms: null, window_start_ms: null, window_end_ms: null });
    const info = await loadSummarizeInfo(LECTURE);
    expect(info).toMatchObject({
      courseId: 'course-1',
      courseName: 'Psicobiología',
      defaults: PRESETS.examTomorrow.sliders,
      durationMs: 2040_000,
      transcriptWords: 5,
      answers: 1,
    });
    expect(info.noteLines).toEqual([
      { id: 'n1', atMs: 252_000 },
      { id: 'n2', atMs: 1_865_000 },
    ]);
    expect(info.marks).toEqual([{ id: 'm1', type: 'important', level: 8, atMs: 1_865_000 }]);
    expect(info.questions).toEqual([{ id: 'q1', askedAtMs: 2052000, windowStartMs: 1452000, windowEndMs: 2052000 }]);
    // While recording, the recording's clock.
    expect((await loadSummarizeInfo(LECTURE, { durationMs: 61_000 })).durationMs).toBe(61_000);
  });
});

describe('Stop & generate summary: a pending summaries row', () => {
  it('the laptop sends it at once: mode new, the lecture, the 10 values, status pending, the plan with the resources and the preview; no result', async () => {
    const id = await requestSummary(LECTURE, SLIDER_DEFAULTS, resources, plan());
    const [row] = rowsOf('summaries');
    expect(row).toMatchObject({
      id,
      file_id: LECTURE,
      mode: 'new',
      source_lecture_ids: [LECTURE],
      sliders: SLIDER_DEFAULTS,
      status: 'pending',
      applied_settings: { targetWords: 1440, takeaways: 4, selfTestCount: 7, markStrength: 1, resources, preview: '≈ 1,440 words · 4 takeaways · 7 questions' },
    });
    expect(row.result).toBeUndefined();
    expect(await latestSummaryRequest(LECTURE)).toMatchObject({ id, status: 'pending', settings: { preview: '≈ 1,440 words · 4 takeaways · 7 questions' } });
  });

  it('the laptop offline: refused (the panel says so; the recording was stopped first)', async () => {
    connectivity.isOffline.mockReturnValue(true);
    await expect(requestSummary(LECTURE, SLIDER_DEFAULTS, resources, plan())).rejects.toThrow();
    expect(rowsOf('summaries')).toEqual([]);
  });

  it('the iPhone keeps it and queues it under the lecture; online the job writes it once (a retry adds nothing)', async () => {
    sync.state.enabled = true;
    const id = await requestSummary(LECTURE, SLIDER_DEFAULTS, resources, plan());
    expect(local.summaries[id]).toMatchObject({ file_id: LECTURE, status: 'pending', result: null });
    expect(sync.queued).toEqual([{ kind: 'request_summary', key: LECTURE, payload: expect.objectContaining({ id, status: 'pending' }) }]);
    expect(rowsOf('summaries')).toEqual([]);
    await sync.handlers.request_summary.run(sync.queued[0].payload);
    await sync.handlers.request_summary.run(sync.queued[0].payload);
    expect(rowsOf('summaries')).toHaveLength(1);
    expect(jest.requireMock('../session.service').ensureLectureOnServer).toHaveBeenCalledWith(LECTURE);
  });
});

describe('earlier notes (legacy-note-v1) and requests live in one table, never mixed up', () => {
  const legacy = { id: 'old', user_id: 'user-1', file_id: LECTURE, mode: 'new', sliders: { summaryLevel: 'standard' }, status: 'done', result: { format: 'legacy-note-v1', isConfirmed: true, title: 'Neuronas' }, created_at: '2026-10-01T00:00:00Z' };
  const request = { id: 'req', user_id: 'user-1', file_id: LECTURE, mode: 'new', sliders: SLIDER_DEFAULTS, status: 'pending', result: null, created_at: '2026-10-30T00:00:00Z' };
  const file = { id: LECTURE, deleted_at: null } as FileRow;

  it('a request is told by its empty result and its 10 sliders', () => {
    expect(isSummaryRequest(request as unknown as SummaryRow)).toBe(true);
    expect(isSummaryRequest(legacy as unknown as SummaryRow)).toBe(false);
    expect(isSummaryRequest({ ...request, sliders: { summaryLevel: 'standard' } } as unknown as SummaryRow)).toBe(false);
    // Step 7.9: Extend, Merge and Exam pack requests are requests too; other modes are not.
    expect(isSummaryRequest({ ...request, mode: 'extend' } as unknown as SummaryRow)).toBe(true);
    expect(isSummaryRequest({ ...request, mode: 'exam_pack' } as unknown as SummaryRow)).toBe(true);
    expect(isSummaryRequest({ ...request, mode: 'quiz' } as unknown as SummaryRow)).toBe(false);
  });

  it('the earlier-note readers skip a newer request', () => {
    const rows = [legacy, request] as unknown as SummaryRow[];
    expect(latestNote(rows, file)?.id).toBe('old');
    expect(lecturesWithNotes([request] as unknown as SummaryRow[], [LECTURE]).size).toBe(0);
    expect(readLegacyNote(null)).toBeNull();
  });

  it('the Summary tab’s request skips the earlier note', async () => {
    serverWrite('summaries', legacy);
    expect(await latestSummaryRequest(LECTURE)).toBeNull();
  });
});

describe('step 7.4: the summary started, read back by status', () => {
  const functions = jest.requireMock('../../lib/functions') as { callFunction: jest.Mock; FunctionError: new (m: string, s: number, c: string) => Error };
  const consent = jest.requireMock('../consent.service') as { ensureConsent: jest.Mock; forgetConsent: jest.Mock };
  beforeEach(() => {
    functions.callFunction.mockReset().mockResolvedValue({ status: 'generating' });
    consent.ensureConsent.mockClear();
  });

  it('startSummary: the consent (images only with media), then summarize with the row', async () => {
    await startSummary(LECTURE, 'sum-1');
    expect(consent.ensureConsent.mock.calls).toEqual([['assistant_summary']]);
    expect(functions.callFunction).toHaveBeenCalledWith('summarize', { lectureId: LECTURE, summaryId: 'sum-1' });
    consent.ensureConsent.mockClear();
    await startSummary(LECTURE, 'sum-1', { media: true });
    expect(consent.ensureConsent.mock.calls).toEqual([['assistant_summary'], ['images']]);
  });

  it('already started (another device): fine; consent withdrawn: forgotten and thrown', async () => {
    functions.callFunction.mockRejectedValueOnce(new functions.FunctionError('x', 409, 'already_started'));
    await expect(startSummary(LECTURE, 'sum-1')).resolves.toBeUndefined();
    functions.callFunction.mockRejectedValueOnce(new functions.FunctionError('x', 403, 'consent_required'));
    await expect(startSummary(LECTURE, 'sum-1')).rejects.toThrow();
    expect(consent.forgetConsent).toHaveBeenCalled();
  });

  it('latestSummary: the newest request or new-engine summary, never an earlier note', async () => {
    serverWrite('summaries', { id: 'old', file_id: LECTURE, mode: 'new', sliders: { summaryLevel: 'x' }, status: 'done', result: { format: 'legacy-note-v1' }, created_at: '2026-10-31T00:00:00Z' });
    expect(await latestSummary(LECTURE)).toBeNull();
    serverWrite('summaries', { id: 'req', file_id: LECTURE, mode: 'new', sliders: SLIDER_DEFAULTS, status: 'generating', result: null, applied_settings: { preview: '≈ 1,440 words', resources }, created_at: '2026-10-30T00:00:00Z' });
    expect(await latestSummary(LECTURE)).toMatchObject({ id: 'req', status: 'generating', result: null, settings: { preview: '≈ 1,440 words' } });
    serverWrite('summaries', { id: 'req', status: 'done', result: { format: 'studiply-summary-v1', coverage: {} } });
    expect(await latestSummary(LECTURE)).toMatchObject({ id: 'req', status: 'done', result: { format: 'studiply-summary-v1' } });
    // The earlier-note readers still skip it.
    expect(latestNote(rowsOf('summaries') as unknown as SummaryRow[], { id: LECTURE, deleted_at: null } as FileRow)?.id).toBe('old');
  });

  it('retrySummary: a new pending row with the same settings, started at once', async () => {
    serverWrite('summaries', { id: 'bad', file_id: LECTURE, mode: 'new', sliders: SLIDER_DEFAULTS, status: 'failed', error: 'too_long', result: null, applied_settings: { preview: 'p', resources } });
    const failed = (await latestSummary(LECTURE))!;
    await retrySummary(LECTURE, failed);
    const fresh = rowsOf('summaries').find((r) => r.id !== 'bad')!;
    expect(fresh).toMatchObject({ file_id: LECTURE, mode: 'new', status: 'pending', sliders: SLIDER_DEFAULTS, applied_settings: { preview: 'p', resources } });
    expect(functions.callFunction).toHaveBeenCalledWith('summarize', { lectureId: LECTURE, summaryId: fresh.id });
  });

  it('the iPhone: once the request reaches the server, the summary starts (no dialog); failing to start leaves it pending', async () => {
    sync.state.enabled = true;
    await requestSummary(LECTURE, SLIDER_DEFAULTS, resources, plan());
    functions.callFunction.mockRejectedValueOnce(new Error('403'));
    await sync.handlers.request_summary.run(sync.queued[0].payload);
    expect(functions.callFunction).toHaveBeenCalledWith('summarize', { lectureId: LECTURE, summaryId: (sync.queued[0].payload as { id: string }).id });
    expect(rowsOf('summaries')[0].status).toBe('pending');
    expect(consent.ensureConsent).not.toHaveBeenCalled();
  });
});

describe('the add buttons', () => {
  it('+ Link: a link row on the lecture; a word that isn’t a web address is refused', async () => {
    await addLink(LECTURE, ' https://example.org/tema1 ');
    expect(rowsOf('media')).toEqual([expect.objectContaining({ lecture_id: LECTURE, kind: 'link', url: 'https://example.org/tema1' })]);
    await expect(addLink(LECTURE, 'tema1')).rejects.toThrow(/web address/);
  });

  it('+ Slides or PDF: the PDF in Storage and a slides row on the lecture; a photo is refused', async () => {
    await addSlides(LECTURE, { uri: 'file:///t.pdf', name: 'Tema1.pdf', mimeType: 'application/pdf', sizeBytes: 1000 });
    const [row] = rowsOf('media');
    expect(row).toMatchObject({ lecture_id: LECTURE, kind: 'slides', caption: 'Tema1.pdf', mime_type: 'application/pdf', size_bytes: 1000 });
    expect(String(row.storage_path)).toMatch(new RegExp(`^user-1/${LECTURE}/.+\\.pdf$`));
    await expect(addSlides(LECTURE, { uri: 'file:///p.jpg', name: 'p.jpg', mimeType: 'image/jpeg', sizeBytes: 10 })).rejects.toThrow(/PDF/);
  });
});
