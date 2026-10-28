import { DocColors } from '../../constants/colors';

/**
 * The colour picker's colours (step 4.5), as Word's: each base colour of
 * `DocColors.palette` at the top of its column, with three lighter and two
 * darker shades below it (Lighter 80 %, 60 %, 40 %, Darker 25 %, 50 %).
 * Worked out here, so only the bases are written in colors.ts.
 */

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB | null {
  const h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16)) as RGB;
  if (/^[0-9a-f]{6}$/i.test(h)) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
  return null;
}

export const rgbToHex = (rgb: RGB) => `#${rgb.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** A colour typed by hand (three or six hex digits, with or without #), as #RRGGBB; null when it isn't one. */
export function cleanHex(raw: string): string | null {
  const rgb = hexToRgb(raw);
  return rgb ? rgbToHex(rgb) : null;
}

const mix = (rgb: RGB, toward: number, amount: number): RGB => rgb.map((n) => n + (toward - n) * amount) as RGB;

/** Word's shades of a colour: lighter 80, 60, 40 %, darker 25, 50 %. */
export function shadesOf(base: string): string[] {
  const rgb = hexToRgb(base);
  if (!rgb) return [];
  return [mix(rgb, 255, 0.8), mix(rgb, 255, 0.6), mix(rgb, 255, 0.4), mix(rgb, 0, 0.25), mix(rgb, 0, 0.5)].map(rgbToHex);
}

export interface PaletteColumn {
  key: string;
  label: string;
  base: string;
  shades: string[];
}

/** The grid: one column per base colour, its shades below. */
export const PALETTE: PaletteColumn[] = DocColors.palette.map((c) => ({ key: c.key, label: c.label, base: c.value, shades: shadesOf(c.value) }));

// ---------------------------------------------------------------------------
// The spectrum ("More colours…"): hue, saturation, brightness.
// ---------------------------------------------------------------------------

export interface HSV {
  h: number; // 0–360
  s: number; // 0–1
  v: number; // 0–1
}

export function hsvToHex({ h, s, v }: HSV): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

export function hexToHsv(hex: string): HSV {
  const rgb = hexToRgb(hex) ?? [0, 0, 0];
  const [r, g, b] = rgb.map((n) => n / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s: max ? d / max : 0, v: max };
}
