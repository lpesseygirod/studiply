/**
 * The spike's paste report: what a paste from Google Docs or Word
 * had, and what the document kept. Formatting is counted in characters
 * (robust to how each app splits its runs), structure in blocks.
 *
 * Runs in the editor (the iPhone's WebView or the laptop page), on the
 * clipboard HTML and the slice ProseMirror made from it. Only counts leave
 * the editor; the pasted text itself is never stored or logged.
 */

export type PasteCounts = {
  headings: number;
  listItems: number;
  tables: number;
  cells: number;
  images: number;
  bold: number;
  italic: number;
  underline: number;
  links: number;
  colour: number;
  highlight: number;
};

export type PasteSource = 'Google Docs' | 'Word' | 'other';

export type PasteReport = {
  /** Increases with every paste, so a listener can tell a new report. */
  id: number;
  source: PasteSource;
  had: PasteCounts;
  kept: PasteCounts;
};

export const PASTE_FIELDS: readonly { key: keyof PasteCounts; label: string; chars: boolean }[] = [
  { key: 'headings', label: 'Headings', chars: false },
  { key: 'listItems', label: 'List items', chars: false },
  { key: 'tables', label: 'Tables', chars: false },
  { key: 'cells', label: 'Cells', chars: false },
  { key: 'images', label: 'Images', chars: false },
  { key: 'bold', label: 'Bold', chars: true },
  { key: 'italic', label: 'Italic', chars: true },
  { key: 'underline', label: 'Underline', chars: true },
  { key: 'links', label: 'Links', chars: true },
  { key: 'colour', label: 'Colour', chars: true },
  { key: 'highlight', label: 'Highlight', chars: true },
];

export function emptyCounts(): PasteCounts {
  return { headings: 0, listItems: 0, tables: 0, cells: 0, images: 0, bold: 0, italic: 0, underline: 0, links: 0, colour: 0, highlight: 0 };
}

export function pasteSource(html: string): PasteSource {
  if (/docs-internal-guid/.test(html)) return 'Google Docs';
  if (/urn:schemas-microsoft-com:office|class="?Mso|mso-/i.test(html)) return 'Word';
  return 'other';
}

// ---- What the clipboard had (DOM) ----

type Style = Pick<CSSStyleDeclaration, 'fontWeight' | 'fontStyle' | 'textDecoration' | 'textDecorationLine' | 'color' | 'backgroundColor'>;

/** Black, white, transparent and "inherit" are what apps write on plain text. */
function plainColour(value: string): boolean {
  const v = value.replace(/\s+/g, '').toLowerCase();
  return !v || v === 'inherit' || v === 'initial' || v === 'transparent' || v === 'windowtext' || v === 'black' || v === 'white'
    || /^#(000|000000|fff|ffffff)$/.test(v) || /^rgba?\((0,0,0|255,255,255)(,1)?\)$/.test(v) || /^rgba\(\d+,\d+,\d+,0\)$/.test(v);
}

function isBold(tag: string, style: Style): boolean {
  const weight = style.fontWeight;
  if (weight === 'normal' || weight === '400') return false; // Google Docs wraps everything in <b style="font-weight:normal">
  return tag === 'B' || tag === 'STRONG' || weight === 'bold' || Number(weight) >= 600;
}

type Inherited = { bold: boolean; italic: boolean; underline: boolean; link: boolean; colour: boolean; highlight: boolean };

/** Counts a parsed clipboard document. Word's list paragraphs (mso-list) count as list items. */
export function countHtml(root: ParentNode): PasteCounts {
  const counts = emptyCounts();
  const walk = (node: Node, inherited: Inherited) => {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      const n = text.length;
      if (inherited.bold) counts.bold += n;
      if (inherited.italic) counts.italic += n;
      if (inherited.underline) counts.underline += n;
      if (inherited.link) counts.links += n;
      if (inherited.colour) counts.colour += n;
      if (inherited.highlight) counts.highlight += n;
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'META' || tag === 'TITLE') return;
    const style = (el.style ?? {}) as Style;
    const styleAttr = el.getAttribute('style') ?? '';
    if (/^H[1-6]$/.test(tag)) counts.headings += 1;
    if (tag === 'LI' || (tag === 'P' && /mso-list:\s*l\d/i.test(styleAttr))) counts.listItems += 1;
    if (tag === 'TABLE') counts.tables += 1;
    if (tag === 'TD' || tag === 'TH') counts.cells += 1;
    if (tag === 'IMG') counts.images += 1;
    const decoration = `${style.textDecoration ?? ''} ${style.textDecorationLine ?? ''}`;
    const next: Inherited = {
      bold: style.fontWeight === 'normal' || style.fontWeight === '400' ? false : inherited.bold || isBold(tag, style),
      italic: inherited.italic || tag === 'I' || tag === 'EM' || style.fontStyle === 'italic',
      underline: inherited.underline || tag === 'U' || /underline/.test(decoration),
      link: inherited.link || (tag === 'A' && !!el.getAttribute('href')),
      colour: style.color ? !plainColour(style.color) : inherited.colour,
      highlight: inherited.highlight || tag === 'MARK' || (!!style.backgroundColor && !plainColour(style.backgroundColor)),
    };
    el.childNodes.forEach((child) => walk(child, next));
  };
  root.childNodes.forEach((child) => walk(child, { bold: false, italic: false, underline: false, link: false, colour: false, highlight: false }));
  return counts;
}

// ---- What the document kept (ProseMirror JSON of the pasted slice) ----

type JsonNode = { type?: string; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: JsonNode[] };

export function countSlice(nodes: readonly JsonNode[]): PasteCounts {
  const counts = emptyCounts();
  const walk = (node: JsonNode) => {
    switch (node.type) {
      case 'heading': counts.headings += 1; break;
      case 'listItem':
      case 'taskItem': counts.listItems += 1; break;
      case 'table': counts.tables += 1; break;
      case 'tableCell':
      case 'tableHeader': counts.cells += 1; break;
      case 'image': counts.images += 1; break;
    }
    if (node.type === 'text' && node.text) {
      const n = node.text.replace(/\s+/g, ' ').trim().length;
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') counts.bold += n;
        if (mark.type === 'italic') counts.italic += n;
        if (mark.type === 'underline') counts.underline += n;
        if (mark.type === 'link') counts.links += n;
        if (mark.type === 'highlight') counts.highlight += n;
        if (mark.type === 'textStyle' && typeof mark.attrs?.color === 'string' && !plainColour(mark.attrs.color)) counts.colour += n;
      }
    }
    node.content?.forEach(walk);
  };
  nodes.forEach(walk);
  return counts;
}

/** "Headings 3 → 3 · Bold 120 → 120 ch · Colour 40 → 0 ch"; only what the paste had. */
export function pasteReportLine(report: Pick<PasteReport, 'source' | 'had' | 'kept'>): string {
  const parts = PASTE_FIELDS.filter(({ key }) => report.had[key] > 0 || report.kept[key] > 0).map(
    ({ key, label, chars }) => `${label} ${report.had[key]} → ${report.kept[key]}${chars ? ' ch' : ''}`,
  );
  return `${report.source}: ${parts.length ? parts.join(' · ') : 'plain text'}`;
}

/** The fields where the document kept less than the paste had. */
export function pasteLosses(report: Pick<PasteReport, 'had' | 'kept'>): (keyof PasteCounts)[] {
  return PASTE_FIELDS.filter(({ key }) => report.kept[key] < report.had[key]).map(({ key }) => key);
}
