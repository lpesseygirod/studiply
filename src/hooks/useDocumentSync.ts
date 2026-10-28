import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AppState, Platform } from 'react-native';

import { DocumentSession, type SessionState } from '../editor/documentSession';
import { formatSaved } from '../utils/shelf';
import type { StudiplyEditorHandle } from '../editor/types';
import { useLibraryUpdates } from '../lib/cache';
import { isOffline } from '../lib/connectivity';
import { onSyncEvent, pendingSyncFor, syncEnabled } from '../lib/sync';
import {
  documentStamp,
  openDocument,
  saveDocument,
  saveVersion,
  takeDocumentConflicts,
  type DocTab,
} from '../services/document.service';

/** How often the open document asks whether the other device changed it. */
export const POLL_MS = 5000;

const INITIAL: SessionState = { status: 'loading', savedAt: null, lost: [], error: null };

/**
 * Autosave for one open document tab (step 4.3), around `DocumentSession`:
 * loads it once the editor is ready, saves after typing, takes the other
 * device's changes every few seconds, keeps a version when the student
 * leaves or the app goes to the background, and on the iPhone follows the
 * sync queue ("Saved on this iPhone" until it is sent).
 */
export function useDocumentSync(params: {
  fileId: string | undefined;
  tab: DocTab;
  editor: RefObject<StudiplyEditorHandle | null>;
  /** The editor can be loaded (its onReady fired). */
  editorReady: boolean;
}) {
  const { fileId, tab, editor, editorReady } = params;
  const [state, setState] = useState<SessionState>(INITIAL);
  const session = useRef<DocumentSession | null>(null);

  useEffect(() => {
    if (!fileId || !editorReady) return;
    setState(INITIAL);
    const port = {
      getJSON: () => editor.current!.getJSON(),
      loadDoc: (doc: Parameters<StudiplyEditorHandle['loadDoc']>[0]) => editor.current?.loadDoc(doc),
      applyBlocks: (doc: Parameters<StudiplyEditorHandle['applyBlocks']>[0]) => editor.current?.applyBlocks(doc),
    };
    const s = new DocumentSession(
      port,
      {
        open: () => openDocument(fileId, tab),
        save: (base, next) => saveDocument({ fileId, tab, base, next }),
        stamp: () => documentStamp(fileId, tab),
        saveVersion: (content) => saveVersion(fileId, tab, content, 'session_end'),
        isOffline: () => syncEnabled && isOffline(),
      },
      setState,
    );
    session.current = s;
    void s.start();

    const poll = setInterval(() => void s.poll(), POLL_MS);

    // The app (iPhone) or the browser tab (laptop) going away ends a session.
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'background') void s.end('background');
    });
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void s.end('background');
    };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', onHidden);

    // iPhone: the queue sent this tab's edits; the cache has the server's copy.
    const key = `${fileId}:${tab}`;
    const unsubscribe = onSyncEvent((e) => {
      if (e.type !== 'done' || e.op.key !== key) return;
      void pendingSyncFor(key).then(async (waiting) => {
        if (waiting.length > 0) return;
        const lost = await takeDocumentConflicts(fileId, tab);
        await s.refresh({ synced: true, lost });
      });
    });

    return () => {
      clearInterval(poll);
      appState.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onHidden);
      unsubscribe();
      session.current = null;
      void s.end('leave').finally(() => s.stop());
    };
  }, [fileId, tab, editorReady, editor]);

  // iPhone: a pull brought new rows (the app came back to the foreground).
  useLibraryUpdates(() => void session.current?.refresh());

  const onChange = useCallback(() => session.current?.changed(), []);
  const flush = useCallback(() => session.current?.flush() ?? Promise.resolve(), []);
  const clearLost = useCallback(() => session.current?.clearLost(), []);

  return { state, onChange, flush, clearLost };
}

/** "Saved · 10:31", "Saving…", "Saved on this iPhone", … for the top bar and the iPhone header. */
export function saveLabel(state: SessionState): string | null {
  switch (state.status) {
    case 'loading':
      return null;
    case 'saving':
      return 'Saving…';
    case 'saved':
      return state.savedAt ? formatSaved(new Date(state.savedAt).toISOString()) : 'Saved';
    case 'local':
      return 'Saved on this iPhone';
    case 'failed':
      return 'Not saved · trying again';
    case 'unavailable':
      return 'Not available offline';
  }
}
