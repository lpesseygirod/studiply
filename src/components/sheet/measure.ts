/**
 * measure.ts
 * How wide a text is in a spreadsheet cell's font (iPhone; the laptop's is
 * measure.web.ts, with a canvas), so a number is rounded to what fits.
 *
 * React Native can't measure text without drawing it, so the sheet draws
 * the characters a number can have (FontProbe.tsx, hidden), once per size
 * and weight, in the system font the cells use, and keeps their widths
 * here. Until they are known, the system font's widths in ems are used, a
 * little generous, so a number is rounded rather than cut.
 */

import type { Fits } from './sheetDisplay';

/** The characters a number can be written with in a cell. */
export const NUMBER_GLYPHS = '0123456789.,-+E#';

const EM: Record<string, number> = { '.': 0.27, ',': 0.27, '-': 0.4, '+': 0.6, E: 0.6, '#': 0.66 };
const DIGIT = 0.62;
const OTHER = 0.62;

/** Measured widths, by size and weight: character → px. */
const measured = new Map<string, Map<string, number>>();
const keyOf = (fontSize: number, bold: boolean) => `${fontSize}|${bold ? 700 : 400}`;

/** A character's width as drawn on this device (FontProbe). */
export function calibrate(fontSize: number, bold: boolean, ch: string, width: number): void {
  const key = keyOf(fontSize, bold);
  if (!measured.has(key)) measured.set(key, new Map());
  measured.get(key)!.set(ch, width);
}

/** Whether every number character was measured for this size and weight. */
export function isCalibrated(fontSize: number, bold: boolean): boolean {
  const m = measured.get(keyOf(fontSize, bold));
  return !!m && [...NUMBER_GLYPHS].every((ch) => m.has(ch));
}

export function textWidth(text: string, fontSize: number, bold: boolean): number {
  const m = measured.get(keyOf(fontSize, bold));
  if (m && [...text].every((ch) => m.has(ch))) return [...text].reduce((w, ch) => w + m.get(ch)!, 0);
  let em = 0;
  for (const ch of text) em += /[0-9]/.test(ch) ? DIGIT : EM[ch] ?? OTHER;
  return em * fontSize * (bold ? 1.06 : 1) * 1.04;
}

/** Whether a text fits `width` px in the cell's font. */
export function cellFits(width: number, fontSize: number, bold: boolean): Fits {
  return (text) => textWidth(text, fontSize, bold) <= width;
}
