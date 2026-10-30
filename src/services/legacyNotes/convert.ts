import katex from 'katex';

import type { LegacyNoteResult } from '../../lib/cloudRows';
import { mediaSrc } from '../../editor/media/photoSource';
import type { Origin } from '../../editor/schema/blockMeta';
import type { DocJSON } from '../../editor/types';

/**
 * Step 4.9: an earlier note (a `summaries` row in format legacy-note-v1: step
 * 1.9's import of the old app, and the generate flow until Phase 7) as the
 * lecture's Summary tab. Pure, so every rule is unit tested; run.ts decides
 * when (the Summary tab opened with no document yet) and saves it.
 *
 * - Title → a Title; summary → paragraphs, lists and headings from the small
 *   markdown the AI wrote (`- ` / `• ` / `1. ` lists, `#` headings,
 *   `**bold**`, `*italic*`).
 * - Key concepts → a list (the term in bold — its explanation); formulas →
 *   the name in bold, a display formula (as text when KaTeX can't read it),
 *   its description; definitions → Definition callouts; unclear parts → the
 *   excerpt as a quote and the reason under it.
 * - Highlights (Clarify) → the highlighted words as a quote and the answer in
 *   an "Added context" callout (it came from the AI, not the lecture).
 * - Tags → a last line; attachments → the lecture's photos as photo blocks
 *   (`media:<id>`: the same file, nothing copied) and its PDFs by name.
 * - Section headings in the lecture's language (study content, CLAUDE.md).
 * - Every block keeps its section's origin (`blocks` meta, step 1.8; without
 *   it `student`, as step 1.9 decided) and time; attachments are `media`.
 * - Block ids come from the section and position, so converting the same
 *   note twice gives the same document (two devices converting at once merge
 *   into one).
 */

export interface LegacyAttachment {
  /** The media row's id. */
  id: string;
  kind: 'photo' | 'pdf';
  /** A PDF's name, when known. */
  name?: string | null;
}

export interface LegacyClarification {
  highlightedParts: string[];
  response: string;
}

type Section = 'title' | 'summary' | 'keyConcepts' | 'formulas' | 'definitions' | 'tags' | 'unclearParts' | 'clarifications';
type Json = { type: string; attrs?: Record<string, unknown>; content?: Json[]; text?: string; marks?: { type: string }[] };

const HEADINGS: Record<string, Record<'keyConcepts' | 'formulas' | 'definitions' | 'unclearParts' | 'clarifications' | 'tags' | 'attachments', string>> = {
  en: { keyConcepts: 'Key concepts', formulas: 'Formulas', definitions: 'Definitions', unclearParts: 'Unclear parts', clarifications: 'Clarifications', tags: 'Tags', attachments: 'Attachments' },
  es: { keyConcepts: 'Conceptos clave', formulas: 'Fórmulas', definitions: 'Definiciones', unclearParts: 'Partes poco claras', clarifications: 'Aclaraciones', tags: 'Etiquetas', attachments: 'Adjuntos' },
  ca: { keyConcepts: 'Conceptes clau', formulas: 'Fórmules', definitions: 'Definicions', unclearParts: 'Parts poc clares', clarifications: 'Aclariments', tags: 'Etiquetes', attachments: 'Adjunts' },
  fr: { keyConcepts: 'Concepts clés', formulas: 'Formules', definitions: 'Définitions', unclearParts: 'Passages peu clairs', clarifications: 'Clarifications', tags: 'Étiquettes', attachments: 'Pièces jointes' },
  de: { keyConcepts: 'Schlüsselbegriffe', formulas: 'Formeln', definitions: 'Definitionen', unclearParts: 'Unklare Stellen', clarifications: 'Erklärungen', tags: 'Schlagwörter', attachments: 'Anhänge' },
  it: { keyConcepts: 'Concetti chiave', formulas: 'Formule', definitions: 'Definizioni', unclearParts: 'Parti poco chiare', clarifications: 'Chiarimenti', tags: 'Tag', attachments: 'Allegati' },
  pt: { keyConcepts: 'Conceitos-chave', formulas: 'Fórmulas', definitions: 'Definições', unclearParts: 'Partes pouco claras', clarifications: 'Esclarecimentos', tags: 'Etiquetas', attachments: 'Anexos' },
};

