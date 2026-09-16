import { all, first, run } from '../lib/db';
import { buildSet, mapNote, newId, now, toBool, toJson, type NoteRow } from '../lib/mappers';
import type { Note } from '../types/database';

// -------------------------------------------------------------------
// Clarification types
// -------------------------------------------------------------------
export interface ClarificationEntry {
  highlightedParts: string[];
  response: string;
  createdAt: string;
}

export function parseClarifications(
  manualAnnotations: string | null | undefined,
): ClarificationEntry[] {
  if (!manualAnnotations) return [];
  try {
    const parsed = JSON.parse(manualAnnotations);
    return (parsed.clarifications ?? []) as ClarificationEntry[];
  } catch {
    return [];
  }
}

// -------------------------------------------------------------------
// createNote
// -------------------------------------------------------------------
export async function createNote(params: {
  userId: string;
  sessionId: string;
  title: string;
  summaryLevel: 'minimal' | 'standard' | 'extra';
  summary?: string;
  keyConcepts?: unknown[];
  formulas?: unknown[];
  definitions?: unknown[];
  tags?: string[];
  unclearParts?: unknown[];
  isConfirmed?: boolean;
  manualAnnotations?: string | null;
}): Promise<Note> {
  const id = newId();
  const timestamp = now();

  await run(
    `INSERT INTO notes (id, user_id, session_id, title, summary_level, summary,
                        key_concepts, formulas, definitions, tags, unclear_parts,
                        manual_annotations, is_confirmed, is_deleted, deleted_at,
                        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
    [
      id,
      params.userId,
      params.sessionId,
      params.title,
      params.summaryLevel,
      params.summary ?? null,
      toJson(params.keyConcepts ?? []),
      toJson(params.formulas ?? []),
      toJson(params.definitions ?? []),
      toJson(params.tags ?? []),
      toJson(params.unclearParts ?? []),
      params.manualAnnotations ?? null,
      toBool(params.isConfirmed ?? false),
      timestamp,
      timestamp,
    ],
  );

  return getNote(id);
}

// -------------------------------------------------------------------
// updateNote
// Absent keys leave their column alone; an explicit null clears it.
// -------------------------------------------------------------------
export async function updateNote(
  noteId: string,
  updates: {
    title?: string;
    summary?: string;
    keyConcepts?: unknown[];
    formulas?: unknown[];
    definitions?: unknown[];
    tags?: string[];
    unclearParts?: unknown[];
    isConfirmed?: boolean;
    manualAnnotations?: string | null;
  },
): Promise<Note> {
  const set = buildSet({
    title: updates.title,
    summary: updates.summary,
    key_concepts: updates.keyConcepts === undefined ? undefined : toJson(updates.keyConcepts),
    formulas: updates.formulas === undefined ? undefined : toJson(updates.formulas),
    definitions: updates.definitions === undefined ? undefined : toJson(updates.definitions),
    tags: updates.tags === undefined ? undefined : toJson(updates.tags),
    unclear_parts: updates.unclearParts === undefined ? undefined : toJson(updates.unclearParts),
    is_confirmed: updates.isConfirmed === undefined ? undefined : toBool(updates.isConfirmed),
    manual_annotations: 'manualAnnotations' in updates ? (updates.manualAnnotations ?? null) : undefined,
    updated_at: now(),
  });

  if (set) {
    await run(`UPDATE notes SET ${set.clause} WHERE id = ?`, [...set.values, noteId]);
  }
  return getNote(noteId);
}

// -------------------------------------------------------------------
// getSessionsWithNotes
// Returns the set of session IDs (from the given list) that have a
// confirmed, non-deleted note. One query — no N+1.
// -------------------------------------------------------------------
export async function getSessionsWithNotes(sessionIds: string[]): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set();

  const placeholders = sessionIds.map(() => '?').join(', ');
  const rows = await all<{ session_id: string }>(
    `SELECT DISTINCT session_id FROM notes
      WHERE session_id IN (${placeholders}) AND is_deleted = 0 AND is_confirmed = 1`,
    sessionIds,
  );

  return new Set(rows.map((r) => r.session_id));
}

// -------------------------------------------------------------------
// getNoteBySession
// Returns the most recent note for a session (null if none).
// -------------------------------------------------------------------
export async function getNoteBySession(sessionId: string): Promise<Note | null> {
  const row = await first<NoteRow>(
    `SELECT * FROM notes
      WHERE session_id = ? AND is_deleted = 0
      ORDER BY created_at DESC
      LIMIT 1`,
    [sessionId],
  );
  return row ? mapNote(row) : null;
}

// -------------------------------------------------------------------
// getNote
// -------------------------------------------------------------------
export async function getNote(noteId: string): Promise<Note> {
  const row = await first<NoteRow>(`SELECT * FROM notes WHERE id = ?`, [noteId]);
  if (!row) throw new Error('Note not found.');
  return mapNote(row);
}

// -------------------------------------------------------------------
// getUserNotes
// -------------------------------------------------------------------
export async function getUserNotes(userId: string): Promise<Note[]> {
  const rows = await all<NoteRow>(
    `SELECT * FROM notes
      WHERE user_id = ? AND is_confirmed = 1 AND is_deleted = 0
      ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map(mapNote);
}

// -------------------------------------------------------------------
// deleteNote
// -------------------------------------------------------------------
export async function deleteNote(noteId: string): Promise<void> {
  await run(`DELETE FROM notes WHERE id = ?`, [noteId]);
}

// -------------------------------------------------------------------
// confirmNote
// Marks an existing draft note as confirmed and updates metadata.
// -------------------------------------------------------------------
export async function confirmNote(
  noteId: string,
  updates?: { title?: string },
): Promise<Note> {
  return updateNote(noteId, { isConfirmed: true, ...updates });
}

// -------------------------------------------------------------------
// addClarification
// Appends a clarification entry to manual_annotations JSON.
// -------------------------------------------------------------------
export async function addClarification(
  noteId: string,
  highlightedParts: string[],
  response: string,
): Promise<Note> {
  const note = await getNote(noteId);
  const existing = parseClarifications(note.manual_annotations);
  const updated: ClarificationEntry[] = [
    ...existing,
    { highlightedParts, response, createdAt: now() },
  ];
  return updateNote(noteId, {
    manualAnnotations: JSON.stringify({ clarifications: updated }),
  });
}
