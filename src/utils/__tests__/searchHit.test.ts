import type { SearchHit } from '../../lib/cache/localSearch';
import { findInNote, hitBadge, hitsForChip, hitTarget, isTitleHit } from '../searchHit';

const hit = (over: Partial<SearchHit>): SearchHit => ({
  kind: 'file', itemId: 'x', fileKind: null, courseId: 'bio', folderId: 'f1', courseName: 'Biología', courseColor: '#2E7D32',
  title: 'X', matched: 'X', field: 'title', tMs: null, rank: 3, ...over,
});

const course = hit({ kind: 'course', itemId: 'bio', folderId: null });
const folder = hit({ kind: 'folder', itemId: 'f2', folderId: 'f1' });
const pdf = hit({ kind: 'file', itemId: 'p', fileKind: 'pdf' });
const lecture = hit({ kind: 'file', itemId: 'l1', fileKind: 'lecture' });
const summary = hit({ kind: 'note', itemId: 'l1', fileKind: 'lecture', field: 'summary' });
const term = hit({ kind: 'term', itemId: 'l1', fileKind: 'lecture', field: 'concept' });
const transcript = hit({ kind: 'transcript', itemId: 'l1', fileKind: 'lecture', field: 'transcript', tMs: 1102000 });

describe('chips', () => {
  const all = [course, folder, pdf, lecture, summary, term, transcript];
  it('All · Notes · Transcripts · Titles', () => {
    expect(hitsForChip(all, 'all')).toHaveLength(7);
    expect(hitsForChip(all, 'notes')).toEqual([summary, term]);
    expect(hitsForChip(all, 'transcripts')).toEqual([transcript]);
    expect(hitsForChip(all, 'titles')).toEqual([course, folder, pdf, lecture]);
    expect(all.filter(isTitleHit)).toEqual([course, folder, pdf, lecture]);
  });
});

describe('hitBadge', () => {
  it('says what was found', () => {
    expect([course, folder, pdf, lecture, summary, term, transcript].map(hitBadge)).toEqual([
      'Course', 'Folder', 'PDF', 'Lecture', 'Summary', 'Term', 'Transcript 18:22',
    ]);
    expect(hitBadge(hit({ kind: 'note', field: 'definition' }))).toBe('Definition');
    expect(hitBadge(hit({ kind: 'note', field: 'formula' }))).toBe('Formula');
  });
});

describe('hitTarget', () => {
  it('opens a course or a folder there', () => {
    expect(hitTarget(course, 'bio')).toBe('/project/bio');
    expect(hitTarget(folder, 'tema')).toEqual({ pathname: '/project/[id]', params: { id: 'bio', folder: 'f2' } });
  });

  it('opens a PDF where it is, like its tile', () => {
    expect(hitTarget(pdf, 'resumen')).toEqual({ pathname: '/project/[id]', params: { id: 'bio', folder: 'f1' } });
  });

  it('opens a lecture with the word marked, a transcript hit at its time', () => {
    expect(hitTarget(lecture, ' filo ')).toEqual({ pathname: '/note/[id]', params: { id: 'l1', find: 'filo' } });
    expect(hitTarget(term, 'arbol')).toEqual({ pathname: '/note/[id]', params: { id: 'l1', find: 'arbol' } });
    expect(hitTarget(transcript, 'filogenetico')).toEqual({
      pathname: '/note/[id]',
      params: { id: 'l1', find: 'filogenetico', at: '1102000' },
    });
  });
});

describe('findInNote', () => {
  const parts = {
    summary: 'Cómo se construye un árbol.',
    concepts: [{ term: 'Clado', explanation: 'Grupo con su ancestro común.' }],
    formulas: [],
    definitions: [{ term: 'Homología', definition: 'Semejanza filogenética.' }],
    segments: [
      { start: 60, text: 'Hoy hablamos de células.' },
      { start: 1102, text: 'El parentesco filogenético.' },
      { start: 1200, text: 'Otro árbol filogenético.' },
    ],
  };

  it('a transcript hit opens at its own line', () => {
    expect(findInNote(parts, 'filogenetico', 1200000)).toEqual({ section: 'transcript', segment: 2 });
    expect(findInNote(parts, 'filogenetico', 1150000)).toEqual({ section: 'transcript', segment: 2 });
  });

  it('otherwise the first part of the note with the word, top to bottom', () => {
    expect(findInNote(parts, 'arbol', null)).toEqual({ section: 'summary', segment: null });
    expect(findInNote(parts, 'ancestro', null)).toEqual({ section: 'concepts', segment: null });
    expect(findInNote(parts, 'filogenetica', null)).toEqual({ section: 'definitions', segment: null });
    expect(findInNote(parts, 'celulas', null)).toEqual({ section: 'transcript', segment: 0 });
    expect(findInNote(parts, 'zarzaparrilla', null)).toBeNull();
  });
});
