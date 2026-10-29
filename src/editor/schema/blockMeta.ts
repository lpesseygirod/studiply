import { Extension } from '@tiptap/core';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Mapping } from '@tiptap/pm/transform';

import type { DocJSON } from '../types';

/**
 * Every top-level block of a document knows who wrote it (step 4.3):
 *
 * - `blockId`: a stable id, so two devices can merge a document block by
 *   block (src/editor/docBlocks.ts) and the regeneration of a summary can
 *   tell the student's blocks from the AI's.
 * - `origin`: `ai`, `student` or `media`. An edit by the student turns a
 *   block into `student` (SUMMARY-SPEC: regeneration never rewrites what the
 *   student wrote or edited).
 * - `editedAt`: when the student last changed the block (ms, device clock):
 *   the newer edit wins a conflict.
 *
 * A plugin keeps them right after every transaction. Loading, changes from
 * the other device, restoring a version and generated content (AI,
 * transcript) are marked as system changes (`SYSTEM_META`) and keep origin
 * and time as they come.
 *
 * Shared by both editors (the iPhone's WebView bundle and the laptop), so it
 * imports nothing from React Native.
 */

export const BLOCK_META = 'blockMeta';
export type Origin = 'ai' | 'student' | 'media';
export const ORIGINS: readonly Origin[] = ['ai', 'student', 'media'];

/** Top-level block types of the schema (the doc's `block` group). */
export const BLOCK_TYPES = ['paragraph', 'heading', 'image', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'table', 'title', 'pageBreak', 'blockMath', 'callout', 'formulaCard', 'graph'];

/** Transaction meta: a change the student didn't type (load, remote, restore, generated). */
export const SYSTEM_META = 'studiplySystem';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockMeta: {
      /** Replaces the document as a system change: not student, not in Undo, no update event. */
      loadDoc: (doc: DocJSON) => ReturnType;
      /** Takes `doc` changing only the blocks that differ, keeping the cursor; a system change. */
      applyBlocks: (doc: DocJSON) => ReturnType;
    };
  }
}

const isOrigin = (v: unknown): v is Origin => typeof v === 'string' && (ORIGINS as readonly string[]).includes(v);

/** A random block id ("b" and 10 base-36 characters). */
export function newBlockId(): string {
  const bytes = new Uint8Array(8);
  // Browsers and the WebView have Web Crypto; the app's own JS engine may not
  // (merging JSON on the iPhone), where an id only needs to be unique.
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `b${Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10)}`;
}

/** FNV-1a, base 36: a short, stable fingerprint of a block's text. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * The id a block without one gets when a document is loaded: the same on
 * every device for the same content, so two devices opening a document
 * saved before ids existed agree on its blocks.
 */
export function stableBlockId(index: number, type: string, text: string): string {
  return `k${index}-${hash(`${type}:${text}`)}`;
}

type BlockJSON = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: BlockJSON[] };

function jsonText(node: BlockJSON): string {
  return (node.text ?? '') + (node.content ?? []).map(jsonText).join('');
}

function nodeText(node: PMNode): string {
  let text = '';
  node.descendants((n) => {
    if (n.isText) text += n.text;
  });
  return text;
}

/**
 * The document with every top-level block's id: missing ones get their
 * stable id, duplicates a fresh one. What the editor does on load, for
 * JSON outside an editor (the merge, generated documents).
 */
export function withBlockIds<T extends { content?: BlockJSON[] }>(doc: T): T {
  const seen = new Set<string>();
  let changed = false;
  const content = (doc.content ?? []).map((block, index) => {
    let id = typeof block.attrs?.blockId === 'string' ? block.attrs.blockId : null;
    if (!id) id = stableBlockId(index, block.type ?? '', jsonText(block));
    while (seen.has(id)) id = newBlockId();
    seen.add(id);
    if (id === block.attrs?.blockId) return block;
    changed = true;
    return { ...block, attrs: { ...block.attrs, blockId: id } };
  });
  return changed ? { ...doc, content } : doc;
}

