import { supabase } from '../lib/supabase';
import {
  LEGACY_NOTE_FORMAT,
  readLegacyNote,
  serviceError,
  summaryToNote,
  type LegacyNoteResult,
  type SummaryRow,
} from '../lib/cloudRows';
import type { Json } from '../types/supabase';
import type { Note, Session } from '../types/database';

/**
 * The old structured note (summary, key concepts, formulas, …) is kept in
 * a `summaries` row: file_id is the lecture, `result` holds the note
 * (format legacy-note-v1, see cloudRows). The Phase 4 editor and the Phase 7
 * summary engine replace this with document blocks. A note goes to Trash
 * with its lecture, so reads skip notes whose lecture file is trashed.
 */

const ACTIVE_NOTE_SELECT = '*, files!inner(deleted_at)';

function toNote(row: unknown): Note {
  const { files: _files, ...summary } = row as SummaryRow & { files?: unknown };
  const note = summaryToNote(summary);
  if (!note) throw new Error('Note not found.');
  return note;
}

function toNotes(rows: unknown[]): Note[] {
  return rows
    .map((row) => {
      const { files: _files, ...summary } = row as SummaryRow & { files?: unknown };
      return summaryToNote(summary);
    })
    .filter((n): n is Note => n !== null);
}

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
  /** How the lecture was recorded; there is no column for it on the lecture. */
  recordingMode?: Session['recording_mode'];
  summary?: string;
  keyConcepts?: unknown[];
  formulas?: unknown[];
  definitions?: unknown[];
  tags?: string[];
  unclearParts?: unknown[];
  isConfirmed?: boolean;
  manualAnnotations?: string | null;
}): Promise<Note> {
  const result: LegacyNoteResult = {
    format: LEGACY_NOTE_FORMAT,
    title: params.title,
    summaryLevel: params.summaryLevel,
    recordingMode: params.recordingMode ?? null,
    summary: params.summary ?? null,
    keyConcepts: (params.keyConcepts ?? []) as Json,
    formulas: (params.formulas ?? []) as Json,
    definitions: (params.definitions ?? []) as Json,
    tags: params.tags ?? [],
    unclearParts: (params.unclearParts ?? []) as Json,
    manualAnnotations: params.manualAnnotations ?? null,
    isConfirmed: params.isConfirmed ?? false,
  };

  const { data, error } = await supabase
    .from('summaries')
    .insert({
      file_id: params.sessionId,
      mode: 'new',
      source_lecture_ids: [params.sessionId],
      sliders: { summaryLevel: params.summaryLevel },
      result: result as unknown as Json,
      status: 'done',
    })
    .select('*')
    .single();
  if (error) throw serviceError(error, 'Could not save the note.');
  return toNote(data);
}

// -------------------------------------------------------------------
// updateNote
// Absent keys leave their field alone; an explicit null clears it.
// The note is one JSON value, so it is read, changed and written back.
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
  const { data: row, error: readError } = await supabase
    .from('summaries')
    .select('result')
    .eq('id', noteId)
    .maybeSingle();
  if (readError) throw serviceError(readError, 'Could not save the note.');
  const current = row ? readLegacyNote(row.result) : null;
  if (!current) throw new Error('Note not found.');

  const next: LegacyNoteResult = {
    ...current,
    ...(updates.title !== undefined && { title: updates.title }),
    ...(updates.summary !== undefined && { summary: updates.summary }),
    ...(updates.keyConcepts !== undefined && { keyConcepts: updates.keyConcepts as Json }),
    ...(updates.formulas !== undefined && { formulas: updates.formulas as Json }),
    ...(updates.definitions !== undefined && { definitions: updates.definitions as Json }),
    ...(updates.tags !== undefined && { tags: updates.tags }),
    ...(updates.unclearParts !== undefined && { unclearParts: updates.unclearParts as Json }),
    ...(updates.isConfirmed !== undefined && { isConfirmed: updates.isConfirmed }),
    ...('manualAnnotations' in updates && { manualAnnotations: updates.manualAnnotations ?? null }),
  };

  const { data, error } = await supabase
    .from('summaries')
    .update({ result: next as unknown as Json })
    .eq('id', noteId)
    .select('*')
    .single();
  if (error) throw serviceError(error, 'Could not save the note.');
  return toNote(data);
}

// -------------------------------------------------------------------
// getSessionsWithNotes
// Returns the set of session IDs (from the given list) that have a
// confirmed note. One query — no N+1.
// -------------------------------------------------------------------
export async function getSessionsWithNotes(sessionIds: string[]): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('summaries')
    .select('file_id')
    .in('file_id', sessionIds)
    .eq('result->>format', LEGACY_NOTE_FORMAT)
    .eq('result->>isConfirmed', 'true');
  if (error) throw serviceError(error, 'Could not load your notes.');

  return new Set(data.map((r) => r.file_id));
}

// -------------------------------------------------------------------
// getNoteBySession
// Returns the most recent note for a session (null if none).
// -------------------------------------------------------------------
export async function getNoteBySession(sessionId: string): Promise<Note | null> {
  const { data, error } = await supabase
    .from('summaries')
    .select(ACTIVE_NOTE_SELECT)
    .eq('file_id', sessionId)
    .eq('result->>format', LEGACY_NOTE_FORMAT)
    .is('files.deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw serviceError(error, 'Could not load the note.');
  return toNotes(data)[0] ?? null;
}

// -------------------------------------------------------------------
// getNote
// -------------------------------------------------------------------
export async function getNote(noteId: string): Promise<Note> {
  const { data, error } = await supabase.from('summaries').select('*').eq('id', noteId).maybeSingle();
  if (error) throw serviceError(error, 'Could not load the note.');
  if (!data) throw new Error('Note not found.');
  return toNote(data);
}

// -------------------------------------------------------------------
// getUserNotes
// -------------------------------------------------------------------
export async function getUserNotes(_userId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('summaries')
    .select(ACTIVE_NOTE_SELECT)
    .eq('result->>format', LEGACY_NOTE_FORMAT)
    .eq('result->>isConfirmed', 'true')
    .is('files.deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw serviceError(error, 'Could not load your notes.');
  return toNotes(data);
}

// -------------------------------------------------------------------
// deleteNote
// -------------------------------------------------------------------
export async function deleteNote(noteId: string): Promise<void> {
  const { error } = await supabase.from('summaries').delete().eq('id', noteId);
  if (error) throw serviceError(error, 'Could not delete the note.');
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
    { highlightedParts, response, createdAt: new Date().toISOString() },
  ];
  return updateNote(noteId, {
    manualAnnotations: JSON.stringify({ clarifications: updated }),
  });
}
