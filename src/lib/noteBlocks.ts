/**
 * noteBlocks.ts
 * The conflict rule for a note edited on two devices (step 1.8).
 *
 * A note is made of blocks. Until the Phase 4 editor these are the sections
 * of the old structured note: title, summary, key concepts, formulas,
 * definitions, tags, unclear parts, clarifications and the confirmed flag.
 * Every block remembers who wrote it (origin ai or student), when (the
 * device clock at the moment of the edit) and on which device.
 *
 * An edit carries, for each block it changed, the value it started from
 * (`base`) and the new value with its time. Against the server's note:
 *   1. the server still has the base value  → nobody else changed it; apply.
 *   2. the server already has the new value → nothing to do.
 *   3. both changed it → the newer edit wins (a tie goes to the larger
 *      device id, so every device decides the same way); the other value
 *      is kept as a version (document_versions, reason 'conflict').
 * Blocks the edit didn't touch keep the server's value, so changes to
 * different sections on two devices both survive.
 *
 * Pure, so it is unit tested; note.service runs it online (web) or when the
 * iPhone's queued edit is sent.
 */

import type { LegacyNoteResult, NoteBlockMeta } from './cloudRows';
import type { Json } from '../types/supabase';

export const NOTE_BLOCKS = [
  'title',
  'summary',
  'keyConcepts',
  'formulas',
  'definitions',
  'tags',
  'unclearParts',
  'clarifications',
  'confirmed',
] as const;

export type NoteBlock = (typeof NOTE_BLOCKS)[number];

/** How a block is named to the student. */
export const BLOCK_LABELS: Record<NoteBlock, string> = {
  title: 'Title',
  summary: 'Summary',
  keyConcepts: 'Key concepts',
  formulas: 'Formulas',
  definitions: 'Definitions',
  tags: 'Tags',
  unclearParts: 'Unclear parts',
  clarifications: 'Clarifications',
  confirmed: 'Confirmed',
};

const FIELD: Record<NoteBlock, keyof LegacyNoteResult> = {
  title: 'title',
  summary: 'summary',
  keyConcepts: 'keyConcepts',
  formulas: 'formulas',
  definitions: 'definitions',
  tags: 'tags',
  unclearParts: 'unclearParts',
  clarifications: 'manualAnnotations',
  confirmed: 'isConfirmed',
};

export type BlockValues = Partial<Record<NoteBlock, Json>>;

export interface BlockChange {
  value: Json;
  editedAt: string;
}

export interface NoteEdit {
  /** Names the edit's conflict versions, so a resent edit doesn't store them twice. */
  id: string;
  device: string;
  /** Each changed block's value when the student started editing. */
  base: BlockValues;
  changes: Partial<Record<NoteBlock, BlockChange>>;
}

export interface Conflict {
  block: NoteBlock;
  /** Whose value the note keeps: this edit's, or the other device's. */
  kept: 'this' | 'other';
}

export interface ConflictVersion {
  /** Whose note this is: the other device's, or this edit's. */
  side: 'other' | 'this';
  blocks: NoteBlock[];
  content: LegacyNoteResult & {
    conflict: { blocks: NoteBlock[]; side: 'other' | 'this'; device: string | null; editedAt: string };
  };
}

export interface MergeResult {
  result: LegacyNoteResult;
  changed: boolean;
  conflicts: Conflict[];
  versions: ConflictVersion[];
}

export function blockValue(note: LegacyNoteResult, block: NoteBlock): Json {
  return (note[FIELD[block]] ?? null) as Json;
}

function withBlock(note: LegacyNoteResult, block: NoteBlock, value: Json, meta: NoteBlockMeta): LegacyNoteResult {
  return {
    ...note,
    [FIELD[block]]: value,
    blocks: { ...note.blocks, [block]: meta },
  };
}

/** A block's author and time; notes from before step 1.8 count as AI, written when created. */
export function blockMeta(note: LegacyNoteResult, block: NoteBlock, createdAt: string): NoteBlockMeta {
  return note.blocks?.[block] ?? { origin: 'ai', editedAt: isoTime(createdAt), device: null };
}

/** Postgres writes 2026-10-25 01:00:00.123456+00; times are compared as JavaScript ISO strings. */
function isoTime(value: string): string {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : value;
}

/** Every block marked as written by the AI now (a newly generated note). */
export function aiBlocks(device: string, at: string): Partial<Record<NoteBlock, NoteBlockMeta>> {
  return Object.fromEntries(NOTE_BLOCKS.map((b) => [b, { origin: 'ai', editedAt: at, device }]));
}

