/**
 * @jest-environment jsdom
 */
// A summary's PDF (SUMMARY-SPEC "PDF export"). The tab made ready for paper
// (export/summaryPrint.ts): the title block first, times as plain "[12:34]", the app's links as words,
// the self-test's answers on a last page under "Answers" (or the self-test left out), the transcript
// appendix; the running header from page 2 and the "Studiply · Page 2 of 4" footer (printPages.ts);
// the file name; short tables kept whole in a summary (pageView.ts); the answers measured as printed.
import { Editor, type JSONContent } from '@tiptap/core';

import { studiplyExtensions } from '../bridges';
import { editorCss } from '../editorCss';
import { katexFontFaces } from '../export/pictures';
import { BRAND, printDocument } from '../export/printPages';
import { plainTimes, summaryPrintTabs, WORDS } from '../export/summaryPrint';
import { DEFAULT_PAGE_SETUP } from '../page/pageSetup';
import { holdsSummary as pmHoldsSummary } from '../page/pageView';
import { transcriptDoc } from '../transcriptDoc';
import type { DocJSON } from '../types';
import { holdsSummary, summaryToDoc } from '../../lib/summaryDoc';
import { summaryPdfFileName } from '../../utils/fileNames';
import type { StoredSummary } from '../../../supabase/functions/_shared/summary-pipeline';
import finance from '../../test-utils/summary-finance.json';
import short from '../../test-utils/summary-synthetic-30.json';

type N = JSONContent;
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const textOf = (n: N): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('');
const all = (n: N): N[] => [n, ...(n.content ?? []).flatMap(all)];
const S30 = summaryToDoc({ summary: short.result as unknown as StoredSummary, summaryId: ID, questionLinks: ['msg-q1'] }) as DocJSON;
const FIN = summaryToDoc({ summary: finance as unknown as StoredSummary, summaryId: ID }) as DocJSON;
const base = { title: 'Tema 1 · Psicobiología', meta: 'Psicobiología · Lecture · 3 Nov 2026', selfTest: true };

