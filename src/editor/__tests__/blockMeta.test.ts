import { getSchema } from '@tiptap/core';
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state';

import { studiplyExtensions } from '../bridges';
import { applyBlocksTo, blockMetaPlugin, initialIds, loadDocInto, SYSTEM_META, withBlockIds } from '../schema/blockMeta';
import type { DocJSON } from '../types';

const schema = getSchema(studiplyExtensions());
let clock = 1000;

const para = (text: string, attrs: Record<string, unknown> = {}) => ({ type: 'paragraph', attrs, content: text ? [{ type: 'text', text }] : [] });

function stateOf(doc: DocJSON) {
  return EditorState.create({ schema, doc: schema.nodeFromJSON(doc), plugins: [blockMetaPlugin(() => clock)] });
}

const apply = (state: EditorState, make: (tr: Transaction) => Transaction) => state.applyTransaction(make(state.tr)).state;
const blocks = (state: EditorState) => state.doc.toJSON().content as { type: string; attrs: Record<string, unknown> }[];
const metaOf = (state: EditorState) => blocks(state).map((b) => ({ id: b.attrs.blockId, origin: b.attrs.origin, editedAt: b.attrs.editedAt }));

const AI_DOC: DocJSON = {
  type: 'doc',
  content: [para('Tema 1', { blockId: 'a', origin: 'ai', editedAt: null }), para('La conducta', { blockId: 'b', origin: 'ai', editedAt: null })],
};

/** Position just inside the n-th top-level block. */
function inside(state: EditorState, n: number): number {
  let pos = 1;
  for (let i = 0; i < n; i++) pos += state.doc.child(i).nodeSize;
  return pos;
}

beforeEach(() => {
  clock = 1000;
});

describe('the origin rule', () => {
  it('turns an AI block the student edits into student, with the time', () => {
    clock = 5000;
    const next = apply(stateOf(AI_DOC), (tr) => tr.insertText(' humana', inside(stateOf(AI_DOC), 1) + 'La conducta'.length));
    expect(metaOf(next)).toEqual([
      { id: 'a', origin: 'ai', editedAt: null },
      { id: 'b', origin: 'student', editedAt: 5000 },
    ]);
  });

  it('leaves origin and time alone for system changes', () => {
    const next = apply(stateOf(AI_DOC), (tr) => tr.insertText('!', inside(stateOf(AI_DOC), 0)).setMeta(SYSTEM_META, true));
    expect(metaOf(next)).toEqual([
      { id: 'a', origin: 'ai', editedAt: null },
      { id: 'b', origin: 'ai', editedAt: null },
    ]);
  });

  it('makes a new block the student adds student, with its own id', () => {
    clock = 7000;
    const state = stateOf(AI_DOC);
    const next = apply(state, (tr) => tr.insert(state.doc.content.size, schema.nodeFromJSON(para('Mi nota'))));
    const added = metaOf(next)[2];
    expect(added.origin).toBe('student');
    expect(added.editedAt).toBe(7000);
    expect(typeof added.id).toBe('string');
    expect(['a', 'b']).not.toContain(added.id);
  });

  it('counts changing a block type as an edit, keeping the id', () => {
    clock = 9000;
    const state = stateOf(AI_DOC);
    const next = apply(state, (tr) => tr.setBlockType(inside(state, 0), inside(state, 0), schema.nodes.heading, { level: 2 }));
    expect(blocks(next)[0].type).toBe('heading');
    expect(metaOf(next)[0]).toEqual({ id: 'a', origin: 'student', editedAt: 9000 });
  });
});

describe('block ids', () => {
  it('gives the second half of a split block a new id', () => {
    const state = stateOf(AI_DOC);
    const next = apply(state, (tr) => tr.split(inside(state, 1) + 2));
    const ids = metaOf(next).map((m) => m.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids.slice(0, 2)).toEqual(['a', 'b']);
  });

  it('gives a pasted copy of a block a new id', () => {
    const state = stateOf(AI_DOC);
    const copy = schema.nodeFromJSON(para('La conducta', { blockId: 'b', origin: 'ai' }));
    const next = apply(state, (tr) => tr.insert(state.doc.content.size, copy));
    const ids = metaOf(next).map((m) => m.id);
    expect(ids.slice(0, 2)).toEqual(['a', 'b']);
    expect(ids[2]).not.toBe('b');
    expect(metaOf(next)[2].origin).toBe('student');
  });

  it('gives a document without ids the same ids on every device', () => {
    const old: DocJSON = { type: 'doc', content: [para('Uno'), para('Dos'), para('Uno')] };
    const loadOnce = () => {
      const state = stateOf({ type: 'doc', content: [para('')] });
      return metaOf(apply(state, (tr) => loadDocInto(tr, old)));
    };
    const a = loadOnce();
    const b = loadOnce();
    expect(a.map((m) => m.id)).toEqual(b.map((m) => m.id));
    expect(new Set(a.map((m) => m.id)).size).toBe(3);
    expect(a.every((m) => m.origin === 'student' && m.editedAt === null)).toBe(true);
    // The JSON helper agrees with the editor.
    expect((withBlockIds(old).content ?? []).map((b) => b.attrs?.blockId)).toEqual(a.map((m) => m.id));
  });

  it('fixes content given at creation', () => {
    const state = stateOf({ type: 'doc', content: [para('Uno'), para('Dos')] });
    const tr = initialIds(state.tr, clock);
    expect(tr).not.toBeNull();
    const next = state.applyTransaction(tr!).state;
    expect(metaOf(next).every((m) => typeof m.id === 'string' && m.origin === 'student' && m.editedAt === null)).toBe(true);
    expect(initialIds(next.tr, clock)).toBeNull();
  });
});

describe('loading and changes from the other device', () => {
  it('loads as a system change: origins kept, not in Undo, no update', () => {
    const state = stateOf({ type: 'doc', content: [para('')] });
    const tr = loadDocInto(state.tr, AI_DOC);
    expect(tr.getMeta('addToHistory')).toBe(false);
    expect(tr.getMeta('preventUpdate')).toBe(true);
    expect(metaOf(state.applyTransaction(tr).state)).toEqual(metaOf(stateOf(AI_DOC)));
  });

  it('replaces only the blocks that differ and keeps the cursor', () => {
    const doc: DocJSON = { type: 'doc', content: [para('Uno', { blockId: 'a' }), para('Dos', { blockId: 'b' }), para('Tres', { blockId: 'c' })] };
    let state = stateOf(doc);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, inside(state, 0) + 2)));
    const remote: DocJSON = { type: 'doc', content: [para('Uno', { blockId: 'a' }), para('Dos y más', { blockId: 'b', origin: 'student', editedAt: 42 }), para('Tres', { blockId: 'c' })] };
    const next = apply(state, (tr) => applyBlocksTo(tr, remote));
    expect(next.doc.toJSON()).toEqual(stateOf(remote).doc.toJSON());
    expect(next.selection.from).toBe(inside(state, 0) + 2);
    expect(metaOf(next)[1]).toEqual({ id: 'b', origin: 'student', editedAt: 42 });
  });

  it('does nothing when the documents are the same', () => {
    const state = stateOf(AI_DOC);
    expect(applyBlocksTo(state.tr, AI_DOC).docChanged).toBe(false);
  });
});