/** JSON with sorted keys, so values compare equal after a round trip through Postgres. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function sameValue(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

/**
 * The edit for `updates` made on top of `base` (the note as the student saw
 * it), or null when nothing changed. A block's time never goes back before
 * the version it replaces, even with a slow clock.
 */
export function makeEdit(params: {
  id: string;
  device: string;
  base: LegacyNoteResult;
  baseCreatedAt: string;
  updates: BlockValues;
  now: Date;
}): NoteEdit | null {
  const edit: NoteEdit = { id: params.id, device: params.device, base: {}, changes: {} };
  for (const block of NOTE_BLOCKS) {
    if (!(block in params.updates)) continue;
    const value = (params.updates[block] ?? null) as Json;
    const before = blockValue(params.base, block);
    if (sameValue(before, value)) continue;

    const previous = Date.parse(blockMeta(params.base, block, params.baseCreatedAt).editedAt);
    const at = Math.max(params.now.getTime(), Number.isFinite(previous) ? previous + 1 : 0);
    edit.base[block] = before;
    edit.changes[block] = { value, editedAt: new Date(at).toISOString() };
  }
  return Object.keys(edit.changes).length > 0 ? edit : null;
}

/** Two waiting edits of the same note as one: the first base, the newest values. */
export function combineEdits(earlier: NoteEdit, later: NoteEdit): NoteEdit {
  const base: BlockValues = { ...earlier.base };
  for (const block of Object.keys(later.base) as NoteBlock[]) {
    if (!(block in base)) base[block] = later.base[block];
  }
  const changes = { ...earlier.changes, ...later.changes };
  // A block edited back to where it started is no change at all.
  for (const block of Object.keys(changes) as NoteBlock[]) {
    if (sameValue(base[block], changes[block]?.value)) {
      delete changes[block];
      delete base[block];
    }
  }
  return { id: earlier.id, device: later.device, base, changes };
}

/** The note with the edit applied as is (the iPhone's copy before it syncs). */
export function applyEdit(note: LegacyNoteResult, edit: NoteEdit, only?: NoteBlock[]): LegacyNoteResult {
  let next = note;
  for (const [block, change] of Object.entries(edit.changes) as [NoteBlock, BlockChange][]) {
    if (only && !only.includes(block)) continue;
    next = withBlock(next, block, change.value, { origin: 'student', editedAt: change.editedAt, device: edit.device });
  }
  return next;
}

function editWins(edit: NoteEdit, change: BlockChange, server: NoteBlockMeta): boolean {
  if (change.editedAt !== server.editedAt) return change.editedAt > server.editedAt;
  return edit.device > (server.device ?? '');
}

/** The conflict rule: merges an edit into the server's note (see the top of this file). */
export function mergeEdit(server: LegacyNoteResult, serverCreatedAt: string, edit: NoteEdit): MergeResult {
  let result = server;
  let changed = false;
  const conflicts: Conflict[] = [];
  const otherLost: NoteBlock[] = [];
  const thisLost: NoteBlock[] = [];
  let latestOther = '';

  for (const [block, change] of Object.entries(edit.changes) as [NoteBlock, BlockChange][]) {
    const current = blockValue(server, block);
    if (sameValue(current, change.value)) continue;

    const mine: NoteBlockMeta = { origin: 'student', editedAt: change.editedAt, device: edit.device };
    if (sameValue(current, edit.base[block] ?? null)) {
      result = withBlock(result, block, change.value, mine);
      changed = true;
      continue;
    }

    const theirs = blockMeta(server, block, serverCreatedAt);
    if (theirs.editedAt > latestOther) latestOther = theirs.editedAt;
    if (editWins(edit, change, theirs)) {
      result = withBlock(result, block, change.value, mine);
      changed = true;
      otherLost.push(block);
      conflicts.push({ block, kept: 'this' });
    } else {
      thisLost.push(block);
      conflicts.push({ block, kept: 'other' });
    }
  }

  const versions: ConflictVersion[] = [];
  if (otherLost.length > 0) {
    // The note as the other device had it.
    const device = blockMeta(server, otherLost[0], serverCreatedAt).device;
    versions.push({
      side: 'other',
      blocks: otherLost,
      content: { ...server, conflict: { blocks: otherLost, side: 'other', device, editedAt: latestOther } },
    });
  }
  if (thisLost.length > 0) {
    // The note as this edit would have made it.
    const mine = applyEdit(server, edit, thisLost);
    const editedAt = thisLost.map((b) => edit.changes[b]?.editedAt ?? '').sort().pop() ?? '';
    versions.push({
      side: 'this',
      blocks: thisLost,
      content: { ...mine, conflict: { blocks: thisLost, side: 'this', device: edit.device, editedAt } },
    });
  }

  return { result, changed, conflicts, versions };
}
