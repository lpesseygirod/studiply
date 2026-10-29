/**
 * styles.ts
 * What tells series apart without colour, so a chart survives black-and-
 * white printing: a line style and a marker shape per series, a fill
 * pattern per bar series and pie slice. Patterns are SVG <pattern>s drawn
 * in the series colour over its tint.
 */

import { el, n } from './svg';

/** stroke-dasharray per series: solid, dashed, dotted, dash-dot. */
export const DASHES = ['', '8 5', '0.1 4.5', '10 4 2 4'] as const;

export type MarkerKind = 'circle' | 'square' | 'triangle' | 'diamond';
export const MARKERS: readonly MarkerKind[] = ['circle', 'square', 'triangle', 'diamond'];

/** A marker of about `size` px centred on (x, y). */
export function marker(kind: MarkerKind, x: number, y: number, size: number, attrs: Record<string, string | number>): string {
  const h = size / 2;
  switch (kind) {
    case 'circle':
      return el('circle', { cx: x, cy: y, r: h, ...attrs });
    case 'square': {
      const s = h * 0.9;
      return el('rect', { x: x - s, y: y - s, width: s * 2, height: s * 2, ...attrs });
    }
    case 'triangle': {
      const s = h * 1.2;
      const d = `M${n(x)} ${n(y - s)}L${n(x + s * 0.95)} ${n(y + s * 0.7)}L${n(x - s * 0.95)} ${n(y + s * 0.7)}Z`;
      return el('path', { d, ...attrs });
    }
    case 'diamond': {
      const s = h * 1.25;
      const d = `M${n(x)} ${n(y - s)}L${n(x + s)} ${n(y)}L${n(x)} ${n(y + s)}L${n(x - s)} ${n(y)}Z`;
      return el('path', { d, ...attrs });
    }
  }
}

/** Fill patterns in order: bars use the first four, pie slices all eight. */
export const PATTERNS = ['solid', 'diagonal', 'dots', 'backDiagonal', 'cross', 'horizontal', 'vertical', 'checks'] as const;
export type PatternKind = (typeof PATTERNS)[number];

/** A <pattern> of `kind` lines/dots in `color` over `tint`. */
export function patternDef(id: string, kind: Exclude<PatternKind, 'solid'>, color: string, tint: string): string {
  const cell = kind === 'dots' ? 5 : kind === 'checks' ? 8 : 6;
  const bg = el('rect', { width: cell, height: cell, fill: tint });
  const ink = (x: number, y: number, width: number, height: number) => el('rect', { x, y, width, height, fill: color });
  let marks: string;
  let rotate: number | undefined;
  switch (kind) {
    case 'diagonal':
      marks = ink(0, 0, 2, cell);
      rotate = 45;
      break;
    case 'backDiagonal':
      marks = ink(0, 0, 2, cell);
      rotate = -45;
      break;
    case 'cross':
      marks = ink(0, 0, 1.5, cell) + ink(0, 0, cell, 1.5);
      rotate = 45;
      break;
    case 'horizontal':
      marks = ink(0, 0, cell, 2);
      break;
    case 'vertical':
      marks = ink(0, 0, 2, cell);
      break;
    case 'dots':
      marks = el('circle', { cx: cell / 2, cy: cell / 2, r: 1.4, fill: color });
      break;
    case 'checks':
      marks = ink(0, 0, cell / 2, cell / 2) + ink(cell / 2, cell / 2, cell / 2, cell / 2);
      break;
  }
  return el(
    'pattern',
    {
      id,
      patternUnits: 'userSpaceOnUse',
      width: cell,
      height: cell,
      patternTransform: rotate === undefined ? undefined : `rotate(${rotate})`,
    },
    bg + marks,
  );
}
