/**
 * docBlocks.ts
 * The conflict rule for a document edited on two devices: the note
 * blocks' rule (src/lib/noteBlocks.ts) over the document's top-level blocks,
 * which carry an id, an origin and the time the student last changed them
 * (src/editor/schema/blockMeta.ts).
 *
 * An edit carries, for each block it changed, the block it started from
 * (`base`; null for a new block) and the new block (null when deleted),
 * plus the order of the document it saw, which places new and moved blocks.
 * Against the server's document, block by block:
 *   1. the server still has the base → nobody else changed it; apply.
 *   2. the server already has the new block → nothing to do.
 *   3. both changed it → the newer edit wins (a tie goes to the server, so
 *      every device decides the same way); the other one is kept as a
 *      version (document_versions, reason 'conflict').
 *   4. one side deleted it, the other edited it → the edit is kept: nothing
 *      anyone wrote is lost.
 * Blocks the edit didn't touch keep the server's version and place, so
 * changes to different blocks on two devices both survive.
 *
 * A block is a top-level block: a whole list or table is one block, so two
 * devices editing different items of one list is a conflict on that list.
 *
 * Pure, so it is unit tested; document.service runs it online (laptop) or
 * when the iPhone's queued edit is sent, and the screen uses `rebase` to
 * take a merged document without losing what was typed meanwhile.
 */

import type { JSONContent } from '@tiptap/core';

import { withBlockIds } from './schema/blockMeta';
import { ATTR_DEFAULTS } from './schema/defaults';
import type { DocJSON } from './types';

export type Block = JSONContent;

export interface DocChange {
  /** The block after the edit; null when the edit deleted it. */
  value: Block | null;
  /** When the student changed it (ms). */
  editedAt: number;
  /** Only its place changed. */
  moved?: boolean;
}

export interface DocEdit {
  /** Names the edit's conflict versions, so a resent edit doesn't store them twice. */
  id: string;
  device: string;
  /** Each changed block as the edit found it; null for a block the edit added. */
  base: Record<string, Block | null>;
  changes: Record<string, DocChange>;
  /** The block ids of the edited document, in order: where new and moved blocks go. */
  order: string[];
  /** Written on an empty document (a tab both devices may have started): its blocks go after the server's. */
  fromEmpty?: boolean;
}

export interface DocConflict {
  blockId: string;
  /** Whose block the document keeps: this edit's, or the other device's. */
  kept: 'this' | 'other';
}

export interface DocConflictVersion {
  /** Whose document this is: the other device's, or this edit's. */
  side: 'other' | 'this';
  blockIds: string[];
  content: DocJSON & { conflict: { blockIds: string[]; side: 'other' | 'this'; device: string | null; editedAt: number } };
}

export interface DocMergeResult {
  doc: DocJSON;
  changed: boolean;
  conflicts: DocConflict[];
  versions: DocConflictVersion[];
}

export const idOf = (block: Block): string => String(block.attrs?.blockId ?? '');
const timeOf = (block: Block | null | undefined): number => (typeof block?.attrs?.editedAt === 'number' ? block.attrs.editedAt : 0);

/**
 * JSON with sorted keys, so blocks compare equal after a round trip through
 * Postgres; attributes at their schema default, and empty `attrs` / `marks`,
 * are left out, so content written without them equals the editor's copy.
 */
