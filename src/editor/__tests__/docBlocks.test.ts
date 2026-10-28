import { combineDocEdits, makeDocEdit, mergeDocEdit, rebase, sameDoc, type Block } from '../docBlocks';
import type { DocJSON } from '../types';

const p = (id: string, text: string, editedAt: number | null = null, origin = 'student'): Block => ({
  type: 'paragraph',
  attrs: { blockId: id, origin, editedAt },
  content: text ? [{ type: 'text', text }] : [],
});
const doc = (...blocks: Block[]): DocJSON => ({ type: 'doc', content: blocks });
const texts = (d: DocJSON) => (d.content ?? []).map((b) => (b.content ?? []).map((c) => c.text).join(''));

const BASE = doc(p('a', 'Tema 1', null, 'ai'), p('b', 'La conducta', null, 'ai'), p('c', 'Fin', null, 'ai'));
const edit = (next: DocJSON, now = 1000, base = BASE, id = 'e1', device = 'iphone') => makeDocEdit({ id, device, base, next, now })!;

describe('makeDocEdit', () => {
  it('is null when nothing changed, whatever the key order', () => {
    const reordered = doc(...(BASE.content ?? []).map((b) => ({ content: b.content, attrs: b.attrs, type: b.type })));
    expect(makeDocEdit({ id: 'x', device: 'd', base: BASE, next: reordered, now: 1 })).toBeNull();
  });

  it('holds only the changed, added and deleted blocks', () => {
    const e = edit(doc(p('a', 'Tema 1', null, 'ai'), p('b', 'La conducta humana', 900), p('n', 'Nuevo', 950)));
    expect(Object.keys(e.changes).sort()).toEqual(['b', 'c', 'n']);
    expect(e.base.n).toBeNull();
    expect(e.changes.c.value).toBeNull();
    expect(e.changes.b.editedAt).toBe(900);
    expect(e.order).toEqual(['a', 'b', 'n']);
  });

  it('never dates an edit before the block it replaces (slow clock)', () => {
    const base = doc(p('a', 'Uno', 5000));
    const e = makeDocEdit({ id: 'x', device: 'd', base, next: doc(p('a', 'Uno!', 4000)), now: 4000 })!;
    expect(e.changes.a.editedAt).toBe(5001);
  });

  it('dates every change now when restoring', () => {
    const e = makeDocEdit({ id: 'x', device: 'd', base: doc(p('a', 'Nuevo', 9000)), next: doc(p('a', 'Viejo', 100)), now: 9500, restamp: true })!;
    expect(e.changes.a.editedAt).toBe(9500);
  });
});

