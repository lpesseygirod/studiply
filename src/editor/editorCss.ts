import { DocColors, LightColors } from '../constants/colors';
import { CHIP_CLASS } from './schema/timestampChip';
import { DEFAULT_LINE_SPACING } from './schema/blocks';
import { DEFAULT_FONT_CSS, DEFAULT_SIZE } from './schema/fonts';
import { TABLE_BAR_CLASS } from './table/tableBar';
import { TABLE_HANDLES_CLASS } from './table/tableHandles';
import { PHOTO_CLASS } from './schema/photo';
import { COMMENT_CLASS } from './schema/comments';
import { PHOTO_BAR_CLASS, PHOTO_COMPACT_CLASS, PHOTO_NARROW_CLASS, PHOTO_SIZE_CLASS, PHOTO_WIDE_CLASS } from './photoBar';
import { MATH_CHIP_CLASS } from './schema/formula';
import { ANSWER_SHOWN_CLASS, CALLOUT_CLASS } from './schema/callout';
import { SUGGESTION_CLASS } from './schema/suggestion';
import { FORMULA_CARD_CLASS } from './schema/formulaCard';
import { GRAPH_CLASS } from './schema/graph';
import { STUDY_MODULE_CLASS } from './schema/studyModule';
import { SELECTION_BAR_CLASS } from './format/selectionBar';
import { MARK_CHIP_CLASS } from './schema/markChip';
import { PAGE_CLASS, PAGE_GAP_CLASS, PAGE_LAYER_CLASS, PAGES_DRAWN_CLASS } from './page/pageView';

/** The document page's colours: always the light palette (see `editorCss`). */
export const PAGE_COLORS = LightColors;

/**
 * The summary's text modules (step 8.1; SUMMARY-SPEC "Module library" and "Spacing and layout"): a quiet
 * box with its label in small capitals, laid out by kind. Tables have thin horizontal rules only and a
 * semibold header; code is monospace (SF Mono / Menlo, 13 px). Lines, dots and arrows are drawn (never
 * read: the words carry the meaning); a module moves whole between pages and in the PDF.
 */
