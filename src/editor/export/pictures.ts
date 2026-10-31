import katex from 'katex';

import { LightColors } from '../../constants/colors';
import { graphMarkup } from '../graph/charts';
import { cleanGraph, planGraph, usesDecimalComma } from '../graph/data';
import { PICTURE_SCALE, type DrawRequest, type Picture } from './docxPictures';

/**
 * Formulas and graphs as PNGs for the Word export (step 4.8b), drawn by the
 * editor's own code so they look as on the page: on the laptop in the page,
 * on the iPhone in the export WebView (bridges/export.ts).
 *
 * - A graph is the charts module's SVG, drawn on a canvas.
 * - A formula is KaTeX's HTML. A picture of HTML is an SVG with the HTML in a
 *   `foreignObject`, which the browser draws as an image; an SVG image can't
 *   reach the page's fonts, so KaTeX's stylesheet goes in with every font
 *   the formula uses as a data URI (the iPhone's bundle has them inline; the
 *   laptop's are fetched once).
 * Both at PICTURE_SCALE (2×). A formula that can't be drawn throws, and the
 * builder writes its LaTeX instead.
 */

const TEXT = LightColors.text.primary;
/** Marks the point on an inline formula's baseline while it is measured. */
const BASELINE = 'data-studiply-baseline';

/** Why a picture wasn't made, in words that never include the student's formula. */
class PictureError extends Error {}

/**
 * A KaTeX font face of the page: its family, weight and style, and the files it can come from, in the
 * order to try them. KaTeX's own stylesheet names each face with links the laptop's bundler doesn't
 * serve (`fonts/KaTeX_Main-Regular.woff2`), and katexFonts.web.ts names the same face again from the
 * files it does serve, with other words for the same weight ("normal" for 400, "bold" for 700): both
 * are one face, and the later one's files are tried first.
 */
interface Face {
  family: string;
  weight: string;
  style: string;
  urls: string[];
}
let katexStyle: { rules: string; faces: Face[] } | null = null;
/** Font files already turned into data URIs (null: not a font). */
const fontData = new Map<string, Promise<string | null>>();

/** A face's weight and style as one word each ("normal" and "400" are the same weight). */
export function faceKey(family: string, weight: string, style: string): string {
  const w = weight.trim().toLowerCase();
  const s = style.trim().toLowerCase();
  return `${family}|${w === 'normal' || w === '' ? '400' : w === 'bold' ? '700' : w}|${s === '' ? 'normal' : s}`;
}

