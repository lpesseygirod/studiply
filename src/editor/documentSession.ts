/**
 * documentSession.ts
 * One open document tab and its autosave (step 4.3), without React so it is
 * unit tested; `useDocumentSync` wires it to the services, the app's state
 * and the sync queue.
 *
 * - A change saves 1 s after the student stops typing; leaving the document
 *   or the app going to the background saves at once.
 * - The save is an edit on top of `base` (what was last loaded or saved).
 *   What comes back (merged with the other device's changes) goes into the
 *   editor with `applyBlocks`, keeping what was typed meanwhile (`rebase`).
 * - Every few seconds the screen asks `poll`: if the server's copy changed
 *   and nothing is waiting here, the other device's changes come in the
 *   same way. With something waiting, the next save merges them.
 * - `end` keeps a version of the session's text when it changed: always on
 *   leaving, at most every 5 minutes for the app going to the background.
 */

import { rebase, sameDoc } from './docBlocks';
import { withBlockIds } from './schema/blockMeta';
import type { DocJSON } from './types';

export type SaveStatus = 'loading' | 'saving' | 'saved' | 'local' | 'failed' | 'unavailable';

export interface SessionState {
  status: SaveStatus;
  /** When the server last confirmed this tab ("Saved · 10:31"). */
  savedAt: number | null;
  /** Blocks where another device's newer edit was kept; this device's is in version history. */
  lost: string[];
  error: string | null;
}

export interface EditorPort {
  getJSON: () => Promise<DocJSON>;
  loadDoc: (doc: DocJSON) => void;
  applyBlocks: (doc: DocJSON) => void;
}

export interface SessionApi {
  open: () => Promise<{ content: DocJSON; updatedAt: string | null }>;
  save: (
    base: DocJSON,
    next: DocJSON,
    options?: { restamp?: boolean },
  ) => Promise<{ content: DocJSON; updatedAt: string | null; queued: boolean; lost: string[] }>;
  /** The server copy's updated_at (online only). */
  stamp: () => Promise<string | null>;
  saveVersion: (content: DocJSON, reason: 'session_end' | 'restore') => Promise<unknown>;
  /** Offline on the iPhone: saves stay here ("Saved on this iPhone"). */
  isOffline: () => boolean;
  now?: () => number;
}

export const SAVE_DELAY_MS = 1000;
export const BACKGROUND_VERSION_GAP_MS = 5 * 60_000;
const RETRY_MS = 5000;

export class DocumentSession {
  private base: DocJSON = { type: 'doc', content: [] };
  private stampSeen: string | null = null;
  private dirty = false;
  private saving: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;
  private stopped = false;
  private changedSinceVersion = false;
  private lastVersionAt = 0;
  private state: SessionState = { status: 'loading', savedAt: null, lost: [], error: null };

  constructor(
    private readonly editor: EditorPort,
    private readonly api: SessionApi,
    private readonly onState: (state: SessionState) => void,
  ) {}

  private now(): number {
    return this.api.now?.() ?? Date.now();
  }

