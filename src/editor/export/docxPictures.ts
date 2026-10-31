import type { JSONContent } from '@tiptap/core';

import { DEFAULT_SIZE } from '../schema/fonts';
import { canDraw } from '../graph/charts';
import { cleanGraph, planGraph } from '../graph/data';
import { mediaIdOf } from '../media/photoSource';
import { cleanPageSetup, paperCm, type PageSetup } from '../page/pageSetup';

/**
 * The pictures of the Word export (step 4.8b): formulas and graphs are put in
 * the .docx as PNGs that the editor's own drawing makes (KaTeX, the charts
 * module), photos as their files. This file has no DOM and no docx: the
 * builder asks for the pictures of the tabs (`pictureRequests`), the device
 * makes them (laptop: in the page, export/pictures.ts; iPhone: formulas and
 * graphs in the export WebView, photos from the phone), and the builder puts
 * each one where its node was (`formulaKey` / `graphKey` / `photoKey`).
 */

/** A formula or a graph to draw. `id` is its key (the same formula at the same size is drawn once). */
export type DrawRequest =
  | { id: string; kind: 'formula'; latex: string; display: boolean; fontPx: number }
  | { id: string; kind: 'graph'; graph: Record<string, unknown>; width: number; blockId: string; language: string | null };

/** A photo to fetch (its `src`: `media:<id>`, a link or a data URI). */
export interface PhotoRequest {
  id: string;
  kind: 'photo';
  src: string;
}

export type PictureRequest = DrawRequest | PhotoRequest;

/** A drawn picture: a PNG at PICTURE_SCALE, placed at `width` × `height` CSS px. */
export interface Picture {
  id: string;
  /** Base64, without the data: prefix. */
  data: string;
  type: 'png' | 'jpg' | 'gif';
  width: number;
  height: number;
  /** Inline formulas: how far below the text's baseline the picture reaches (px), so it is lowered by that much. */
  depth?: number;
}

/** Formulas and graphs are drawn at twice their size, so they stay sharp when zoomed and printed. */
export const PICTURE_SCALE = 2;

export const formulaKey = (latex: string, display: boolean, fontPx: number) => `f:${display ? 'd' : 'i'}:${Math.round(fontPx * 100) / 100}:${latex}`;
export const graphKey = (attrs: Record<string, unknown>, width: number, language: string | null) =>
  `g:${Math.round(width)}:${language ?? ''}:${String(attrs.blockId ?? '')}:${JSON.stringify(cleanGraph(attrs))}`;
export const photoKey = (src: string) => `p:${src}`;

/** The text's width on the page (px at 96 an inch): graphs are drawn at it, pictures are never wider. */
export function textWidthPx(raw: PageSetup): number {
  const setup = cleanPageSetup(raw);
  const paper = paperCm(setup);
  return Math.round(((paper.width - setup.margins.left - setup.margins.right) / 2.54) * 96 * 10) / 10;
}

/** Heading sizes in em, as the page draws them (editorCss). */
export const HEADING_EM: Record<number, number> = { 1: 1.75, 2: 1.4, 3: 1.15 };
export const TITLE_EM = 2.1;

/** The text size of a block (px): its heading's, or the page's. */
export function blockFontPx(node: JSONContent): number {
  if (node.type === 'heading') return DEFAULT_SIZE * (HEADING_EM[Number(node.attrs?.level)] ?? 1);
  if (node.type === 'title') return DEFAULT_SIZE * TITLE_EM;
  return DEFAULT_SIZE;
}

/** "18px" in a text-style mark, as a number. */
const markSize = (node: JSONContent): number | null => {
  const style = node.marks?.find((m) => m.type === 'textStyle');
  const m = typeof style?.attrs?.fontSize === 'string' ? /^(\d+(?:\.\d+)?)px$/.exec(style.attrs.fontSize) : null;
  return m ? Number(m[1]) : null;
};

/** The formula's size (px) in its block: its own text size if it has one. */
export const inlineFormulaPx = (node: JSONContent, block: JSONContent) => markSize(node) ?? blockFontPx(block);

/**
 * Every picture the tabs need, once each. `width`: the text's width on the page (px), which graphs are
 * drawn at; `language`: the document's (graphs write decimals with a comma in Spanish).
 */
export function pictureRequests(docs: JSONContent[], width: number, language: string | null): PictureRequest[] {
  const out = new Map<string, PictureRequest>();
  const walk = (node: JSONContent, block: JSONContent) => {
    const latex = String(node.attrs?.latex ?? '');
    if (node.type === 'inlineMath' && latex.trim()) {
      const px = inlineFormulaPx(node, block);
      const id = formulaKey(latex, false, px);
      out.set(id, { id, kind: 'formula', latex, display: false, fontPx: px });
    } else if (node.type === 'blockMath' && latex.trim()) {
      const id = formulaKey(latex, true, DEFAULT_SIZE);
      out.set(id, { id, kind: 'formula', latex, display: true, fontPx: DEFAULT_SIZE });
    } else if (node.type === 'graph' && canDraw(planGraph(cleanGraph(node.attrs)).spec)) {
      // A kind the charts module doesn't draw yet (8.2) isn't asked for: the builder writes its line.
      const attrs = node.attrs ?? {};
      const id = graphKey(attrs, width, language);
      out.set(id, { id, kind: 'graph', graph: attrs, width, blockId: String(attrs.blockId ?? ''), language });
    } else if ((node.type === 'image' || node.type === 'inlineImage') && typeof node.attrs?.src === 'string' && node.attrs.src) {
      const src = node.attrs.src;
      if (mediaIdOf(src) || /^(https?:|data:image\/)/i.test(src)) out.set(photoKey(src), { id: photoKey(src), kind: 'photo', src });
    }
    const childBlock = node.content?.some((c) => c.type === 'text' || c.type === 'inlineMath') ? node : block;
    for (const child of node.content ?? []) walk(child, childBlock);
  };
  for (const doc of docs) walk(doc, doc);
  return [...out.values()];
}

/** The requests that are drawn (formulas and graphs), not fetched. */
export const drawRequests = (requests: PictureRequest[]): DrawRequest[] => requests.filter((r): r is DrawRequest => r.kind !== 'photo');
export const photoRequests = (requests: PictureRequest[]): PhotoRequest[] => requests.filter((r): r is PhotoRequest => r.kind === 'photo');
