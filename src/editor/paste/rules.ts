import { DocColors } from '../../constants/colors';

/**
 * Pasting from Google Docs or Word: the clipboard HTML is
 * rewritten before the editor reads it, so a pasted page keeps its
 * headings, bold/italic/underline, colours, highlights, lists, links and
 * tables, in Studiply's styles:
 *
 * - Word: `mso-list` paragraphs become real lists (bulleted or numbered from
 *   their marker, nested by level); MsoTitle / MsoSubtitle become Title /
 *   Subheading; `mso-highlight` / `background` become highlights; page
 *   breaks become page breaks.
 * - Google Docs: `background-color` becomes a highlight; its title and
 *   subtitle and its page breaks the same way.
 * - Both: highlights snap to the nearest Studiply highlight; fonts, sizes,
 *   margins, black and transparent colours are dropped (the page's own
 *   look applies); h4–h6 become Subheading.
 *
 * Needs a DOM (DOMParser): runs in the browser and the iPhone's WebView.
 */

const isWord = (html: string) => /urn:schemas-microsoft-com|class=["']?Mso|mso-list|mso-highlight/i.test(html);

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

/** Word's named highlight colours (what Word writes on the clipboard, not colours Studiply shows). */
const WORD_HIGHLIGHTS: Record<string, RGB> = {
  yellow: [255, 255, 0], green: [0, 255, 0], brightgreen: [0, 255, 0], cyan: [0, 255, 255], turquoise: [0, 255, 255],
  magenta: [255, 0, 255], pink: [255, 0, 255], blue: [0, 0, 255], red: [255, 0, 0], darkblue: [0, 0, 128], teal: [0, 128, 128],
  darkgreen: [0, 128, 0], violet: [128, 0, 128], darkred: [128, 0, 0], darkyellow: [128, 128, 0], gray: [128, 128, 128],
  darkgray: [128, 128, 128], lightgray: [192, 192, 192], black: [0, 0, 0], windowtext: [0, 0, 0], white: [255, 255, 255], window: [255, 255, 255],
};

/** [r, g, b] of a CSS colour (hex, rgb or rgba, Word names), or null (transparent, unknown). */
export function rgbOf(value: string | null | undefined): RGB | null {
  if (!value) return null;
  const v = value.trim().toLowerCase().replace(/\s+/g, '');
  if (!v || v === 'transparent' || v === 'none' || v === 'inherit' || v === 'initial' || v === 'auto') return null;
  if (WORD_HIGHLIGHTS[v]) return [...WORD_HIGHLIGHTS[v]];
  const hex = v.replace('#', '');
  if (/^[0-9a-f]{6}$/.test(hex)) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
  if (/^[0-9a-f]{3}$/.test(hex)) return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16)) as RGB;
  const m = /^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/.exec(v);
  if (m) return m[4] !== undefined && Number(m[4]) === 0 ? null : [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

const toHex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** Black-ish text: the page's own colour, so no colour is kept. */
export function isPlainText(rgb: [number, number, number]): boolean {
  return Math.max(...rgb) < 60;
}

/** White-ish background: no highlight. */
const isPlainBackground = (rgb: [number, number, number]) => Math.min(...rgb) > 245;

/** The Studiply highlight nearest to a colour (by hue more than lightness: Word's bright yellow is our yellow). */
export function nearestHighlight(rgb: [number, number, number]): string {
  const hue = ([r, g, b]: [number, number, number]) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return -1;
    const d = max - min;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return ((h * 60) + 360) % 360;
  };
  const target = hue(rgb);
  let best: string = DocColors.highlight[0].value;
  let bestDistance = Infinity;
  for (const h of DocColors.highlight) {
    const own = hue(rgbOf(h.value)!);
    const d = target < 0 ? Infinity : Math.min(Math.abs(own - target), 360 - Math.abs(own - target));
    if (d < bestDistance) {
      bestDistance = d;
      best = h.value;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// The rewrite
// ---------------------------------------------------------------------------

const DROPPED_STYLE = /^(font-family|font-size|font|line-height|margin.*|padding.*|text-indent|mso-.*|tab-stops|layout-grid-mode|white-space|vertical-align|font-variant.*|letter-spacing)$/i;

/** Keeps only what the editor reads from a style: weight, italics, decoration, colour; highlights become <mark>. */
function cleanStyle(el: HTMLElement): string | null {
  const style = el.getAttribute('style');
  if (!style) return null;
  let highlight: string | null = null;
  const kept: string[] = [];
  for (const part of style.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const name = part.slice(0, i).trim().toLowerCase();
    const value = part.slice(i + 1).trim();
    if (name === 'mso-highlight' || name === 'background' || name === 'background-color') {
      const rgb = rgbOf(name === 'background' ? value.split(/\s+/)[0] : value);
      if (rgb && !isPlainBackground(rgb)) highlight = nearestHighlight(rgb);
      continue;
    }
    if (name === 'color') {
      const rgb = rgbOf(value);
      if (rgb && !isPlainText(rgb)) kept.push(`color: ${toHex(rgb)}`);
      continue;
    }
    if (DROPPED_STYLE.test(name)) continue;
    kept.push(`${name}: ${value}`);
  }
  if (kept.length) el.setAttribute('style', kept.join('; '));
  else el.removeAttribute('style');
  return highlight;
}

/** A pasted cell's shading, as it is (cells keep their own colour, not a highlight's). */
function cellShading(el: HTMLElement): string | null {
  const style = el.getAttribute('style') ?? '';
  const m = /(?:^|;)\s*(?:background-color|background)\s*:\s*([^;]+)/i.exec(style);
  const rgb = m ? rgbOf(m[1].trim().split(/\s+/)[0]) : null;
  return rgb && !isPlainBackground(rgb) ? toHex(rgb) : null;
}

function wrapInMark(doc: Document, el: HTMLElement, color: string) {
  const mark = doc.createElement('mark');
  mark.setAttribute('data-color', color);
  mark.style.backgroundColor = color;
  while (el.firstChild) mark.appendChild(el.firstChild);
  el.appendChild(mark);
}

function rename(doc: Document, el: Element, tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const next = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) next.setAttribute(k, v);
  const style = el.getAttribute('style');
  if (style) next.setAttribute('style', style);
  while (el.firstChild) next.appendChild(el.firstChild);
  el.replaceWith(next);
  return next;
}

const PAGE_BREAK_STYLE = /(page-break-before|break-before)\s*:\s*(always|page)/i;

function pageBreak(doc: Document): HTMLElement {
  const div = doc.createElement('div');
  div.setAttribute('data-page-break', '');
  return div;
}

/** A Word list paragraph's marker ("1.", "a)", "·", "o", "§"), removed; whether it is numbered. */
function takeMarker(p: HTMLElement): { ordered: boolean } {
  // Word writes the marker in a span styled mso-list:Ignore (between <![if !supportLists]> comments).
  const spans = Array.from(p.querySelectorAll('span'));
  let marker = spans.find((s) => /mso-list\s*:\s*ignore/i.test(s.getAttribute('style') ?? ''));
  if (!marker) {
    const first = p.firstElementChild as HTMLElement | null;
    const text = (first?.textContent ?? '').replace(/ /g, ' ').trim();
    if (first && /^([·•o§▪\-–]|\d+[.)]|[a-z][.)]|[ivxlc]+[.)])$/i.test(text)) marker = first;
  }
  const text = (marker?.textContent ?? '').replace(/ /g, ' ').trim();
  marker?.remove();
  // Leftover comments and spacing before the text.
  while (p.firstChild && (p.firstChild.nodeType === 8 || (p.firstChild.nodeType === 3 && !(p.firstChild.textContent ?? '').trim()))) p.firstChild.remove();
  return { ordered: /^(\d+|[a-z]|[ivxlc]+)[.)]$/i.test(text) };
}