describe('mergeDocEdit', () => {
  it('applies an edit when nobody else changed the document', () => {
    const next = doc(p('a', 'Tema 1', null, 'ai'), p('b', 'La conducta humana', 900), p('n', 'Nuevo', 950));
    const r = mergeDocEdit(BASE, edit(next));
    expect(r.changed).toBe(true);
    expect(sameDoc(r.doc, next)).toBe(true);
    expect(r.conflicts).toEqual([]);
    expect(r.versions).toEqual([]);
  });

  it('does nothing when the same edit is sent again', () => {
    const e = edit(doc(p('a', 'Tema 1', null, 'ai'), p('b', 'Otra', 900), p('c', 'Fin', null, 'ai'), p('n', 'Nuevo', 950)));
    const once = mergeDocEdit(BASE, e);
    const twice = mergeDocEdit(once.doc, e);
    expect(twice.changed).toBe(false);
    expect(sameDoc(twice.doc, once.doc)).toBe(true);
    expect(twice.versions).toEqual([]);
  });

  it('keeps changes to different blocks from both devices', () => {
    const laptop = doc(p('a', 'Tema 1 · Psicobiología', 800), p('b', 'La conducta', null, 'ai'), p('c', 'Fin', null, 'ai'));
    const iphone = edit(doc(p('a', 'Tema 1', null, 'ai'), p('b', 'La conducta', null, 'ai'), p('c', 'Fin del tema', 900)));
    const r = mergeDocEdit(laptop, iphone);
    expect(texts(r.doc)).toEqual(['Tema 1 · Psicobiología', 'La conducta', 'Fin del tema']);
    expect(r.conflicts).toEqual([]);
  });

  it('keeps the newer edit of the same block; the older one goes to a version', () => {
    const laptop = doc(p('a', 'Tema 1', null, 'ai'), p('b', 'Laptop', 2000), p('c', 'Fin', null, 'ai'));
    // The iPhone wrote later: it wins; the laptop's document is kept.
    const newer = mergeDocEdit(laptop, edit(doc(p('a', 'Tema 1', null, 'ai'), p('b', 'iPhone', 3000), p('c', 'Fin', null, 'ai'))));
    expect(texts(newer.doc)[1]).toBe('iPhone');
    expect(newer.conflicts).toEqual([{ blockId: 'b', kept: 'this' }]);
    expect(newer.versions).toHaveLength(1);
    expect(newer.versions[0].side).toBe('other');
    expect(texts(newer.versions[0].content)[1]).toBe('Laptop');
    expect(newer.versions[0].content.conflict).toMatchObject({ blockIds: ['b'], side: 'other', editedAt: 2000 });

    // The iPhone wrote earlier: the laptop's stays; the iPhone's is kept.
    const older = mergeDocEdit(laptop, edit(doc(p('a', 'Tema 1', null, 'ai'), p('b', 'iPhone', 1500), p('c', 'Fin', null, 'ai'))));
    expect(texts(older.doc)[1]).toBe('Laptop');
    expect(older.changed).toBe(false);
    expect(older.versions[0].side).toBe('this');
    expect(texts(older.versions[0].content)[1]).toBe('iPhone');
    expect(older.versions[0].content.conflict.device).toBe('iphone');
  });

  it('gives a tie to the server, the same on every device', () => {
    const laptop = doc(p('a', 'Tema 1', null, 'ai'), p('b', 'Laptop', 2000), p('c', 'Fin', null, 'ai'));
    const r = mergeDocEdit(laptop, edit(doc(p('a', 'Tema 1', null, 'ai'), p('b', 'iPhone', 2000), p('c', 'Fin', null, 'ai'))));
    expect(texts(r.doc)[1]).toBe('Laptop');
    expect(r.conflicts).toEqual([{ blockId: 'b', kept: 'other' }]);
  });

  it('keeps an edit over a delete, both ways: nothing written is lost', () => {
    // Deleted here, edited there: the other device's edit stays.
    const edited = doc(p('a', 'Tema 1', null, 'ai'), p('b', 'Editado', 2000), p('c', 'Fin', null, 'ai'));
    const deleteHere = mergeDocEdit(edited, edit(doc(p('a', 'Tema 1', null, 'ai'), p('c', 'Fin', null, 'ai'))));
    expect(texts(deleteHere.doc)).toEqual(['Tema 1', 'Editado', 'Fin']);
    expect(deleteHere.conflicts).toEqual([{ blockId: 'b', kept: 'other' }]);

    // Edited here, deleted there: this edit comes back in its place.
    const deleted = doc(p('a', 'Tema 1', null, 'ai'), p('c', 'Fin', null, 'ai'));
    const editHere = mergeDocEdit(deleted, edit(doc(p('a', 'Tema 1', null, 'ai'), p('b', 'Editado aquí', 900), p('c', 'Fin', null, 'ai'))));
    expect(texts(editHere.doc)).toEqual(['Tema 1', 'Editado aquí', 'Fin']);
  });

  it('deletes a block nobody else changed', () => {
    const r = mergeDocEdit(BASE, edit(doc(p('a', 'Tema 1', null, 'ai'), p('c', 'Fin', null, 'ai'))));
    expect(texts(r.doc)).toEqual(['Tema 1', 'Fin']);
  });

  it('puts new blocks after the block they followed, in order', () => {
    const laptop = doc(p('z', 'Arriba', 500), ...(BASE.content ?? []));
    const r = mergeDocEdit(laptop, edit(doc(p('a', 'Tema 1', null, 'ai'), p('n1', 'Uno', 900), p('n2', 'Dos', 901), p('b', 'La conducta', null, 'ai'), p('c', 'Fin', null, 'ai'))));
    expect(texts(r.doc)).toEqual(['Arriba', 'Tema 1', 'Uno', 'Dos', 'La conducta', 'Fin']);
  });

  it('puts a new block after the closest earlier block that still exists', () => {
    const laptop = doc(p('a', 'Tema 1', null, 'ai'), p('c', 'Fin', null, 'ai')); // b deleted there
    const r = mergeDocEdit(laptop, edit(doc(p('a', 'Tema 1', null, 'ai'), p('b', 'La conducta', null, 'ai'), p('n', 'Nuevo', 900), p('c', 'Fin', null, 'ai'))));
    expect(texts(r.doc)).toEqual(['Tema 1', 'Nuevo', 'Fin']);
  });

  it('puts what was written on an empty tab after what the other device wrote there', () => {
    const laptop = doc(p('l', 'Nota del laptop', 900));
    const e = makeDocEdit({ id: 'x', device: 'iphone', base: doc(), next: doc(p('m1', 'Uno', 1000), p('m2', 'Dos', 1001)), now: 1000 })!;
    expect(texts(mergeDocEdit(laptop, e).doc)).toEqual(['Nota del laptop', 'Uno', 'Dos']);
  });

  it('moves a block the student moved', () => {
    const moved = doc(p('c', 'Fin', null, 'ai'), p('a', 'Tema 1', null, 'ai'), p('b', 'La conducta', null, 'ai'));
    const e = edit(moved);
    expect(e.changes.c.moved).toBe(true);
    const laptop = doc(p('a', 'Tema 1', null, 'ai'), p('b', 'La conducta editada', 800), p('c', 'Fin', null, 'ai'));
    expect(texts(mergeDocEdit(laptop, e).doc)).toEqual(['Fin', 'Tema 1', 'La conducta editada']);
  });

  it('reads documents saved before block ids the same on both sides', () => {
    const old: DocJSON = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Uno' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Dos' }] }] };
    const next: DocJSON = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Uno' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Dos y tres' }] }] };
    const e = makeDocEdit({ id: 'x', device: 'd', base: old, next, now: 10 });
    // Without ids the edited block looks new; the old one is deleted: same text in the end.
    expect(texts(mergeDocEdit(old, e!).doc)).toEqual(['Uno', 'Dos y tres']);
  });
});

