/**
 * searchHit.ts
 * What a Search result shows and opens (docs/design iphone-09),
 * pure so it is tested: the chips, each hit's badge ("Transcript 18:22"),
 * and the screen it opens.
 */

import type { Href } from 'expo-router';

import type { SearchHit } from '../lib/cache/localSearch';
import { formatHitTime } from './searchText';
import { courseAt, fileKind, typeLabel } from './shelf';

export type SearchChip = 'all' | 'notes' | 'transcripts' | 'titles';

export const SEARCH_CHIPS: { key: SearchChip; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'notes', label: 'Notes' },
  { key: 'transcripts', label: 'Transcripts' },
  { key: 'titles', label: 'Titles' },
];

export function hitsForChip(hits: SearchHit[], chip: SearchChip): SearchHit[] {
  switch (chip) {
    case 'all':
      return hits;
    case 'notes':
      return hits.filter((h) => h.kind === 'note' || h.kind === 'term');
    case 'transcripts':
      return hits.filter((h) => h.kind === 'transcript');
    case 'titles':
      return hits.filter((h) => h.kind === 'course' || h.kind === 'folder' || h.kind === 'file');
  }
}

const NOTE_PART: Record<SearchHit['field'], string> = {
  title: 'Summary',
  summary: 'Summary',
  concept: 'Key concept',
  definition: 'Definition',
  formula: 'Formula',
  transcript: 'Transcript',
};

/** The badge on the right of a result. */
export function hitBadge(hit: SearchHit): string {
  switch (hit.kind) {
    case 'course':
      return 'Course';
    case 'folder':
      return 'Folder';
    case 'file':
      return typeLabel(fileKind(hit.fileKind ?? ''));
    case 'term':
      return 'Term';
    case 'note':
      return NOTE_PART[hit.field];
    case 'transcript':
      return hit.tMs === null ? 'Transcript' : `Transcript ${formatHitTime(hit.tMs)}`;
  }
}

/** A title hit shows its title highlighted; the others their matched text under the title. */
export function isTitleHit(hit: SearchHit): boolean {
  return hit.kind === 'course' || hit.kind === 'folder' || hit.kind === 'file';
}

/**
 * Where a result opens. A lecture opens as its document: the Summary tab for
 * its title, notes and terms, the Transcript tab for a transcript hit (the
 * word isn't marked there yet); a course or folder opens there; PDFs, photos
 * and the kinds without a screen of their own open their course at their
 * folder (as their tiles do from Library).
 */
export function hitTarget(hit: SearchHit): Href {
  switch (hit.kind) {
    case 'course':
      return `/project/${hit.itemId}`;
    case 'folder':
      return courseAt(hit.courseId, hit.itemId);
    case 'file':
      return hit.fileKind === 'lecture'
        ? { pathname: '/doc/[id]', params: { id: hit.itemId, tab: 'summary' } }
        : courseAt(hit.courseId, hit.folderId);
    case 'note':
    case 'term':
      return { pathname: '/doc/[id]', params: { id: hit.itemId, tab: 'summary' } };
    case 'transcript':
      return { pathname: '/doc/[id]', params: { id: hit.itemId, tab: 'transcript' } };
  }
}