/** Word's list paragraphs as nested <ul>/<ol>, in place. */
function wordLists(doc: Document) {
  const isItem = (el: Element | null): el is HTMLElement =>
    !!el && el.tagName === 'P' && /mso-list\s*:\s*l\d+/i.test(el.getAttribute('style') ?? '');
  const items = Array.from(doc.body.querySelectorAll('p')).filter(isItem);
  const done = new Set<Element>();
  for (const first of items) {
    if (done.has(first)) continue;
    // A run of list paragraphs next to each other (blank text between them doesn't count).
    const run: HTMLElement[] = [];
    let el: Element | null = first;
    while (el && isItem(el)) {
      run.push(el);
      done.add(el);
      let next: ChildNode | null = el.nextSibling;
      while (next && next.nodeType !== 1 && !(next.textContent ?? '').trim()) next = next.nextSibling;
      el = next && next.nodeType === 1 ? (next as Element) : null;
    }
    const root = doc.createElement('div');
    first.before(root);
    const stack: { level: number; list: HTMLElement }[] = [];
    for (const p of run) {
      const level = Number(/level(\d+)/i.exec(p.getAttribute('style') ?? '')?.[1] ?? 1);
      const { ordered } = takeMarker(p);
      while (stack.length && stack[stack.length - 1].level > level) stack.pop();
      let top = stack[stack.length - 1];
      if (!top || top.level < level) {
        const list = doc.createElement(ordered ? 'ol' : 'ul');
        const parentItem = top?.list.lastElementChild;
        (parentItem ?? root).appendChild(list);
        top = { level, list };
        stack.push(top);
      }
      const li = doc.createElement('li');
      p.removeAttribute('class');
      li.appendChild(p);
      top.list.appendChild(li);
    }
    root.replaceWith(...Array.from(root.childNodes));
  }
}

