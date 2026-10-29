/**
 * frame.ts
 * What every chart shares: the <svg> with its screen-reader title and
 * description, the background, the title at the top, the notes at the
 * bottom, the empty state, and the fill patterns the chart asks for.
 */

import type { PreparedChart } from './data';
import { PATTERNS, patternDef } from './styles';
import { el, esc, textLines, wrapText } from './svg';
import { ChartFont, chartTheme, type ChartTheme } from './theme';
import type { RenderOptions } from './types';

export const PAD = 16;
export const DEFAULT_WIDTH = 640;
export const DEFAULT_HEIGHT = 400;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Frame {
  id: string;
  width: number;
  height: number;
  theme: ChartTheme;
  /** Free space under the title and above the notes. */
  area: Box;
  head: string[];
  foot: string[];
  defs: Map<string, string>;
}

/** Line spacing for wrapped text of `size` px. */
export const lineHeight = (size: number) => Math.round(size * ChartFont.leading * 10) / 10 + 2;

function size(v: number | undefined, fallback: number, min: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.round(v)) : fallback;
}

export function makeFrame(p: PreparedChart, options: RenderOptions, id: string): Frame {
  const width = size(options.width, DEFAULT_WIDTH, 240);
  const height = size(options.height, DEFAULT_HEIGHT, 200);
  const theme = chartTheme(options.theme);
  const head = [el('rect', { width, height, fill: theme.background })];

  const titleLines = p.title ? wrapText(p.title, width - 2 * PAD, ChartFont.title, 2) : [];
  const titleLh = lineHeight(ChartFont.title);
  if (titleLines.length > 0) {
    head.push(
      textLines(titleLines, PAD, PAD + ChartFont.title, titleLh, {
        'font-size': ChartFont.title,
        'font-weight': ChartFont.titleWeight,
        fill: theme.text,
      }),
    );
  }
  const top = PAD + (titleLines.length > 0 ? titleLines.length * titleLh + 10 : 0);

  const noteLines = p.notes.flatMap((note) => wrapText(note, width - 2 * PAD, ChartFont.tick, 2));
  const noteLh = lineHeight(ChartFont.tick);
  const noteHeight = noteLines.length * noteLh;
  const foot =
    noteLines.length > 0
      ? [textLines(noteLines, PAD, height - PAD - noteHeight + ChartFont.tick, noteLh, { 'font-size': ChartFont.tick, fill: theme.textMuted })]
      : [];
  const bottom = height - PAD - (noteHeight > 0 ? noteHeight + 8 : 0);

  return { id, width, height, theme, area: { left: PAD, top, right: width - PAD, bottom }, head, foot, defs: new Map() };
}

/**
 * The fill for series (or slice) `index`: its colour, solid for pattern 0,
 * otherwise a pattern registered in the frame's <defs>.
 */
export function fillFor(f: Frame, index: number, pattern = index): { fill: string; patterned: boolean; color: string } {
  const colorIndex = index % f.theme.series.length;
  const color = f.theme.series[colorIndex];
  const kind = PATTERNS[pattern % PATTERNS.length];
  if (kind === 'solid') return { fill: color, patterned: false, color };
  const id = `${f.id}-fill-${colorIndex}-${kind}`;
  if (!f.defs.has(id)) f.defs.set(id, patternDef(id, kind, color, f.theme.tints[colorIndex]));
  return { fill: `url(#${id})`, patterned: true, color };
}

/** The empty chart's message, centred in the free space. */
export function emptyState(f: Frame, text: string): string {
  const { left, right, top, bottom } = f.area;
  return el(
    'text',
    {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      'text-anchor': 'middle',
      'font-size': ChartFont.label,
      fill: f.theme.textMuted,
    },
    esc(text),
  );
}

export function finish(f: Frame, title: string, description: string, body: string[]): string {
  const defs = f.defs.size > 0 ? `<defs>${[...f.defs.values()].join('')}</defs>` : '';
  const open =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f.width}" height="${f.height}" ` +
    `viewBox="0 0 ${f.width} ${f.height}" role="img" aria-labelledby="${f.id}-title ${f.id}-desc" ` +
    `font-family="${esc(ChartFont.family)}">`;
  return (
    open +
    el('title', { id: `${f.id}-title` }, esc(title)) +
    el('desc', { id: `${f.id}-desc` }, esc(description)) +
    defs +
    f.head.join('') +
    body.join('') +
    f.foot.join('') +
    '</svg>'
  );
}
