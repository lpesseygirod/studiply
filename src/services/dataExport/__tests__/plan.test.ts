// Step 10.1b-4: what goes where in "Export my data", from a fixture library; parts of 500 MB.
import { EXPORT_TABLES, planExport, type ExportSnapshot, type ExportTables } from '../plan';
import { exportSize, PART_LIMIT_BYTES, partFileName, splitParts } from '../parts';

const T = '2026-11-01T10:00:00Z';
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (...content: object[]) => ({ type: 'doc', content });

function snapshot(): ExportSnapshot {
  const tables = Object.fromEntries(EXPORT_TABLES.map((t) => [t, []])) as unknown as ExportTables;
  const set = <K extends keyof ExportTables>(k: K, rows: object[]) => {
    (tables as Record<string, unknown>)[k] = rows;
  };
  set('profiles', [{ id: 'u1', display_name: 'Lea', avatar_path: 'u1/profile/avatar.jpg' }]);
  set('courses', [
    { id: 'c1', name: 'Psicobiología', sort_order: 0, created_at: T, deleted_at: null },
    { id: 'c2', name: 'Old / course', sort_order: 1, created_at: T, deleted_at: T },
  ]);
  set('folders', [{ id: 'f1', course_id: 'c1', parent_id: null, name: 'Tema 1', deleted_at: null }]);
  const file = (id: string, kind: string, title: string, course_id: string | null, folder_id: string | null = null, sort_order = 0) => ({ id, kind, title, course_id, folder_id, sort_order, created_at: T, deleted_at: null });
  set('files', [
    file('l1', 'lecture', 'Clase 1', 'c1', 'f1', 0),
    file('l2', 'lecture', 'Clase 1', 'c1', 'f1', 1),
    file('d1', 'document', 'Apuntes: repaso', 'c1'),
    file('d2', 'document', 'Hoja', 'c1'),
    file('p1', 'pdf', 'Syllabus.pdf', 'c1'),
    file('l3', 'lecture', 'Vieja', 'c2'),
    file('n1', 'document', 'Sin curso', null),
  ]);
  const tab = (file_id: string, tabId: string, content: object, extra: object = {}) => ({ id: `${file_id}-${tabId}`, file_id, tab: tabId, title: null, kind: null, position: null, created_at: T, deleted_at: null, content, ...extra });
  set('documents', [
    tab('l1', 'notes', doc(p('Mis notas'), { type: 'image', attrs: { src: 'media:m1', alt: 'Pizarra' } })),
    tab('l1', 'summary', doc({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Resumen' }] })),
    tab('l1', 't-gone', doc(p('borrada')), { title: 'Borrada', deleted_at: T }),
    tab('d1', 'notes', doc(p('Repaso del tema'))),
    tab('d2', 'notes', doc(p('Hoja de cálculo'))),
    tab('d2', 't-1', doc({ type: 'sheetCell', attrs: { blockId: 'A1', input: '2' } }, { type: 'sheetCell', attrs: { blockId: 'B1', input: '=A1*3' } }), { title: 'Cuentas', kind: 'sheet', position: 1 }),
    tab('n1', 'notes', doc(p('Fuera de los cursos'))),
  ]);
  set('transcript_segments', [
    { lecture_id: 'l1', start_ms: 400000, text: 'La sinapsis química.' },
    { lecture_id: 'l1', start_ms: 0, text: 'Empezamos.' },
    { lecture_id: 'l2', start_ms: 0, text: 'Segunda clase.' },
    { lecture_id: 'l3', start_ms: 0, text: 'Clase vieja.' },
  ]);
  set('marks', [{ lecture_id: 'l1', t_ms: 400000, type: 'exam', level: 9, note: 'Entra, "seguro"' }]);
  set('assistant_messages', [
    { lecture_id: 'l1', role: 'user', content: '¿Qué es una sinapsis?', created_at: T },
    { lecture_id: 'l1', role: 'assistant', content: 'Es la unión entre neuronas.', created_at: '2026-11-01T10:00:05Z' },
  ]);
  set('audio_chunks', [
    { lecture_id: 'l1', seq: 0, storage_path: 'u1/l1/0000.webm' },
    { lecture_id: 'l1', seq: 1, storage_path: 'u1/l1/0001.webm' },
    { lecture_id: 'l1', seq: 2, storage_path: null },
  ]);
  set('media', [
    { id: 'm1', lecture_id: 'l1', file_id: null, kind: 'photo', caption: null, storage_path: 'u1/l1/m1.jpg', created_at: T },
    { id: 'm2', lecture_id: 'l1', file_id: null, kind: 'slides', caption: 'Tema 1.pdf', storage_path: 'u1/l1/m2.pdf', created_at: T },
    { id: 'm3', lecture_id: null, file_id: 'p1', kind: 'slides', caption: null, storage_path: 'u1/p1/s.pdf', created_at: T },
  ]);
  set('summaries', [{ file_id: 'l1', created_at: T, result: { format: 'legacy-note-v1', title: 'Clase 1', summary: 'Resumen antiguo.', keyConcepts: [{ term: 'Axón', definition: 'Lleva la señal.' }] } }]);
  set('flashcards', [{ course_id: 'c1', front: '¿Axón?', back: 'Lleva la señal', source: 'manual', created_at: T }]);
  set('quizzes', [{ id: 'q1', course_id: 'c1', title: 'Tema 1', deleted_at: null }]);
  set('quiz_questions', [{ quiz_id: 'q1', position: 0, prompt: '¿Qué es una sinapsis?', answer_text: 'Una unión', explanation: 'Entre neuronas' }]);
  set('quiz_attempts', [{ quiz_id: 'q1', started_at: '2026-11-02T09:00:00Z', points: 4, max_points: 5, passed: true }]);
  return {
    exportedAt: '2026-11-09T12:00:00Z',
    userId: 'u1',
    email: 'lea@example.com',
    deviceSettings: { default_retention_policy: 'delete_3_days' },
    tables,
    sizes: {
      'audio-chunks': { 'u1/l1/0000.webm': 1000 },
      photos: { 'u1/l1/m1.jpg': 50, 'u1/profile/avatar.jpg': 10 },
      slides: { 'u1/l1/m2.pdf': 200, 'u1/p1/s.pdf': 300 },
    },
  };
}

const plan = planExport(snapshot());
const text = (path: string) => plan.texts.find((t) => t.path === path)?.text;
const paths = () => [...plan.texts.map((t) => t.path), ...plan.files.map((f) => f.path)];

describe('planExport', () => {
  it('a README, settings.json and every table of hers in data/', () => {
    expect(plan.texts[0].path).toBe('README.txt');
    expect(text('README.txt')).toContain('Recording/');
    expect(text('README.txt')).toContain('1 stored file(s) could not be found');
    for (const table of EXPORT_TABLES) expect(text(`data/${table}.json`)).toBeDefined();
    expect(JSON.parse(text('data/marks.json')!)[0].note).toBe('Entra, "seguro"');
    const settings = JSON.parse(text('settings.json')!);
    expect(settings.account).toMatchObject({ id: 'u1', email: 'lea@example.com', display_name: 'Lea' });
    expect(settings.settingsOnThisDevice.default_retention_policy).toBe('delete_3_days');
  });

  it('a lecture: its tabs as Markdown (deleted tabs left out), the transcript with times, marks, the assistant, earlier notes', () => {
    const dir = 'Courses/Psicobiología/Tema 1/Clase 1/';
    expect(text(`${dir}My notes.md`)).toBe('Mis notas\n\n![Pizarra](Photos/Photo%201.jpg)\n');
    expect(text(`${dir}Summary.md`)).toBe('## Resumen\n');
    expect(paths().some((x) => x.includes('Borrada'))).toBe(false);
    expect(text(`${dir}Transcript.txt`)).toBe('[00:00] Empezamos.\n[06:40] La sinapsis química.\n');
    expect(text(`${dir}Marks.csv`)).toBe('time,type,level,note\r\n06:40,exam,9,"Entra, ""seguro"""\r\n');
    expect(text(`${dir}Assistant.md`)).toBe('# Study assistant\n\n**You:** ¿Qué es una sinapsis?\n\n**Studiply:** Es la unión entre neuronas.\n');
    expect(text(`${dir}Notes (earlier format).md`)).toContain('- **Axón** — Lleva la señal.');
  });

  it('its recording still kept, photos and slides, with their sizes; a missing file and deleted audio left out', () => {
    const dir = 'Courses/Psicobiología/Tema 1/Clase 1/';
    expect(plan.files.filter((f) => f.path.startsWith(dir)).map((f) => [f.path.slice(dir.length), f.bucket, f.storagePath, f.bytes])).toEqual([
      ['Photos/Photo 1.jpg', 'photos', 'u1/l1/m1.jpg', 50],
      ['Slides/Tema 1.pdf', 'slides', 'u1/l1/m2.pdf', 200],
      ['Recording/0000.webm', 'audio-chunks', 'u1/l1/0000.webm', 1000],
    ]);
    expect(plan.missing).toBe(1);
    expect(plan.counts).toMatchObject({ courses: 2, lectures: 3, recordings: 1, photos: 2, pdfs: 2 });
  });

  it('names: two lectures with one title, a title with a colon, a library PDF, a sheet tab as CSV', () => {
    expect(text('Courses/Psicobiología/Tema 1/Clase 1 (2)/Transcript.txt')).toBe('[00:00] Segunda clase.\n');
    expect(text('Courses/Psicobiología/Apuntes- repaso.md')).toBe('Repaso del tema\n');
    expect(plan.files.find((f) => f.storagePath === 'u1/p1/s.pdf')?.path).toBe('Courses/Psicobiología/Syllabus.pdf');
    expect(text('Courses/Psicobiología/Hoja/Tab 1.md')).toBe('Hoja de cálculo\n');
    expect(text('Courses/Psicobiología/Hoja/Cuentas.csv')).toBe('2,6\r\n');
  });

  it('flashcards and quizzes per course; the trash and what has no course apart; the profile photo', () => {
    expect(text('Courses/Psicobiología/Flashcards.csv')).toContain('¿Axón?,Lleva la señal,manual');
    const quiz = text('Courses/Psicobiología/Quizzes/Tema 1.md')!;
    expect(quiz).toContain('1. ¿Qué es una sinapsis?\n   - Answer: Una unión\n   - Why: Entre neuronas');
    expect(quiz).toContain('4 of 5 points (passed)');
    expect(text('Recently deleted/Courses/Old - course/Vieja/Transcript.txt')).toBe('[00:00] Clase vieja.\n');
    expect(paths().some((x) => x.startsWith('Courses/Old - course/'))).toBe(false);
    expect(text('Other/Sin curso.md')).toBe('Fuera de los cursos\n');
    expect(plan.files.find((f) => f.storagePath === 'u1/profile/avatar.jpg')?.path).toBe('Profile photo.jpg');
  });
});

describe('parts of 500 MB', () => {
  const file = (n: number, mb: number) => ({ path: `R/${n}.webm`, bucket: 'audio-chunks' as const, storagePath: `u/${n}`, bytes: mb * 1_000_000, kind: 'recording' as const });
  const texts = [{ path: 'README.txt', text: 'x'.repeat(1000) }];

  it('one part when it fits; text and data always in part 1', () => {
    const parts = splitParts({ texts, files: [file(1, 100), file(2, 100)] });
    expect(parts.map((p) => [p.index, p.texts.length, p.files.length])).toEqual([[1, 1, 2]]);
  });

  it('a new part when the next file would pass 500 MB; a file bigger than that alone', () => {
    const parts = splitParts({ texts, files: [file(1, 300), file(2, 199), file(3, 300), file(4, 700), file(5, 10)] });
    expect(parts.map((p) => p.files.map((f) => f.path))).toEqual([['R/1.webm', 'R/2.webm'], ['R/3.webm'], ['R/4.webm'], ['R/5.webm']]);
    expect(parts.every((p) => p.files.reduce((n, f) => n + f.bytes, 0) <= PART_LIMIT_BYTES || p.files.length === 1)).toBe(true);
    expect(parts.slice(1).every((p) => p.texts.length === 0)).toBe(true);
  });

  it('file names and the size line', () => {
    expect(partFileName('2026-11-09T12:00:00Z', 1, 1)).toBe('Studiply export 2026-11-09.zip');
    expect(partFileName('2026-11-09T12:00:00Z', 2, 3)).toBe('Studiply export 2026-11-09 (part 2 of 3).zip');
    expect(exportSize({ texts, files: [file(1, 300), { ...file(2, 5), kind: 'photo' as const }] })).toEqual({ total: 305_001_000, recordings: 300_000_000 });
  });
});
