import { makeDocEdit, mergeDocEdit, type Block } from '../docBlocks';
import { BACKGROUND_VERSION_GAP_MS, DocumentSession, SAVE_DELAY_MS, type SessionApi, type SessionState } from '../documentSession';
import type { DocJSON } from '../types';

const p = (id: string, text: string, editedAt: number | null = null): Block => ({
  type: 'paragraph',
  attrs: { blockId: id, origin: 'student', editedAt },
  content: text ? [{ type: 'text', text }] : [],
});
const doc = (...blocks: Block[]): DocJSON => ({ type: 'doc', content: blocks });
const texts = (d: DocJSON) => (d.content ?? []).map((b) => (b.content ?? []).map((c) => c.text).join(''));

/** The editor: a document, written by the test as the student would. */
function fakeEditor(initial: DocJSON = doc()) {
  const e = {
    doc: initial,
    applied: 0,
    getJSON: async () => e.doc,
    loadDoc: (d: DocJSON) => void (e.doc = d),
    applyBlocks: (d: DocJSON) => {
      e.applied++;
      e.doc = d;
    },
  };
  return e;
}

/** The server: one document, merged block by block like document.service. */
function fakeServer(initial: DocJSON, options: { queued?: boolean } = {}) {
  let tick = 0;
  const s = {
    doc: initial,
    updatedAt: 't0',
    saves: 0,
    versions: [] as DocJSON[],
    offline: false,
    failNext: false,
    duringSave: null as null | (() => void),
    write(next: DocJSON) {
      s.doc = next;
      s.updatedAt = `t${++tick}`;
    },
    api: {} as SessionApi,
  };
  s.api = {
    open: async () => ({ content: s.doc, updatedAt: s.updatedAt }),
    save: async (base, next) => {
      s.saves++;
      if (s.failNext) {
        s.failNext = false;
        throw new Error('Network request failed');
      }
      s.duringSave?.();
      s.duringSave = null;
      if (options.queued) return { content: next, updatedAt: null, queued: true, lost: [] };
      const edit = makeDocEdit({ id: `e${s.saves}`, device: 'laptop', base, next, now: 5000 });
      if (edit) {
        const merged = mergeDocEdit(s.doc, edit);
        if (merged.changed) s.write(merged.doc);
        return { content: s.doc, updatedAt: s.updatedAt, queued: false, lost: merged.conflicts.filter((c) => c.kept === 'other').map((c) => c.blockId) };
      }
      return { content: s.doc, updatedAt: s.updatedAt, queued: false, lost: [] };
    },
    stamp: async () => s.updatedAt,
    saveVersion: async (content) => void s.versions.push(content),
    isOffline: () => s.offline,
    now: () => Date.now(),
  };
  return s;
}

function session(editor: ReturnType<typeof fakeEditor>, server: ReturnType<typeof fakeServer>) {
  const states: SessionState[] = [];
  const s = new DocumentSession(editor, server.api, (state) => states.push(state));
  return { s, states, last: () => states[states.length - 1] };
}

