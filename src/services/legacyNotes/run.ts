import type { LegacyNoteResult } from '../../lib/cloudRows';
import type { DocJSON } from '../../editor/types';
import { legacyNoteToDoc, type LegacyAttachment, type LegacyClarification } from './convert';

/**
 * Step 4.9: a lecture's earlier note becomes its Summary tab, when that tab
 * is opened and has no document yet (decided 30 Oct: no background pass).
 *
 * - Never overwrites: a Summary tab that has a document (converted before,
 *   written by the student, or made by Phase 7) is left as it is, so a note
 *   generated again later (the generate flow writes the old format until
 *   Phase 7) doesn't reach it; the old notes view shows that newer note.
 * - Keeps the old data: the `summaries` row is only read.
 * - Safe to run twice and on two devices at once: the same note gives the
 *   same blocks (convert.ts), and the document is saved as any edit is
 *   (merged by block, queued offline on the iPhone).
 */

export type ConvertOutcome = 'converted' | 'exists' | 'none';

export interface ConvertDeps {
  /** Whether the lecture's Summary tab has a document. */
  summaryExists: (lectureId: string) => Promise<boolean>;
  /** The lecture's latest earlier note, as stored, or null. */
  latestNote: (lectureId: string) => Promise<{ id: string; result: LegacyNoteResult } | null>;
  /** The lecture's photos and PDFs. */
  attachments: (lectureId: string) => Promise<LegacyAttachment[]>;
  /** The language for the section headings (the lecture's, else the account's). */
  language: (lectureId: string) => Promise<string | null>;
  /** Saves the Summary tab's first content. */
  save: (lectureId: string, doc: DocJSON) => Promise<void>;
}

/** The highlights (Clarify entries) kept in the note's annotations. */
export function clarificationsOf(note: LegacyNoteResult): LegacyClarification[] {
  if (!note.manualAnnotations) return [];
  try {
    const parsed = JSON.parse(note.manualAnnotations) as { clarifications?: unknown };
    return (Array.isArray(parsed.clarifications) ? parsed.clarifications : [])
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c) => ({
        highlightedParts: Array.isArray(c.highlightedParts) ? c.highlightedParts.filter((x): x is string => typeof x === 'string') : [],
        response: typeof c.response === 'string' ? c.response : '',
      }));
  } catch {
    return [];
  }
}

export async function convertEarlierNote(lectureId: string, deps: ConvertDeps): Promise<ConvertOutcome> {
  if (await deps.summaryExists(lectureId)) return 'exists';
  const found = await deps.latestNote(lectureId);
  if (!found) return 'none';
  const [attachments, language] = await Promise.all([deps.attachments(lectureId), deps.language(lectureId)]);
  // Asked again just before saving: the other device may have converted it meanwhile (it would merge, but no need).
  if (await deps.summaryExists(lectureId)) return 'exists';
  const doc = legacyNoteToDoc({ note: found.result, clarifications: clarificationsOf(found.result), attachments, language });
  await deps.save(lectureId, doc);
  return 'converted';
}