/** The attributes apart from the bookkeeping ones. */
function ownAttrs(attrs: Record<string, unknown>): string {
  const { blockId: _id, origin: _origin, editedAt: _editedAt, ...rest } = attrs;
  return JSON.stringify(rest);
}

/** Same block apart from the bookkeeping attributes. */
function sameBlock(a: PMNode, b: PMNode): boolean {
  return a === b || (a.type === b.type && a.content.eq(b.content) && ownAttrs(a.attrs) === ownAttrs(b.attrs));
}

export type BlockMetaOptions = {
  /** The clock (tests set it). */
  now: () => number;
};

const pluginKey = new PluginKey(BLOCK_META);

export const BlockMeta = Extension.create<BlockMetaOptions>({
  name: BLOCK_META,

  addOptions() {
    return { now: () => Date.now() };
  },

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          // Not split onto the new block (Enter), and not in the HTML, so a
          // copy gets its own id.
          blockId: { default: null, keepOnSplit: false, rendered: false },
          origin: {
            default: 'student',
            keepOnSplit: false,
            parseHTML: () => 'student',
            renderHTML: (attrs) => (isOrigin(attrs.origin) ? { 'data-origin': attrs.origin } : {}),
          },
          editedAt: { default: null, keepOnSplit: false, rendered: false },
        },
      },
    ];
  },

  addCommands() {
    return {
      loadDoc:
        (doc) =>
        ({ tr, dispatch }) => {
          if (dispatch) loadDocInto(tr, doc);
          return true;
        },
      applyBlocks:
        (doc) =>
        ({ tr, dispatch }) => {
          if (dispatch) applyBlocksTo(tr, doc);
          return true;
        },
    };
  },

  onCreate() {
    // Content given at creation never went through a transaction: give its
    // blocks their ids now (a system change, saved with the next edit).
    const { view } = this.editor;
    const tr = initialIds(view.state.tr, this.options.now());
    if (tr) view.dispatch(tr);
  },

  addProseMirrorPlugins() {
    return [blockMetaPlugin(() => this.options.now())];
  },
});

const asSystem = (tr: Transaction) => tr.setMeta(SYSTEM_META, true).setMeta('addToHistory', false).setMeta('preventUpdate', true);

/** `loadDoc`: the whole document replaced, as a system change. */
export function loadDocInto(tr: Transaction, doc: DocJSON): Transaction {
  const node = tr.doc.type.schema.nodeFromJSON(doc);
  return asSystem(tr.replaceWith(0, tr.doc.content.size, node.content));
}

/**
 * `applyBlocks`: only the blocks between the ends both documents share are
 * replaced, so a cursor in an untouched block stays where it is.
 */
export function applyBlocksTo(tr: Transaction, doc: DocJSON): Transaction {
  const target = tr.doc.type.schema.nodeFromJSON(doc);
  const current = tr.doc;
  let start = 0;
  while (start < current.childCount && start < target.childCount && current.child(start).eq(target.child(start))) start++;
  let endCurrent = current.childCount;
  let endTarget = target.childCount;
  while (endCurrent > start && endTarget > start && current.child(endCurrent - 1).eq(target.child(endTarget - 1))) {
    endCurrent--;
    endTarget--;
  }
  if (start === endCurrent && start === endTarget) return tr;
  let from = 0;
  for (let i = 0; i < start; i++) from += current.child(i).nodeSize;
  let to = from;
  for (let i = start; i < endCurrent; i++) to += current.child(i).nodeSize;
  const blocks: PMNode[] = [];
  for (let i = start; i < endTarget; i++) blocks.push(target.child(i));
  return asSystem(tr.replaceWith(from, to, Fragment.from(blocks)));
}

/** The ids a document given at creation lacks, or null. */
export function initialIds(tr: Transaction, now: number): Transaction | null {
  const fix = blockMetaFix(tr.doc, tr.doc, [], true, now);
  return fix ? asSystem(applyFix(tr, fix)) : null;
}

