import { LEGACY_NOTE_FORMAT, readLegacyNote, type LegacyNoteResult } from '../cloudRows';
import { aiBlocks, applyEdit, blockMeta, combineEdits, makeEdit, mergeEdit, sameValue, type NoteEdit } from '../noteBlocks';

const CREATED = '2026-10-20 09:00:00.123456+00';
const T = (min: number) => new Date(Date.UTC(2026, 9, 25, 10, min)).toISOString();

function note(over: Partial<LegacyNoteResult> = {}): LegacyNoteResult {
  return {
    format: LEGACY_NOTE_FORMAT,
    title: 'Macro 1',
    summaryLevel: 'standard',
    recordingMode: 'lecture',
    summary: 'S0',
    keyConcepts: [{ term: 'GDP' }],
    formulas: [],
    definitions: [],
    tags: ['econ'],
    unclearParts: [],
    manualAnnotations: null,
    isConfirmed: true,
    ...over,
  };
}

/** An edit made on `device` at minute `min` on top of `base`. */
function edit(base: LegacyNoteResult, updates: Record<string, unknown>, device: string, min: number, id = `e-${device}-${min}`): NoteEdit {
  const e = makeEdit({ id, device, base, baseCreatedAt: CREATED, updates: updates as never, now: new Date(T(min)) });
  if (!e) throw new Error('no change');
  return e;
}

describe('makeEdit', () => {
  it('keeps only the blocks that changed, with their starting value', () => {
    const e = edit(note(), { summary: 'S1', title: 'Macro 1', tags: ['econ'] }, 'phone', 5);
    expect(Object.keys(e.changes)).toEqual(['summary']);
    expect(e.base).toEqual({ summary: 'S0' });
    expect(e.changes.summary).toEqual({ value: 'S1', editedAt: T(5) });
  });

  it('is null when nothing changed', () => {
    expect(makeEdit({ id: 'x', device: 'd', base: note(), baseCreatedAt: CREATED, updates: { summary: 'S0' }, now: new Date() })).toBeNull();
  });

  it("never dates an edit before the version it replaces (a slow clock)", () => {
    const base = note({ blocks: { summary: { origin: 'student', editedAt: T(30), device: 'laptop' } } });
    const e = edit(base, { summary: 'S1' }, 'phone', 5);
    expect(e.changes.summary?.editedAt).toBe(new Date(Date.parse(T(30)) + 1).toISOString());
  });
});

