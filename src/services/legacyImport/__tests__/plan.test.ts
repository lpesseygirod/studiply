import { NOTE_BLOCKS } from '../../../lib/noteBlocks';
import {
  chunkTiming,
  CHUNK_MS,
  IMPORT_DEVICE,
  planImport,
  summarizeProfiles,
  type LegacySnapshot,
  type OldFolder,
  type OldNote,
  type OldProject,
  type OldSession,
  type OldSourceFile,
} from '../plan';

const NOW = new Date('2026-10-26T10:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 3600 * 1000).toISOString();
const T0 = '2025-03-01T09:00:00.000Z';
const T1 = '2025-03-02T18:30:00.000Z';

const project = (id: string, over: Partial<OldProject> = {}): OldProject => ({
  id, user_id: 'me', name: id, color: '#6C63FF', icon: 'folder', sort_order: 0, is_archived: 0, is_deleted: 0,
  deleted_at: null, created_at: T0, updated_at: T1, ...over,
});
const folder = (id: string, over: Partial<OldFolder> = {}): OldFolder => ({
  id, user_id: 'me', project_id: 'psico', parent_folder_id: null, name: id, sort_order: 0, is_deleted: 0,
  deleted_at: null, created_at: T0, updated_at: T1, ...over,
});
const session = (id: string, over: Partial<OldSession> = {}): OldSession => ({
  id, user_id: 'me', project_id: 'psico', folder_id: null, title: id, recording_mode: 'lecture', language: 'es',
  status: 'completed', duration_seconds: 45 * 60, is_deleted: 0, deleted_at: null, created_at: T0, updated_at: T1, ...over,
});
const source = (id: string, sessionId: string, over: Partial<OldSourceFile> = {}): OldSourceFile => ({
  id, session_id: sessionId, user_id: 'me', file_type: 'audio', file_path: `file:///cache/AV/${id}.m4a`,
  file_size_bytes: 1000, mime_type: 'audio/m4a', retention_policy: 'keep_permanently', is_deleted: 0,
  storage_path: `me/${sessionId}/${id}.m4a`, created_at: T0, ...over,
});
const note = (id: string, sessionId: string, over: Partial<OldNote> = {}): OldNote => ({
  id, session_id: sessionId, user_id: 'me', title: 'Neuronas', summary_level: 'extra', summary: 'Las neuronas…',
  key_concepts: '[{"term":"sinapsis"}]', formulas: '[]', definitions: 'not json', tags: '["bio", 3]', unclear_parts: '[]',
  manual_annotations: '{"clarifications":[{"highlightedParts":["x"],"response":"y","createdAt":"2025-03-02T10:00:00Z"}]}',
  is_confirmed: 1, is_deleted: 0, created_at: T0, updated_at: T1, ...over,
});

function snapshot(over: Partial<LegacySnapshot> = {}): LegacySnapshot {
  return {
    profiles: [
      { id: 'me', username: 'Lea', display_name: 'Lea', created_at: T0 },
      { id: 'local-test', username: 'test', display_name: null, created_at: T1 },
    ],
    projects: [project('psico', { name: 'Psicobiología' }), project('test-course', { user_id: 'local-test', name: 'Test' })],
    folders: [folder('sub', { parent_folder_id: 'tema1' }), folder('tema1', { name: 'Tema 1' })],
    sessions: [
      session('l1', { folder_id: 'sub', title: 'Clase 1' }),
      session('test-lecture', { user_id: 'local-test', project_id: 'test-course' }),
    ],
    sourceFiles: [
      source('a0', 'l1', { created_at: '2025-03-01T09:00:00.000Z' }),
      source('a1', 'l1', { created_at: '2025-03-01T09:20:00.000Z' }),
      source('a2', 'l1', { created_at: '2025-03-01T09:40:00.000Z' }),
      source('pdf', 'l1', { file_type: 'pdf', file_path: 'file:///cache/DocumentPicker/Tema%201.pdf', storage_path: null, mime_type: 'application/pdf' }),
      source('photo', 'l1', { file_type: 'photo', file_path: 'file:///cache/ImagePicker/x.jpg', storage_path: null }),
      source('gone', 'l1', { file_type: 'photo', is_deleted: 1 }),
    ],
    transcripts: [{
      id: 't1', session_id: 'l1', language: 'es', full_text: 'Hola. Adiós.', confidence_score: 0.87, created_at: T0,
      segments: JSON.stringify([{ id: 0, start: 0, end: 2.5, text: 'Hola.' }, { id: 1, start: 1210.25, end: 1212, text: 'Adiós.' }]),
    }],
    notes: [note('n1', 'l1')],
    ...over,
  };
}

const mine = (s = snapshot()) => planImport(s, { profileIds: ['me'], now: NOW });

describe('planImport: what the old data becomes', () => {
  it('keeps ids and dates, only for the chosen profiles', () => {
    const plan = mine();
    expect(plan.courses).toEqual([expect.objectContaining({ id: 'psico', name: 'Psicobiología', created_at: T0, updated_at: T1, deleted_at: null })]);
    expect(plan.files.map((f) => f.id)).toEqual(['l1']);
    expect(plan.summaries.map((s) => s.id)).toEqual(['n1']);
    expect(plan.media.map((m) => m.id)).toEqual(['pdf', 'photo']);
  });

  it('folders come parents first', () => {
    expect(mine().folders.map((f) => f.id)).toEqual(['tema1', 'sub']);
    expect(mine().folders[1]).toMatchObject({ course_id: 'psico', parent_id: 'tema1' });
  });

  it('a session becomes a lecture file and a lecture (status, language, length, confidence, retention)', () => {
    const plan = mine(snapshot({ sessions: [session('l1', { folder_id: 'sub', status: 'review', language: 'auto' })] }));
    expect(plan.files[0]).toMatchObject({ kind: 'lecture', course_id: 'psico', folder_id: 'sub' });
    expect(plan.lectures[0]).toMatchObject({
      id: 'l1', status: 'transcribing', language: null, duration_ms: 2_700_000, recorded_at: T0,
      avg_confidence: 0.87, audio_retention: 'keep_permanently',
    });
    expect(mine().lectures[0]).toMatchObject({ status: 'ready', language: 'es' });
  });

  it('every section of an old note is the student\'s, clarifications included: none is ai', () => {
    const result = mine().summaries[0].result as { blocks: Record<string, { origin: string; editedAt: string; device: string }> } & Record<string, unknown>;
    expect(Object.keys(result.blocks).sort()).toEqual([...NOTE_BLOCKS].sort());
    for (const meta of Object.values(result.blocks)) {
      expect(meta).toEqual({ origin: 'student', editedAt: T1, device: IMPORT_DEVICE });
    }
    expect(result.blocks.clarifications.origin).toBe('student');
    expect(result).toMatchObject({
      format: 'legacy-note-v1', title: 'Neuronas', summaryLevel: 'extra', recordingMode: 'lecture',
      keyConcepts: [{ term: 'sinapsis' }], definitions: [], tags: ['bio'], isConfirmed: true,
      manualAnnotations: expect.stringContaining('clarifications'),
    });
    expect(mine().summaries[0]).toMatchObject({ file_id: 'l1', mode: 'new', status: 'done', sliders: { summaryLevel: 'extra' } });
  });

  it('transcripts: seconds become ms; without segments the full text is one segment', () => {
    expect(mine().transcripts[0]).toEqual({
      lectureId: 'l1',
      segments: [{ start_ms: 0, end_ms: 2500, text: 'Hola.' }, { start_ms: 1_210_250, end_ms: 1_212_000, text: 'Adiós.' }],
    });
    const plain = mine(snapshot({ transcripts: [{ ...snapshot().transcripts[0], segments: null }] }));
    expect(plain.transcripts[0].segments).toEqual([{ start_ms: 0, end_ms: 2_700_000, text: 'Hola. Adiós.' }]);
  });

  it('audio chunks: in order, 20 minutes each, the last one the rest; transcribed when there is a transcript', () => {
    const audio = mine().audio;
    expect(audio.map((a) => [a.seq, a.startMs, a.durationMs, a.status])).toEqual([
      [0, 0, CHUNK_MS, 'transcribed'],
      [1, CHUNK_MS, CHUNK_MS, 'transcribed'],
      [2, 2 * CHUNK_MS, 5 * 60 * 1000, 'transcribed'],
    ]);
    expect(audio[0].file).toEqual({ storagePath: 'me/l1/a0.m4a', filePath: 'file:///cache/AV/a0.m4a' });
    expect(chunkTiming(1, null)).toEqual([{ startMs: 0, durationMs: CHUNK_MS }]);
    expect(chunkTiming(2, 30)).toEqual([{ startMs: 0, durationMs: CHUNK_MS }, { startMs: CHUNK_MS, durationMs: 1 }]);
  });

  it('photos and PDFs: a PDF keeps its file name; files removed in the old app are left out', () => {
    expect(mine().media).toEqual([
      expect.objectContaining({ id: 'pdf', kind: 'slides', caption: 'Tema 1.pdf', lectureId: 'l1' }),
      expect.objectContaining({ id: 'photo', kind: 'photo', caption: null }),
    ]);
  });
});

describe('planImport: old trash', () => {
  it('recent trash goes to Recently Deleted with its date', () => {
    const plan = mine(snapshot({ sessions: [session('l1', { is_deleted: 1, deleted_at: daysAgo(3) })] }));
    expect(plan.files[0].deleted_at).toBe(daysAgo(3));
  });

  it('trash older than 30 days is left out (and counted)', () => {
    const plan = mine(snapshot({ sessions: [session('l1', { is_deleted: 1, deleted_at: daysAgo(40) })] }));
    expect(plan.files).toEqual([]);
    expect(plan.summaries).toEqual([]);
    expect(plan.audio).toEqual([]);
    expect(plan.skipped.oldTrash).toBe(1);
  });

  it('what is inside a trashed folder gets its date; inside an old trashed course, nothing comes', () => {
    const inFolder = mine(snapshot({ folders: [folder('sub', { parent_folder_id: 'tema1' }), folder('tema1', { is_deleted: 1, deleted_at: daysAgo(2) })] }));
    expect(inFolder.folders.map((f) => f.deleted_at)).toEqual([daysAgo(2), daysAgo(2)]);
    expect(inFolder.files[0].deleted_at).toBe(daysAgo(2));

    const oldCourse = mine(snapshot({ projects: [project('psico', { is_deleted: 1, deleted_at: daysAgo(90) })] }));
    expect([oldCourse.courses, oldCourse.folders, oldCourse.files]).toEqual([[], [], []]);
    expect(oldCourse.skipped.oldTrash).toBe(1);
  });

  it('a note in the old trash is left out (and counted)', () => {
    const plan = mine(snapshot({ notes: [note('n1', 'l1', { is_deleted: 1 }), note('n2', 'l1')] }));
    expect(plan.summaries.map((s) => s.id)).toEqual(['n2']);
    expect(plan.skipped.deletedNotes).toBe(1);
  });
});

describe('summarizeProfiles: what the screen shows to choose', () => {
  it('counts and first names per profile', () => {
    const [me, test] = summarizeProfiles(snapshot(), NOW);
    expect(me).toMatchObject({
      id: 'me', name: 'Lea', courses: 1, folders: 2, lectures: 1, notes: 1, transcripts: 1, recordings: 1,
      photos: 1, pdfs: 1, courseNames: ['Psicobiología'], lectureTitles: ['Clase 1'],
    });
    expect(test).toMatchObject({ id: 'local-test', name: 'test', courses: 1, lectures: 1, notes: 0 });
  });
});
