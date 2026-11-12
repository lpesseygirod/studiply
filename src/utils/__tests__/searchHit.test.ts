import type { SearchHit } from '../../lib/cache/localSearch';
import { hitBadge, hitsForChip, hitTarget, isTitleHit } from '../searchHit';

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
    expect(hitTarget(course)).toBe('/project/bio');
    expect(hitTarget(folder)).toEqual({ pathname: '/project/[id]', params: { id: 'bio', folder: 'f2' } });
  });

  it('opens a PDF where it is, like its tile', () => {
    expect(hitTarget(pdf)).toEqual({ pathname: '/project/[id]', params: { id: 'bio', folder: 'f1' } });
  });

  it('opens a lecture as its document: the Summary tab, the Transcript tab for a transcript hit', () => {
    expect(hitTarget(lecture)).toEqual({ pathname: '/doc/[id]', params: { id: 'l1', tab: 'summary' } });
    expect(hitTarget(summary)).toEqual({ pathname: '/doc/[id]', params: { id: 'l1', tab: 'summary' } });
    expect(hitTarget(term)).toEqual({ pathname: '/doc/[id]', params: { id: 'l1', tab: 'summary' } });
    expect(hitTarget(transcript)).toEqual({ pathname: '/doc/[id]', params: { id: 'l1', tab: 'transcript' } });
  });
});