describe('the tab made ready for paper', () => {
  const [tab] = summaryPrintTabs(S30, base);
  const blocks = tab.content.content as N[];

  it('page 1 opens with the title and the meta line (as the screen’s header), then the notes check line and Key takeaways', () => {
    expect(blocks[0]).toEqual({ type: 'title', content: [{ type: 'text', text: 'Tema 1 · Psicobiología' }] });
    expect(textOf(blocks[1])).toBe('Psicobiología · Lecture · 3 Nov 2026');
    expect(blocks[1].content![0].marks).toEqual([{ type: 'textStyle', attrs: { color: expect.stringMatching(/^#/) } }]);
    expect(blocks.slice(2, 4).map((b) => b.attrs?.kind)).toEqual(['notesCheck', 'takeaways']);
    // Still a summary to the page view (its rules for summaries apply).
    expect(holdsSummary(tab.content)).toBe(true);
  });

  it('times as plain "[m:ss]" text; the app’s links (My notes, Full answer) as their words; other links kept', () => {
    const nodes = blocks.flatMap(all);
    expect(nodes.some((n) => n.type === 'timestampChip')).toBe(false);
    expect(nodes.some((n) => n.marks?.some((m) => m.type === 'link' && String(m.attrs?.href).startsWith('studiply:')))).toBe(false);
    expect(blocks.some((b) => b.type === 'heading' && /^1 · .* \[0:00\]/.test(textOf(b)))).toBe(true);
    expect(textOf(blocks[2])).toContain('See them in My notes');
    const web = plainTimes({ type: 'paragraph', content: [{ type: 'text', text: 'web', marks: [{ type: 'link', attrs: { href: 'https://example.org' } }] }] });
    expect(web.content![0].marks).toEqual([{ type: 'link', attrs: { href: 'https://example.org' } }]);
  });

  it('the answers on a last page under “Answers”, each after its question’s number; none left in the self-test', () => {
    const questions = blocks.filter((b) => /-q\d+$/.test(String(b.attrs?.blockId))).map(textOf);
    expect(questions.length).toBeGreaterThan(1);
    expect(blocks.some((b) => b.type === 'callout' && b.attrs?.kind === 'answer')).toBe(false);
    const at = blocks.findIndex((b) => b.type === 'heading' && textOf(b) === WORDS.answers);
    expect(blocks[at - 1]).toEqual({ type: 'pageBreak' });
    const answers = blocks.slice(at + 1);
    expect(answers.map((a) => textOf(a).match(/^(\d+)\. /)?.[1])).toEqual(questions.map((q) => q.match(/^(\d+)\. /)?.[1]));
    expect(answers[0].content![0]).toEqual({ type: 'text', text: '1. ', marks: [{ type: 'bold' }] });
    // The self-test's own answers, in order (their first words).
    const stored = (short.result as unknown as { selfTest: { answer: string }[] }).selfTest;
    expect(answers).toHaveLength(stored.length);
    answers.forEach((a, i) => expect(textOf(a)).toContain(stored[i].answer.replace(/\*\*/g, '').split(/[$*]/)[0].trim().slice(0, 20)));
  });

  it('the self-test left out: its heading, questions, answers and what she added among them go; nothing after it does', () => {
    const withHers = { ...S30, content: (S30.content as N[]).flatMap((b) => (/-q0$/.test(String(b.attrs?.blockId)) ? [b, { type: 'paragraph', content: [{ type: 'text', text: 'Mi nota' }] }] : [b])) } as DocJSON;
    const out = summaryPrintTabs(withHers, { ...base, selfTest: false })[0].content.content as N[];
    expect(out.some((b) => /-(selftest|q\d+(-answer)?)$/.test(String(b.attrs?.blockId)))).toBe(false);
    expect(out.some((b) => textOf(b) === 'Mi nota' || textOf(b) === WORDS.answers)).toBe(false);
    expect(out.some((b) => /-glossary$/.test(String(b.attrs?.blockId)))).toBe(true);
    expect(out.some((b) => /-cards$/.test(String(b.attrs?.blockId)))).toBe(true);
  });

  it('the transcript appendix: a tab of its own (a new page), "Transcript", each time as plain text; none when empty', () => {
    const transcript = transcriptDoc([{ start: 5, text: 'Buenos días.' }, { start: 75, text: 'Empezamos.' }]);
    const tabs = summaryPrintTabs(S30, { ...base, transcript });
    expect(tabs).toHaveLength(2);
    expect((tabs[1].content.content as N[]).map(textOf)).toEqual(['Transcript', '[0:05] Buenos días.', '[1:15] Empezamos.']);
    expect(summaryPrintTabs(S30, { ...base, transcript: { type: 'doc', content: [{ type: 'paragraph' }] } as DocJSON })).toHaveLength(1);
  });

  it('valid for the editors that lay it out (both devices), Finance’s formula cards and graphs as they are', () => {
    const tabs = summaryPrintTabs(FIN, { ...base, title: 'Tema 2 · Finanzas' });
    const editor = new Editor({ extensions: studiplyExtensions(), content: tabs[0].content });
    try {
      editor.state.doc.check();
      expect(pmHoldsSummary(editor.state.doc)).toBe(true);
      const types = editor.getJSON().content!.map((b) => b.type);
      expect(types.filter((t) => t === 'formulaCard')).toHaveLength(3);
      expect(types.filter((t) => t === 'graph')).toHaveLength(3);
      expect(types.at(-1)).toBe('paragraph');
    } finally {
      editor.destroy();
    }
  });
});

describe('the running header and the footer', () => {
  const html = printDocument([[], [], []], { setup: DEFAULT_PAGE_SETUP, numbers: true, target: 'browser', running: { left: 'Math <&>', right: 'Tema 1' } }, 'Tema 1');
  const pages = html.split('<section').slice(1);

  it('no header on page 1; from page 2 the course left and the lecture’s title right', () => {
    expect(pages[0]).not.toContain('studiply-print-header');
    for (const p of pages.slice(1)) expect(p).toContain('class="studiply-print-header"');
    expect(pages[1]).toMatch(/studiply-print-header[^>]*><span>Math &lt;&amp;&gt;<\/span><span>Tema 1<\/span>/);
  });

  it('every page: "Studiply" left, "Page n of N" right, in place of the page number', () => {
    pages.forEach((p, k) => expect(p).toContain(`<span>${BRAND}</span><span>Page ${k + 1} of 3</span>`));
    expect(html).not.toContain('class="studiply-print-number"');
    // 8.5 pt in the secondary colour, a long name cut with "…".
    expect(html).toMatch(/\.studiply-print-header, \.studiply-print-footer \{[^}]*font: 11\.33px/);
    expect(html).toMatch(/text-overflow: ellipsis/);
  });

  it('without it (any other document): the page number as before', () => {
    const plain = printDocument([[], []], { setup: DEFAULT_PAGE_SETUP, numbers: true, target: 'browser' }, 'Doc');
    expect(plain).toContain('class="studiply-print-number"');
    expect(plain).not.toContain('studiply-print-footer"');
  });

  it('Letter: the paper’s own size', () => {
    expect(printDocument([[]], { setup: { ...DEFAULT_PAGE_SETUP, size: 'letter' }, numbers: false, target: 'browser', running: { left: '', right: 'x' } }, 'x')).toContain('@page { size: 21.59cm 27.94cm; margin: 0; }');
  });
});

describe('the file name', () => {
  const day = new Date(2026, 9, 20, 23, 30);
  it.each([
    ['Corporate Finance', 'Time Value of Money', 'Corporate Finance – Time Value of Money – 2026-10-20.pdf'],
    [null, 'Tema 1', 'Tema 1 – 2026-10-20.pdf'],
    ['Física: II', 'Tema 3/4 "ondas"', 'Física II – Tema 3 4 ondas – 2026-10-20.pdf'],
    ['C'.repeat(80), 'T'.repeat(90), `${'C'.repeat(40)} – ${'T'.repeat(60)} – 2026-10-20.pdf`],
  ])('%s / %s → %s', (course, title, name) => expect(summaryPdfFileName(course, title, day)).toBe(name));
});

describe('KaTeX’s fonts in the print document (SUMMARY-SPEC: embedded, works offline)', () => {
  // jsdom has no CSSFontFaceRule: the faces themselves are checked in Chrome (summary-pdf.mjs reads
  // KaTeX's font names in the PDF).
  it('nothing added to a print without formulas', async () => {
    expect(await katexFontFaces(new Set())).toBe('');
  });
});

describe('the answers, as printed', () => {
  it('hidden only in the editor she writes in, not in the read-only one the export lays its pages out in', () => {
    const css = editorCss();
    expect(css).toContain("[contenteditable='true'] .studiply-callout[data-callout='answer']:not(");
    expect(css).not.toMatch(/\[contenteditable\] \.studiply-callout\[data-callout='answer'\]/);
  });
});
