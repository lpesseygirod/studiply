/**
 * parts.ts
 * "Export my data" in parts of at most 500 MB (step 10.1b-4, D6), so a phone never holds a huge
 * file: the text and data always go in part 1; then the files, in the plan's order (lecture by
 * lecture), each part filled up to the limit. A file bigger than the limit is a part of its own.
 */

import type { ExportPlan, PlannedFile, PlannedText } from './plan';

export const PART_LIMIT_BYTES = 500 * 1000 * 1000;

export interface ExportPart {
  index: number;
  texts: PlannedText[];
  files: PlannedFile[];
  bytes: number;
}

const textBytes = (texts: PlannedText[]) => texts.reduce((n, t) => n + t.text.length, 0);

export function splitParts(plan: Pick<ExportPlan, 'texts' | 'files'>, limit = PART_LIMIT_BYTES): ExportPart[] {
  const parts: ExportPart[] = [{ index: 1, texts: plan.texts, files: [], bytes: textBytes(plan.texts) }];
  for (const file of plan.files) {
    let part = parts[parts.length - 1];
    if (part.files.length + part.texts.length > 0 && part.bytes + file.bytes > limit) {
      part = { index: parts.length + 1, texts: [], files: [], bytes: 0 };
      parts.push(part);
    }
    part.files.push(file);
    part.bytes += file.bytes;
  }
  return parts;
}

/** "Studiply export 2026-11-09.zip", "Studiply export 2026-11-09 (part 2 of 3).zip". */
export function partFileName(exportedAt: string, index: number, total: number): string {
  const day = exportedAt.slice(0, 10);
  return total > 1 ? `Studiply export ${day} (part ${index} of ${total}).zip` : `Studiply export ${day}.zip`;
}

/** The export's size, for "About 1.2 GB (380 MB of recordings)". */
export function exportSize(plan: Pick<ExportPlan, 'texts' | 'files'>): { total: number; recordings: number } {
  const recordings = plan.files.filter((f) => f.kind === 'recording').reduce((n, f) => n + f.bytes, 0);
  return { total: textBytes(plan.texts) + plan.files.reduce((n, f) => n + f.bytes, 0), recordings };
}
