import { supabase } from '../lib/supabase';
import { serviceError } from '../lib/cloudRows';
import { cacheUser, markClean, notifyLibraryUpdated, readRows, readThrough, remember, saveLocalRow, withLocalChanges } from '../lib/cache';
import { newId } from '../lib/mappers';
import { emptySheetDoc } from '../lib/sheetDoc';
import { enqueue, pendingSyncFor, PermanentSyncError, registerSyncHandler, syncEnabled } from '../lib/sync';
import { syncError } from '../lib/sync/errors';
import type { DocJSON } from '../editor/types';
import type { Json } from '../types/supabase';
import {
  blankDoc,
  editKey,
  ensureDocumentOnServer,
  FIXED_TABS,
  localDocument,
  noteKeptTab,
  type DocTab,
  type DocumentRow,
  type FixedTab,
} from './document.service';

/**
 * Tabs in every document (step 4.7b). Each tab is a documents row: its id
 * (`tab`) is `notes`, `summary`, `transcript` or `t-<uuid>` for an added one,
 * with a title, a position among the movable tabs, a soft delete and a kind
 * (summary, sheet). Content, versions, page setup and the queue already work
 * per row (document.service); this is the list of tabs and what changes it.
 *
 * - A lecture's My notes · Summary · Transcript come first, in that order,
 *   and can't be renamed, moved or deleted; added tabs follow.
 * - A plain document's tabs can all be renamed, moved and deleted, while at
 *   least one remains. At most 30 tabs.
 * - Moving a tab writes only its own position (halfway between its new
 *   neighbours), so two devices moving different tabs keep both moves.
 * - The laptop writes at once; the iPhone saves in its cache and queues
 *   `create_tab` / `tab_meta` under the tab's key, before its edits.
 * - Deleted on one device and edited offline on another: the edit is kept
 *   and the tab stays (an edit reaching a deleted tab brings it back,
 *   applyDocEdit; a delete that arrives after a newer edit is not applied).
 */

export type TabKind = 'summary' | 'sheet';
export const MAX_TABS = 30;
export const MAX_TAB_TITLE = 100;

export interface TabInfo {
  tab: DocTab;
  title: string;
  /** A lecture's My notes, Summary, Transcript: not renamed, moved or deleted. */
  fixed: boolean;
  kind: TabKind | null;
}

const LECTURE_TITLES: Record<FixedTab, string> = { notes: 'My notes', summary: 'Summary', transcript: 'Transcript' };

const isFixed = (tab: string): tab is FixedTab => (FIXED_TABS as readonly string[]).includes(tab);
const ADDED_TAB = /^t-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** An added tab's id: as the database checks it. */
export const isAddedTab = (tab: string): boolean => ADDED_TAB.test(tab);
export const newTabId = (): DocTab => `t-${newId().toLowerCase()}`;

/** The tab columns the list needs (never the content). */
export type TabRow = Pick<DocumentRow, 'tab' | 'title' | 'position' | 'deleted_at' | 'kind' | 'created_at'>;
const TAB_COLUMNS = 'id, file_id, tab, title, position, deleted_at, kind, created_at';

/** A tab's name: its title, else the default (a lecture's names; "Tab 1" for a plain document's first tab). */
export function tabTitle(row: Pick<TabRow, 'tab' | 'title'> | null | undefined, tab: DocTab, isLecture: boolean): string {
  if (row?.title?.trim()) return row.title.trim();
  if (isLecture && isFixed(tab)) return LECTURE_TITLES[tab];
  if (tab === 'notes') return 'Tab 1';
  return 'Tab';
}

/** A title as saved: spaces tidied, 1–100 characters. */
export function cleanTabTitle(raw: string): string {
  const title = raw.trim().replace(/\s+/g, ' ');
  if (!title) throw new Error('Enter a name for the tab.');
  if (title.length > MAX_TAB_TITLE) throw new Error(`Use at most ${MAX_TAB_TITLE} characters.`);
  return title;
}

/** Where a movable tab sits: its position, else the default (a plain document's first tab first, an added tab last). */
const placeOf = (row: TabRow): number => row.position ?? (row.tab === 'notes' ? 0 : Number.POSITIVE_INFINITY);

