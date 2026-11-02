/**
 * @jest-environment jsdom
 */
// Step 9.1: Quiz me on a summary's sections (schema/quizMe.ts), both editors. A pill on each section
// heading with a cue question; quizzed, the section's blocks are hidden behind "? cue" and Reveal;
// all at once by the format command; never an edit (the document, its dates and its history
// untouched); no pill in a read-only editor (the PDF export's).
import { Editor } from '@tiptap/core';

import { studiplyExtensions } from '../bridges';
import { editorCss } from '../editorCss';
import { formatState, runFormat } from '../format';
import { quizInfo, quizSections } from '../schema/quizMe';
import type { DocJSON } from '../types';
import { summaryToDoc } from '../../lib/summaryDoc';
import type { StoredSummary } from '../../../supabase/functions/_shared/summary-pipeline';
import short from '../../test-utils/summary-synthetic-30.json';

const DOC = summaryToDoc({ summary: short.result as unknown as StoredSummary, summaryId: '0f8fad5b-d9cb-469f-a165-70867728950e' }) as DocJSON;
let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});
const open = (content: DocJSON, editable = true) => {
  editor = new Editor({ extensions: studiplyExtensions(), content, editable });
  return editor;
};
const q = (css: string) => [...editor!.view.dom.querySelectorAll(css)];
const press = (el: Element) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

describe('Quiz me on a summary’s sections', () => {
  it('a pill on each section heading with a cue question, nothing hidden yet', () => {
    const e = open(DOC);
    const sections = quizSections(e.state.doc);
    const cues = (DOC.content ?? []).filter((b) => b.type === 'heading' && b.attrs?.cue);
    expect(sections.length).toBe(cues.length);
    expect(sections.length).toBeGreaterThan(1);
    expect(q('.studiply-quiz-pill')).toHaveLength(sections.length);
    expect(q('.studiply-quiz-hidden')).toHaveLength(0);
    expect(quizInfo(e.state)).toEqual({ available: true, all: false });
  });

  it('a pill hides its section behind its cue and Reveal; Reveal shows it again', () => {
    const e = open(DOC);
    const [first] = quizSections(e.state.doc);
    press(q('.studiply-quiz-pill')[0]);
    const box = q('.studiply-quiz-cue');
    expect(box).toHaveLength(1);
    expect(box[0].textContent).toBe(`?${first.cue}Reveal`);
    expect(q('.studiply-quiz-hidden')).toHaveLength(first.blocks.length);
    press(box[0].querySelector('.studiply-quiz-reveal')!);
    expect(q('.studiply-quiz-cue')).toHaveLength(0);
    expect(q('.studiply-quiz-hidden')).toHaveLength(0);
  });

  it('all at once (the iPhone’s button, the document menu), and all shown again', () => {
    const e = open(DOC);
    expect(runFormat(e, { type: 'quiz', on: true })).toBe(true);
    const sections = quizSections(e.state.doc);
    expect(q('.studiply-quiz-cue')).toHaveLength(sections.length);
    expect(q('.studiply-quiz-hidden')).toHaveLength(sections.reduce((n, s) => n + s.blocks.length, 0));
    expect(quizInfo(e.state).all).toBe(true);
    runFormat(e, { type: 'quiz', on: false });
    expect(q('.studiply-quiz-hidden')).toHaveLength(0);
  });

  it('never an edit: the document, its blocks’ dates and the undo history stay as they were', () => {
    const e = open(DOC);
    const before = JSON.stringify(e.getJSON());
    let changed = 0;
    e.on('update', () => (changed += 1));
    runFormat(e, { type: 'quiz', on: true });
    press(q('.studiply-quiz-reveal')[0]);
    expect(JSON.stringify(e.getJSON())).toBe(before);
    expect(changed).toBe(0);
    expect(e.can().undo()).toBe(false);
    expect(formatState(e).canUndo).toBe(false);
  });

  it('no pill in a read-only editor (the one the PDF export lays its pages out in); nothing for a document without cues', () => {
    open(DOC, false);
    expect(q('button.studiply-quiz-pill')).toHaveLength(0);
    editor!.destroy();
    const plain = open({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Mi sección' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Texto' }] }] });
    expect(q('.studiply-quiz-pill')).toHaveLength(0);
    expect(runFormat(plain, { type: 'quiz', on: true })).toBe(false);
  });

  it('its look: the hidden blocks gone, the cue box dashed in the accent', () => {
    const css = editorCss();
    expect(css).toMatch(/\.studiply-quiz-hidden \{ display: none; \}/);
    expect(css).toMatch(/\.studiply-quiz-cue \{[^}]*border: 1px dashed/);
  });
});
