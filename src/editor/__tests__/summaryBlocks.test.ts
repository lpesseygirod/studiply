/**
 * @jest-environment jsdom
 */
// The editor's side of the summary in the Summary tab: the new callout kinds (Key takeaways,
// the notes check line, a hidden answer) and the From your notes label with her mark; a self-test
// answer shown and hidden by its label without changing the document; a section's cue question and a
// box's note ids kept through loading and saving.
import { Editor, type JSONContent } from '@tiptap/core';

import { studiplyExtensions } from '../bridges';
import { ANSWER_SHOWN_CLASS, CALLOUT_CLASS, MENU_CALLOUT_KINDS, calloutLabel } from '../schema/callout';

let editor: Editor;
afterEach(() => editor?.destroy());
const p = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const open = (content: JSONContent[], editable = true) => {
  editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content }, editable });
};

describe('the summary’s callouts', () => {
  it('labels: From your notes with the mark on that line, the notes check line, an answer', () => {
    expect(calloutLabel({ kind: 'fromNotes', ms: 400_000, mark: 'exam', level: 9 })).toBe('From your notes · 6:40 · Exam 9/10');
    expect(calloutLabel({ kind: 'fromNotes', ms: 400_000, mark: 'nonsense', level: 9 })).toBe('From your notes · 6:40');
    expect(calloutLabel({ kind: 'notesCheck' })).toBe('All your notes are in this summary');
    expect(calloutLabel({ kind: 'takeaways' })).toBe('Key takeaways');
    expect(calloutLabel({ kind: 'answer' })).toBe('Answer');
  });

  it('the Callout menus offer Key takeaways, not the summary’s own boxes', () => {
    const kinds = MENU_CALLOUT_KINDS.map((k) => k.kind);
    expect(kinds).toContain('takeaways');
    expect(kinds).not.toContain('notesCheck');
    expect(kinds).not.toContain('answer');
    expect(kinds).not.toContain('fromAssistant');
  });

  it('a box’s note ids and mark, a section’s cue question: kept through loading and saving', () => {
    open([
      { type: 'heading', attrs: { level: 2, cue: '¿Qué es la sinapsis?', blockId: 'h', origin: 'ai' }, content: [{ type: 'text', text: '1 · La sinapsis' }] },
      { type: 'callout', attrs: { kind: 'fromNotes', ms: 400_000, mark: 'exam', level: 9, noteIds: 'p1,p2', blockId: 'c', origin: 'student' }, content: [p('Mi nota')] },
    ]);
    const [heading, box] = editor.getJSON().content!;
    expect(heading.attrs?.cue).toBe('¿Qué es la sinapsis?');
    expect(box.attrs).toMatchObject({ noteIds: 'p1,p2', mark: 'exam', level: 9 });
    expect(editor.getHTML()).toContain('data-cue="¿Qué es la sinapsis?"');
    expect(editor.view.dom.querySelector(`.${CALLOUT_CLASS}-label`)?.textContent).toBe('From your notes · 6:40 · Exam 9/10');
  });
});

describe('a self-test answer, hidden until its label is tapped', () => {
  const doc = [p('1. ¿Qué es la sinapsis?'), { type: 'callout', attrs: { kind: 'answer', blockId: 'a1', origin: 'ai', editedAt: null }, content: [p('El punto de comunicación entre dos neuronas.')] }];
  const box = () => editor.view.dom.querySelector(`[data-callout='answer']`) as HTMLElement;
  const tapLabel = () => box().querySelector(`.${CALLOUT_CLASS}-label`)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

  it('shown and hidden again, the document never changed (no edit, no save: it stays untouched for a summary written again)', () => {
    open(doc);
    const before = JSON.stringify(editor.getJSON());
    let updates = 0;
    editor.on('update', () => updates++);
    expect(box().classList.contains(ANSWER_SHOWN_CLASS)).toBe(false);
    tapLabel();
    expect(box().classList.contains(ANSWER_SHOWN_CLASS)).toBe(true);
    tapLabel();
    expect(box().classList.contains(ANSWER_SHOWN_CLASS)).toBe(false);
    expect(JSON.stringify(editor.getJSON())).toBe(before);
    expect(updates).toBe(0);
    expect(editor.getJSON().content![1].attrs).toMatchObject({ origin: 'ai', editedAt: null });
  });

  it('also in a document that can’t be edited', () => {
    open(doc, false);
    tapLabel();
    expect(box().classList.contains(ANSWER_SHOWN_CLASS)).toBe(true);
  });
});