/**
 * The visible tabs in order. Pure (tested): a lecture's fixed tabs first
 * (also before their rows exist), then the movable ones by position, then
 * by when they were made. Deleted tabs are left out.
 */
export function orderTabs(rows: TabRow[], isLecture: boolean): TabInfo[] {
  const live = rows.filter((r) => !r.deleted_at);
  const info = (row: TabRow | undefined, tab: DocTab, fixed: boolean): TabInfo => ({
    tab,
    title: tabTitle(row, tab, isLecture),
    fixed,
    kind: row?.kind === 'summary' || row?.kind === 'sheet' ? row.kind : null,
  });
  const fixed = isLecture ? FIXED_TABS.map((tab) => info(live.find((r) => r.tab === tab), tab, true)) : [];
  const movable = live
    .filter((r) => !(isLecture && isFixed(r.tab)))
    .sort((a, b) => placeOf(a) - placeOf(b) || (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  const list = [...fixed, ...movable.map((r) => info(r, r.tab, false))];
  // A plain document always has a first tab, even before its row is known here.
  return list.length > 0 ? list : [info(undefined, 'notes', false)];
}

/**
 * A position between two neighbours (null: no neighbour there). Pure: the
 * midpoint, or one step past the end.
 */
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  return (before + after) / 2;
}

/**
 * The next free "Tab N" name, "Sheet N" for a spreadsheet (counted among the sheets, step 4.7e), or
 * "New summary", "New summary 2"… for a summary she didn't add to the Summary tab (step 7.7, 4.7b).
 */
export function nextTabTitle(tabs: (Pick<TabInfo, 'title'> & { kind?: TabKind | null })[], kind: TabKind | null = null): string {
  const taken = new Set(tabs.map((t) => t.title.toLowerCase()));
  if (kind === 'summary') {
    if (!taken.has('new summary')) return 'New summary';
    for (let n = 2; ; n++) if (!taken.has(`new summary ${n}`)) return `New summary ${n}`;
  }
  const [word, start] = kind === 'sheet' ? ['Sheet', tabs.filter((t) => t.kind === 'sheet').length + 1] : ['Tab', tabs.length + 1];
  for (let n = start; ; n++) if (!taken.has(`${word.toLowerCase()} ${n}`)) return `${word} ${n}`;
}

// -------------------------------------------------------------------
// Reading
// -------------------------------------------------------------------

/** The document's rows' tab columns: the server's (with this iPhone's unsent changes), or the cache offline. */
async function tabRows(fileId: string): Promise<TabRow[]> {
  return readThrough(
    async () => {
      const { data, error } = await supabase.from('documents').select(TAB_COLUMNS).eq('file_id', fileId);
      if (error) throw serviceError(error, 'Could not load the tabs.');
      const rows = (data ?? []) as unknown as DocumentRow[];
      const overlaid = await withLocalChanges('documents', rows);
      // Tabs made on this iPhone and not sent yet.
      const local = await readRows<DocumentRow>('documents', fileId).catch(() => []);
      const known = new Set(overlaid.map((r) => r.tab));
      return [...overlaid, ...local.filter((r) => !known.has(r.tab))];
    },
    () => readRows<DocumentRow>('documents', fileId),
  );
}

/** The document's visible tabs, in order (works offline on the iPhone). */
export async function listTabs(fileId: string, isLecture: boolean): Promise<TabInfo[]> {
  return orderTabs(await tabRows(fileId), isLecture);
}

// -------------------------------------------------------------------
// Step 5.7: a document turned into a lecture. Its first tab (`notes`)
// becomes My notes, untouched: the same row, content and versions. Two
// cases first (Lea's advisor, 30 Oct):
//  - renamed ("Week 3"): it takes the name My notes; the old name is in the
//    name of a version of the text saved first, so nothing is hidden;
//  - deleted earlier (4.7b keeps it, deleted, while other tabs remain): My
//    notes starts empty; the deleted text is saved first as a version named
//    "Before recording".
// -------------------------------------------------------------------

export const BEFORE_RECORDING = 'Before recording';

/** The version's name when the first tab had its own name. */
export function renamedVersionName(title: string): string {
  return `${BEFORE_RECORDING} · the tab was “${title}”`.slice(0, 100);
}

/** Makes the first tab My notes; returns how to put it back (the recording couldn't start). */
export async function makeFirstTabMyNotes(
  fileId: string,
  deps: {
    openNotes: () => Promise<DocJSON>;
    saveVersion: (content: DocJSON, name: string) => Promise<unknown>;
    replaceNotes: (base: DocJSON, next: DocJSON) => Promise<unknown>;
  },
): Promise<() => Promise<void>> {
  const row = (await tabRows(fileId)).find((r) => r.tab === 'notes');
  const title = row?.title?.trim() || null;
  if (!row || (!row.deleted_at && !title)) return async () => {};
  const content = await deps.openNotes();
  if (row.deleted_at) {
    await deps.saveVersion(content, BEFORE_RECORDING);
    await writeTabMeta(fileId, 'notes', { deleted_at: null, title: null });
    const empty = blankDoc();
    await deps.replaceNotes(content, empty);
    return async () => {
      await deps.replaceNotes(empty, content);
      await writeTabMeta(fileId, 'notes', { deleted_at: row.deleted_at, title });
    };
  }
  await deps.saveVersion(content, renamedVersionName(title!));
  await writeTabMeta(fileId, 'notes', { title: null });
  return async () => {
    await writeTabMeta(fileId, 'notes', { title });
  };
}

// -------------------------------------------------------------------
// Adding
// -------------------------------------------------------------------

export interface CreateTabPayload {
  fileId: string;
  tab: DocTab;
  localId: string;
  title: string;
  position: number;
  kind: TabKind | null;
  content: DocJSON;
  pageSetup: Json | null;
}

/**
 * A new tab at the end ("Tab N", or "Sheet N" for a spreadsheet, unless
 * named), with an empty page (no cells for a sheet) and the document's page
 * setup. At most 30 tabs.
 */
export async function addTab(fileId: string, options: { isLecture: boolean; title?: string; kind?: TabKind }): Promise<TabInfo> {
  const rows = await tabRows(fileId);
  const tabs = orderTabs(rows, options.isLecture);
  if (tabs.length >= MAX_TABS) throw new Error(`A document has at most ${MAX_TABS} tabs.`);
  const title = cleanTabTitle(options.title ?? nextTabTitle(tabs, options.kind ?? null));
  const live = rows.filter((r) => !r.deleted_at && !(options.isLecture && isFixed(r.tab)));
  const last = live.length > 0 ? Math.max(...live.map((r) => (Number.isFinite(placeOf(r)) ? placeOf(r) : 0))) : null;
  const payload: CreateTabPayload = {
    fileId,
    tab: newTabId(),
    localId: newId(),
    title,
    position: positionBetween(last, null),
    kind: options.kind ?? null,
    content: options.kind === 'sheet' ? emptySheetDoc() : blankDoc(),
    pageSetup: await documentPageSetup(fileId),
  };
  if (syncEnabled) {
    const userId = cacheUser();
    if (!userId) throw new Error('Could not add the tab.');
    const at = new Date().toISOString();
    const row: DocumentRow = {
      id: payload.localId,
      user_id: userId,
      file_id: fileId,
      tab: payload.tab,
      content: payload.content as unknown as NonNullable<Json>,
      page_setup: payload.pageSetup,
      title,
      position: payload.position,
      deleted_at: null,
      kind: payload.kind,
      created_at: at,
      updated_at: at,
    };
    await saveLocalRow('documents', row);
    await enqueue<CreateTabPayload>({ kind: 'create_tab', key: editKey(fileId, payload.tab), payload });
  } else {
    const row = await createTabRow(payload, (error, message) => serviceError(error, message));
    remember('documents', [row]);
  }
  return { tab: payload.tab, title, fixed: false, kind: payload.kind };
}

/** The document's page setup, from one of its tabs (they share it); a new tab copies it. */
async function documentPageSetup(fileId: string): Promise<Json | null> {
  const fromRows = (rows: Pick<DocumentRow, 'tab' | 'page_setup'>[]) =>
    (rows.find((r) => r.tab === 'notes' && r.page_setup) ?? rows.find((r) => r.page_setup))?.page_setup ?? null;
  return readThrough(
    async () => {
      const { data, error } = await supabase.from('documents').select('tab, page_setup').eq('file_id', fileId);
      if (error) throw serviceError(error, 'Could not add the tab.');
      return fromRows((data ?? []) as Pick<DocumentRow, 'tab' | 'page_setup'>[]);
    },
    async () => fromRows(await readRows<DocumentRow>('documents', fileId)),
  );
}

type ErrorOf = (error: { code?: string; message?: string }, message: string) => Error;

/** Creates the tab's row; a row already there (sent twice) is left as it is. */
async function createTabRow(payload: CreateTabPayload, fail: ErrorOf): Promise<DocumentRow> {
  const { error } = await supabase.from('documents').upsert(
    {
      id: payload.localId,
      file_id: payload.fileId,
      tab: payload.tab,
      title: payload.title,
      position: payload.position,
      kind: payload.kind,
      content: payload.content as unknown as NonNullable<Json>,
      page_setup: payload.pageSetup,
    },
    { onConflict: 'file_id,tab', ignoreDuplicates: true },
  );
  if (error) throw fail(error, 'Could not add the tab.');
  const { data, error: readError } = await supabase.from('documents').select('*').eq('file_id', payload.fileId).eq('tab', payload.tab).single();
  if (readError) throw fail(readError, 'Could not add the tab.');
  return data;
}

// -------------------------------------------------------------------
// Renaming, moving, deleting
// -------------------------------------------------------------------

export interface TabMeta {
  /** null: the default name (step 5.7: the first tab of a document turned into a lecture is My notes). */
  title?: string | null;
  position?: number;
  deleted_at?: string | null;
}

export interface TabMetaPayload {
  fileId: string;
  tab: DocTab;
  localId: string;
  meta: TabMeta;
  /**
   * With a delete: the newest edit time in the tab as this device knew it.
   * If the server has a newer edit (made on another device, maybe offline),
   * the delete is not applied: the edit is kept.
   */
  seenEditedAt?: number;
}

/** The newest edit time of any block in a document (0 when none is dated). */
export function lastEditedAt(doc: unknown): number {
  const blocks = (doc as DocJSON | null)?.content ?? [];
  return blocks.reduce((max, b) => {
    const at = Number((b.attrs as { editedAt?: unknown } | undefined)?.editedAt);
    return Number.isFinite(at) && at > max ? at : max;
  }, 0);
}

function refuseFixed(tab: DocTab, isLecture: boolean, what: string) {
  if (isLecture && isFixed(tab)) throw new Error(`A lecture's ${LECTURE_TITLES[tab as FixedTab]} tab can't be ${what}.`);
}

export async function renameTab(fileId: string, tab: DocTab, rawTitle: string, isLecture: boolean): Promise<string> {
  refuseFixed(tab, isLecture, 'renamed');
  const title = cleanTabTitle(rawTitle);
  await writeTabMeta(fileId, tab, { title });
  return title;
}

/** Moves a tab to `toIndex` in the visible list (a lecture's fixed tabs stay first). */
export async function moveTab(fileId: string, tab: DocTab, toIndex: number, isLecture: boolean): Promise<void> {
  refuseFixed(tab, isLecture, 'moved');
  const rows = await tabRows(fileId);
  const order = orderTabs(rows, isLecture);
  const firstMovable = order.findIndex((t) => !t.fixed);
  const others = order.filter((t) => t.tab !== tab);
  const at = Math.max(firstMovable < 0 ? 0 : firstMovable, Math.min(toIndex, others.length));
  const placeOfTab = (t: TabInfo | undefined): number | null => {
    if (!t || t.fixed) return null;
    const row = rows.find((r) => r.tab === t.tab);
    if (!row) return null;
    const place = placeOf(row);
    return Number.isFinite(place) ? place : null;
  };
  const before = placeOfTab(others[at - 1]);
  const after = placeOfTab(others[at]);
  // Next to a tab with no place yet (made before positions): keep it after that one.
  const position = after === null && others[at] && !others[at].fixed ? positionBetween(before, null) : positionBetween(before, after);
  await writeTabMeta(fileId, tab, { position });
}

/** Deletes a tab (softly: Undo brings it back). Not a lecture's fixed tabs, nor a document's last tab. */
export async function deleteTab(fileId: string, tab: DocTab, isLecture: boolean): Promise<void> {
  refuseFixed(tab, isLecture, 'deleted');
  const tabs = await listTabs(fileId, isLecture);
  if (tabs.filter((t) => t.tab !== tab).length === 0) throw new Error("A document's last tab can't be deleted.");
  const local = syncEnabled ? await localDocument(fileId, tab) : null;
  await writeTabMeta(fileId, tab, { deleted_at: new Date().toISOString() }, local ? lastEditedAt(local.content) : undefined);
}

/** Undo of a delete. */
export async function restoreTab(fileId: string, tab: DocTab): Promise<void> {
  await writeTabMeta(fileId, tab, { deleted_at: null });
}

/** Laptop: written at once. iPhone: in the cache, then queued under the tab's key. */
async function writeTabMeta(fileId: string, tab: DocTab, meta: TabMeta, seenEditedAt?: number): Promise<void> {
  if (syncEnabled) {
    const local = await localDocument(fileId, tab);
    if (!local) throw new Error('This tab is not on this iPhone yet.');
    await saveLocalRow('documents', { ...local, ...meta, updated_at: new Date().toISOString() });
    await enqueue<TabMetaPayload>({ kind: 'tab_meta', key: editKey(fileId, tab), payload: { fileId, tab, localId: local.id, meta, seenEditedAt } });
    return;
  }
  const { row } = await applyTabMeta({ fileId, tab, localId: '', meta }, (error, message) => serviceError(error, message));
  remember('documents', [row]);
}

/**
 * Writes the tab's name, place or deletion on the server. A delete that
 * arrives after a newer edit than the deleting device had seen is dropped:
 * the edit is kept (`kept`).
 */
async function applyTabMeta(payload: TabMetaPayload, fail: ErrorOf): Promise<{ row: DocumentRow; kept: boolean }> {
  const { fileId, tab, seenEditedAt } = payload;
  const meta = { ...payload.meta };
  const { data: current, error } = await supabase.from('documents').select('*').eq('file_id', fileId).eq('tab', tab).maybeSingle();
  if (error) throw fail(error, 'Could not change the tab.');
  if (!current) throw new PermanentSyncError('This tab is no longer on Studiply.', `tab ${fileId}:${tab} missing`);
  let kept = false;
  if (meta.deleted_at && seenEditedAt !== undefined && lastEditedAt(current.content) > seenEditedAt) {
    delete meta.deleted_at;
    kept = true;
  }
  if (Object.keys(meta).length === 0) return { row: current, kept };
  const { data, error: writeError } = await supabase.from('documents').update(meta).eq('id', current.id).select('*').single();
  if (writeError) throw fail(writeError, 'Could not change the tab.');
  return { row: data, kept };
}

/** After a tab step was sent: this iPhone's copy becomes the server's, unless more of the tab waits. */
async function refreshTabRow(row: DocumentRow, localId: string, fileId: string, tab: DocTab): Promise<void> {
  // The running operation itself is still listed.
  if ((await pendingSyncFor(editKey(fileId, tab))).length > 1) return;
  if (row.id === localId) await markClean('documents', localId, row);
  else remember('documents', [row]);
}

registerSyncHandler<CreateTabPayload>('create_tab', {
  run: async (payload) => {
    await ensureDocumentOnServer(payload.fileId);
    const row = await createTabRow(payload, syncError);
    await refreshTabRow(row, payload.localId, payload.fileId, payload.tab);
    notifyLibraryUpdated();
  },
});

registerSyncHandler<TabMetaPayload>('tab_meta', {
  run: async (payload) => {
    await ensureDocumentOnServer(payload.fileId);
    const { row, kept } = await applyTabMeta(payload, syncError);
    await refreshTabRow(row, payload.localId, payload.fileId, payload.tab);
    if (kept) await noteKeptTab(payload.fileId, payload.tab);
    notifyLibraryUpdated();
  },
  // Name, place and deletion: each the latest; a later delete's check uses the later edit time.
  merge: (earlier, later) => ({ ...later, meta: { ...earlier.meta, ...later.meta }, seenEditedAt: later.seenEditedAt ?? earlier.seenEditedAt }),
});
