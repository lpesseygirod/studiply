// Offline search on the iPhone (step 3.5): the same hits as search_library
// (supabase/tests/database/11_search.test.sql), from cached rows.
import type { CourseRow, FileRow, FolderRow, SegmentRow, SummaryRow } from '../../cloudRows';
import { noteParts, searchRows, type SearchSource } from '../localSearch';

const T = (n: number) => `2026-10-${String(n).padStart(2, '0')}T10:00:00.000Z`;
const course = (id: string, name: string, over: Partial<CourseRow> = {}) =>
  ({ id, user_id: 'u', name, color: '#2E7D32', is_archived: false, deleted_at: null, starred_at: null, updated_at: T(1), ...over }) as CourseRow;
const folder = (id: string, name: string, over: Partial<FolderRow> = {}) =>
  ({ id, user_id: 'u', course_id: 'bio', parent_id: null, name, deleted_at: null, updated_at: T(1), ...over }) as FolderRow;
const file = (id: string, title: string, over: Partial<FileRow> = {}) =>
  ({ id, user_id: 'u', kind: 'lecture', title, course_id: 'bio', folder_id: 'f1', deleted_at: null, starred_at: null, last_opened_at: null, created_at: T(1), updated_at: T(1), ...over }) as FileRow;
const note = (fileId: string, result: object, created = T(2)) =>
  ({ id: `s-${fileId}-${created}`, user_id: 'u', file_id: fileId, created_at: created, updated_at: created, result: { format: 'legacy-note-v1', isConfirmed: true, ...result } }) as unknown as SummaryRow;
const seg = (start_ms: number, text: string): SegmentRow => ({ start_ms, end_ms: start_ms + 4000, text, confidence: null });

function source(): SearchSource {
  return {
    courses: [course('bio', 'Biología'), course('cat', 'Col·legi', { color: '#455A64' }), course('old', 'Filogenético viejo', { deleted_at: T(3) })],
    folders: [folder('f1', 'Tema 3'), folder('f2', 'Filogenia', { parent_id: 'f1' })],
    files: [
      file('l1', 'Clase 4'),
      file('trashed', 'Árbol filogenético (borrada)', { deleted_at: T(3) }),
      file('pdf', 'Resumen FILOGENÉTICO.pdf', { kind: 'pdf', folder_id: null }),
      file('holder', 'Project Files'),
    ],
    summaries: [
      note('l1', { title: 'Viejo', summary: 'Una palabra antigua: zarzaparrilla.' }, T(1)),
      note('l1', {
        title: 'Filogenia',
        summary: 'Cómo se construye un árbol filogenético a partir de caracteres.',
        keyConcepts: [
          { term: 'Árbol filogenético', explanation: 'Diagrama de parentesco.' },
          { term: 'Clado', explanation: 'Grupo con su ancestro común.' },
        ],
        definitions: JSON.stringify([{ term: 'Homología', definition: 'Semejanza por ancestro común.' }]),
        formulas: [],
      }),
    ],
    segments: new Map([
      ['l1', [
        seg(60000, 'Hoy hablamos de células.'),
        seg(1400000, 'Y un cuarto filogenético.'),
        seg(1102000, 'El parentesco filogenético se ve en el árbol.'),
        seg(1200000, 'Otro árbol filogenético.'),
        seg(1300000, 'Un tercer análisis FILOGENÉTICO.'),
      ]],
      ['trashed', [seg(1000, 'Filogenético en la papelera.')]],
    ]),
  };
}

describe('searchRows', () => {
  const hits = searchRows(source(), 'filogenetico');

  it('finds titles without case or accents, never the trash or the hidden holder', () => {
    expect(hits.filter((h) => h.field === 'title').map((h) => h.itemId)).toEqual(['pdf']);
    expect(hits.some((h) => h.itemId === 'trashed' || h.itemId === 'old')).toBe(false);
    expect(searchRows(source(), 'project files')).toEqual([]);
  });

  it('transcripts: the 3 earliest per lecture, with their time and course', () => {
    const t = hits.filter((h) => h.kind === 'transcript');
    expect(t.map((h) => h.tMs)).toEqual([1102000, 1200000, 1300000]);
    expect(t[0]).toMatchObject({ itemId: 'l1', title: 'Clase 4', courseName: 'Biología', courseColor: '#2E7D32', folderId: 'f1', matched: 'El parentesco filogenético se ve en el árbol.' });
  });

  it('notes: one hit per lecture (the first part that matches), terms on their own', () => {
    expect(hits.filter((h) => h.kind === 'note').map((h) => h.field)).toEqual(['summary']);
    expect(hits.filter((h) => h.kind === 'term').map((h) => h.matched)).toEqual(['Árbol filogenético — Diagrama de parentesco.']);
  });

  it('orders titles, then terms, notes, transcripts', () => {
    expect(hits.map((h) => h.kind)).toEqual(['file', 'term', 'note', 'transcript', 'transcript', 'transcript']);
  });

  it('searches a definition saved as a JSON string, only the newest note, and Catalan words', () => {
    expect(searchRows(source(), 'HOMOLOGIA').map((h) => h.kind)).toEqual(['term']);
    expect(searchRows(source(), 'zarzaparrilla')).toEqual([]);
    expect(searchRows(source(), 'collegi').map((h) => [h.kind, h.itemId])).toEqual([['course', 'cat']]);
    expect(searchRows(source(), 'filogenia').find((h) => h.kind === 'folder')).toMatchObject({ itemId: 'f2', folderId: 'f1', courseId: 'bio' });
  });

  it('needs 2 letters', () => {
    expect(searchRows(source(), 'f')).toEqual([]);
  });
});

describe('noteParts', () => {
  it('reads every part in order, and ignores lists it can\'t read', () => {
    expect(
      noteParts({ title: 'T', summary: null, keyConcepts: 'not json', formulas: [{ name: 'Área', expression: 'πr²', description: 'del círculo' }] }),
    ).toEqual([
      { field: 'title', term: null, body: 'T' },
      { field: 'summary', term: null, body: null },
      { field: 'formula', term: 'Área', body: 'πr² del círculo' },
    ]);
  });
});