/** The plugin that keeps ids, origin and edit times right after every transaction. */
export function blockMetaPlugin(now: () => number): Plugin {
  return new Plugin({
    key: pluginKey,
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;
      const system = transactions.some((tr) => tr.getMeta(SYSTEM_META));
      const fix = blockMetaFix(oldState.doc, newState.doc, transactions, system, now());
      if (!fix) return null;
      const tr = applyFix(newState.tr, fix);
      // Keep the marks set for what is typed next (⌘B before typing, leaving a
      // link): a transaction that changes the document would otherwise drop them.
      if (newState.storedMarks) tr.setStoredMarks(newState.storedMarks);
      return system ? tr.setMeta(SYSTEM_META, true).setMeta('addToHistory', false) : tr;
    },
  });
}

type BlockChange = { pos: number; attrs: Record<string, unknown> };

function applyFix(tr: Transaction, changes: BlockChange[]): Transaction {
  for (const { pos, attrs } of changes) {
    for (const [key, value] of Object.entries(attrs)) tr.setNodeAttribute(pos, key, value);
  }
  return tr;
}

/**
 * What the new document's top-level blocks need: ids for blocks without
 * one (inherited from the block they replace, stable when loaded, else
 * new) and for duplicates; `student` and the time for blocks the student
 * changed or added. Null when nothing.
 */
export function blockMetaFix(
  oldDoc: PMNode,
  newDoc: PMNode,
  transactions: readonly Transaction[],
  system: boolean,
  now: number,
): BlockChange[] | null {
  const oldById = new Map<string, PMNode>();
  oldDoc.forEach((node) => {
    if (typeof node.attrs.blockId === 'string') oldById.set(node.attrs.blockId, node);
  });
  const newIds = new Set<string>();
  newDoc.forEach((node) => {
    if (typeof node.attrs.blockId === 'string') newIds.add(node.attrs.blockId);
  });

  // Back from the new document to the old one, to find what a block replaced.
  const back = new Mapping();
  for (const tr of transactions) for (const map of tr.mapping.maps) back.appendMap(map);
  const inverted = back.invert();

  const seen = new Set<string>();
  const changes: BlockChange[] = [];
  newDoc.forEach((node, pos, index) => {
    if (!BLOCK_TYPES.includes(node.type.name)) return;
    const attrs: Record<string, unknown> = {};
    let id: string | null = typeof node.attrs.blockId === 'string' ? node.attrs.blockId : null;
    let previous: PMNode | undefined = id ? oldById.get(id) : undefined;

    if (!id || seen.has(id)) {
      const missing = !id;
      // The student changed a block's type (paragraph → heading), which
      // drops its id: it keeps the id of the block it replaced if nothing
      // else has it now. (Not for system changes: a loaded document
      // replaces everything, so positions say nothing.)
      const before = !system && transactions.length ? oldBlockAt(oldDoc, inverted.map(pos, 1)) : undefined;
      const beforeId = typeof before?.attrs.blockId === 'string' ? before.attrs.blockId : null;
      if (beforeId && !newIds.has(beforeId) && !seen.has(beforeId)) {
        id = beforeId;
        previous = before;
      } else {
        id = system && missing ? stableBlockId(index, node.type.name, nodeText(node)) : newBlockId();
        while (seen.has(id)) id = newBlockId();
        previous = undefined;
      }
      attrs.blockId = id;
    }
    seen.add(id);

    if (!system) {
      const studentChange = !previous || !sameBlock(previous, node);
      if (studentChange && (node.attrs.origin !== 'student' || node.attrs.editedAt !== now)) {
        attrs.origin = 'student';
        attrs.editedAt = now;
      }
    }
    if (Object.keys(attrs).length) changes.push({ pos, attrs });
  });
  return changes.length ? changes : null;
}

function oldBlockAt(doc: PMNode, pos: number): PMNode | undefined {
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  const index = doc.resolve(clamped).index(0);
  return index < doc.childCount ? doc.child(index) : undefined;
}
