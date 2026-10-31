/**
 * @jest-environment jsdom
 */
// Step 8.1: the summary's twelve text modules as editor blocks (editor/schema/studyModule.ts), written
// by the 7.7 converter (lib/summaryDoc.ts). On the hand-made fixture with all twelve
// (src/test-utils/summary-modules.json): each appears in its section, in order, valid for both
// editors; its HTML round-trips (copy and paste, the other device); its label and group name; an edit
// inside makes it hers and a summary written again keeps it; Extend's anchors see its words; the
// editor's CSS lays each kind out and keeps it whole on a page.
import { Editor, type JSONContent } from '@tiptap/core';

import { studiplyExtensions } from '../../editor/bridges';
import { editorCss } from '../../editor/editorCss';
import { MODULE_KINDS, moduleLabel } from '../../editor/schema/studyModule';
import { checkBlock } from '../../../supabase/functions/_shared/summary-zod';
import type { StoredSummary } from '../../../supabase/functions/_shared/summary-pipeline';
import { anchorsOf } from '../summaryCombine';
import { holdsSummary, mergeRegenerated, summaryKey, summaryToDoc, type SummaryDocJSON } from '../summaryDoc';
import fixture from '../../test-utils/summary-modules.json';

type N = JSONContent;
const S = fixture as unknown as StoredSummary;
const ID = '3f2a9c1e-8b7d-4e6f-a5c4-1d2e3f4a5b6c';
const textOf = (n: N): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('');
const doc = summaryToDoc({ summary: S, summaryId: ID });
const modules = doc.content.filter((b) => b.type === 'studyModule') as N[];
const of = (kind: string) => modules.find((m) => m.attrs?.kind === kind)!;

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});
function load(content: SummaryDocJSON | string): Editor {
  editor = new Editor({ extensions: studiplyExtensions(), content });
  editor.state.doc.check();
  return editor;
}

describe('the fixture: all twelve modules, as Claude writes them', () => {
  it('every block is valid for its type (BLOCK_DATA)', () => {
    const blocks = (S.sections as { blocks: ({ type: string } & Record<string, unknown>)[] }[]).flatMap((s, si) => s.blocks.map((b, bi) => ({ b, path: `$.sections[${si}].blocks[${bi}]` })));
    for (const { b, path } of blocks) {
      const { type, ...fields } = b;
      const checked = checkBlock(type as Parameters<typeof checkBlock>[0], fields, path);
      expect(checked.ok ? [] : checked.errors).toEqual([]);
    }
  });
});

