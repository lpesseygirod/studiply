/**
 * measure.web.ts
 * How wide a text is in a spreadsheet cell's font (laptop), so a number can
 * be rounded to what fits (sheetDisplay.fitNumber). Measured with a canvas
 * in the font the cells are drawn with (read from a drawn cell), bold or not.
 */

import type { Fits } from './sheetDisplay';

/** react-native-web's system font, until a cell is drawn to read it from. */
const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

let context: CanvasRenderingContext2D | null = null;
let family: string | null = null;
const widths = new Map<string, number>();

function fontFamily(): string {
  if (family) return family;
  const drawn = document.querySelector('[data-cell] > div');
  if (!drawn) return SYSTEM_FONT;
  family = getComputedStyle(drawn).fontFamily || SYSTEM_FONT;
  widths.clear();
  return family;
}

export function textWidth(text: string, fontSize: number, bold: boolean): number {
  const font = `${bold ? 700 : 400} ${fontSize}px ${fontFamily()}`;
  const key = `${font}|${text}`;
  const known = widths.get(key);
  if (known !== undefined) return known;
  context ??= document.createElement('canvas').getContext('2d');
  if (!context) return text.length * fontSize * 0.62;
  context.font = font;
  const width = context.measureText(text).width;
  widths.set(key, width);
  return width;
}

/** The characters a number can be written with (the iPhone measures them; the laptop's canvas needs no probe). */
export const NUMBER_GLYPHS = '0123456789.,-+E#';
export function calibrate(_fontSize: number, _bold: boolean, _ch: string, _width: number): void {}
export function isCalibrated(_fontSize: number, _bold: boolean): boolean {
  return true;
}

/** Whether a text fits `width` px in the cell's font. */
export function cellFits(width: number, fontSize: number, bold: boolean): Fits {
  return (text) => textWidth(text, fontSize, bold) <= width;
}