  private set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    if (!this.stopped) this.onState(this.state);
  }

  get current(): SessionState {
    return this.state;
  }

  /** Loads the tab into the editor (call once the editor is ready). */
  async start(): Promise<void> {
    try {
      const opened = await this.api.open();
      this.base = withBlockIds(opened.content);
      this.stampSeen = opened.updatedAt;
      this.editor.loadDoc(this.base);
      this.loaded = true;
      this.set({ status: 'saved', savedAt: opened.updatedAt ? Date.parse(opened.updatedAt) : null, error: null });
    } catch (err) {
      this.set({ status: 'unavailable', error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** The student changed the document. */
  changed(): void {
    if (!this.loaded) return;
    this.dirty = true;
    this.schedule(SAVE_DELAY_MS);
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.save();
    }, ms);
  }

  /** Saves now if anything is waiting, and waits for a save in flight. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.saving) await this.saving;
    if (this.dirty) await this.save();
  }

  private save(): Promise<void> {
    if (this.saving) return this.saving;
    if (!this.dirty || !this.loaded) return Promise.resolve();
    this.dirty = false;
    this.set({ status: 'saving' });
    this.saving = this.saveOnce().finally(() => {
      this.saving = null;
      if (this.dirty) this.schedule(SAVE_DELAY_MS);
    });
    return this.saving;
  }

  private async saveOnce(): Promise<void> {
    const sent = await this.editor.getJSON();
    try {
      const saved = await this.api.save(this.base, sent);
      if (!sameDoc(this.base, sent)) this.changedSinceVersion = true;
      if (saved.queued) {
        // iPhone: kept here and queued; `synced` brings the server's copy.
        this.base = sent;
        this.set({ status: this.api.isOffline() ? 'local' : 'saving', error: null });
        return;
      }
      await this.take(sent, saved.content);
      if (saved.updatedAt) this.stampSeen = saved.updatedAt;
      this.set({ status: 'saved', savedAt: this.now(), lost: saved.lost.length ? saved.lost : this.state.lost, error: null });
    } catch (err) {
      // Kept in the editor; tried again shortly.
      this.dirty = true;
      this.set({ status: 'failed', error: err instanceof Error ? err.message : String(err) });
      this.schedule(RETRY_MS);
    }
  }

  /** Puts `merged` in the editor on top of `sent`, keeping what was typed since. */
  private async take(sent: DocJSON, merged: DocJSON): Promise<void> {
    const current = await this.editor.getJSON();
    const patch = rebase(sent, current, merged);
    if (patch) this.editor.applyBlocks(patch);
    this.base = withBlockIds(merged);
  }

  /** The other device's changes, when the server's copy moved and nothing is waiting here. */
  async poll(): Promise<void> {
    if (!this.loaded || this.stopped || this.saving || this.dirty || this.api.isOffline()) return;
    let stamp: string | null;
    try {
      stamp = await this.api.stamp();
    } catch {
      return;
    }
    if (!stamp || stamp === this.stampSeen) return;
    await this.refresh();
  }

  /** Reads the tab again (after a poll found a change, or the iPhone's queue sent this tab). */
  async refresh(options: { synced?: boolean; lost?: string[] } = {}): Promise<void> {
    if (!this.loaded || this.stopped) return;
    let opened: { content: DocJSON; updatedAt: string | null };
    try {
      opened = await this.api.open();
    } catch {
      return;
    }
    // Typed or saving meanwhile: the next save merges the other device's changes.
    if (this.saving || this.dirty) return;
    await this.take(this.base, opened.content);
    this.stampSeen = opened.updatedAt;
    if (options.synced) {
      this.set({ status: 'saved', savedAt: this.now(), lost: options.lost?.length ? options.lost : this.state.lost, error: null });
    }
  }

  /** The student read the conflict notice. */
  clearLost(): void {
    this.set({ lost: [] });
  }

  /**
   * The editing session ends (leaving the document, or the app going to the
   * background): saves, then keeps a version if the text changed.
   */
  async end(reason: 'leave' | 'background'): Promise<void> {
    await this.flush();
    if (!this.changedSinceVersion) return;
    if (reason === 'background' && this.now() - this.lastVersionAt < BACKGROUND_VERSION_GAP_MS) return;
    this.changedSinceVersion = false;
    this.lastVersionAt = this.now();
    try {
      await this.api.saveVersion(this.base, 'session_end');
    } catch {
      this.changedSinceVersion = true;
    }
  }

  /**
   * Brings back an older version: the current text is kept first ("Before
   * restore"), then the old one is saved as a new edit, dated now so it wins
   * over anything older. Its blocks keep their origin.
   */
  async restore(doc: DocJSON): Promise<void> {
    await this.flush();
    const current = await this.editor.getJSON();
    await this.api.saveVersion(current, 'restore');
    const restored = withBlockIds(doc);
    this.editor.loadDoc(restored);
    this.set({ status: 'saving' });
    const saved = await this.api.save(this.base, restored, { restamp: true });
    this.changedSinceVersion = true;
    if (saved.queued) {
      this.base = restored;
      this.set({ status: this.api.isOffline() ? 'local' : 'saving', error: null });
      return;
    }
    await this.take(restored, saved.content);
    if (saved.updatedAt) this.stampSeen = saved.updatedAt;
    this.set({ status: 'saved', savedAt: this.now(), error: null });
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