describe('each module where expected (BUILD-PLAN 8.1’s check)', () => {
  it('one block per stored module, in its section and order', () => {
    const bySection: string[][] = [];
    for (const b of doc.content) {
      if (b.type === 'heading' && /-s\d+$/.test(String(b.attrs?.blockId))) bySection.push([]);
      else if (b.type === 'studyModule') bySection.at(-1)!.push(String(b.attrs?.kind));
    }
    expect(bySection).toEqual([
      ['timeline', 'causeEffect', 'keyFigures'],
      ['comparison', 'process', 'framework'],
      ['theoryCard', 'caseCard', 'argument'],
      ['workedExample', 'code', 'vocabulary'],
    ]);
    expect(new Set(modules.map((m) => m.attrs?.kind))).toEqual(new Set(MODULE_KINDS.map((k) => k.kind)));
    // Their ids: the stored block's place (s1-b2), one id where 7.7 sometimes made several.
    expect(of('framework').attrs).toMatchObject({ blockId: `${summaryKey(ID)}-s1-b2`, origin: 'ai', editedAt: null, title: 'DAFO' });
  });

  it('valid for both editors, every module kept through loading with its kind and title', () => {
    const json = load(doc).getJSON();
    const loaded = (json.content ?? []).filter((b) => b.type === 'studyModule');
    expect(loaded.map((m) => [m.attrs?.kind, m.attrs?.title])).toEqual(modules.map((m) => [m.attrs?.kind, m.attrs?.title ?? '']));
  });

  it('what each holds (the module library): the timeline’s importance and the code’s language no longer lost', () => {
    expect(of('timeline').content![0].content![0].content!.map(textOf)).toEqual([
      '1897 · Pavlov describe el reflejo condicionado',
      'Perros que salivan al oír el metrónomo que anuncia la comida.',
      'Primera prueba experimental de que se aprende por asociación.',
    ]);
    expect(of('causeEffect').content!.map((c) => c.type)).toEqual(['bulletList', 'paragraph', 'bulletList']);
    expect(of('keyFigures').content![0].content![0].content!.map(textOf)).toEqual(['Person', 'Role', 'What they did', 'Why it matters']);
    expect(of('comparison').content![0].content![0].content!.map(textOf)).toEqual(['', 'Condicionamiento clásico', 'Condicionamiento operante']);
    expect(of('process').content![0].content![1].content!.map(textOf)).toEqual(['Extinción', 'In: EC presentado sin EI → Out: La RC disminuye']);
    // A 2 × 2 grid: label in bold, the class example under it.
    const grid = of('framework').content![0];
    expect(grid.content!.map((row) => row.content!.map((cell) => cell.content!.map(textOf)))).toEqual([
      [['Fortalezas', 'La terapia de exposición tiene mucha evidencia en fobias.'], ['Debilidades', 'Al principio genera ansiedad y algunos pacientes abandonan.']],
      [['Oportunidades', 'La realidad virtual permite exponer sin salir de la consulta.'], ['Amenazas', 'Las recaídas si no se generaliza a otros contextos.']],
    ]);
    expect(of('theoryCard').content!.map(textOf)[0]).toBe('Seligman y Maier (1967)');
    expect(of('caseCard').content!.map(textOf).at(-1)).toMatch(/^Lesson: El miedo se aprende/);
    expect(of('argument').content!.map(textOf).slice(0, 2)).toEqual(['Todo aprendizaje se reduce al condicionamiento.', 'Supporting premises']);
    // Claude's $…$ as formulas in a worked example; the answer last (boxed by the CSS).
    expect(JSON.stringify(of('workedExample'))).toContain('"inlineMath"');
    expect(textOf(of('workedExample').content!.at(-1)!)).toMatch(/^Answer: /);
    expect(of('vocabulary').content![0].content!).toHaveLength(4);
  });

  it('code: each line in the code mark, its indent kept; "Output" then the output lines; the language in the label', () => {
    const code = of('code');
    expect(code.attrs?.title).toBe('Python');
    const lines = code.content!.map(textOf);
    expect(lines).toEqual(['alpha_beta, lam = 0.3, 1.0', 'V = 0.0', 'for trial in range(1, 4):', '    V += alpha_beta * (lam - V)  # sorpresa: lam - V', '    print(trial, round(V, 2))', 'Output', '1 0.3', '2 0.51', '3 0.66']);
    expect(code.content!.filter((l) => textOf(l) !== 'Output').every((l) => l.content?.[0].marks?.some((m) => m.type === 'code'))).toBe(true);
  });
});

describe('a lecture with no notes and no marks (the fixture)', () => {
  it('one plain line first, "No notes or marks were taken in class": no notes box, no "0 of 0", no link; still a summary', () => {
    const first = doc.content[0];
    expect(first).toMatchObject({ type: 'paragraph', attrs: { blockId: `${summaryKey(ID)}-check` } });
    expect(textOf(first)).toBe('No notes or marks were taken in class');
    expect(doc.content.some((b) => b.type === 'callout' && b.attrs?.kind === 'notesCheck')).toBe(false);
    expect(JSON.stringify(doc)).not.toContain('0 of 0');
    expect(holdsSummary(doc)).toBe(true);
  });
});

