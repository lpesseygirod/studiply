import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/**
 * Quiz me (step 9.1; SUMMARY-SPEC: "each section has a Quiz me toggle that hides the content and
 * shows the cue question"), on both editors. A summary section is a heading with its cue question
 * (7.7, sectionCue.ts) and the blocks under it up to the next heading of its level or above.
 *
 * - Each such heading gets a small "Quiz me" pill at its end. It hides the section's blocks and
 *   shows "? <cue question>" with Reveal in their place; Reveal shows the section again.
 * - All sections at once: the format command `quiz` (the iPhone's button under the summary, the
 *   laptop's document menu).
 * - Never an edit: a plugin state (the quizzed sections' block ids) and decorations only. No
 *   transaction changes the document, so nothing is saved, dated (blockMeta) or versioned; it stays
 *   on this device and is off when the tab opens. The PDF and Word exports never see it.
 */

export const QUIZ_CLASS = 'studiply-quiz';
const key = new PluginKey<QuizState>('studiplyQuizMe');

interface QuizState {
  /** The quizzed sections, by their heading's block id. */
  hidden: Set<string>;
}
type QuizMeta = { toggle: string } | { all: true } | { none: true };

/** A section heading Quiz me can hide: a heading with a cue question and a block id. */
const quizzable = (n: PMNode): string | null =>
  n.type.name === 'heading' && typeof n.attrs.cue === 'string' && n.attrs.cue.trim() && typeof n.attrs.blockId === 'string' ? n.attrs.blockId : null;

/** The document's sections Quiz me can hide: each heading's id, cue, place, and the blocks under it. */
export function quizSections(doc: PMNode): { id: string; cue: string; pos: number; end: number; blocks: { from: number; to: number }[] }[] {
  const out: { id: string; cue: string; pos: number; end: number; blocks: { from: number; to: number }[] }[] = [];
  let open: (typeof out)[number] | null = null;
  let openLevel = 0;
  doc.forEach((node, pos) => {
    const level = node.type.name === 'heading' ? Number(node.attrs.level) || 1 : 0;
    if (open && level && level <= openLevel) open = null;
    const id = quizzable(node);
    if (id) {
      open = { id, cue: String(node.attrs.cue).trim(), pos, end: pos + node.nodeSize, blocks: [] };
      openLevel = level;
      out.push(open);
      return;
    }
    if (open) open.blocks.push({ from: pos, to: pos + node.nodeSize });
  });
  return out;
}

const button = (label: string, data: Record<string, string>, className: string): HTMLButtonElement => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  b.setAttribute('contenteditable', 'false');
  for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
  return b;
};

function decorations(state: EditorState): DecorationSet {
  const { hidden } = key.getState(state) ?? { hidden: new Set<string>() };
  const decos: Decoration[] = [];
  for (const s of quizSections(state.doc)) {
    const on = hidden.has(s.id);
    // The pill, at the end of the heading's text; only in the editor she reads and writes in (the
    // read-only one the PDF export lays its pages out in would print it).
    decos.push(
      Decoration.widget(s.end - 1, (view) => (view.editable ? button('Quiz me', { quizToggle: s.id }, `${QUIZ_CLASS}-pill${on ? ` ${QUIZ_CLASS}-pill-on` : ''}`) : document.createElement('span')), {
        side: 1,
        key: `pill-${s.id}-${on}`,
        ignoreSelection: true,
      }),
    );
    if (!on) continue;
    // In the section's place: its cue question and Reveal.
    decos.push(
      Decoration.widget(
        s.end,
        () => {
          const box = document.createElement('div');
          box.className = `${QUIZ_CLASS}-cue`;
          box.setAttribute('contenteditable', 'false');
          box.dataset.quizToggle = s.id;
          box.setAttribute('role', 'group');
          box.setAttribute('aria-label', `Quiz me: ${s.cue}`);
          const mark = document.createElement('span');
          mark.className = `${QUIZ_CLASS}-mark`;
          mark.textContent = '?';
          const text = document.createElement('span');
          text.className = `${QUIZ_CLASS}-question`;
          text.textContent = s.cue;
          box.append(mark, text, button('Reveal', { quizToggle: s.id }, `${QUIZ_CLASS}-reveal`));
          return box;
        },
        { side: -1, key: `cue-${s.id}`, ignoreSelection: true, stopEvent: () => false },
      ),
    );
    for (const b of s.blocks) decos.push(Decoration.node(b.from, b.to, { class: `${QUIZ_CLASS}-hidden` }));
  }
  return DecorationSet.create(state.doc, decos);
}

export function quizMePlugin(): Plugin<QuizState> {
  return new Plugin<QuizState>({
    key,
    state: {
      init: () => ({ hidden: new Set() }),
      apply(tr: Transaction, value, _old, next) {
        const meta = tr.getMeta(key) as QuizMeta | undefined;
        if (!meta) return value;
        if ('none' in meta) return { hidden: new Set() };
        if ('all' in meta) return { hidden: new Set(quizSections(next.doc).map((s) => s.id)) };
        const hidden = new Set(value.hidden);
        if (hidden.has(meta.toggle)) hidden.delete(meta.toggle);
        else hidden.add(meta.toggle);
        return { hidden };
      },
    },
    props: {
      decorations,
      handleDOMEvents: {
        // A pill, the cue box or Reveal: toggles that section (a press, so the caret doesn't move there).
        mousedown: (view, event) => {
          const target = (event.target as HTMLElement | null)?.closest?.('[data-quiz-toggle]') as HTMLElement | null;
          if (!target) return false;
          event.preventDefault();
          setQuiz(view, { toggle: target.dataset.quizToggle! });
          return true;
        },
      },
    },
  });
}

function setQuiz(view: EditorView, meta: QuizMeta) {
  view.dispatch(view.state.tr.setMeta(key, meta).setMeta('addToHistory', false));
}

/** All the sections quizzed, or none (the format command `quiz`). */
export function quizAll(view: EditorView, on: boolean) {
  setQuiz(view, on ? { all: true } : { none: true });
}

/** For the format state: whether the document has sections to quiz, and whether all are hidden. */
export function quizInfo(state: EditorState): { available: boolean; all: boolean } {
  const sections = quizSections(state.doc);
  const hidden = key.getState(state)?.hidden ?? new Set<string>();
  return { available: sections.length > 0, all: sections.length > 0 && sections.every((s) => hidden.has(s.id)) };
}