/** The headings in the lecture's language ("es", "es-ES"…), English when there are none for it. */
export function headingsFor(language: string | null | undefined) {
  const code = (language ?? '').toLowerCase().slice(0, 2);
  return HEADINGS[code] ?? HEADINGS.en;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const list = (v: unknown): Record<string, unknown>[] =>
  (Array.isArray(v) ? v : []).map((x) => (typeof x === 'string' ? { term: x } : x)).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x));

/** Inline `**bold**`, `*italic*` and `_italic_` as text with marks. */
export function inline(text: string, base: { type: string }[] = []): Json[] {
  const out: Json[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_/g;
  let at = 0;
  const push = (t: string, marks: { type: string }[]) => {
    if (!t) return;
    out.push({ type: 'text', text: t, ...(marks.length ? { marks } : {}) });
  };
  for (let m = re.exec(text); m; m = re.exec(text)) {
    push(text.slice(at, m.index), base);
    if (m[1] !== undefined) push(m[1], [...base, { type: 'bold' }]);
    else push(m[2] ?? m[3], [...base, { type: 'italic' }]);
    at = m.index + m[0].length;
  }
  push(text.slice(at), base);
  return out;
}

/** Whether KaTeX can draw it (else it goes in as text). */
function readableLatex(expression: string): boolean {
  try {
    katex.renderToString(expression, { throwOnError: true });
    return true;
  } catch {
    return false;
  }
}

export function legacyNoteToDoc(params: {
  note: LegacyNoteResult;
  clarifications: LegacyClarification[];
  attachments: LegacyAttachment[];
  language: string | null | undefined;
}): DocJSON {
  const { note } = params;
  const h = headingsFor(params.language);
  const blocks: Json[] = [];
  const counters: Record<string, number> = {};

  const meta = (section: Section | 'attachments') => {
    if (section === 'attachments') return { origin: 'media' as Origin, editedAt: null };
    const m = note.blocks?.[section];
    const time = m?.editedAt ? Date.parse(m.editedAt) : NaN;
    return { origin: (m?.origin ?? 'student') as Origin, editedAt: Number.isFinite(time) ? time : null };
  };
  const add = (section: Section | 'attachments', node: Json) => {
    const n = counters[section] ?? 0;
    counters[section] = n + 1;
    blocks.push({ ...node, attrs: { ...(node.attrs ?? {}), blockId: `legacy-${section}-${n}`, ...meta(section) } });
  };
  const p = (content: Json[], attrs?: Record<string, unknown>): Json => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), ...(content.length ? { content } : {}) });
  const heading = (section: Section, text: string, level = 2) => add(section, { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
  const paragraphs = (text: string): Json[] =>
    text
      .split(/\n\s*\n/)
      .map((part) => part.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)
      .map((part) => p(inline(part)));

  // Title.
  const title = str(note.title);
  if (title) add('title', { type: 'title', content: [{ type: 'text', text: title }] });

  // Summary: paragraphs, lists and headings from its small markdown.
  const lines = (note.summary ?? '').split('\n');
  let para: string[] = [];
  let items: { ordered: boolean; texts: string[] } | null = null;
  const flushPara = () => {
    if (para.length) add('summary', p(inline(para.join(' '))));
    para = [];
  };
  const flushList = () => {
    if (items?.texts.length) add('summary', { type: items.ordered ? 'orderedList' : 'bulletList', content: items.texts.map((t) => ({ type: 'listItem', content: [p(inline(t))] })) });
    items = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    const bullet = /^(?:[-•*])\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const head = /^(#{1,3})\s+(.*)$/.exec(line);
    if (!line) {
      flushPara();
      flushList();
    } else if (head) {
      flushPara();
      flushList();
      add('summary', { type: 'heading', attrs: { level: head[1].length === 3 ? 3 : 2 }, content: inline(head[2]) });
    } else if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      if (items && items.ordered !== ordered) flushList();
      if (!items) items = { ordered, texts: [] };
      items.texts.push((bullet ?? numbered)![1]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();

  // Key concepts.
  const concepts = list(note.keyConcepts).filter((k) => str(k.term));
  if (concepts.length) {
    heading('keyConcepts', h.keyConcepts);
    add('keyConcepts', {
      type: 'bulletList',
      content: concepts.map((k) => {
        const explanation = str(k.explanation);
        return { type: 'listItem', content: [p([{ type: 'text', text: str(k.term), marks: [{ type: 'bold' }] }, ...(explanation ? inline(` — ${explanation}`) : [])])] };
      }),
    });
  }

  // Formulas.
  const formulas = list(note.formulas).filter((f) => str(f.name) || str(f.expression));
  if (formulas.length) {
    heading('formulas', h.formulas);
    for (const f of formulas) {
      if (str(f.name)) add('formulas', p([{ type: 'text', text: str(f.name), marks: [{ type: 'bold' }] }]));
      const expression = str(f.expression);
      if (expression) add('formulas', readableLatex(expression) ? { type: 'blockMath', attrs: { latex: expression } } : p([{ type: 'text', text: expression }]));
      if (str(f.description)) add('formulas', p(inline(str(f.description))));
    }
  }

  // Definitions: Definition callouts.
  const definitions = list(note.definitions).filter((d) => str(d.term) || str(d.definition));
  if (definitions.length) {
    heading('definitions', h.definitions);
    for (const d of definitions) {
      const body = [str(d.term) ? p([{ type: 'text', text: str(d.term), marks: [{ type: 'bold' }] }]) : null, ...paragraphs(str(d.definition))].filter((x): x is Json => !!x);
      add('definitions', { type: 'callout', attrs: { kind: 'definition' }, content: body });
    }
  }

  // Unclear parts: the excerpt as a quote, the reason under it.
  const unclear = list(note.unclearParts).filter((u) => str(u.excerpt));
  if (unclear.length) {
    heading('unclearParts', h.unclearParts);
    for (const u of unclear) {
      add('unclearParts', { type: 'blockquote', content: [p(inline(str(u.excerpt)))] });
      if (str(u.reason)) add('unclearParts', p(inline(str(u.reason))));
    }
  }

  // Highlights (Clarify): the highlighted words as a quote, the answer as Added context.
  const clarifications = params.clarifications.filter((c) => str(c.response) || (c.highlightedParts ?? []).some((x) => str(x)));
  if (clarifications.length) {
    heading('clarifications', h.clarifications);
    for (const c of clarifications) {
      const words = (c.highlightedParts ?? []).map(str).filter(Boolean);
      if (words.length) add('clarifications', { type: 'blockquote', content: words.map((w) => p(inline(w))) });
      const answer = paragraphs(str(c.response));
      if (answer.length) add('clarifications', { type: 'callout', attrs: { kind: 'addedContext' }, content: answer });
    }
  }

  // Tags: one last line.
  const tags = (note.tags ?? []).map(str).filter(Boolean);
  if (tags.length) add('tags', p([{ type: 'text', text: `${h.tags}: `, marks: [{ type: 'bold' }] }, { type: 'text', text: tags.join(', ') }]));

  // Attachments: the lecture's photos shown (the same file), its PDFs by name.
  if (params.attachments.length) {
    add('attachments', { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: h.attachments }] });
    for (const a of params.attachments) {
      if (a.kind === 'photo') add('attachments', { type: 'image', attrs: { src: mediaSrc(a.id) } });
      else add('attachments', p([{ type: 'text', text: `PDF: ${str(a.name) || 'PDF'}` }]));
    }
  }

  if (!blocks.length) add('summary', p([]));
  return { type: 'doc', content: blocks } as DocJSON;
}