function canonical(value: unknown, defaults?: Record<string, unknown>): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v)).join(',')}]`;
  if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    const own = typeof node.type === 'string' ? ATTR_DEFAULTS[node.type] : undefined;
    const entries = Object.entries(node)
      .filter(([k, v]) => v !== undefined && v !== null && !(defaults && k in defaults && defaults[k] === v))
      .map(([k, v]) => [k, canonical(v, k === 'attrs' ? own : undefined)] as const)
      .filter(([k, v]) => !((k === 'attrs' && v === '{}') || (k === 'marks' && v === '[]')))
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${v}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The same block, whenever it was last touched. */
export function sameBlock(a: Block | null | undefined, b: Block | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  const strip = (block: Block) => ({ ...block, attrs: { ...block.attrs, editedAt: undefined } });
  return canonical(strip(a)) === canonical(strip(b));
}

/** The same document, block for block. */
export function sameDoc(a: DocJSON, b: DocJSON): boolean {
  const x = blocksOf(a);
  const y = blocksOf(b);
  return x.length === y.length && x.every((block, i) => idOf(block) === idOf(y[i]) && sameBlock(block, y[i]));
}

function blocksOf(doc: DocJSON): Block[] {
  return withBlockIds(doc).content ?? [];
}

/** Ids of `next` order whose place changed (not in a longest common run with `base`). */
function movedIds(baseOrder: string[], nextOrder: string[]): Set<string> {
  const inBase = new Set(baseOrder);
  const inNext = new Set(nextOrder);
  const a = baseOrder.filter((id) => inNext.has(id));
  const b = nextOrder.filter((id) => inBase.has(id));
  if (a.length === b.length && a.every((id, i) => id === b[i])) return new Set();
  // Longest common subsequence; what's outside it moved.
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const kept = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      kept.add(a[i]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return new Set(b.filter((id) => !kept.has(id)));
}

/**
 * The edit from `base` (the document as last saved) to `next` (the editor's
 * document), or null when nothing changed. A block's time never goes back
 * before the version it replaces, even with a slow clock; `restamp` dates
 * every change now (restoring a version is a new edit, whatever the old
 * blocks' times).
 */
export function makeDocEdit(params: {
  id: string;
  device: string;
  base: DocJSON;
  next: DocJSON;
  now: number;
  restamp?: boolean;
}): DocEdit | null {
  const before = blocksOf(params.base);
  const after = blocksOf(params.next);
  const beforeById = new Map(before.map((b) => [idOf(b), b]));
  const afterIds = new Set(after.map(idOf));
  const order = after.map(idOf);
  const moved = movedIds(before.map(idOf), order);
  const edit: DocEdit = { id: params.id, device: params.device, base: {}, changes: {}, order, ...(before.length === 0 ? { fromEmpty: true } : {}) };

  const stamp = (block: Block | null, previous: Block | null | undefined) => {
    const own = params.restamp ? params.now : block ? timeOf(block) || params.now : params.now;
    return Math.max(own, previous ? timeOf(previous) + 1 : 0);
  };
  // Restoring: the saved blocks carry the new time too, not only this merge,
  // so the next merge on any device sees the restore as the newest edit.
  const dated = (block: Block, at: number): Block => (params.restamp ? { ...block, attrs: { ...block.attrs, editedAt: at } } : block);

  for (const block of after) {
    const id = idOf(block);
    const previous = beforeById.get(id);
    if (!previous) {
      const at = stamp(block, null);
      edit.base[id] = null;
      edit.changes[id] = { value: dated(block, at), editedAt: at };
    } else if (!sameBlock(previous, block) || (params.restamp && timeOf(previous) !== timeOf(block))) {
      const at = stamp(block, previous);
      edit.base[id] = previous;
      edit.changes[id] = { value: dated(block, at), editedAt: at, ...(moved.has(id) ? { moved: true } : {}) };
    } else if (moved.has(id)) {
      edit.base[id] = previous;
      edit.changes[id] = { value: block, editedAt: stamp(block, previous), moved: true };
    }
  }
  for (const block of before) {
    const id = idOf(block);
    if (!afterIds.has(id)) {
      edit.base[id] = block;
      edit.changes[id] = { value: null, editedAt: Math.max(params.now, timeOf(block) + 1) };
    }
  }
  return Object.keys(edit.changes).length > 0 ? edit : null;
}

/**
 * Every top-level block dated `now` (a restored version is a new edit: it
 * must win over anything written before it, on every device).
 */
export function stampBlocks(doc: DocJSON, now: number): DocJSON {
  return { ...doc, content: (doc.content ?? []).map((b) => ({ ...b, attrs: { ...b.attrs, editedAt: now } })) };
}

/** Two waiting edits of the same document as one: the first base, the newest blocks and order. */
export function combineDocEdits(earlier: DocEdit, later: DocEdit): DocEdit {
  const base: Record<string, Block | null> = { ...earlier.base };
  for (const id of Object.keys(later.base)) if (!(id in base)) base[id] = later.base[id];
  const changes: Record<string, DocChange> = { ...earlier.changes, ...later.changes };
  for (const id of Object.keys(changes)) {
    const change = changes[id];
    // A block edited back to where it started (or added and deleted again) is no change at all.
    if (!change.moved && sameBlock(base[id], change.value)) {
      delete changes[id];
      delete base[id];
    }
  }
  return { id: earlier.id, device: later.device, base, changes, order: later.order, ...(earlier.fromEmpty ? { fromEmpty: true } : {}) };
}

function editWins(change: DocChange, server: Block): boolean {
  return change.editedAt > timeOf(server);
}

/** The conflict rule: merges an edit into the server's document (see the top of this file). */
export function mergeDocEdit(server: DocJSON, edit: DocEdit, options: { editAlwaysWins?: boolean } = {}): DocMergeResult {
  const serverBlocks = blocksOf(server);
  const result: Block[] = [...serverBlocks];
  const indexOf = (id: string) => result.findIndex((b) => idOf(b) === id);
  let changed = false;
  const conflicts: DocConflict[] = [];
  const otherLost: string[] = [];
  const thisLost: string[] = [];
  const serverById = new Map(serverBlocks.map((b) => [idOf(b), b]));

  /** Puts `block` after the closest block before it (in the edit's order) that the result has. */
  const place = (block: Block) => {
    const id = idOf(block);
    const at = indexOf(id);
    if (at >= 0) result.splice(at, 1);
    const position = edit.order.indexOf(id);
    let insertAt = edit.fromEmpty ? result.length : 0;
    for (let k = position - 1; k >= 0; k--) {
      const anchor = indexOf(edit.order[k]);
      if (anchor >= 0) {
        insertAt = anchor + 1;
        break;
      }
    }
    result.splice(insertAt, 0, block);
    changed = true;
  };

  // In the edit's order, so a run of new blocks keeps its order.
  const ids = [...edit.order.filter((id) => id in edit.changes), ...Object.keys(edit.changes).filter((id) => !edit.order.includes(id))];
  for (const id of ids) {
    const change = edit.changes[id];
    const base = edit.base[id] ?? null;
    const current = serverById.get(id);

    if (change.value === null) {
      // Deleted here.
      if (!current) continue;
      if (sameBlock(current, base) || options.editAlwaysWins) {
        result.splice(indexOf(id), 1);
        changed = true;
      } else {
        // Edited on the other device: kept, nothing is lost.
        conflicts.push({ blockId: id, kept: 'other' });
      }
      continue;
    }

    if (!current) {
      // New here, or edited here and deleted on the other device: kept.
      if (base && !change.moved && !options.editAlwaysWins) conflicts.push({ blockId: id, kept: 'this' });
      if (base && change.moved && sameBlock(base, change.value)) continue; // only moved, and deleted there: stays deleted
      place(change.value);
      continue;
    }

    if (sameBlock(current, change.value)) {
      if (change.moved) place(current);
      continue;
    }

    if (sameBlock(current, base) || options.editAlwaysWins || editWins(change, current)) {
      if (!sameBlock(current, base) && !options.editAlwaysWins) {
        otherLost.push(id);
        conflicts.push({ blockId: id, kept: 'this' });
      }
      result[indexOf(id)] = change.value;
      if (change.moved) place(change.value);
      changed = true;
    } else {
      thisLost.push(id);
      conflicts.push({ blockId: id, kept: 'other' });
    }
  }

  const doc: DocJSON = { ...server, type: 'doc', content: result };
  const versions: DocConflictVersion[] = [];
  if (otherLost.length > 0) {
    // The document as the other device had it.
    const editedAt = Math.max(...otherLost.map((id) => timeOf(serverById.get(id))));
    versions.push({ side: 'other', blockIds: otherLost, content: { ...server, type: 'doc', content: serverBlocks, conflict: { blockIds: otherLost, side: 'other', device: null, editedAt } } });
  }
  if (thisLost.length > 0) {
    // The document as this edit would have made it: the merge, with this edit's blocks where they lost.
    const mine = result.map((b) => (thisLost.includes(idOf(b)) ? (edit.changes[idOf(b)].value as Block) : b));
    const editedAt = Math.max(...thisLost.map((id) => edit.changes[id].editedAt));
    versions.push({ side: 'this', blockIds: thisLost, content: { ...server, type: 'doc', content: mine, conflict: { blockIds: thisLost, side: 'this', device: edit.device, editedAt } } });
  }
  return { doc, changed, conflicts, versions };
}

/**
 * What the open editor should show once `merged` (the saved or the other
 * device's document) comes back: `merged`, with everything typed since
 * `sent` (what the save started from) kept on top. Null when the editor
 * already shows it.
 */
export function rebase(sent: DocJSON, current: DocJSON, merged: DocJSON): DocJSON | null {
  const typed = makeDocEdit({ id: 'rebase', device: '', base: sent, next: current, now: 0 });
  const next = typed ? mergeDocEdit(merged, typed, { editAlwaysWins: true }).doc : withBlockIds(merged);
  return sameDoc(next, current) ? null : next;
}
