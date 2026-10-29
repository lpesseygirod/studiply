/**
 * svg.ts
 * Building SVG text without a DOM: escaping, elements, numbers, and text
 * measured by an estimate of the system font's character widths (good
 * enough to wrap and shorten labels; the exact width is up to the renderer).
 */

export type Attrs = Record<string, string | number | undefined>;

/** Characters XML 1.0 doesn't allow (control codes other than tab, newline, return). */
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function esc(s: string): string {
  return s
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A coordinate with at most 2 decimals, never "-0". */
export function n(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

/** An element; `children` is SVG already escaped. Empty attributes are left out. */
export function el(tag: string, attrs: Attrs, children?: string): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => ` ${k}="${typeof v === 'number' ? n(v) : esc(String(v))}"`)
    .join('');
  return children === undefined ? `<${tag}${a}/>` : `<${tag}${a}>${children}</${tag}>`;
}

/** Lines of text, the first with its baseline at `y`. */
export function textLines(lines: string[], x: number, y: number, lineHeight: number, attrs: Attrs): string {
  if (lines.length <= 1) return el('text', { x, y, ...attrs }, esc(lines[0] ?? ''));
  const spans = lines.map((line, i) => el('tspan', { x, dy: i === 0 ? undefined : lineHeight }, esc(line))).join('');
  return el('text', { x, y, ...attrs }, spans);
}

// ---- Numbers ----

export const MINUS = '−';

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/**
 * A value for a label: up to `maxDecimals` decimals, thousands separated
 * from 10,000 (years stay "2007"), millions and billions shortened ("1.25M"),
 * a true minus sign.
 */
export function formatNumber(v: number, maxDecimals = 2): string {
  if (!Number.isFinite(v)) return String(v);
  const abs = Math.abs(v);
  let body: string;
  if (abs >= 1e9) body = `${trimZeros((abs / 1e9).toFixed(2))}B`;
  else if (abs >= 1e6) body = `${trimZeros((abs / 1e6).toFixed(2))}M`;
  else if (abs > 0 && abs < 10 ** -maxDecimals) body = String(Number(abs.toPrecision(2)));
  else {
    body = trimZeros(abs.toFixed(maxDecimals));
    if (abs >= 1e4) body = body.replace(/^\d+/, (int) => int.replace(/\B(?=(\d{3})+$)/g, ','));
  }
  return v < 0 && /[1-9]/.test(body) ? MINUS + body : body;
}

/** A number written by a student or Claude: a number, or a string that is only a number. */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(MINUS, '-');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const parsed = Number(s);
  return Number.isFinite(parsed) ? parsed : null;
}

// ---- Text size ----

/** Rough advance widths (in em) of the system sans-serif. */
function charEm(ch: string): number {
  if (ch === ' ') return 0.28;
  if (/[iljI.,:;'|!()[\]]/.test(ch)) return 0.3;
  if (/[ftr\-]/.test(ch)) return 0.38;
  if (/[mwMW@%]/.test(ch)) return 0.86;
  if (/[0-9]/.test(ch)) return 0.58;
  if (/[A-Z]/.test(ch)) return 0.66;
  if (/[a-z]/.test(ch)) return 0.53;
  // Wide scripts (CJK and the like) take a full em.
  if (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-｠]/.test(ch)) return 1;
  return 0.6;
}

export function textWidth(s: string, size: number): number {
  let em = 0;
  for (const ch of s) em += charEm(ch);
  return em * size;
}

const ELLIPSIS = '…';

/** `text` cut with "…" so it fits `maxWidth`. */
export function ellipsize(text: string, maxWidth: number, size: number): string {
  if (textWidth(text, size) <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 0 && textWidth(chars.join('').trimEnd() + ELLIPSIS, size) > maxWidth) chars.pop();
  return chars.join('').trimEnd() + ELLIPSIS;
}

/**
 * `text` broken into lines that fit `maxWidth` (words that don't fit alone
 * are broken), at most `maxLines`, the last one ending in "…" when cut.
 */
export function wrapText(text: string, maxWidth: number, size: number, maxLines = Infinity): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    while (textWidth(line, size) > maxWidth && Array.from(line).length > 1) {
      const chars = Array.from(line);
      let cut = chars.length - 1;
      while (cut > 1 && textWidth(chars.slice(0, cut).join(''), size) > maxWidth) cut--;
      lines.push(chars.slice(0, cut).join(''));
      line = chars.slice(cut).join('');
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = ellipsize(`${kept[maxLines - 1]} ${lines[maxLines]}`, maxWidth, size);
  if (!kept[maxLines - 1].endsWith(ELLIPSIS)) kept[maxLines - 1] = ellipsize(kept[maxLines - 1] + ELLIPSIS, maxWidth, size);
  return kept;
}

/** A short, stable id from any text (FNV-1a). */
export function hashId(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