function moduleCss(pm: string): string {
  const m = DocColors.module;
  const M = `${pm} .${STUDY_MODULE_CLASS}`;
  const kind = (k: string) => `${M}[data-module='${k}'] .${STUDY_MODULE_CLASS}-body`;
  const small = '700 11px/16px -apple-system, system-ui, sans-serif';
  return `/* Summary modules (step 8.1) */
${M} { margin: 0 0 0.9em; padding: 10px 14px 12px; border: 1px solid ${m.border}; border-radius: 8px; background: ${m.bg}; break-inside: avoid; }
${M}-label { margin-bottom: 6px; font: ${small}; letter-spacing: 0.12em; text-transform: uppercase; color: ${m.label}; user-select: none; -webkit-user-select: none; }
${M}-body > :last-child { margin-bottom: 0; }
${M}-body p { margin: 0 0 0.4em; }
${M} table { margin: 0.2em 0 0; background: ${m.box}; }
/* Never a word split in the middle: columns sized by their content (at least the longest word, and
   5.5em), the table as wide as the box or wider, scrolling sideways in its box on a narrow screen. */
${M} .tableWrapper { overflow-x: auto; overflow-y: hidden; }
${M} table { table-layout: auto; width: 100%; }
${M} td, ${M} th { min-width: 5.5em; overflow-wrap: normal; word-break: normal; hyphens: manual; }
${M} td, ${M} th { border: 0; border-bottom: 1px solid ${m.border}; }
${M} th { background: transparent; font-weight: 600; }
${kind('timeline')} > ul { position: relative; list-style: none; margin: 0; padding-left: 24px; }
${kind('timeline')} > ul::before { content: ''; position: absolute; left: 7px; top: 8px; bottom: 8px; width: 2px; border-radius: 1px; background: ${m.line}; }
${kind('timeline')} > ul > li { position: relative; margin: 0 0 0.7em; }
${kind('timeline')} > ul > li::before { content: ''; position: absolute; left: -22px; top: 0.4em; width: 12px; height: 12px; box-sizing: border-box; border-radius: 50%; border: 2px solid ${m.line}; background: ${m.box}; }
${kind('timeline')} li p + p { font-size: 0.9em; color: ${m.secondary}; }
${kind('causeEffect')} > * { position: relative; margin: 0; padding: 8px 12px; border: 1px solid ${m.border}; border-radius: 8px; background: ${m.box}; }
${kind('causeEffect')} > ul { padding-left: 2.2em; }
${kind('causeEffect')} > p { border-color: ${m.line}; font-weight: 600; }
${kind('causeEffect')} > * + * { margin-top: 28px; }
${kind('causeEffect')} > * + *::after { content: '↓'; position: absolute; top: -26px; left: 50%; transform: translateX(-50%); font: 700 16px/24px -apple-system, system-ui, sans-serif; color: ${m.line}; }
${kind('causeEffect')} > ul:first-child::before, ${kind('causeEffect')} > ul:last-child:not(:first-child)::before, ${kind('causeEffect')} > p::before { display: block; margin-bottom: 2px; font: ${small}; letter-spacing: 0.12em; text-transform: uppercase; color: ${m.label}; }
${kind('causeEffect')} > ul:first-child::before { content: 'Causes'; margin-left: -1.6em; }
${kind('causeEffect')} > ul:last-child:not(:first-child)::before { content: 'Effects'; margin-left: -1.6em; }
${kind('causeEffect')} > p::before { content: 'Event'; }
${kind('process')} > ol { list-style: none; counter-reset: studiply-step; margin: 0; padding-left: 0; }
${kind('process')} > ol > li { position: relative; counter-increment: studiply-step; min-height: 26px; margin: 0 0 0.7em; padding-left: 38px; }
${kind('process')} > ol > li::before { content: counter(studiply-step); position: absolute; left: 0; top: 0; width: 26px; height: 26px; box-sizing: border-box; border-radius: 50%; border: 2px solid ${m.line}; background: ${m.box}; color: ${m.label}; font: 700 12px/22px -apple-system, system-ui, sans-serif; text-align: center; }
${kind('process')} > ol > li:not(:last-child)::after { content: ''; position: absolute; left: 12px; top: 28px; bottom: -0.6em; width: 2px; background: ${m.border}; }
${kind('process')} li p + p { font-size: 0.85em; color: ${m.secondary}; }
/* The grid's cells line up with the box's edges: the spacing's 6 px taken from the scroll box's margins,
   so the table is exactly its box's width and the box scrolls only when the grid is really wider. */
${kind('framework')} .tableWrapper { margin: -6px -6px 0; }
${kind('framework')} table { border-collapse: separate; border-spacing: 6px; background: transparent; width: 100%; margin: 0; }
${kind('framework')} td { border: 1px solid ${m.border}; border-radius: 6px; background: ${m.box}; }
${kind('theoryCard')} > p:first-child { font-size: 1.05em; }
${kind('theoryCard')} > p, ${kind('caseCard')} > p { margin-bottom: 0.35em; }
${kind('caseCard')} > p:last-child { padding: 6px 10px; border-left: 3px solid ${m.answerBorder}; border-radius: 6px; background: ${m.answerBg}; }
${kind('argument')} > p:first-child { padding: 8px 12px; border: 1px solid ${m.border}; border-radius: 8px; background: ${m.box}; font-weight: 600; }
${kind('argument')} > p:not(:first-child) { margin: 0.6em 0 0.2em; }
${kind('argument')} > ul { list-style: none; margin: 0; padding-left: 12px; border-left: 3px solid ${m.premise}; }
${kind('argument')} > ul:last-of-type:not(:first-of-type) { border-left-color: ${m.objection}; }
${kind('argument')} li { margin-bottom: 0.4em; }
${kind('argument')} li p + p { margin-left: 1em; color: ${m.secondary}; }
${kind('code')} { padding: 8px 10px; border-radius: 6px; background: ${m.codeBg}; overflow-x: auto; }
${kind('code')} p { margin: 0; font-family: 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; line-height: 1.45; white-space: pre-wrap; }
${kind('code')} code { padding: 0; background: none; }
${kind('code')} p:has(> strong:only-child) { margin-top: 0.6em; font: ${small}; letter-spacing: 0.12em; text-transform: uppercase; color: ${m.label}; }
${kind('workedExample')} > ol { margin-bottom: 0.4em; }
${kind('workedExample')} li p + p { font-size: 0.88em; color: ${m.secondary}; }
${kind('workedExample')} > p:last-child:not(:first-child) { padding: 6px 10px; border: 2px solid ${m.answerBorder}; border-radius: 6px; background: ${m.answerBg}; }`;
}

