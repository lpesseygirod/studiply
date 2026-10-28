// Documents saved from the laptop (step 4.3): every save is merged block by
// block with the server's document, also when another device writes in
// between, and what loses a conflict is kept as a version, once.

import { onNextUpdate, resetTables, rowsOf, serverWrite } from '../../test-utils/fakeTables';
import { applyDocEdit, createDocument, getVersion, listVersions, openDocument, renameDocument, saveDocument, saveVersion } from '../document.service';
import { makeDocEdit, type Block } from '../../editor/docBlocks';
import type { DocJSON } from '../../editor/types';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/fakeTables').module);
jest.mock('../../lib/deviceId', () => ({ getDeviceId: async () => 'laptop' }));
jest.mock('../../lib/mappers', () => {
  let n = 0;
  return { ...jest.requireActual('../../lib/mappers'), newId: () => `id-${++n}` };
});

const p = (id: string, text: string, editedAt: number | null = null): Block => ({
  type: 'paragraph',
  attrs: { blockId: id, origin: 'student', editedAt },
  content: text ? [{ type: 'text', text }] : [],
});
const doc = (...blocks: Block[]): DocJSON => ({ type: 'doc', content: blocks });
const texts = (d: unknown) => ((d as DocJSON).content ?? []).map((b) => (b.content ?? []).map((c) => c.text).join(''));

const FILE = 'file-1';
const BASE = doc(p('a', 'Tema 1'), p('b', 'La conducta'));

function serverDoc(content: DocJSON, tab = 'notes') {
  serverWrite('files', { id: FILE, kind: 'document', title: 'Apuntes', course_id: null, folder_id: null });
  return serverWrite('documents', { id: `doc-${tab}`, file_id: FILE, tab, content });
}

beforeEach(() => resetTables());

describe('saving on the laptop', () => {
  it('creates a tab the first time something is written in it', async () => {
    serverWrite('files', { id: FILE, kind: 'lecture', title: 'Tema 1' });
    const saved = await saveDocument({ fileId: FILE, tab: 'notes', base: doc(), next: doc(p('a', 'Mi nota', 500)) });
    expect(texts(saved.content)).toEqual(['Mi nota']);
    expect(rowsOf('documents')).toHaveLength(1);
    expect(rowsOf('documents')[0]).toMatchObject({ file_id: FILE, tab: 'notes' });
  });

  it('merges again when another device wrote in between (compare-and-swap)', async () => {
    serverDoc(BASE);
    onNextUpdate(() => serverWrite('documents', { id: 'doc-notes', content: doc(p('a', 'Tema 1 (iPhone)', 800), p('b', 'La conducta')) }));
    const saved = await saveDocument({ fileId: FILE, tab: 'notes', base: BASE, next: doc(p('a', 'Tema 1'), p('b', 'La conducta humana', 900)) });
    expect(texts(saved.content)).toEqual(['Tema 1 (iPhone)', 'La conducta humana']);
    expect(texts(rowsOf('documents')[0].content)).toEqual(['Tema 1 (iPhone)', 'La conducta humana']);
    expect(rowsOf('document_versions')).toEqual([]);
  });

  it('keeps the newer edit of a block and the other as a version, once', async () => {
    serverDoc(doc(p('a', 'Tema 1'), p('b', 'iPhone, más tarde', 3000)));
    const edit = makeDocEdit({ id: 'e1', device: 'laptop', base: BASE, next: doc(p('a', 'Tema 1'), p('b', 'Laptop, antes', 2000)), now: 2000 })!;

    const first = await applyDocEdit(FILE, 'notes', edit);
    expect(texts(first.row.content)).toEqual(['Tema 1', 'iPhone, más tarde']);
    expect(first.conflicts).toEqual([{ blockId: 'b', kept: 'other' }]);
    // Sent again (a retry): no second copy.
    await applyDocEdit(FILE, 'notes', edit);

    const versions = rowsOf('document_versions');
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ document_id: 'doc-notes', file_id: FILE, reason: 'conflict' });
    expect(texts(versions[0].content)).toEqual(['Tema 1', 'Laptop, antes']);
    // Opened from history, it's a plain document.
    expect(await getVersion(versions[0].id as string)).not.toHaveProperty('conflict');
  });

  it('reports blocks that lost to a newer edit', async () => {
    serverDoc(doc(p('a', 'Tema 1'), p('b', 'Más nuevo', 9_000_000_000_000)));
    const saved = await saveDocument({ fileId: FILE, tab: 'notes', base: BASE, next: doc(p('a', 'Tema 1'), p('b', 'Más viejo', 1000)) });
    expect(saved.lost).toEqual(['b']);
  });
});

describe('new documents', () => {
  it('creates the file and one empty page with a block id', async () => {
    const id = await createDocument({ courseId: 'c1', folderId: 'f1' });
    expect(rowsOf('files')[0]).toMatchObject({ id, kind: 'document', title: 'Untitled document', course_id: 'c1', folder_id: 'f1' });
    const page = rowsOf('documents')[0];
    expect(page).toMatchObject({ file_id: id, tab: 'notes' });
    expect((page.content as DocJSON).content?.[0].attrs?.blockId).toMatch(/^b/);

    const opened = await openDocument(id, 'notes');
    expect(opened.id).toBe(page.id);
    expect(opened.content).toEqual(page.content);
  });

  it('opens a tab nothing was written in as empty', async () => {
    serverWrite('files', { id: FILE, kind: 'lecture', title: 'Tema 1' });
    expect(await openDocument(FILE, 'summary')).toMatchObject({ id: null, content: { type: 'doc', content: [] }, updatedAt: null });
  });

  it('renames with the library name rule', async () => {
    serverDoc(BASE);
    expect(await renameDocument(FILE, '  Resumen   Tema 1 ')).toBe('Resumen Tema 1');
    expect(rowsOf('files')[0].title).toBe('Resumen Tema 1');
    await expect(renameDocument(FILE, '   ')).rejects.toThrow('Enter a name.');
  });
});

describe('versions', () => {
  it('keeps a version of the tab and lists them newest first', async () => {
    serverDoc(BASE);
    await saveVersion(FILE, 'notes', BASE, 'session_end');
    await saveVersion(FILE, 'notes', doc(p('a', 'Generado')), 'ai_generation');
    const list = await listVersions(FILE, 'notes');
    expect(list.map((v) => v.reason)).toEqual(['ai_generation', 'session_end']);
    expect(texts(await getVersion(list[1].id))).toEqual(['Tema 1', 'La conducta']);
    expect(rowsOf('document_versions').every((v) => v.document_id === 'doc-notes')).toBe(true);
  });
});
