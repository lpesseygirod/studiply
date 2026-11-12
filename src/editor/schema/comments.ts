import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import type { Mark as PMMark, Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';

/**
 * Comments, inside the document (Lea's choice): a `comment` mark
 * on the text, carrying the comment itself, so it travels with its block:
 * it syncs and merges with it and comes back with version restore.
 * No table, no migration. Several comments can cover the same words.
 *
 * Shared by both editors: the laptop shows them in a margin beside the page
 * (or a popover when the window is narrow), the iPhone in a sheet; both
 * act on them through `runFormat` ({ type: 'comment' }).
 */

export const COMMENT = 'comment';
export const COMMENT_CLASS = 'studiply-comment';
/** Laptop: the toolbar's Comment button or ⌘⌥M (no detail): the composer opens at the selection. */
export const COMMENT_EVENT = 'studiply-comment';
/** Laptop: a click on commented text; `detail` is { ids, x, y }. */
export const COMMENT_CLICK_EVENT = 'studiply-comment-click';

/** The laptop's comments margin beside the page (a wide window), and its gap. */
export const COMMENT_MARGIN_W = 260;
export const COMMENT_MARGIN_GAP = 16;

export interface CommentInfo {
  id: string;
  text: string;
  /** When it was written (ms). */
  createdAt: number;
  resolved: boolean;
  /** The words it is about. */
  quote: string;
  from: number;
  to: number;
  /** Who wrote it: 'studiply' (a summary extended with a lecture), else null (hers). */
  author: string | null;
  /** The moment it is about (a lecture and its time), kept so a later step can play it. */
  source: CommentSource | null;
}

export interface CommentSource {
  lectureId: string;
  ms: number | null;
}

/** A comment's source as stored (an attribute), or null. */
export function cleanSource(v: unknown): CommentSource | null {
  const s = (typeof v === 'string' ? (() => { try { return JSON.parse(v) as unknown; } catch { return null; } })() : v) as { lectureId?: unknown; ms?: unknown } | null;
  if (!s || typeof s !== 'object' || typeof s.lectureId !== 'string') return null;
  return { lectureId: s.lectureId, ms: typeof s.ms === 'number' && Number.isFinite(s.ms) ? s.ms : null };
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      /** A comment on the selected text. */
      addComment: (options: { id: string; text: string; createdAt?: number }) => ReturnType;
      /** Changes a comment's text or whether it is resolved, wherever it is. */
      updateComment: (id: string, changes: { text?: string; resolved?: boolean }) => ReturnType;
      deleteComment: (id: string) => ReturnType;
      /** Selects the words a comment is about. */
      selectComment: (id: string) => ReturnType;
    };
  }
}

const isComment = (m: PMMark) => m.type.name === COMMENT && typeof m.attrs.id === 'string';

/** Every comment in the document, in the order of the text. */
export function listComments(doc: PMNode): CommentInfo[] {
  const byId = new Map<string, CommentInfo>();
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (!isComment(mark)) continue;
      const id = mark.attrs.id as string;
      const end = pos + node.nodeSize;
      const found = byId.get(id);
      if (found) {
        found.quote += (pos > found.to ? ' ' : '') + (node.text ?? '');
        found.from = Math.min(found.from, pos);
        found.to = Math.max(found.to, end);
      } else {
        byId.set(id, {
          id,
          text: String(mark.attrs.text ?? ''),
          createdAt: Number(mark.attrs.createdAt) || 0,
          resolved: mark.attrs.resolved === true,
          quote: node.text ?? '',
          from: pos,
          to: end,
          author: typeof mark.attrs.author === 'string' && mark.attrs.author ? mark.attrs.author : null,
          source: cleanSource(mark.attrs.source),
        });
      }
    }
  });
  return [...byId.values()].sort((a, b) => a.from - b.from);
}

/** The comments on the text at the cursor (or the start of the selection); open ones first. */
export function commentsAt(state: EditorState): string[] {
  const { $from, empty } = state.selection;
  const marks = empty ? [...$from.marks(), ...($from.nodeAfter?.marks ?? [])] : ($from.nodeAfter?.marks ?? $from.marks());
  const found = marks.filter(isComment);
  found.sort((a, b) => Number(a.attrs.resolved === true) - Number(b.attrs.resolved === true));
  return [...new Set(found.map((m) => m.attrs.id as string))];
}