/** Every url(…) in a face's src, in order. */
export function srcUrls(src: string): string[] {
  return Array.from(src.matchAll(/url\((["']?)([^"')]+)\1\)/g), (m) => m[2]);
}

function readKatexStyle() {
  if (katexStyle) return katexStyle;
  const rules: string[] = [];
  const faces = new Map<string, Face>();
  for (const sheet of Array.from(document.styleSheets)) {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(list)) {
      if (typeof CSSFontFaceRule !== 'undefined' && rule instanceof CSSFontFaceRule) {
        const family = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
        if (!family.startsWith('KaTeX_')) continue;
        const urls = srcUrls(rule.style.getPropertyValue('src')).map((u) => (u.startsWith('data:') ? u : new URL(u, sheet.href ?? document.baseURI).href));
        if (!urls.length) continue;
        const weight = rule.style.getPropertyValue('font-weight') || 'normal';
        const style = rule.style.getPropertyValue('font-style') || 'normal';
        const key = faceKey(family, weight, style);
        const known = faces.get(key);
        // A later declaration of the face is tried first (the one the page itself uses).
        faces.set(key, { family, weight, style, urls: [...urls, ...(known?.urls ?? [])] });
      } else if (rule.cssText.includes('.katex')) {
        rules.push(rule.cssText);
      }
    }
  }
  const read = { rules: rules.join('\n'), faces: [...faces.values()] };
  // Kept once the stylesheet is in the page (the laptop adds it with the formula editor).
  if (read.faces.length) katexStyle = read;
  return read;
}

/** A font file's type from its first bytes (a server may call it anything, or answer a missing file with a page). */
export function fontType(bytes: Uint8Array): string | null {
  const tag = String.fromCharCode(...bytes.slice(0, 4));
  if (tag === 'wOF2') return 'font/woff2';
  if (tag === 'wOFF') return 'font/woff';
  if (tag === 'OTTO') return 'font/otf';
  if (tag === 'true' || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) return 'font/ttf';
  return null;
}

const asDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** A font file as a data URI, or null when the link doesn't give a font. */
function fontDataUrl(url: string): Promise<string | null> {
  if (url.startsWith('data:')) return Promise.resolve(url);
  let found = fontData.get(url);
  if (!found) {
    found = fetch(url)
      .then(async (res) => {
        if (!res.ok) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        const type = fontType(bytes);
        return type ? asDataUrl(new Blob([bytes], { type })) : null;
      })
      .catch(() => null);
    fontData.set(url, found);
  }
  return found;
}

/** The face's first file that is a font. */
async function faceData(face: Face): Promise<string | null> {
  for (const url of face.urls) {
    const data = await fontDataUrl(url);
    if (data) return data;
  }
  return null;
}

/** The KaTeX fonts the drawn formula uses (each element's first font family). */
function familiesIn(el: Element): Set<string> {
  const used = new Set<string>();
  for (const node of [el, ...Array.from(el.querySelectorAll('*'))]) {
    const family = getComputedStyle(node).fontFamily.split(',')[0]?.replace(/["']/g, '').trim();
    if (family?.startsWith('KaTeX_')) used.add(family);
  }
  return used;
}

/** The stylesheet that goes in the formula's picture: KaTeX's rules and its fonts as data. */
async function formulaCss(used: Set<string>): Promise<string> {
  const { rules, faces } = readKatexStyle();
  const declared = await Promise.all(
    faces
      .filter((f) => used.has(f.family))
      .map(async (f) => {
        const data = await faceData(f);
        if (!data) throw new PictureError(`font ${f.family} ${f.weight} ${f.style} not loaded`);
        return `@font-face { font-family: ${f.family}; font-weight: ${f.weight}; font-style: ${f.style}; src: url("${data}"); }`;
      }),
  );
  return `${declared.join('\n')}\n${rules}`;
}

/**
 * Step 8.3: the KaTeX faces of these families as data (@font-face rules), for the PDF's print
 * document: it is a page of its own, and linked fonts were not loaded in time when it printed (the
 * formulas came out in Times and STIX). A face whose file can't be had is left out (its fallback
 * prints); the fonts are read once.
 */
export async function katexFontFaces(used: Set<string>): Promise<string> {
  if (!used.size) return '';
  const { faces } = readKatexStyle();
  const declared = await Promise.all(
    faces
      .filter((f) => used.has(f.family))
      .map(async (f) => {
        const data = await faceData(f);
        return data ? `@font-face { font-family: ${f.family}; font-weight: ${f.weight}; font-style: ${f.style}; font-display: block; src: url("${data}"); }` : '';
      }),
  );
  return declared.filter(Boolean).join('\n');
}

/** The KaTeX font families the formulas in `root` use (each element's first family). */
export function katexFamiliesIn(root: Element): Set<string> {
  const used = new Set<string>();
  for (const formula of Array.from(root.querySelectorAll('.katex-html'))) familiesIn(formula).forEach((f) => used.add(f));
  return used;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** An SVG as a PNG of `width` × `height` px at PICTURE_SCALE (base64). */
async function svgToPng(svg: string, width: number, height: number): Promise<string> {
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new PictureError('the SVG did not load as an image'));
  });
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;
  await img.decode?.().catch(() => {});
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * PICTURE_SCALE));
  canvas.height = Math.max(1, Math.ceil(height * PICTURE_SCALE));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PictureError('no canvas');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // WebKit can draw an SVG image before the fonts inside it are ready: drawn again a frame later.
  await nextFrame();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}

/** The SVG's own width and height (from its attributes or viewBox). */
function svgSize(markup: string): { width: number; height: number } | null {
  const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  if (!svg || svg.nodeName !== 'svg') return null;
  const box = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const width = Number(svg.getAttribute('width')) || box[2];
  const height = Number(svg.getAttribute('height')) || box[3];
  return width > 0 && height > 0 ? { width, height } : null;
}

async function graphPicture(req: Extract<DrawRequest, { kind: 'graph' }>): Promise<Picture> {
  const data = cleanGraph(req.graph);
  let markup = graphMarkup(planGraph(data).spec, req.width, req.blockId, usesDecimalComma(data, req.language));
  if (!markup) throw new PictureError('the charts module drew nothing');
  if (!/xmlns=/.test(markup.slice(0, 200))) markup = markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  const size = svgSize(markup) ?? { width: req.width, height: Math.round(req.width * 0.6) };
  // The drawing is never wider than the text (narrow pages draw at MIN_DRAW_WIDTH and scale down).
  const width = Math.min(size.width, req.width);
  const height = (size.height * width) / size.width;
  return { id: req.id, type: 'png', width, height, data: await svgToPng(markup, width, height) };
}

/** KaTeX's HTML of the formula, drawn off screen at `fontPx` so it can be measured. */
function drawnFormula(req: Extract<DrawRequest, { kind: 'formula' }>): HTMLElement {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'absolute',
    left: '-20000px',
    top: '0',
    display: 'inline-block',
    whiteSpace: 'nowrap',
    fontSize: `${req.fontPx}px`,
    lineHeight: 'normal',
    color: TEXT,
    margin: '0',
    padding: '0',
  });
  host.innerHTML = katex.renderToString(req.latex, { displayMode: req.display, throwOnError: true, output: 'html' });
  const display = host.querySelector<HTMLElement>('.katex-display');
  if (display) display.style.margin = '0';
  // Inline: a point on the baseline, to know how far the formula reaches below it. (After a display
  // formula, a block, it would start a line of its own and leave a blank band under the picture.)
  if (!req.display) {
    const baseline = document.createElement('span');
    baseline.setAttribute(BASELINE, '');
    Object.assign(baseline.style, { display: 'inline-block', width: '0', height: '0', verticalAlign: 'baseline' });
    host.appendChild(baseline);
  }
  document.body.appendChild(host);
  return host;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The part of the drawn formula the picture keeps: KaTeX's own box (its pieces' boxes together, each
 * as tall as its strut makes it: the formula's height above the baseline and depth below), in whole
 * pixels with `pad` around for the glyphs' soft edges, from `origin`. Not the line around it (a line
 * of text is taller than x², and an inline formula's own element is only the font's line, which a
 * fraction reaches beyond).
 */