/**
 * The document's look for both editors: injected into the iPhone's WebView,
 * and a <style> on the laptop scoped under `scope`. The page is always white
 * with dark text, like Google Docs, in light and dark mode alike (pasted
 * text keeps colours chosen for white paper); only the app around it follows
 * the appearance. Step 4.4 replaces this with the designed styles.
 */
export function editorCss(scope = ''): string {
  const c = PAGE_COLORS;
  const pm = `${scope} .ProseMirror`.trim();
  const bar = `${scope} .${TABLE_BAR_CLASS}`.trim();
  const handles = `${scope} .${TABLE_HANDLES_CLASS}`.trim();
  const photo = `${pm} .${PHOTO_CLASS}`;
  const sheet = `${pm}.${PAGE_CLASS}`;
  // A page's soft shadow on the gradient (the page view, step 4.5b).
  const PAGE_SHADOW = `0 1px 3px ${c.scrim}, 0 6px 24px ${c.scrim}`;
  const gap = `${pm} .${PAGE_GAP_CLASS}`;
  const page = scope ? '' : `html, body { background: ${c.card}; color: ${c.text.primary}; color-scheme: light; }\n`;
  return `${page}
${pm} { display: flow-root; color: ${c.text.primary}; background: ${c.card}; color-scheme: light; font-family: ${DEFAULT_FONT_CSS}; font-size: ${DEFAULT_SIZE}px; line-height: ${DEFAULT_LINE_SPACING}; padding: 16px 20px 160px; caret-color: ${c.accentDark}; word-wrap: break-word; }
${pm} h1 { font-size: 1.75em; line-height: 1.25; margin: 0.8em 0 0.4em; }
${pm} h2 { font-size: 1.4em; line-height: 1.3; margin: 0.8em 0 0.4em; }
${pm} h3 { font-size: 1.15em; font-weight: 600; color: ${c.text.secondary}; margin: 0.8em 0 0.3em; }
${pm} h4, ${pm} h5, ${pm} h6 { font-size: 1.05em; margin: 0.8em 0 0.3em; }
${pm} .doc-title { font-size: 2.1em; font-weight: 700; line-height: 1.2; margin: 0.4em 0 0.3em; }
${pm} .page-break { position: relative; margin: 1.4em 0; border-top: 1px dashed ${c.border}; text-align: center; height: 0; user-select: none; -webkit-user-select: none; }
${pm} .page-break span { position: relative; top: -0.75em; padding: 0 8px; background: ${c.card}; font-size: 0.75em; color: ${c.text.secondary}; }
${pm} .page-break.ProseMirror-selectednode { border-top-color: ${c.accent}; }
${pm} p { margin: 0 0 0.6em; }
${pm} ul, ${pm} ol { padding-left: 1.4em; margin: 0 0 0.6em; }
${pm} li p { margin: 0; }
${pm} a { color: ${c.accentDark}; }
${pm} blockquote { border-left: 3px solid ${c.border}; margin: 0 0 0.6em; padding-left: 12px; color: ${c.text.secondary}; }
${pm} code { background: ${c.cardMuted}; border-radius: 4px; padding: 0 4px; }
${pm} mark { background: ${c.highlight}; color: inherit; }
${pm} .studiply-find { background: ${c.found}; border-radius: 2px; }
${pm} .studiply-find-current { box-shadow: 0 0 0 2px ${c.accent}; }
${pm} table { border-collapse: collapse; width: 100%; margin: 0.6em 0; table-layout: fixed; }
${pm} td, ${pm} th { border: 1px solid ${c.border}; padding: 6px 8px; vertical-align: top; }
${pm} th { background: ${c.cardMuted}; font-weight: 600; text-align: left; }
${pm} td p, ${pm} th p { margin: 0; }
${pm} td, ${pm} th { position: relative; }
${pm} .selectedCell::after { content: ''; position: absolute; inset: 0; background: ${c.accentLight}; opacity: 0.55; pointer-events: none; }
${pm} .column-resize-handle { position: absolute; right: -2px; top: 0; bottom: -2px; width: 4px; background: ${c.accent}; pointer-events: none; }
${pm}.resize-cursor { cursor: col-resize; }
${pm} .ProseMirror-gapcursor { display: none; pointer-events: none; position: absolute; }
${pm} .ProseMirror-gapcursor::after { content: ''; display: block; position: absolute; top: -2px; width: 20px; border-top: 1.5px solid ${c.accentDark}; animation: studiply-gap-blink 1.1s steps(2, start) infinite; }
${pm}.ProseMirror-focused .ProseMirror-gapcursor { display: block; }
@keyframes studiply-gap-blink { to { visibility: hidden; } }
${pm} .${CHIP_CLASS} { display: inline-block; padding: 0 8px; margin: 0 2px; border-radius: 10px; background: ${DocColors.timestamp.bg}; color: ${DocColors.timestamp.text}; font-size: 0.8em; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.6; vertical-align: 1px; cursor: pointer; user-select: none; -webkit-user-select: none; }
${pm} .${CHIP_CLASS}.ProseMirror-selectednode { outline: 2px solid ${c.accent}; }
/* Studiply's blocks (step 4.6; SUMMARY-SPEC "Callouts"): a 4 px coloured border, a light fill, 8 px corners; the label in small capitals. */
${pm} .${CALLOUT_CLASS} { margin: 0 0 0.9em; padding: 10px 14px 10px 14px; border-left: 4px solid; border-radius: 8px; break-inside: avoid; }
${pm} .${CALLOUT_CLASS}-label { margin-bottom: 4px; font: 700 11px/16px -apple-system, system-ui, sans-serif; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; user-select: none; -webkit-user-select: none; }
${pm} .${CALLOUT_CLASS}-body > :last-child { margin-bottom: 0; }
/* Formula cards (step 4.7c): a quiet box; the title in small capitals; the formula, then its legend smaller and softer. */
${pm} .${FORMULA_CARD_CLASS} { margin: 0 0 0.9em; padding: 10px 14px; border: 1px solid ${DocColors.formulaCard.border}; border-radius: 8px; background: ${DocColors.formulaCard.bg}; break-inside: avoid; }
${pm} .${FORMULA_CARD_CLASS}-title { margin-bottom: 2px; font: 700 11px/16px -apple-system, system-ui, sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: ${DocColors.formulaCard.title}; user-select: none; -webkit-user-select: none; }
${pm} .${FORMULA_CARD_CLASS}-body > [data-type='block-math'] { margin: 0.3em 0 0.4em; }
${pm} .${FORMULA_CARD_CLASS}-body > p { margin: 0.15em 0 0; font-size: 0.85em; line-height: 1.5; color: ${DocColors.formulaCard.legend}; }
@media (max-width: 480px) { ${pm} .${FORMULA_CARD_CLASS}-body > [data-type='block-math'] .katex { font-size: 1em; } }
/* Graphs (step 4.7d): the charts module's drawing across the text width, whole on a page; selected like a photo. */
${pm} .${GRAPH_CLASS} { margin: 0.4em 0 0.9em; padding: 4px 0; border-radius: 8px; cursor: pointer; break-inside: avoid; scroll-margin-top: 130px; }
${pm} .${GRAPH_CLASS}-art svg { display: block; width: 100%; height: auto; }
${pm} .${GRAPH_CLASS}.ProseMirror-selectednode { outline: 2px solid ${c.accent}; outline-offset: 2px; }
/* Step 8.2: a graph the charts module doesn't draw yet is its line, as 7.7's placeholder paragraph. */
${pm} .${GRAPH_CLASS}-later { margin: 0; font-style: italic; color: ${c.text.secondary}; cursor: default; }
${moduleCss(pm)}

${Object.entries(DocColors.callout)
  .map(([kind, k]) => `${pm} .${CALLOUT_CLASS}[data-callout='${kind}'] { background: ${k.bg}; border-left-color: ${k.border}; } ${pm} .${CALLOUT_CLASS}[data-callout='${kind}'] .${CALLOUT_CLASS}-label { color: ${k.label}; }`)
  .join('\n')}
/* The summary in the Summary tab (step 7.7, desktop-03): the notes check line's label is a sentence; a self-test answer is hidden until its label is tapped (view only, never saved). */
${pm} .${CALLOUT_CLASS}[data-callout='notesCheck'] .${CALLOUT_CLASS}-label { font: 700 14px/20px -apple-system, system-ui, sans-serif; letter-spacing: 0; text-transform: none; cursor: default; }
${pm} .${CALLOUT_CLASS}[data-callout='notesCheck'] .${CALLOUT_CLASS}-body { font-size: 0.85em; }
${pm} .${CALLOUT_CLASS}[data-callout='notesCheck'] a { white-space: nowrap; }
${pm} .${CALLOUT_CLASS}[data-callout='takeaways'] { border-left-width: 1px; }
${pm} .${CALLOUT_CLASS}[data-callout='answer'] { padding-top: 6px; padding-bottom: 6px; }
/* Hidden only in the editor (its root has contenteditable): an exported PDF shows the answers (8.3 moves them to the last page). */
${pm}[contenteditable] .${CALLOUT_CLASS}[data-callout='answer'] .${CALLOUT_CLASS}-label::after { content: ' · tap to show'; letter-spacing: 0.04em; text-transform: none; font-weight: 600; }
${pm}[contenteditable] .${CALLOUT_CLASS}[data-callout='answer'].${ANSWER_SHOWN_CLASS} .${CALLOUT_CLASS}-label::after { content: ' · tap to hide'; }
${pm}[contenteditable] .${CALLOUT_CLASS}[data-callout='answer']:not(.${ANSWER_SHOWN_CLASS}) .${CALLOUT_CLASS}-body { display: none; }
${pm}[contenteditable] .${CALLOUT_CLASS}[data-callout='answer']:not(.${ANSWER_SHOWN_CLASS}) .${CALLOUT_CLASS}-label { margin-bottom: 0; }
/* Ask Claude (step 6.3): the text a pending suggestion is about, until it is accepted or rejected. */
${pm} .${SUGGESTION_CLASS} { background: ${c.accentLight}; box-shadow: 0 2px 0 ${c.accent}; }
${pm} .${MARK_CHIP_CLASS} { display: inline-block; padding: 0 8px; margin: 0 2px; border-radius: 10px; font-size: 0.8em; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.6; vertical-align: 1px; cursor: pointer; user-select: none; -webkit-user-select: none; }
${Object.entries(DocColors.markChip)
  .map(([kind, k]) => `${pm} .${MARK_CHIP_CLASS}[data-mark='${kind}'] { background: ${k.bg}; color: ${k.text}; }`)
  .join('\n')}
${pm} .${MARK_CHIP_CLASS}.ProseMirror-selectednode { outline: 2px solid ${c.accent}; }
${pm} p.is-editor-empty:first-child::before { color: ${c.text.placeholder}; }
${bar} { position: absolute; z-index: 5; display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 10px; box-sizing: border-box; overflow-x: auto; scrollbar-width: none; background: ${c.card}; border: 1px solid ${c.border}; box-shadow: 0 4px 14px ${c.scrim}; font-family: -apple-system, system-ui, sans-serif; }
${bar} button { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 9px; border: 0; border-radius: 7px; background: transparent; color: ${c.text.primary}; font: 600 13px/1 -apple-system, system-ui, sans-serif; cursor: pointer; white-space: nowrap; -webkit-tap-highlight-color: transparent; }
${bar} button:hover { background: ${c.cardMuted}; }
${bar} button[aria-pressed='true'] { background: ${c.accentLight}; color: ${c.accentDark}; }
${bar} button.danger { color: ${c.error}; }
${bar} .${TABLE_BAR_CLASS}-swatch { width: 12px; height: 12px; border-radius: 3px; border: 1px solid ${c.border}; }
${bar} .${TABLE_BAR_CLASS}-swatch.empty { background: ${c.card}; }
${handles} { position: absolute; inset: 0; pointer-events: none; z-index: 4; }
${handles} button { position: absolute; pointer-events: auto; padding: 0; border: 0; cursor: pointer; }
${handles} .grip { border-radius: 4px; background: ${c.border}; opacity: 0.7; }
${handles} .grip:hover { background: ${c.accent}; opacity: 1; }
${handles} .plus { z-index: 1; display: flex; align-items: center; justify-content: center; background: transparent; }
${handles} .plus span { width: 16px; height: 16px; border-radius: 8px; background: ${c.accentDark}; color: ${c.accentOn}; font: 700 13px/16px -apple-system, system-ui, sans-serif; text-align: center; pointer-events: none; }
${handles} .plus:hover span { transform: scale(1.2); }
${pm} [data-type='inline-math'], ${pm} [data-type='block-math'] { border-radius: 4px; }
${pm}[contenteditable='true'] [data-type='inline-math'], ${pm}[contenteditable='true'] [data-type='block-math'] { cursor: pointer; }
${pm} [data-type='block-math'] { margin: 0.2em 0 0.6em; overflow-x: auto; overflow-y: hidden; }
${pm} .ProseMirror-selectednode[data-type='inline-math'], ${pm} .ProseMirror-selectednode[data-type='block-math'] { outline: 2px solid ${c.accent}; outline-offset: 2px; }
${pm} .inline-math-error, ${pm} .block-math-error { color: ${c.error}; }
${pm} .${COMMENT_CLASS} { background: ${DocColors.comment}; border-radius: 2px; }
${pm} .${COMMENT_CLASS}.resolved { background: ${DocColors.commentResolved}; }
${photo} { margin: 0 0 0.6em; line-height: 0; }
${photo}[data-align='center'] { text-align: center; }
${photo}[data-align='right'] { text-align: right; }
${photo}[data-wrap='left'] { float: left; clear: left; margin: 0.25em 1.2em 0.6em 0; max-width: 100%; }
${photo}[data-wrap='right'] { float: right; clear: right; margin: 0.25em 0 0.6em 1.2em; max-width: 100%; }
${photo}[data-wrap='inline'] { display: inline-block; vertical-align: bottom; margin: 0 0.15em; max-width: 100%; text-align: left; }
${photo}[data-wrap='left'] .${PHOTO_CLASS}-frame, ${photo}[data-wrap='right'] .${PHOTO_CLASS}-frame, ${photo}[data-wrap='inline'] .${PHOTO_CLASS}-frame { display: block; }
${photo}[data-wrap='left'] .${PHOTO_CLASS}-frame.sized, ${photo}[data-wrap='right'] .${PHOTO_CLASS}-frame.sized, ${photo}[data-wrap='inline'] .${PHOTO_CLASS}-frame.sized { width: 100%; }
${bar}.${SELECTION_BAR_CLASS} .${SELECTION_BAR_CLASS}-split { flex: none; width: 1px; align-self: stretch; margin: 5px 3px; background: ${c.border}; }
${bar}.${SELECTION_BAR_CLASS} .${SELECTION_BAR_CLASS}-more { margin-left: -3px; font-size: 10px; opacity: 0.6; }
${bar}.${SELECTION_BAR_CLASS}-touch, ${bar}.${SELECTION_BAR_CLASS}-wrap { flex-wrap: wrap; }
${bar}.${SELECTION_BAR_CLASS}-touch .${SELECTION_BAR_CLASS}-split, ${bar}.${SELECTION_BAR_CLASS}-wrap .${SELECTION_BAR_CLASS}-split { flex-basis: 100%; width: auto; height: 1px; align-self: auto; margin: 2px 0; }
${bar} .${PHOTO_BAR_CLASS}-divider { flex: none; width: 1px; align-self: stretch; margin: 5px 3px; background: ${c.border}; }
${bar} button:disabled { opacity: 0.35; cursor: default; }
${`${scope} .${MATH_CHIP_CLASS}`.trim()} { padding: 6px 10px; gap: 6px; color: ${c.accentDark}; font: 600 13px/1 -apple-system, system-ui, sans-serif; cursor: pointer; white-space: pre; }
${bar} button:disabled:hover { background: transparent; }
${photo}-frame { position: relative; display: inline-block; max-width: 100%; vertical-align: top; border-radius: 4px; }
${photo}-frame img { display: block; max-width: 100%; height: auto; border-radius: 4px; }
${photo}-frame.sized img { width: 100%; }
${photo}-frame.empty { min-width: min(240px, 100%); }
${photo}-note { display: flex; align-items: center; justify-content: center; min-height: 120px; padding: 0 16px; border-radius: 4px; background: ${c.cardMuted}; color: ${c.text.secondary}; font-size: 0.85em; line-height: 1.4; text-align: center; }
${photo}-note[hidden], ${photo}-frame img[hidden] { display: none; }
${photo}.ProseMirror-selectednode .${PHOTO_CLASS}-frame { outline: 2px solid ${c.accent}; outline-offset: 2px; }
${photo}-handle { display: none; position: absolute; width: 12px; height: 12px; border-radius: 3px; background: ${c.card}; border: 2px solid ${c.accent}; box-sizing: border-box; z-index: 2; }
${photo}.ProseMirror-selectednode .${PHOTO_CLASS}-handle, ${photo}.resizing .${PHOTO_CLASS}-handle { display: block; }
${photo}-handle[data-corner='nw'] { left: -7px; top: -7px; cursor: nwse-resize; }
${photo}-handle[data-corner='ne'] { right: -7px; top: -7px; cursor: nesw-resize; }
${photo}-handle[data-corner='sw'] { left: -7px; bottom: -7px; cursor: nesw-resize; }
${photo}-handle[data-corner='se'] { right: -7px; bottom: -7px; cursor: nwse-resize; }
@media (pointer: coarse) {
  ${photo}-handle { width: 24px; height: 24px; border-radius: 12px; border-width: 3px; touch-action: none; }
  ${photo}-handle[data-corner='nw'] { left: -12px; top: -12px; }
  ${photo}-handle[data-corner='ne'] { right: -12px; top: -12px; }
  ${photo}-handle[data-corner='sw'] { left: -12px; bottom: -12px; }
  ${photo}-handle[data-corner='se'] { right: -12px; bottom: -12px; }
}
/* The page view (step 4.5b): the editor is the A4 sheet, white until its pages are drawn; then it is
   transparent and a layer behind the text draws each white page, so the gaps show what is behind (the
   app's gradient). Gaps are widgets (page/pageView.ts). */
${sheet} { max-width: none; box-sizing: border-box; margin: 0 auto; box-shadow: ${PAGE_SHADOW}; }
${sheet}.${PAGES_DRAWN_CLASS} { background: transparent; box-shadow: none; position: relative; z-index: 0; }
${sheet} .page-break { height: 0; margin: 0; padding: 0; border: 0; overflow: hidden; }
${pm} .${PAGE_LAYER_CLASS} { position: absolute; left: 0; top: 0; z-index: -1; pointer-events: none; user-select: none; -webkit-user-select: none; }
${pm} .${PAGE_LAYER_CLASS}-sheet { position: absolute; left: 0; width: 100%; background: ${c.card}; box-shadow: ${PAGE_SHADOW}; }
${pm} .${PAGE_LAYER_CLASS}-number { position: absolute; font: 11px/16px -apple-system, system-ui, sans-serif; color: ${c.text.secondary}; }
${gap} { display: block; position: relative; margin: 0; padding: 0; border: 0; user-select: none; -webkit-user-select: none; pointer-events: none; }
${sheet} .${PAGE_GAP_CLASS} + * { margin-top: 0 !important; }
${pm} tr.${PAGE_GAP_CLASS} { display: table-row; }
${pm} tr.${PAGE_GAP_CLASS} > td { position: relative; padding: 0; border: 0 !important; background: transparent; }
${pm}.studiply-page-measuring .${PAGE_GAP_CLASS} { display: none !important; }
${scope ? '' : `html:has(.ProseMirror.${PAGE_CLASS}), body:has(.ProseMirror.${PAGE_CLASS}) { background: transparent; }
.studiply-page-label { position: fixed; left: 12px; bottom: 12px; z-index: 20; padding: 4px 10px; border-radius: 12px; background: ${c.card}; border: 1px solid ${c.border}; font: 12px/16px -apple-system, system-ui, sans-serif; color: ${c.text.secondary}; opacity: 0; transition: opacity 0.25s; pointer-events: none; }`}
@media (pointer: coarse) { ${bar} button { min-height: 40px; padding: 0 11px; font-size: 15px; } }
${bar} .${PHOTO_NARROW_CLASS} { display: none; }
${bar}.${PHOTO_COMPACT_CLASS} .${PHOTO_WIDE_CLASS} { display: none; }
${bar}.${PHOTO_COMPACT_CLASS} .${PHOTO_NARROW_CLASS} { display: inline-flex; }
@media (max-width: 480px) { ${bar} .${PHOTO_WIDE_CLASS} { display: none; } ${bar} .${PHOTO_NARROW_CLASS} { display: inline-flex; } ${bar} .${PHOTO_SIZE_CLASS} { display: none; } ${bar} button { padding: 0 8px; } ${bar} button[data-key='colour'] .${TABLE_BAR_CLASS}-text { display: none; } ${bar} .${TABLE_BAR_CLASS}-swatch { width: 16px; height: 16px; } }
`;
}
