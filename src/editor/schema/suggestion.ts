import { Extension, type JSONContent } from '@tiptap/core';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { answerBlocks, type AnswerSpan } from '../../utils/answerText';
import { KEEP_ORIGIN_META, newBlockId } from './blockMeta';
import { CALLOUT } from './callout';
import { BLOCK_MATH, INLINE_MATH } from './formula';
import { TIMESTAMP_CHIP } from './timestampChip';
import type { DocJSON } from '../types';

/**
 * The study assistant in the document (step 6.3), shared by both editors:
 *
 *  - Ask Claude on a selection: pressing the selection bar's "✦ Ask Claude"
 *    keeps the selection as the suggestion's range, highlighted and mapped
 *    through every later edit. Claude's answer is a suggestion the student
 *    accepts or rejects (SUMMARY-SPEC: never applied silently):
 *      `replace` (Explain simpler, Rewrite): the suggestion takes the range's
 *        place; an ordinary edit, so its block is the student's (she chose
 *        it; a regenerated summary never removes it) and one Undo step;
 *      `below` (Give an example, Go deeper): a box after the range's block,
 *        Example or "Added context · not from the lecture", `origin: ai`.
 *    If the range's text changed since she asked, a replace would overwrite
 *    her newer edit: it goes below instead, in a "From the study assistant"
 *    box. Reject (clear) changes nothing.
 *  - Add to notes (an assistant answer): a "From the study assistant · m:ss"
 *    box at the end of the document, its question first, `origin: ai`, the
 *    times it cites as timestamp chips. `assistantNoteJSON` makes the same
 *    box for My notes saved without the editor (moment-placement).
 *
 * Callouts aren't note lines (editor/noteLines reads page paragraphs, headings
 * and list items), so an answer added to My notes never counts as the
 * student's notes in the summary's coverage check.
 */

export const SUGGESTION_CLASS = 'studiply-suggestion';

interface Pending {
  id: number;
  from: number;
  to: number;
  /** The range's text when asked: if it changes, a replace would overwrite a newer edit. */
  original: string;
  /** What is sent: the selected text (formulas as $…$) and the text around it. */
  text: string;
  context: string;
}

type Meta = { start: Pending } | { clear: true };

export const suggestionKey = new PluginKey<Pending | null>('studiplySuggestion');

/** What the screen needs: what to send, and whether the range changed since. */
export interface SuggestionInfo {
  id: number;
  text: string;
  context: string;
  stale: boolean;
}

/** Below the text: Give an example, Go deeper; a stale replace; Add to notes. */
export type BelowKind = 'example' | 'addedContext' | 'fromAssistant';

const MAX_CONTEXT_CHARS = 2000;

/** A range as text: blocks apart by a blank line, formulas as $…$ ($$…$$ on a line), chips and photos left out. */
export function rangeText(doc: PMNode, from: number, to: number): string {
  return doc.textBetween(from, to, '\n\n', (leaf) =>
    leaf.type.name === INLINE_MATH ? `$${leaf.attrs.latex ?? ''}$` : leaf.type.name === BLOCK_MATH ? `$$${leaf.attrs.latex ?? ''}$$` : '',
  );
}

/** The selection becomes the suggestion's range (the selection bar's "✦ Ask Claude"). */
export function startSuggestion(tr: Transaction, state: EditorState): Transaction {
  const { from, to } = state.selection;
  if (from === to) return tr.setMeta(suggestionKey, { clear: true } satisfies Meta);
  const doc = state.doc;
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  const start = $from.depth > 0 ? $from.before(1) : from;
  const end = $to.depth > 0 ? $to.after(1) : to;
  const text = rangeText(doc, from, to).trim();
  const pending: Pending = { id: Date.now(), from, to, original: rangeText(doc, from, to), text, context: rangeText(doc, start, end).trim().slice(0, MAX_CONTEXT_CHARS) };
  return tr.setMeta(suggestionKey, { start: pending } satisfies Meta);
}