/** The clipboard HTML rewritten for the editor (see the top of this file). */
export function transformPastedHTML(html: string): string {
  if (typeof DOMParser === 'undefined' || !html) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;

  if (isWord(html)) wordLists(doc);

  // Page breaks: Word's <br style="page-break-before:always">, Google Docs' <hr>, any block that starts a page.
  for (const el of Array.from(body.querySelectorAll<HTMLElement>('[style]'))) {
    if (!PAGE_BREAK_STYLE.test(el.getAttribute('style') ?? '')) continue;
    if (el.tagName === 'BR' || el.tagName === 'HR') el.replaceWith(pageBreak(doc));
    else el.before(pageBreak(doc));
  }
  // A page break Word wraps in a span would split a paragraph: lift it out to the top.
  for (const br of Array.from(body.querySelectorAll('div[data-page-break]'))) {
    let top: Element = br;
    while (top.parentElement && top.parentElement !== body && /^(SPAN|B|I|U|FONT|P)$/.test(top.parentElement.tagName)) top = top.parentElement;
    if (top !== br) top.after(br);
  }

  // Title, subtitle, small headings.
  for (const el of Array.from(body.querySelectorAll('p.MsoTitle, p.title'))) rename(doc, el, 'p', { 'data-type': 'title' });
  for (const el of Array.from(body.querySelectorAll('p.MsoSubtitle, p.subtitle'))) rename(doc, el, 'h3');
  for (const el of Array.from(body.querySelectorAll('h4, h5, h6'))) rename(doc, el, 'h3');

  // Styles: highlights become <mark> (a table cell's shading its colour);
  // fonts, sizes, margins and plain colours go.
  for (const el of Array.from(body.querySelectorAll<HTMLElement>('[style]'))) {
    const isCell = el.tagName === 'TD' || el.tagName === 'TH';
    const shading = isCell ? cellShading(el) : null;
    const highlight = cleanStyle(el);
    if (isCell) {
      if (shading) el.setAttribute('data-background', shading);
    } else if (highlight) wrapInMark(doc, el, highlight);
  }
  // Word's and Google Docs' own <font> and class names say nothing to the editor.
  for (const el of Array.from(body.querySelectorAll('[class]'))) el.removeAttribute('class');
  for (const font of Array.from(body.querySelectorAll('font'))) font.replaceWith(...Array.from(font.childNodes));

  return body.innerHTML;
}
