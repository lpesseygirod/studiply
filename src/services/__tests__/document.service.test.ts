// Documents saved from the laptop: every save is merged block by
// block with the server's document, also when another device writes in
// between, and what loses a conflict is kept as a version, once.

import { onNextUpdate, resetTables, rowsOf, serverWrite } from '../../test-utils/fakeTables';
import { applyDocEdit, createDocument, getVersion, listVersions, nameVersion, openDocument, renameDocument, saveDocument, saveVersion, setPageSetup, thinVersions, versionsToThin } from '../document.service';
import { DEFAULT_PAGE_SETUP, MARGIN_PRESETS, type PageSetup } from '../../editor/page/pageSetup';
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

describe('naming and thinning versions', () => {
  const NOW = new Date('2026-12-15T12:00:00Z');
  const v = (id: string, created_at: string, reason = 'session_end', name: string | null = null) => ({ id, created_at, reason, name });

  it('keeps everything from the last 30 days, then the last edit of each day', () => {
    const versions = [
      v('recent-1', '2026-12-10T09:00:00Z'),
      v('recent-2', '2026-12-10T10:00:00Z'),
      v('old-morning', '2026-10-20T09:00:00Z'),
      v('old-noon', '2026-10-20T12:00:00Z'),
      v('old-evening', '2026-10-20T19:00:00Z'),
      v('old-other-day', '2026-10-21T09:00:00Z'),
    ];
    expect(versionsToThin(versions, NOW).sort()).toEqual(['old-morning', 'old-noon']);
  });

  it('never thins named, AI, before-restore or conflict versions', () => {
    const versions = [
      v('named', '2026-10-20T08:00:00Z', 'session_end', 'Antes del examen'),
      v('ai', '2026-10-20T08:30:00Z', 'ai_generation'),
      v('restore', '2026-10-20T09:00:00Z', 'restore'),
      v('conflict', '2026-10-20T09:30:00Z', 'conflict'),
      v('edit-1', '2026-10-20T10:00:00Z'),
      v('edit-2', '2026-10-20T11:00:00Z'),
    ];
    expect(versionsToThin(versions, NOW)).toEqual(['edit-1']);
  });

  it('names a version, removes the name, and a named one survives thinning', async () => {
    serverDoc(BASE);
    for (const [id, at, name] of [['n1', '2026-10-20T08:00:00Z', null], ['n2', '2026-10-20T09:00:00Z', null], ['n3', '2026-10-20T10:00:00Z', null]] as const) {
      serverWrite('document_versions', { id, document_id: 'doc-notes', file_id: FILE, reason: 'session_end', content: BASE, name });
      rowsOf('document_versions').find((r) => r.id === id)!.created_at = at;
    }
    expect(await nameVersion('n1', '  Antes   del examen ')).toBe('Antes del examen');
    await expect(nameVersion('n2', '   ')).rejects.toThrow('Enter a name.');
    await expect(nameVersion('n2', 'x'.repeat(101))).rejects.toThrow('Use at most 100 characters.');

    expect(await thinVersions(FILE, 'notes', NOW)).toBe(1);
    expect(rowsOf('document_versions').map((r) => r.id).sort()).toEqual(['n1', 'n3']);
    expect((await listVersions(FILE, 'notes')).find((x) => x.id === 'n1')?.name).toBe('Antes del examen');

    await nameVersion('n1', null);
    expect(rowsOf('document_versions').find((r) => r.id === 'n1')?.name).toBeNull();
  });
});

describe('page setup (after test D)', () => {
  const LETTER: PageSetup = { size: 'letter', orientation: 'landscape', margins: MARGIN_PRESETS.narrow.margins, numbers: 'top-right', gap: 48 };

  it('opens with the defaults; saved on the row beside the content, which stays as it is', async () => {
    serverDoc(BASE);
    expect((await openDocument(FILE, 'notes')).pageSetup).toEqual(DEFAULT_PAGE_SETUP);
    await setPageSetup(FILE, 'notes', LETTER);
    expect(rowsOf('documents')[0].page_setup).toEqual(LETTER);
    expect(texts(rowsOf('documents')[0].content)).toEqual(['Tema 1', 'La conducta']);
    expect((await openDocument(FILE, 'notes')).pageSetup).toEqual(LETTER);
    // Text saved afterwards keeps it.
    await saveDocument({ fileId: FILE, tab: 'notes', base: BASE, next: doc(p('a', 'Tema 1'), p('b', 'La conducta humana', 900)) });
    expect(rowsOf('documents')[0].page_setup).toEqual(LETTER);
  });

  it('a tab nothing was written in gets its row (empty) with the setup', async () => {
    serverWrite('files', { id: FILE, kind: 'lecture', title: 'Tema 1' });
    await setPageSetup(FILE, 'summary', LETTER);
    expect(rowsOf('documents')).toHaveLength(1);
    expect(rowsOf('documents')[0]).toMatchObject({ file_id: FILE, tab: 'summary', page_setup: LETTER, content: { type: 'doc', content: [] } });
  });

  it("a new document takes the account's default (Set as default)", async () => {
    serverWrite('profiles', { id: 'user-1', preferences: { pageSetup: LETTER } });
    const id = await createDocument({ courseId: null, folderId: null });
    expect((await openDocument(id, 'notes')).pageSetup).toEqual(LETTER);
  });
});
