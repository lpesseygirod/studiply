/**
 * The document's fonts and sizes (step 4.4). Stored in the text-style mark
 * as CSS (`fontFamily`, `fontSize`), so both editors and the export read
 * them the same way. Pasted fonts and sizes are dropped (src/editor/paste),
 * so a pasted page takes the document's look.
 */

export interface FontChoice {
  key: 'system' | 'rounded' | 'serif' | 'mono';
  label: string;
  /** The CSS font stack; null for System (the document's default). */
  css: string | null;
}

/**
 * Rounded is Apple's rounded system font (iPhone, Mac; Arial Rounded on older
 * Macs). Windows has none: it shows as the system font there.
 */
export const FONTS: readonly FontChoice[] = [
  { key: 'system', label: 'System', css: null },
  { key: 'rounded', label: 'Rounded', css: 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif' },
  { key: 'serif', label: 'Serif', css: 'ui-serif, "New York", Georgia, "Times New Roman", serif' },
  { key: 'mono', label: 'Monospace', css: 'ui-monospace, Menlo, Consolas, monospace' },
];

/** The document font when nothing is chosen. */
export const DEFAULT_FONT_CSS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/** Normal text, in px (the mockup's "15"). */
export const DEFAULT_SIZE = 15;
export const FONT_SIZES: readonly number[] = [9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36];

/** The font a stored stack is; System for anything else (pasted or unknown). */
export function fontOf(css: string | null | undefined): FontChoice {
  return FONTS.find((f) => f.css !== null && f.css === css) ?? FONTS[0];
}

/** "18px" → 18; null when not set or not px. */
export function sizeOf(value: string | null | undefined): number | null {
  const m = typeof value === 'string' ? /^(\d+(?:\.\d+)?)px$/.exec(value.trim()) : null;
  return m ? Number(m[1]) : null;
}

/** The next size up or down from `current` (px), within the list. */
export function stepSize(current: number, direction: 1 | -1): number {
  if (direction > 0) return FONT_SIZES.find((s) => s > current) ?? FONT_SIZES[FONT_SIZES.length - 1];
  return [...FONT_SIZES].reverse().find((s) => s < current) ?? FONT_SIZES[0];
}

/** A size typed in the box: a whole number from 6 to 96, else null. */
export function cleanSize(raw: string): number | null {
  const n = Math.round(Number(raw.trim()));
  return Number.isFinite(n) && n >= 6 && n <= 96 ? n : null;
}