describe('on the page', () => {
  it('a box with its label drawn (not text) and a group name for screen readers', () => {
    const e = load(doc);
    const box = e.view.dom.querySelector('[data-module="framework"]')!;
    expect(box.getAttribute('role')).toBe('group');
    expect(box.getAttribute('aria-label')).toBe('Framework grid: DAFO');
    const label = box.querySelector('.studiply-module-label')!;
    expect(label.textContent).toBe('Framework · DAFO');
    expect(label.getAttribute('contenteditable')).toBe('false');
    expect(moduleLabel({ kind: 'code', title: 'Python' })).toBe('Code · Python');
    expect(moduleLabel({ kind: 'nonsense' })).toBe('Timeline');
  });

  it('its HTML round-trips (copy and paste; the other device)', () => {
    const html = load(doc).getHTML();
    editor!.destroy();
    const again = load(html).getJSON();
    const back = (again.content ?? []).filter((b) => b.type === 'studyModule');
    expect(back.map((m) => [m.attrs?.kind, m.attrs?.title, textOf(m)])).toEqual(modules.map((m) => [m.attrs?.kind, m.attrs?.title ?? '', textOf(m)]));
  });

  it('the CSS lays out each kind, keeps a module whole on a page and uses the document colours only', () => {
    const css = editorCss();
    expect(css).toMatch(/\.studiply-module \{[^}]*break-inside: avoid/);
    for (const kind of ['timeline', 'causeEffect', 'process', 'framework', 'theoryCard', 'caseCard', 'argument', 'code', 'workedExample']) expect(css).toContain(`[data-module='${kind}']`);
    // Tables: thin horizontal rules only (no vertical lines), a semibold header (SUMMARY-SPEC).
    expect(css).toMatch(/\.studiply-module td, [^{]*\.studiply-module th \{ border: 0; border-bottom: 1px solid/);
    // Never a word split in the middle: columns by their content, the table scrolling sideways in its box.
    expect(css).toMatch(/\.studiply-module table \{ table-layout: auto; width: 100%; \}/);
    expect(css).toMatch(/\.studiply-module td, [^{]*\.studiply-module th \{ min-width: 5\.5em; overflow-wrap: normal; word-break: normal;/);
    expect(css).toMatch(/\.studiply-module \.tableWrapper \{ overflow-x: auto;/);
    // The framework grid: its spacing taken from the scroll box's margins, the table exactly the box's width (no false scrollbar).
    expect(css).toMatch(/\[data-module='framework'\] \.studiply-module-body \.tableWrapper \{ margin: -6px -6px 0; \}/);
    expect(css).toMatch(/\[data-module='framework'\] \.studiply-module-body table \{[^}]*width: 100%; margin: 0; \}/);
    expect(css).toContain("'SF Mono', SFMono-Regular, Menlo");
  });
});

describe('her edits, regeneration and Extend', () => {
  it('typing inside a module makes it hers (origin student, an edit time)', () => {
    const e = load(doc);
    let at = -1;
    e.state.doc.descendants((node, pos) => {
      if (at < 0 && node.isText && node.text?.includes('Fortalezas')) at = pos + node.text.length;
    });
    e.commands.insertContentAt(at, ' (clave)');
    const framework = e.getJSON().content!.find((b) => b.type === 'studyModule' && b.attrs?.kind === 'framework')!;
    expect(framework.attrs).toMatchObject({ origin: 'student' });
    expect(typeof framework.attrs?.editedAt).toBe('number');
    const timeline = e.getJSON().content!.find((b) => b.type === 'studyModule' && b.attrs?.kind === 'timeline')!;
    expect(timeline.attrs).toMatchObject({ origin: 'ai', editedAt: null });
  });

  it('a summary written again keeps the module she edited and replaces the untouched ones', () => {
    const edited: SummaryDocJSON = {
      ...doc,
      content: doc.content.map((b) => (b.type === 'studyModule' && b.attrs?.kind === 'caseCard' ? { ...b, attrs: { ...b.attrs, origin: 'student', editedAt: 1_000 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mi propio resumen del caso.' }] }] } : b)),
    };
    const second = JSON.parse(JSON.stringify(S)) as StoredSummary;
    (second.sections as { blocks: Record<string, unknown>[] }[])[0].blocks[1] = { type: 'timeline', events: [{ date: '1900', title: 'Otra fecha', detail: '', importance: '' }] };
    // Written again: another summary (another id), as a regeneration always is.
    const merged = mergeRegenerated(edited, summaryToDoc({ summary: second, summaryId: '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b' }));
    const kinds = merged.content.filter((b) => b.type === 'studyModule');
    // Hers stays (beside the new summary's case card); the untouched timeline gives way to the new one.
    expect(kinds.filter((m) => m.attrs?.kind === 'caseCard').map(textOf)).toContain('Mi propio resumen del caso.');
    expect(kinds.filter((m) => m.attrs?.kind === 'timeline').map(textOf)).toEqual(['1900 · Otra fecha']);
  });

  it('Extend’s anchors (7.9) see a module’s words, by its id', () => {
    const anchors = anchorsOf(doc);
    const timeline = anchors.find((a) => a.id === of('timeline').attrs?.blockId)!;
    expect(timeline.text).toContain('Pavlov describe el reflejo condicionado');
    expect(anchors.find((a) => a.id === of('code').attrs?.blockId)?.text).toContain('alpha_beta');
  });
});
