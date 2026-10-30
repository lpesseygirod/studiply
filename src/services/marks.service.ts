/**
 * A lecture's marks (step 5.5) follow its My notes, as its note_lines do:
 * after each save of the notes tab (the laptop's save, the iPhone's queued
 * edit), every linked mark chip in the document as saved on the server is
 * its `marks` row (type, level, time, note), and a row whose chip is gone is
 * deleted (Lea's advisor, 30 Oct: a chip deleted by typing deletes its mark;
 * Undo brings the chip back, and the next save the row). A chip copied into
 * another lecture's notes doesn't take that lecture's mark. Safe to run
 * twice; nothing is written when the marks haven't changed since the last
 * time on this device.
 */

import { supabase } from '../lib/supabase';
import { syncError } from '../lib/sync/errors';
import { cleanLevel } from '../editor/schema/callout';
import { cleanNote, isMarkKind, MARK_CHIP, type MarkKind } from '../editor/schema/markChip';
import type { DocJSON } from '../editor/types';
import { isLectureFile } from './note-lines.service';

export interface MarkRow {
  id: string;
  type: MarkKind;
  level: number;
  t_ms: number;
  note: string | null;
}

type JSONNode = { type?: string; attrs?: Record<string, unknown>; content?: JSONNode[] };

/** The linked mark chips in a document, in its order (a chip copied twice counts once). */
export function marksOf(doc: DocJSON): MarkRow[] {
  const out: MarkRow[] = [];
  const seen = new Set<string>();
  const walk = (node: JSONNode) => {
    if (node.type === MARK_CHIP) {
      const a = node.attrs ?? {};
      const id = typeof a.markId === 'string' ? a.markId : '';
      const level = cleanLevel(a.level);
      const ms = typeof a.ms === 'number' && Number.isFinite(a.ms) && a.ms >= 0 ? Math.round(a.ms) : null;
      if (id && !seen.has(id) && isMarkKind(a.kind) && level !== null && ms !== null) {
        seen.add(id);
        out.push({ id, type: a.kind, level, t_ms: ms, note: cleanNote(a.note) });
      }
    }
    node.content?.forEach(walk);
  };
  walk(doc as JSONNode);
  return out;
}

const same = (a: MarkRow, b: { type: string; level: number; t_ms: number; note: string | null }) =>
  a.type === b.type && a.level === b.level && a.t_ms === b.t_ms && a.note === (b.note ?? null);

/** What was last written per lecture (its marks as JSON). */
const written = new Map<string, string>();

export async function syncMarks(row: { file_id: string; tab: string; content: unknown }): Promise<void> {
  if (row.tab !== 'notes' || !(await isLectureFile(row.file_id))) return;
  const lectureId = row.file_id;
  const marks = marksOf(row.content as DocJSON);
  const json = JSON.stringify(marks);
  if (written.get(lectureId) === json) return;
  const fail = (error: { message?: string; code?: string }) => syncError(error, 'Could not save the marks.');

  const { data: existing, error } = await supabase.from('marks').select('id, type, level, t_ms, note').eq('lecture_id', lectureId);
  if (error) throw fail(error);
  const have = new Map((existing ?? []).map((m) => [m.id, m]));

  // A chip whose mark belongs to another lecture (copied from its notes) is that lecture's.
  const unknown = marks.filter((m) => !have.has(m.id)).map((m) => m.id);
  let elsewhere = new Set<string>();
  if (unknown.length > 0) {
    const { data: others, error: othersError } = await supabase.from('marks').select('id, lecture_id').in('id', unknown);
    if (othersError) throw fail(othersError);
    elsewhere = new Set((others ?? []).filter((o) => o.lecture_id !== lectureId).map((o) => o.id));
  }

  const changed = marks.filter((m) => !elsewhere.has(m.id) && !(have.has(m.id) && same(m, have.get(m.id)!)));
  if (changed.length > 0) {
    const { error: upsertError } = await supabase.from('marks').upsert(
      changed.map((m) => ({ ...m, lecture_id: lectureId })),
      { onConflict: 'id' },
    );
    if (upsertError) throw fail(upsertError);
  }
  const keep = new Set(marks.map((m) => m.id));
  const gone = [...have.keys()].filter((id) => !keep.has(id));
  if (gone.length > 0) {
    const { error: deleteError } = await supabase.from('marks').delete().in('id', gone);
    if (deleteError) throw fail(deleteError);
  }
  written.set(lectureId, json);
}