export function suggestionInfo(state: EditorState): SuggestionInfo | null {
  const p = suggestionKey.getState(state);
  if (!p) return null;
  const stale = p.from >= p.to || rangeText(state.doc, p.from, p.to) !== p.original;
  return { id: p.id, text: p.text, context: p.context, stale };
}

// ---------- the answer's text as document content ----------

const FORMULA = /\$([^$\n]+)\$/g;

/** A span's text, its formulas ($…$) as inline formulas, its line breaks as hard breaks. */
function textJSON(text: string, bold: boolean): JSONContent[] {
  const out: JSONContent[] = [];
  const pushText = (t: string) => {
    t.split('\n').forEach((line, i) => {
      if (i > 0) out.push({ type: 'hardBreak' });
      if (line) out.push({ type: 'text', text: line, ...(bold && { marks: [{ type: 'bold' }] }) });
    });
  };
  let at = 0;
  for (const m of text.matchAll(FORMULA)) {
    if (m.index! > at) pushText(text.slice(at, m.index));
    out.push({ type: INLINE_MATH, attrs: { latex: m[1].trim() } });
    at = m.index! + m[0].length;
  }
  if (at < text.length) pushText(text.slice(at));
  return out;
}

/** Spans as inline content; `times`: the cited times as timestamp chips (else kept as text). */
function inlineJSON(spans: AnswerSpan[], times: boolean): JSONContent[] {
  return spans.flatMap((s) =>
    s.kind === 'text' ? textJSON(s.text, s.bold) : times ? [{ type: TIMESTAMP_CHIP, attrs: { ms: s.ms } }] : textJSON(`[${s.label}]`, s.bold),
  );
}

const paragraph = (content: JSONContent[]): JSONContent => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' });

/** The answer as blocks: paragraphs and lists, bold, formulas; `times` as chips. */
export function answerJSON(text: string, times: boolean): JSONContent[] {
  const blocks = answerBlocks(text).map((b): JSONContent =>
    b.kind === 'paragraph'
      ? paragraph(inlineJSON(b.spans, times))
      : {
          type: b.ordered ? 'orderedList' : 'bulletList',
          content: b.items.map((item) => ({ type: 'listItem', content: [paragraph(inlineJSON(item.spans, times))] })),
        },
  );
  return blocks.length ? blocks : [paragraph([])];
}

/** A replacement for a range: paragraphs only (a list's items keep their numbers as text). */
function replacementJSON(text: string): JSONContent[] {
  return answerBlocks(text).flatMap((b) =>
    b.kind === 'paragraph'
      ? [paragraph(inlineJSON(b.spans, false))]
      : b.items.map((item, i) => paragraph([...textJSON(b.ordered ? `${item.number ?? i + 1}. ` : '• ', false), ...inlineJSON(item.spans, false)])),
  );
}

/** A box of the assistant's: its own id, `origin: ai`. */
function boxJSON(kind: BelowKind, ms: number | null, content: JSONContent[]): JSONContent & { attrs: { blockId: string } } {
  return { type: CALLOUT, attrs: { kind, level: null, ms, blockId: newBlockId(), origin: 'ai' }, content };
}

export interface AssistantNote {
  /** The question's (or the recording's) time on the lecture's timeline; null: none. */
  ms: number | null;
  question: string;
  answer: string;
}

/** The "From the study assistant · m:ss" box for an answer: its question first (in italics), then the answer. */
export function assistantNoteJSON(note: AssistantNote) {
  const question: JSONContent[] = note.question.trim() ? [{ type: 'paragraph', content: [{ type: 'text', text: note.question.trim(), marks: [{ type: 'italic' }] }] }] : [];
  return boxJSON('fromAssistant', note.ms, [...question, ...answerJSON(note.answer, true)]);
}

