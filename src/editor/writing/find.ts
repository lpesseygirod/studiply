/**
 * find.ts
 * Find & replace, in the shared editor so both devices run it
 * (the laptop's bar calls it directly; the iPhone's sends `find` commands
 * through the format bridge and reads `find` in the format state):
 *   - every match highlighted, the current one stronger; next / previous go
 *     round and select the match, scrolled into view;
 *   - Match case; Whole words (not inside a longer word: "tasa" isn't found
 *     in "tasación");
 *   - a match is inside one paragraph, across bold, links and colours; never
 *     across paragraphs, chips or formulas (as Google Docs);
 *   - Replace changes the current match and goes on to the next; Replace all
 *     changes every match in one change, so one Undo takes it all back.
 */

import { Extension, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface FindOptions {
  matchCase: boolean;
  wholeWords: boolean;
}

export interface Match {
  from: number;
  to: number;
}

/** What the find bars show: the query, how many matches, which is current (-1: none). */
export interface FindState {
  query: string;
  count: number;
  current: number;
}

interface PluginState extends FindOptions {
  query: string;
  matches: Match[];
  current: number;
}

export const findKey = new PluginKey<PluginState>('studiplyFind');

/** ⌘F / ⌘⇧H (detail: `{ replace }`) and ⌘⌥A on the editor: the laptop's find bar and outline listen. */
export const FIND_EVENT = 'studiply-find';
export const OUTLINE_EVENT = 'studiply-outline';
const EMPTY: PluginState = { query: '', matchCase: false, wholeWords: false, matches: [], current: -1 };

/** A chip, a formula or a line break in a paragraph: never part of a match. */
const NOT_TEXT = '￼';

/** Every match of `query` in the document, in order. */
export function findMatches(doc: PMNode, query: string, options: FindOptions): Match[] {
  if (!query) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = options.wholeWords ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped;
  const re = new RegExp(pattern, options.matchCase ? 'gu' : 'giu');
  const out: Match[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // The paragraph's text, and where each of its characters is in the document.
    let text = '';
    const at: number[] = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) at.push(start + i);
        text += child.text;
      } else {
        at.push(start);
        text += NOT_TEXT;
      }
    });
    for (const m of text.matchAll(re)) {
      if (!m[0] || m.index === undefined) continue;
      out.push({ from: at[m.index], to: at[m.index + m[0].length - 1] + 1 });
    }
    return false;
  });
  return out;
}

type Meta = { search: { query: string } & FindOptions } | { current: number } | { close: true };

export const FindReplace = Extension.create({
  name: 'studiplyFind',
  addProseMirrorPlugins() {
    return [
      new Plugin<PluginState>({
        key: findKey,
        state: {
          init: () => EMPTY,
          apply(tr, prev, _old, state) {
            const meta = tr.getMeta(findKey) as Meta | undefined;
            if (meta && 'close' in meta) return EMPTY;
            if (meta && 'search' in meta) {
              const { query, matchCase, wholeWords } = meta.search;
              const matches = findMatches(state.doc, query, { matchCase, wholeWords });
              // The first match at or after the cursor.
              const from = tr.selection.from;
              const first = matches.findIndex((m) => m.from >= from);
              return { query, matchCase, wholeWords, matches, current: matches.length ? (first >= 0 ? first : 0) : -1 };
            }
            let next = prev;
            if (prev.query && tr.docChanged) {
              const matches = findMatches(state.doc, prev.query, prev);
              next = { ...prev, matches, current: matches.length ? Math.min(Math.max(prev.current, 0), matches.length - 1) : -1 };
            }
            if (meta && 'current' in meta) next = { ...next, current: next.matches.length ? meta.current : -1 };
            return next;
          },
        },
        props: {
          decorations(state) {
            const s = findKey.getState(state);
            if (!s?.matches.length) return null;
            return DecorationSet.create(
              state.doc,
              s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.current ? 'studiply-find studiply-find-current' : 'studiply-find' })),
            );
          },
        },
      }),
    ];
  },
});

/** The find bars' state; null when nothing is searched. */
export function findState(state: EditorState): FindState | null {
  const s = findKey.getState(state);
  if (!s?.query) return null;
  return { query: s.query, count: s.matches.length, current: s.current };
}

/** Selects the current match and scrolls to it (the find box keeps the keyboard focus). */
function showCurrent(tr: Transaction, s: PluginState): Transaction {
  const m = s.matches[s.current];
  if (!m) return tr;
  return tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView();
}

export type FindCommand =
  | { type: 'find'; action: 'search'; query: string; matchCase: boolean; wholeWords: boolean }
  | { type: 'find'; action: 'next' | 'previous' | 'close' }
  | { type: 'find'; action: 'replace' | 'replaceAll'; text: string };

/** Runs a find command; false when it did nothing. */
export function runFind(editor: Editor, cmd: FindCommand): boolean {
  const { view } = editor;
  const current = () => findKey.getState(view.state) ?? EMPTY;
  switch (cmd.action) {
    case 'search': {
      const tr = view.state.tr.setMeta(findKey, { search: { query: cmd.query, matchCase: cmd.matchCase, wholeWords: cmd.wholeWords } });
      // The plugin works out the matches as this applies; then the first is shown.
      view.dispatch(tr);
      const s = current();
      if (s.current >= 0) view.dispatch(showCurrent(view.state.tr, s));
      return true;
    }
    case 'next':
    case 'previous': {
      const s = current();
      if (!s.matches.length) return false;
      const step = cmd.action === 'next' ? 1 : -1;
      const index = (s.current + step + s.matches.length) % s.matches.length;
      view.dispatch(showCurrent(view.state.tr.setMeta(findKey, { current: index }), { ...s, current: index }));
      return true;
    }
    case 'close':
      view.dispatch(view.state.tr.setMeta(findKey, { close: true }));
      return true;
    case 'replace': {
      const s = current();
      const m = s.matches[s.current];
      if (!m) return false;
      const tr = cmd.text ? view.state.tr.insertText(cmd.text, m.from, m.to) : view.state.tr.delete(m.from, m.to);
      view.dispatch(tr);
      // On to the next match after what was put in (the new text may match again).
      const after = current();
      const end = m.from + cmd.text.length;
      const next = after.matches.findIndex((x) => x.from >= end);
      const index = after.matches.length ? (next >= 0 ? next : 0) : -1;
      view.dispatch(showCurrent(view.state.tr.setMeta(findKey, { current: index }), { ...after, current: index }));
      return true;
    }
    case 'replaceAll': {
      const s = current();
      if (!s.matches.length) return false;
      // One change, from the end so the positions before stay right: one Undo.
      let tr = view.state.tr;
      for (let i = s.matches.length - 1; i >= 0; i--) {
        const m = s.matches[i];
        tr = cmd.text ? tr.insertText(cmd.text, m.from, m.to) : tr.delete(m.from, m.to);
      }
      view.dispatch(tr.scrollIntoView());
      return true;
    }
  }
}
