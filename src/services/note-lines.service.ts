/**
 * A lecture's `note_lines` follow its My notes: after each save
 * of the notes tab (the laptop's save, the iPhone's queued edit), the lines
 * of the document as saved on the server are written (by document and
 * block) and the lines that are gone removed (editor/noteLines.ts). Safe to
 * run twice; nothing is written when the lines haven't changed since the
 * last time on this device.
 */

import { supabase } from '../lib/supabase';
import { syncError } from '../lib/sync/errors';
import { noteLinesOf } from '../editor/noteLines';
import type { DocJSON } from '../editor/types';
import type { Json } from '../types/supabase';

const kinds = new Map<string, boolean>();
/** What was last written per document (its lines as JSON). */
const written = new Map<string, string>();

/** A document just turned into a lecture: asked again at its next save. */
export function forgetLectureKind(fileId: string): void {
  kinds.delete(fileId);
}

/** Whether the file is a lecture (kept per file; also the marks'). */
export async function isLectureFile(fileId: string): Promise<boolean> {
  const known = kinds.get(fileId);
  if (known !== undefined) return known;
  const { data, error } = await supabase.from('files').select('kind').eq('id', fileId).maybeSingle();
  if (error) throw syncError(error, 'Could not save the note lines.');
  const lecture = data?.kind === 'lecture';
  kinds.set(fileId, lecture);
  return lecture;
}

export async function syncNoteLines(row: { id: string; file_id: string; tab: string; content: unknown }): Promise<void> {
  if (row.tab !== 'notes' || !(await isLectureFile(row.file_id))) return;
  const lines = noteLinesOf(row.content as DocJSON);
  const json = JSON.stringify(lines);
  if (written.get(row.id) === json) return;

  const { data: existing, error } = await supabase.from('note_lines').select('id, block_id').eq('document_id', row.id);
  if (error) throw syncError(error, 'Could not save the note lines.');
  if (lines.length > 0) {
    const { error: upsertError } = await supabase.from('note_lines').upsert(
      lines.map((l) => ({ lecture_id: row.file_id, document_id: row.id, ...l, content: l.content as unknown as Json })),
      { onConflict: 'document_id,block_id' },
    );
    if (upsertError) throw syncError(upsertError, 'Could not save the note lines.');
  }
  const keep = new Set(lines.map((l) => l.block_id));
  const gone = (existing ?? []).filter((e) => !keep.has(e.block_id)).map((e) => e.id);
  if (gone.length > 0) {
    const { error: deleteError } = await supabase.from('note_lines').delete().in('id', gone);
    if (deleteError) throw syncError(deleteError, 'Could not save the note lines.');
  }
  written.set(row.id, json);
}