describe('combineDocEdits', () => {
  it('turns two waiting edits into one: first base, newest blocks', () => {
    const first = edit(doc(p('a', 'Tema 1', null, 'ai'), p('b', 'Uno', 900), p('c', 'Fin', null, 'ai')));
    const afterFirst = doc(p('a', 'Tema 1', null, 'ai'), p('b', 'Uno', 900), p('c', 'Fin', null, 'ai'));
    const second = edit(doc(p('a', 'Tema 1', null, 'ai'), p('b', 'Uno dos', 950), p('c', 'Fin', null, 'ai'), p('n', 'Nuevo', 960)), 1000, afterFirst, 'e2');
    const both = combineDocEdits(first, second);
    expect(both.id).toBe('e1');
    expect(texts({ type: 'doc', content: [both.base.b as Block] })).toEqual(['La conducta']);
    expect(both.changes.b.value?.content?.[0].text).toBe('Uno dos');
    expect(Object.keys(both.changes).sort()).toEqual(['b', 'n']);
    expect(texts(mergeDocEdit(BASE, both).doc)).toEqual(['Tema 1', 'Uno dos', 'Fin', 'Nuevo']);
  });

  it('drops a block edited back to where it started, or added and deleted again', () => {
    const first = edit(doc(p('a', 'Tema 1', null, 'ai'), p('b', 'Otra', 900), p('c', 'Fin', null, 'ai'), p('n', 'Nuevo', 910)));
    const afterFirst = doc(p('a', 'Tema 1', null, 'ai'), p('b', 'Otra', 900), p('c', 'Fin', null, 'ai'), p('n', 'Nuevo', 910));
    const second = edit(BASE, 1000, afterFirst, 'e2');
    const both = combineDocEdits(first, second);
    expect(both.changes).toEqual({});
  });
});

describe('rebase', () => {
  it('takes the merged document and keeps what was typed since the save started', () => {
    const sent = doc(p('a', 'Tema 1', null, 'ai'), p('b', 'Uno', 900), p('c', 'Fin', null, 'ai'));
    const current = doc(p('a', 'Tema 1', null, 'ai'), p('b', 'Uno dos tres', 990), p('c', 'Fin', null, 'ai'));
    const merged = doc(p('a', 'Tema 1 (laptop)', 950), p('b', 'Uno', 900), p('c', 'Fin', null, 'ai'));
    expect(texts(rebase(sent, current, merged)!)).toEqual(['Tema 1 (laptop)', 'Uno dos tres', 'Fin']);
  });

  it('is null when the editor already shows the merged document', () => {
    const sent = doc(p('a', 'Tema 1', null, 'ai'), p('b', 'Uno', 900));
    expect(rebase(sent, sent, sent)).toBeNull();
  });
});