/** Whether the selection has words a comment could be about. */
export function canComment(state: EditorState): boolean {
  const { from, to, empty } = state.selection;
  return !empty && state.doc.textBetween(from, to, ' ').trim().length > 0;
}

/** Applies `fn` to every stretch of text carrying comment `id`. */
function eachRange(doc: PMNode, id: string, fn: (from: number, to: number, mark: PMMark) => void) {
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => isComment(m) && m.attrs.id === id);
    if (mark) fn(pos, pos + node.nodeSize, mark);
  });
}

export const Comment = Mark.create({
  name: COMMENT,
  // Typing at its edge doesn't extend it; several comments can share words.
  inclusive: false,
  excludes: '',

  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute('data-comment-id'), renderHTML: (a) => ({ 'data-comment-id': a.id }) },
      text: { default: '', parseHTML: (el) => el.getAttribute('data-comment') ?? '', renderHTML: (a) => ({ 'data-comment': a.text }) },
      createdAt: {
        default: 0,
        parseHTML: (el) => Number(el.getAttribute('data-created')) || 0,
        renderHTML: (a) => ({ 'data-created': String(a.createdAt) }),
      },
      resolved: {
        default: false,
        parseHTML: (el) => el.hasAttribute('data-resolved'),
        renderHTML: (a) => (a.resolved ? { 'data-resolved': '' } : {}),
      },
      // A comment Studiply wrote (a summary extended with a lecture), and the moment it is about.
      author: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-author'),
        renderHTML: (a) => (typeof a.author === 'string' && a.author ? { 'data-author': a.author } : {}),
      },
      source: {
        default: null,
        parseHTML: (el) => cleanSource(el.getAttribute('data-source')),
        renderHTML: (a) => (cleanSource(a.source) ? { 'data-source': JSON.stringify(cleanSource(a.source)) } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }];
  },

  renderHTML({ HTMLAttributes, mark }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: mark.attrs.resolved ? `${COMMENT_CLASS} resolved` : COMMENT_CLASS }), 0];
  },
});

export const Comments = Extension.create({
  name: 'comments',

  addCommands() {
    return {
      addComment:
        ({ id, text, createdAt }) =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.marks[COMMENT];
          if (!type || !canComment(state) || !text.trim()) return false;
          if (dispatch) {
            const mark = type.create({ id, text: text.trim(), createdAt: createdAt ?? Date.now(), resolved: false });
            for (const range of state.selection.ranges) tr.addMark(range.$from.pos, range.$to.pos, mark);
          }
          return true;
        },
      updateComment:
        (id, changes) =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.marks[COMMENT];
          let found = false;
          eachRange(state.doc, id, (from, to, mark) => {
            found = true;
            if (!dispatch || !type) return;
            const next = type.create({ ...mark.attrs, ...(changes.text !== undefined && { text: changes.text.trim() }), ...(changes.resolved !== undefined && { resolved: changes.resolved }) });
            tr.removeMark(from, to, mark).addMark(from, to, next);
          });
          return found;
        },
      deleteComment:
        (id) =>
        ({ state, tr, dispatch }) => {
          let found = false;
          eachRange(state.doc, id, (from, to, mark) => {
            found = true;
            if (dispatch) tr.removeMark(from, to, mark);
          });
          return found;
        },
      selectComment:
        (id) =>
        ({ state, tr, dispatch }) => {
          const c = listComments(state.doc).find((x) => x.id === id);
          if (!c) return false;
          if (dispatch) tr.setSelection(TextSelection.create(tr.doc, c.from, c.to)).scrollIntoView();
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // ⌘⌥M (Google Docs): the screen opens its comment composer (the laptop listens).
      'Mod-Alt-m': () => {
        this.editor.view.dom.dispatchEvent(new CustomEvent(COMMENT_EVENT, { bubbles: true }));
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('studiplyCommentClicks'),
        props: {
          // A click on commented text tells the laptop which comments (the cursor goes there as usual).
          handleClick: (view, pos, event) => {
            const $pos = view.state.doc.resolve(pos);
            const marks = [...($pos.nodeAfter?.marks ?? []), ...($pos.nodeBefore?.marks ?? [])].filter(isComment);
            const ids = [...new Set(marks.map((m) => m.attrs.id as string))];
            if (ids.length) view.dom.dispatchEvent(new CustomEvent(COMMENT_CLICK_EVENT, { bubbles: true, detail: { ids, x: event.clientX, y: event.clientY + 12 } }));
            return false;
          },
        },
      }),
    ];
  },
});