export function cropBox(parts: Box[], origin: { left: number; top: number }, pad = 1): { x: number; y: number; width: number; height: number } {
  const seen = parts.filter((p) => p.right > p.left && p.bottom > p.top);
  const left = Math.min(...seen.map((p) => p.left)) - origin.left;
  const top = Math.min(...seen.map((p) => p.top)) - origin.top;
  const right = Math.max(...seen.map((p) => p.right)) - origin.left;
  const bottom = Math.max(...seen.map((p) => p.bottom)) - origin.top;
  const x = Math.floor(left) - pad;
  const y = Math.floor(top) - pad;
  return { x, y, width: Math.ceil(right) + pad - x, height: Math.ceil(bottom) + pad - y };
}

/** The pieces of KaTeX's drawing (`.katex-base`, an equation's tag), each with its strut's height and depth. */
const formulaParts = (host: Element): Box[] =>
  Array.from(host.querySelectorAll('.katex-html > :not(.katex-newline)'), (el) => el.getBoundingClientRect());

async function formulaPicture(req: Extract<DrawRequest, { kind: 'formula' }>): Promise<Picture> {
  const host = drawnFormula(req);
  try {
    await (document.fonts?.ready ?? Promise.resolve()).catch(() => {});
    const used = familiesIn(host);
    const css = await formulaCss(used);
    // Fonts the formula just asked for.
    await (document.fonts?.ready ?? Promise.resolve()).catch(() => {});
    const whole = host.getBoundingClientRect();
    const parts = formulaParts(host);
    if (!parts.some((p) => p.right > p.left && p.bottom > p.top)) throw new PictureError('KaTeX drew nothing');
    const crop = cropBox(parts, whole);
    const baseline = host.querySelector(`[${BASELINE}]`);
    // Inline: how far the picture reaches below the text's baseline (Word sets a picture on the
    // baseline; the builder lowers it by this much, so the formula's own baseline is on the line).
    const depth = baseline ? Math.max(0, crop.y + crop.height - (baseline.getBoundingClientRect().top - whole.top)) : 0;
    baseline?.remove();
    const html = new XMLSerializer().serializeToString(host.firstElementChild!);
    // The whole drawing, laid out as it was measured (no padding), seen through the crop.
    const fullWidth = Math.ceil(whole.width) + 1;
    const fullHeight = Math.ceil(whole.height) + 1;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${crop.width}" height="${crop.height}" viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}">` +
      `<foreignObject x="0" y="0" width="${fullWidth}" height="${fullHeight}">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="display:inline-block;margin:0;padding:0;white-space:nowrap;font-size:${req.fontPx}px;line-height:normal;color:${TEXT}">` +
      `<style>${css.replace(/</g, '\\3c ')}</style>${html}</div></foreignObject></svg>`;
    return { id: req.id, type: 'png', width: crop.width, height: crop.height, depth, data: await svgToPng(svg, crop.width, crop.height) };
  } finally {
    host.remove();
  }
}

/** Why a picture failed: our own words, or only the error's kind (KaTeX's messages quote the formula). */
const reasonOf = (kind: DrawRequest['kind'], err: unknown) =>
  `${kind}: ${err instanceof PictureError ? err.message : err instanceof Error ? err.name : 'unknown'}`;

/**
 * Draws the formulas and graphs; one that can't be drawn is left out (the builder writes its text).
 * `reasons`: why, one per failed picture, for the Chrome check and the console (never the formula).
 */
export async function makePictures(requests: DrawRequest[]): Promise<{ pictures: Picture[]; failed: string[]; reasons: string[] }> {
  const pictures: Picture[] = [];
  const failed: string[] = [];
  const reasons: string[] = [];
  for (const req of requests) {
    try {
      pictures.push(req.kind === 'formula' ? await formulaPicture(req) : await graphPicture(req));
    } catch (err) {
      failed.push(req.id);
      reasons.push(reasonOf(req.kind, err));
    }
  }
  return { pictures, failed, reasons };
}