/** Lets the timers and the promises they start run. */
async function wait(ms: number) {
  await jest.advanceTimersByTimeAsync(ms);
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('autosave', () => {
  it('loads the tab and saves 1 s after the student stops typing, once', async () => {
    const server = fakeServer(doc(p('a', 'Tema 1')));
    const editor = fakeEditor();
    const { s, last } = session(editor, server);
    await s.start();
    expect(texts(editor.doc)).toEqual(['Tema 1']);
    expect(last().status).toBe('saved');

    editor.doc = doc(p('a', 'Tema 1.'));
    s.changed();
    await wait(600);
    editor.doc = doc(p('a', 'Tema 1. La'));
    s.changed();
    await wait(600);
    expect(server.saves).toBe(0);
    await wait(SAVE_DELAY_MS);
    expect(server.saves).toBe(1);
    expect(texts(server.doc)).toEqual(['Tema 1. La']);
    expect(last().status).toBe('saved');
    expect(last().savedAt).not.toBeNull();
  });

  it('takes the other device\'s changes from a save and keeps what was typed meanwhile', async () => {
    const server = fakeServer(doc(p('a', 'Tema 1'), p('b', 'Uno')));
    const editor = fakeEditor();
    const { s } = session(editor, server);
    await s.start();

    editor.doc = doc(p('a', 'Tema 1'), p('b', 'Uno dos', 4000));
    s.changed();
    server.duringSave = () => {
      // The laptop wrote the title; the student kept typing here.
      server.write(doc(p('a', 'Tema 1 (laptop)', 4500), p('b', 'Uno')));
      editor.doc = doc(p('a', 'Tema 1'), p('b', 'Uno dos tres', 4100));
      s.changed();
    };
    await wait(SAVE_DELAY_MS);
    expect(texts(editor.doc)).toEqual(['Tema 1 (laptop)', 'Uno dos tres']);
    await wait(SAVE_DELAY_MS);
    expect(texts(server.doc)).toEqual(['Tema 1 (laptop)', 'Uno dos tres']);
  });

  it('keeps the text and tries again after a failed save', async () => {
    const server = fakeServer(doc(p('a', 'Tema 1')));
    const editor = fakeEditor();
    const { s, last } = session(editor, server);
    await s.start();
    server.failNext = true;
    editor.doc = doc(p('a', 'Tema 1 editado', 4000));
    s.changed();
    await wait(SAVE_DELAY_MS);
    expect(last().status).toBe('failed');
    expect(texts(editor.doc)).toEqual(['Tema 1 editado']);
    await wait(5000);
    expect(last().status).toBe('saved');
    expect(texts(server.doc)).toEqual(['Tema 1 editado']);
  });

  it('says "saved on this iPhone" while offline, and saved once the queue sent it', async () => {
    const server = fakeServer(doc(p('a', 'Tema 1')), { queued: true });
    server.offline = true;
    const editor = fakeEditor();
    const { s, last } = session(editor, server);
    await s.start();
    editor.doc = doc(p('a', 'Sin conexión', 4000));
    s.changed();
    await wait(SAVE_DELAY_MS);
    expect(last().status).toBe('local');

    // Back online: the queue merged it with the laptop's line.
    server.offline = false;
    server.write(doc(p('a', 'Sin conexión', 4000), p('l', 'Del laptop', 4200)));
    await s.refresh({ synced: true });
    expect(texts(editor.doc)).toEqual(['Sin conexión', 'Del laptop']);
    expect(last().status).toBe('saved');
  });
});

describe('changes from the other device', () => {
  it('come in when the server copy moved and nothing waits here', async () => {
    const server = fakeServer(doc(p('a', 'Tema 1')));
    const editor = fakeEditor();
    const { s } = session(editor, server);
    await s.start();
    await s.poll();
    expect(editor.applied).toBe(0);

    server.write(doc(p('a', 'Tema 1'), p('i', 'Escrito en el iPhone', 4000)));
    await s.poll();
    expect(texts(editor.doc)).toEqual(['Tema 1', 'Escrito en el iPhone']);
  });

  it('wait for the next save while something is waiting here', async () => {
    const server = fakeServer(doc(p('a', 'Tema 1')));
    const editor = fakeEditor();
    const { s } = session(editor, server);
    await s.start();
    editor.doc = doc(p('a', 'Tema 1'), p('m', 'Mío', 4000));
    s.changed();
    server.write(doc(p('a', 'Tema 1'), p('i', 'Del iPhone', 4100)));
    await s.poll();
    expect(texts(editor.doc)).toEqual(['Tema 1', 'Mío']);
    await wait(SAVE_DELAY_MS);
    expect(texts(editor.doc).sort()).toEqual(['Del iPhone', 'Mío', 'Tema 1']);
  });
});

describe('a version at the end of each session', () => {
  it('is kept on leaving when the text changed, not when it didn\'t', async () => {
    const server = fakeServer(doc(p('a', 'Tema 1')));
    const editor = fakeEditor();
    const { s } = session(editor, server);
    await s.start();
    await s.end('leave');
    expect(server.versions).toHaveLength(0);

    editor.doc = doc(p('a', 'Tema 1 final', 4000));
    s.changed();
    await s.end('leave'); // saves first, without waiting for the second
    expect(server.saves).toBe(1);
    expect(server.versions.map(texts)).toEqual([['Tema 1 final']]);
  });

  it('is kept at most every 5 minutes when the app goes to the background', async () => {
    const server = fakeServer(doc(p('a', 'Uno')));
    const editor = fakeEditor();
    const { s } = session(editor, server);
    await s.start();
    editor.doc = doc(p('a', 'Dos', 4000));
    s.changed();
    await s.end('background');
    editor.doc = doc(p('a', 'Tres', 4001));
    s.changed();
    await s.end('background');
    expect(server.versions).toHaveLength(1);
    jest.setSystemTime(Date.now() + BACKGROUND_VERSION_GAP_MS);
    await s.end('background');
    expect(server.versions.map(texts)).toEqual([['Dos'], ['Tres']]);
  });
});
