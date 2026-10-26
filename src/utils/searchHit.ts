/**
 * searchHit.ts
 * What a Search result shows and opens (step 3.5, docs/design iphone-09),
 * pure so it is tested: the chips, each hit's badge ("Transcript 18:22"),
 * and the screen it opens.
 */

import type { Href } from 'expo-router';

import type { SearchHit } from '../lib/cache/localSearch';
import { formatHitTime, matches } from './searchText';
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
 * Where a result opens. A lecture opens its notes with the word marked
 * (`find`), a transcript hit scrolled to its time (`at`, ms); a course or
 * folder opens there; PDFs, photos and the kinds without a screen of their
 * own open their course at their folder (as their tiles do from Library).
 */
export function hitTarget(hit: SearchHit, query: string): Href {
  const find = query.trim();
  switch (hit.kind) {
    case 'course':
      return `/project/${hit.itemId}`;
    case 'folder':
      return courseAt(hit.courseId, hit.itemId);
    case 'file':
      return hit.fileKind === 'lecture'
        ? { pathname: '/note/[id]', params: { id: hit.itemId, find } }
        : courseAt(hit.courseId, hit.folderId);
    case 'note':
    case 'term':
      return { pathname: '/note/[id]', params: { id: hit.itemId, find } };
    case 'transcript':
      return {
        pathname: '/note/[id]',
        params: { id: hit.itemId, find, ...(hit.tMs !== null && { at: String(hit.tMs) }) },
      };
  }
}

// ── A note opened from Search ───────────────────────────────────────────

export type NoteFindSection = 'summary' | 'concepts' | 'formulas' | 'definitions' | 'transcript';

export interface NoteFindParts {
  summary: string | null;
  concepts: { term?: string; explanation?: string }[];
  formulas: { name?: string; expression?: string; description?: string }[];
  definitions: { term?: string; definition?: string }[];
  /** The transcript's lines; start in seconds (Transcript.segments). */
  segments: { start: number; text: string }[];
}

export interface NoteFindTarget {
  section: NoteFindSection;
  /** The transcript line to show (transcript only). */
  segment: number | null;
}

/**
 * Where a note opened from Search scrolls to: a transcript hit's own line
 * (`atMs`), else the first part of the note with the word, top to bottom.
 */
export function findInNote(parts: NoteFindParts, find: string, atMs: number | null): NoteFindTarget | null {
  const has = (...texts: (string | null | undefined)[]) => matches(texts.filter(Boolean).join(' '), find);
  const lines = parts.segments.map((s, i) => ({ i, ms: s.start * 1000, hit: has(s.text) })).filter((l) => l.hit);
  if (atMs !== null && lines.length > 0) {
    // The hit's line (times are rounded), else the next one with the word.
    const line = lines.find((l) => Math.abs(l.ms - atMs) < 1000) ?? lines.find((l) => l.ms >= atMs) ?? lines[0];
    return { section: 'transcript', segment: line.i };
  }
  if (has(parts.summary)) return { section: 'summary', segment: null };
  if (parts.concepts.some((k) => has(k.term, k.explanation))) return { section: 'concepts', segment: null };
  if (parts.formulas.some((f) => has(f.name, f.expression, f.description))) return { section: 'formulas', segment: null };
  if (parts.definitions.some((d) => has(d.term, d.definition))) return { section: 'definitions', segment: null };
  return lines.length > 0 ? { section: 'transcript', segment: lines[0].i } : null;
}