/** My notes (saved without the editor) with the box at the end; an empty last line stays last, to type on. */
export function withAssistantNote(doc: DocJSON, note: AssistantNote): DocJSON {
  const content = [...(doc.content ?? [])];
  const last = content[content.length - 1];
  const emptyLast = last?.type === 'paragraph' && !(last.content ?? []).length;
  const box = assistantNoteJSON(note);
  if (emptyLast) content.splice(content.length - 1, 0, box);
  else content.push(box, { type: 'paragraph' });
  return { ...doc, content };
}

/** Where a box goes after the block holding `pos` (at the top level). */
function afterBlock(doc: PMNode, pos: number): number {
  const $pos = doc.resolve(Math.min(Math.max(pos, 0), doc.content.size));
  return $pos.depth > 0 ? $pos.after(1) : doc.content.size;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    suggestion: {
      /**
       * Accepts the pending suggestion: `replace` puts `text` in the range's place (if the range
       * changed since, it goes below in a "From the study assistant" box instead); `below` puts it
       * in a box of `kind` after the range's block. False when nothing is pending.
       */
      acceptSuggestion: (mode: 'replace' | 'below', text: string, kind?: BelowKind) => ReturnType;
      /** Rejected (or nothing came): the range is let go, nothing changes. */
      clearSuggestion: () => ReturnType;
      /** Add to notes: the answer's box at the end of the document. */
      addAssistantNote: (note: AssistantNote) => ReturnType;
    };
  }
}

export const Suggestion = Extension.create({
  name: 'studiplySuggestion',

  addCommands() {
    return {
      acceptSuggestion:
        (mode, text, kind = 'fromAssistant') =>
        ({ state, tr, dispatch }) => {
          const p = suggestionKey.getState(state);
          const info = suggestionInfo(state);
          if (!p || !info || !text.trim()) return false;
          if (!dispatch) return true;
          const schema = state.schema;
          if (mode === 'replace' && !info.stale) {
            const nodes = replacementJSON(text).map((j) => schema.nodeFromJSON(j));
            tr.replaceRange(p.from, p.to, new Slice(Fragment.from(nodes), 1, 1));
          } else {
            const box = boxJSON(mode === 'replace' ? 'fromAssistant' : kind, null, answerJSON(text, false));
            tr.insert(afterBlock(tr.doc, p.to), schema.nodeFromJSON(box)).setMeta(KEEP_ORIGIN_META, [box.attrs.blockId]);
          }
          tr.setMeta(suggestionKey, { clear: true } satisfies Meta);
          return true;
        },
      clearSuggestion:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(suggestionKey, { clear: true } satisfies Meta).setMeta('addToHistory', false);
          return true;
        },
      addAssistantNote:
        (note) =>
        ({ state, tr, dispatch }) => {
          if (!dispatch) return true;
          const box = assistantNoteJSON(note);
          const node = state.schema.nodeFromJSON(box);
          const doc = tr.doc;
          const last = doc.lastChild;
          // An empty last line stays last, to type on; else one is added after the box.
          if (last?.type.name === 'paragraph' && last.content.size === 0) tr.insert(doc.content.size - last.nodeSize, node);
          else tr.insert(doc.content.size, [node, state.schema.nodes.paragraph.create()]);
          tr.setMeta(KEEP_ORIGIN_META, [box.attrs.blockId]);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<Pending | null>({
        key: suggestionKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(suggestionKey) as Meta | undefined;
            if (meta && 'clear' in meta) return null;
            if (meta && 'start' in meta) return meta.start;
            if (!value || !tr.docChanged) return value;
            return { ...value, from: tr.mapping.map(value.from, 1), to: tr.mapping.map(value.to, -1) };
          },
        },
        props: {
          decorations(state) {
            const p = suggestionKey.getState(state);
            if (!p || p.from >= p.to) return null;
            return DecorationSet.create(state.doc, [Decoration.inline(p.from, p.to, { class: SUGGESTION_CLASS })]);
          },
        },
      }),
    ];
  },
});