describe('mergeEdit', () => {
  it('applies an edit nobody else made, and marks the block as the student\'s', () => {
    const server = note();
    const m = mergeEdit(server, CREATED, edit(server, { summary: 'S1' }, 'phone', 5));
    expect(m.changed).toBe(true);
    expect(m.conflicts).toEqual([]);
    expect(m.versions).toEqual([]);
    expect(m.result.summary).toBe('S1');
    expect(m.result.blocks?.summary).toEqual({ origin: 'student', editedAt: T(5), device: 'phone' });
  });

  it('does nothing when the server already has the value (an edit sent twice)', () => {
    const server = note();
    const e = edit(server, { summary: 'S1' }, 'phone', 5);
    const once = mergeEdit(server, CREATED, e).result;
    const twice = mergeEdit(once, CREATED, e);
    expect(twice.changed).toBe(false);
    expect(twice.versions).toEqual([]);
  });

  it('edits of different blocks on two devices both survive', () => {
    const start = note();
    const laptop = mergeEdit(start, CREATED, edit(start, { formulas: ['Y = C + I'] }, 'laptop', 7)).result;
    const m = mergeEdit(laptop, CREATED, edit(start, { summary: 'phone summary' }, 'phone', 5));
    expect(m.result.summary).toBe('phone summary');
    expect(m.result.formulas).toEqual(['Y = C + I']);
    expect(m.conflicts).toEqual([]);
  });

  it('same block on two devices: the newer edit (laptop) wins, the phone\'s is kept as a version', () => {
    const start = note();
    const laptop = mergeEdit(start, CREATED, edit(start, { summary: 'B (laptop, 10:07)' }, 'laptop', 7)).result;
    // The phone edited offline at 10:05 and syncs later.
    const m = mergeEdit(laptop, CREATED, edit(start, { summary: 'A (phone, 10:05)', tags: ['econ', 'gdp'] }, 'phone', 5));

    expect(m.result.summary).toBe('B (laptop, 10:07)');
    expect(m.result.tags).toEqual(['econ', 'gdp']);
    expect(m.conflicts).toEqual([{ block: 'summary', kept: 'other' }]);
    expect(m.versions).toHaveLength(1);
    expect(m.versions[0].side).toBe('this');
    expect(m.versions[0].content.summary).toBe('A (phone, 10:05)');
    expect(m.versions[0].content.conflict).toMatchObject({ blocks: ['summary'], side: 'this', device: 'phone' });
  });

  it('same block on two devices: the newer edit (phone) wins, the laptop\'s is kept as a version', () => {
    const start = note();
    const laptop = mergeEdit(start, CREATED, edit(start, { summary: 'B (laptop, 10:03)' }, 'laptop', 3)).result;
    const m = mergeEdit(laptop, CREATED, edit(start, { summary: 'A (phone, 10:05)' }, 'phone', 5));

    expect(m.result.summary).toBe('A (phone, 10:05)');
    expect(m.conflicts).toEqual([{ block: 'summary', kept: 'this' }]);
    expect(m.versions).toHaveLength(1);
    expect(m.versions[0].side).toBe('other');
    expect(m.versions[0].content.summary).toBe('B (laptop, 10:03)');
    expect(m.versions[0].content.conflict).toMatchObject({ side: 'other', device: 'laptop', editedAt: T(3) });
  });

  it('a tie is decided by device id, the same way on every device', () => {
    const start = note();
    const viaA = mergeEdit(mergeEdit(start, CREATED, edit(start, { summary: 'from a' }, 'device-a', 5)).result, CREATED, edit(start, { summary: 'from b' }, 'device-b', 5));
    const viaB = mergeEdit(mergeEdit(start, CREATED, edit(start, { summary: 'from b' }, 'device-b', 5)).result, CREATED, edit(start, { summary: 'from a' }, 'device-a', 5));
    expect(viaA.result.summary).toBe('from b');
    expect(viaB.result.summary).toBe('from b');
  });

  it('a note from before step 1.8 counts as written by the AI when it was created', () => {
    const old = note();
    expect(blockMeta(old, 'summary', CREATED)).toEqual({ origin: 'ai', editedAt: '2026-10-20T09:00:00.123Z', device: null });
    // Changed on the server without block times (an old app version): any later edit wins.
    const m = mergeEdit(note({ summary: 'changed elsewhere' }), CREATED, edit(old, { summary: 'S1' }, 'phone', 5));
    expect(m.result.summary).toBe('S1');
    expect(m.versions[0].content.summary).toBe('changed elsewhere');
  });

  it('values compare equal regardless of key order (Postgres reorders JSON keys)', () => {
    expect(sameValue([{ term: 'GDP', definition: 'x' }], [{ definition: 'x', term: 'GDP' }])).toBe(true);
    const server = note({ keyConcepts: [{ definition: 'x', term: 'GDP' }] });
    const base = note({ keyConcepts: [{ term: 'GDP', definition: 'x' }] });
    const m = mergeEdit(server, CREATED, edit(base, { keyConcepts: [] }, 'phone', 5));
    expect(m.conflicts).toEqual([]);
    expect(m.result.keyConcepts).toEqual([]);
  });

  it('origin switches to student only for the blocks the student edited', () => {
    const generated = note({ blocks: aiBlocks('phone', T(1)) });
    const m = mergeEdit(generated, CREATED, edit(generated, { summary: 'mine' }, 'phone', 5));
    expect(m.result.blocks?.summary?.origin).toBe('student');
    expect(m.result.blocks?.formulas?.origin).toBe('ai');
  });

  it('block times survive the round trip through readLegacyNote', () => {
    const m = mergeEdit(note(), CREATED, edit(note(), { summary: 'S1' }, 'phone', 5));
    const read = readLegacyNote(JSON.parse(JSON.stringify(m.result)));
    expect(read?.blocks?.summary).toEqual({ origin: 'student', editedAt: T(5), device: 'phone' });
  });
});

describe('combineEdits and applyEdit (the iPhone, offline)', () => {
  it('two offline edits of the same note: the first base, the newest values', () => {
    const start = note();
    const first = edit(start, { summary: 'S1' }, 'phone', 5);
    const afterFirst = applyEdit(start, first);
    const second = edit(afterFirst, { summary: 'S2', title: 'Macro 1b' }, 'phone', 6);
    const both = combineEdits(first, second);
    expect(both.base).toEqual({ summary: 'S0', title: 'Macro 1' });
    expect(both.changes.summary?.value).toBe('S2');
    expect(both.id).toBe(first.id);

    // Against an untouched server, no conflict.
    const m = mergeEdit(start, CREATED, both);
    expect(m.conflicts).toEqual([]);
    expect(m.result.summary).toBe('S2');
    expect(m.result.title).toBe('Macro 1b');
  });

  it('an edit undone before it synced disappears', () => {
    const start = note();
    const first = edit(start, { summary: 'S1' }, 'phone', 5);
    const back = edit(applyEdit(start, first), { summary: 'S0' }, 'phone', 6);
    expect(combineEdits(first, back).changes).toEqual({});
  });
});
