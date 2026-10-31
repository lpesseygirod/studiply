import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ILevelsOptions,
  type IParagraphOptions,
  type IRunOptions,
  type ParagraphChild,
} from 'docx';
import type { JSONContent } from '@tiptap/core';

import { DocColors, LightColors } from '../../constants/colors';
import { canDraw, laterLine } from '../graph/charts';
import { cleanGraph, planGraph } from '../graph/data';
import { cleanPageSetup, PAPER, type PageSetup } from '../page/pageSetup';
import { calloutLabel } from '../schema/callout';
import { DEFAULT_LINE_SPACING, INDENT_EM } from '../schema/blocks';
import { DEFAULT_SIZE, FONTS } from '../schema/fonts';
import { markChipLabel } from '../schema/markChip';
import { moduleLabel } from '../schema/studyModule';
import { chipLabel } from '../schema/timestampChip';
import { rgbOf } from '../paste/rules';
import type { DocJSON } from '../types';
import { numberPlace, withTabHeading, type PrintTab } from './printPages';
import { blockFontPx, formulaKey, graphKey, inlineFormulaPx, photoKey, textWidthPx, type Picture } from './docxPictures';

/**
 * The Word export (step 4.8b): a document's tabs as a .docx, built from
 * their JSON with the `docx` library, on both devices (no DOM).
 *
 * - Each tab is a section with the document's paper, orientation and
 *   margins; a section starts a new page and the page numbers run on
 *   through the file. All tabs: each tab starts with its name as a Heading 1.
 * - Text: Title and Heading 1–3 as Word's own styles (so Word's navigation
 *   and a re-import know them), bold, italic, underline, strike, colours,
 *   highlights (as shading, in Studiply's colour), fonts, sizes, alignment,
 *   line spacing, indents, links, line breaks.
 * - Bulleted and numbered lists as Word lists (each list numbered from its
 *   own start); checklists as ☐ / ☑ lines; tables with their cell colours and
 *   column widths; page breaks.
 * - Studiply's blocks: callouts and formula cards as shaded lines with a
 *   coloured edge and their label; time and mark chips as their text on
 *   their colour; photos, formulas and graphs as pictures (`pictures`, made
 *   by the device: docxPictures.ts). A formula that couldn't be drawn is its
 *   LaTeX in Word's maths font, a missing photo is left out.
 * - Page numbers in the footer (or the header, top right) where the page
 *   setup puts them, bottom centre when it has them off, as the PDF does.
 */

export interface WordOptions {
  setup: PageSetup;
  numbers: boolean;
  tabHeadings: boolean;
  /** The document's name: the file's title property. */
  title: string;
  /** The document's language (graphs write decimals with a comma in Spanish). */
  language?: string | null;
}

type Block = Paragraph | Table;

/** CSS px → twentieths of a point (96 px an inch, 1440 twips). */
const twips = (px: number) => Math.round(px * 15);
const cmTwips = (cm: number) => Math.round((cm * 1440) / 2.54);
/** CSS px → Word's half points. */
const halfPoints = (px: number) => Math.round(px * 1.5);

const hex = (color: string) => color.replace('#', '').toUpperCase();
/** A CSS colour as Word's hex, or null (transparent, unknown). */
function wordColor(css: unknown): string | null {
  const rgb = typeof css === 'string' ? rgbOf(css) : null;
  return rgb ? rgb.map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase() : null;
}

/** The document's fonts in Word: the closest font every Mac, iPad and PC has. */
const WORD_FONTS: Record<string, string> = { system: 'Arial', rounded: 'Arial Rounded MT Bold', serif: 'Georgia', mono: 'Courier New' };
const BODY_FONT = WORD_FONTS.system;
const wordFont = (css: unknown): string | undefined => {
  const choice = FONTS.find((f) => f.css !== null && f.css === css);
  return choice ? WORD_FONTS[choice.key] : undefined;
};

const TEXT = hex(LightColors.text.primary);
const SECONDARY = hex(LightColors.text.secondary);
const BORDER = hex(LightColors.border);

/** What a block is drawn inside: the room it has, and a callout's or card's box. */
interface Ctx {
  /** The room for pictures (px). */
  width: number;
  box?: { fill: string; edge: string };
  quote?: boolean;
  /** Extra left indent (px), as the list item's text lines up. */
  indent?: number;
}

const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED } as const;
const alignOf = (value: unknown) => (typeof value === 'string' && value in ALIGN ? ALIGN[value as keyof typeof ALIGN] : undefined);

/** Line spacing (1, 1.15, 1.5, 2) in Word's 240ths of a line; the page's 1.5 when the block has none. */
const lineOf = (value: unknown) => Math.round((Number(value) > 0 ? Number(value) : DEFAULT_LINE_SPACING) * 240);

const BULLETS = 'studiply-bullets';
const NUMBERS = 'studiply-numbers';
const BULLET_CHARS = ['•', '◦', '▪'];
const NUMBER_FORMATS = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
/** A list level's indent: 0.75 cm a level, the marker hanging in it. */
const levelIndent = (level: number) => ({ left: cmTwips(0.75 * (level + 1)), hanging: cmTwips(0.6) });

function bulletLevels(): ILevelsOptions[] {
  return Array.from({ length: 9 }, (_, level) => ({
    level,
    format: LevelFormat.BULLET,
    text: BULLET_CHARS[level % BULLET_CHARS.length],
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: levelIndent(level) } },
  }));
}

function numberLevels(start: number): ILevelsOptions[] {
  return Array.from({ length: 9 }, (_, level) => ({
    level,
    format: NUMBER_FORMATS[level % NUMBER_FORMATS.length],
    text: `%${level + 1}.`,
    start: level === 0 ? start : 1,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: levelIndent(level) } },
  }));
}

/** Builds one .docx; it keeps the numbering it needs while the tabs are walked. */
class WordBuilder {
  /** Numbered lists by their start (each start a definition), and the lists made so far (each its own instance). */
  private starts = new Set<number>([1]);
  private instance = 0;

  /**
   * `room`: the text's width on the page (px), which graphs are drawn at; `language`: the
   * document's (both are in a graph's picture key).
   */
  constructor(
    private pictures: Map<string, Picture>,
    private room: number,
    private language: string | null,
  ) {}

  numbering() {
    return {
      config: [
        { reference: BULLETS, levels: bulletLevels() },
        ...[...this.starts].map((start) => ({ reference: start === 1 ? NUMBERS : `${NUMBERS}-${start}`, levels: numberLevels(start) })),
      ],
    };
  }

  // ── Text ──────────────────────────────────────────────────────────

  private runOptions(node: JSONContent, fontPx: number | null): IRunOptions {
    const marks = node.marks ?? [];
    const has = (type: string) => marks.some((m) => m.type === type);
    const style = marks.find((m) => m.type === 'textStyle')?.attrs ?? {};
    const highlight = marks.find((m) => m.type === 'highlight')?.attrs;
    const size = typeof style.fontSize === 'string' ? /^(\d+(?:\.\d+)?)px$/.exec(style.fontSize)?.[1] : undefined;
    const color = wordColor(style.color);
    const fill = highlight ? (wordColor(highlight.color) ?? hex(DocColors.highlight[0].value)) : null;
    const code = has('code');
    return {
      bold: has('bold') || undefined,
      italics: has('italic') || undefined,
      underline: has('underline') || has('link') ? {} : undefined,
      strike: has('strike') || undefined,
      superScript: has('superscript') || undefined,
      subScript: has('subscript') || undefined,
      color: color ?? (has('link') ? hex(LightColors.accentDark) : undefined),
      shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : code ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(LightColors.cardMuted) } : undefined,
      font: code ? WORD_FONTS.mono : wordFont(style.fontFamily),
      size: size ? halfPoints(Number(size)) : fontPx ? halfPoints(fontPx) : undefined,
    };
  }

  private picture(id: string, width?: number, height?: number, run?: IRunOptions): ImageRun | null {
    const p = this.pictures.get(id);
    if (!p) return null;
    const w = width ?? p.width;
    const h = height ?? p.height;
    return new ImageRun({ type: p.type, data: p.data, transformation: { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) }, ...(run ? { run } : {}) });
  }

  /** A photo at its width (% of the room, else its own size but never wider than the room). */
  private photo(node: JSONContent, room: number): ImageRun | null {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
    const p = src ? this.pictures.get(photoKey(src)) : undefined;
    if (!p) return null;
    const pct = typeof node.attrs?.width === 'number' ? node.attrs.width : null;
    const width = Math.min(room, pct ? (room * pct) / 100 : p.width);
    return this.picture(photoKey(src), width, (p.height * width) / p.width);
  }

  private chip(text: string, colors: { bg: string; text: string }, fontPx: number): TextRun {
    return new TextRun({ text: ` ${text} `, bold: true, color: hex(colors.text), shading: { type: ShadingType.CLEAR, color: 'auto', fill: hex(colors.bg) }, size: halfPoints(fontPx * 0.8) });
  }

  /** A textblock's inline content as Word runs; `fontPx`: a size the runs must carry (null: the style's). */
  inline(block: JSONContent, ctx: Ctx, fontPx: number | null): ParagraphChild[] {
    const out: ParagraphChild[] = [];
    let link: { href: string; runs: TextRun[] } | null = null;
    const flush = () => {
      if (link) out.push(new ExternalHyperlink({ link: link.href, children: link.runs }));
      link = null;
    };
    const textPx = fontPx ?? blockFontPx(block);
    for (const node of block.content ?? []) {
      if (node.type === 'text') {
        const run = new TextRun({ text: node.text ?? '', ...this.runOptions(node, fontPx) });
        const href = node.marks?.find((m) => m.type === 'link')?.attrs?.href;
        if (typeof href === 'string' && /^(https?:|mailto:)/i.test(href)) {
          if (link && link.href !== href) flush();
          if (!link) link = { href, runs: [] };
          link.runs.push(run);
          continue;
        }
        flush();
        out.push(run);
        continue;
      }
      flush();
      if (node.type === 'hardBreak') out.push(new TextRun({ text: '', break: 1 }));
      else if (node.type === 'inlineMath') out.push(this.inlineFormula(node, block));
      else if (node.type === 'inlineImage') {
        const photo = this.photo(node, ctx.width);
        if (photo) out.push(photo);
      } else if (node.type === 'markChip') {
        const kind = String(node.attrs?.kind ?? 'important') as keyof typeof DocColors.markChip;
        out.push(this.chip(markChipLabel(node.attrs ?? {}), DocColors.markChip[kind] ?? DocColors.markChip.important, textPx));
      } else if (node.type === 'timestampChip') {
        out.push(this.chip(chipLabel(Number(node.attrs?.ms) || 0), DocColors.timestamp, textPx));
      } else if (node.content?.length) {
        out.push(...this.inline(node, ctx, fontPx));
      }
    }
    flush();
    return out;
  }

  private inlineFormula(node: JSONContent, block: JSONContent): ParagraphChild {
    const latex = String(node.attrs?.latex ?? '');
    const p = this.pictures.get(formulaKey(latex, false, inlineFormulaPx(node, block)));
    // Lowered by how far the formula reaches below the line (a fraction's denominator), in Word's
    // half points as a plain number: every Word reads that (a "-3pt" measure only newer ones).
    const run = p?.depth ? { position: String(-halfPoints(p.depth)) as NonNullable<IRunOptions['position']> } : undefined;
    return (p && this.picture(p.id, undefined, undefined, run)) ?? new TextRun({ text: latex, font: 'Cambria Math', italics: true });
  }

  // ── Blocks ────────────────────────────────────────────────────────

  /** A paragraph in its context: a callout's shading and edge, a quote's bar, the list's indent. */
  private para(options: IParagraphOptions & { indentPx?: number }, ctx: Ctx): Paragraph {
    const { indentPx = 0, ...rest } = options;
    const left = indentPx + (ctx.indent ?? 0) + (ctx.quote ? 18 : 0);
    const edge = ctx.box ? { color: ctx.box.edge, size: 24 } : ctx.quote ? { color: BORDER, size: 18 } : null;
    return new Paragraph({
      ...rest,
      ...(left && !rest.numbering ? { indent: { left: twips(left) } } : {}),
      ...(ctx.box ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: ctx.box.fill } } : {}),
      ...(edge ? { border: { left: { style: BorderStyle.SINGLE, color: edge.color, size: edge.size, space: 8 } } } : {}),
    });
  }

  /** A textblock: paragraph, heading or Title. */
  private textblock(node: JSONContent, ctx: Ctx, extra: IParagraphOptions = {}): Paragraph {
    const attrs = node.attrs ?? {};
    const level = Math.min(3, Math.max(1, Number(attrs.level) || 1));
    const heading = node.type === 'heading' ? [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][level - 1] : node.type === 'title' ? HeadingLevel.TITLE : undefined;
    const indent = Math.max(0, Number(attrs.indent) || 0) * INDENT_EM * DEFAULT_SIZE;
    return this.para(
      {
        heading,
        alignment: alignOf(attrs.textAlign),
        ...(heading ? {} : { spacing: { line: lineOf(attrs.lineSpacing), after: 120 } }),
        ...(heading && attrs.lineSpacing ? { spacing: { line: lineOf(attrs.lineSpacing) } } : {}),
        indentPx: indent,
        children: this.inline(node, ctx, null),
        ...extra,
      },
      ctx,
    );
  }

  private list(node: JSONContent, ctx: Ctx, level: number): Block[] {
    const out: Block[] = [];
    const ordered = node.type === 'orderedList';
    const task = node.type === 'taskList';
    let reference = BULLETS;
    let instance: number | undefined;
    if (ordered) {
      const start = Math.max(0, Math.round(Number(node.attrs?.start) || 1));
      this.starts.add(start);
      reference = start === 1 ? NUMBERS : `${NUMBERS}-${start}`;
      instance = ++this.instance;
    }
    for (const item of node.content ?? []) {
      let first = true;
      for (const child of item.content ?? []) {
        if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList') {
          out.push(...this.list(child, ctx, level + 1));
          continue;
        }
        const textLike = child.type === 'paragraph' || child.type === 'heading' || child.type === 'title';
        if (!textLike) {
          out.push(...this.blocks([child], { ...ctx, indent: (ctx.indent ?? 0) + 28 * (level + 1) }));
          continue;
        }
        if (task) {
          // The box before the line's own text; the item's next lines under its text.
          out.push(
            first
              ? this.withLeading(child, ctx, level, new TextRun({ text: item.attrs?.checked ? '☑ ' : '☐ ' }))
              : this.textblock(child, { ...ctx, indent: (ctx.indent ?? 0) + 28 * (level + 1) }),
          );
        } else if (first) {
          out.push(this.textblock(child, ctx, { numbering: { reference, level: Math.min(8, level), ...(instance ? { instance } : {}) } }));
        } else {
          out.push(this.textblock(child, { ...ctx, indent: (ctx.indent ?? 0) + 28 * (level + 1) }));
        }
        first = false;
      }
    }
    return out;
  }

  /** A checklist line: its box, then its text. */
  private withLeading(node: JSONContent, ctx: Ctx, level: number, lead: TextRun): Paragraph {
    const attrs = node.attrs ?? {};
    return this.para(
      { alignment: alignOf(attrs.textAlign), spacing: { line: lineOf(attrs.lineSpacing), after: 60 }, indentPx: 28 * level, children: [lead, ...this.inline(node, ctx, null)] },
      ctx,
    );
  }

  private table(node: JSONContent, ctx: Ctx): Table {
    const rows = node.content ?? [];
    const firstRow = rows[0]?.content ?? [];
    const cols = Math.max(1, firstRow.reduce((n, cell) => n + Math.max(1, Number(cell.attrs?.colspan) || 1), 0));
    // Widths: the ones dragged on the laptop (px), the rest sharing what is left.
    const given: (number | null)[] = [];
    for (const cell of firstRow) {
      const span = Math.max(1, Number(cell.attrs?.colspan) || 1);
      const widths = Array.isArray(cell.attrs?.colwidth) ? (cell.attrs.colwidth as unknown[]) : [];
      for (let i = 0; i < span; i++) given.push(typeof widths[i] === 'number' && (widths[i] as number) > 0 ? (widths[i] as number) : null);
    }
    const fixed = given.reduce<number>((s, w) => s + (w ?? 0), 0);
    const free = given.filter((w) => w === null).length;
    const share = free ? Math.max(40, (ctx.width - fixed) / free) : 0;
    let widths = given.map((w) => w ?? share);
    const total = widths.reduce((s, w) => s + w, 0);
    if (total > ctx.width) widths = widths.map((w) => (w * ctx.width) / total);
    const border = { style: BorderStyle.SINGLE, size: 4, color: BORDER };
    return new Table({
      width: { size: twips(widths.reduce((s, w) => s + w, 0)), type: WidthType.DXA },
      columnWidths: widths.map(twips),
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows: rows.map(
        (row, r) =>
          new TableRow({
            tableHeader: r === 0 && (row.content ?? []).every((c) => c.type === 'tableHeader') ? true : undefined,
            children: (row.content ?? []).map((cell, c) => {
              const span = Math.max(1, Number(cell.attrs?.colspan) || 1);
              const room = widths.slice(c, c + span).reduce((s, w) => s + w, 0) || ctx.width / cols;
              const fill = wordColor(cell.attrs?.backgroundColor);
              const inner: Ctx = { width: Math.max(20, room - 16) };
              const children = this.blocks(cell.content ?? [], inner).map((b) => b);
              return new TableCell({
                children: children.length ? children : [new Paragraph({})],
                columnSpan: span > 1 ? span : undefined,
                rowSpan: Number(cell.attrs?.rowspan) > 1 ? Number(cell.attrs?.rowspan) : undefined,
                shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
              });
            }),
          }),
      ),
    });
  }

  /** A shaded box (callout, formula card): its label line, then its blocks, all with its fill and edge. */
  private boxed(label: string, colors: { bg: string; border: string; label: string }, content: JSONContent[], ctx: Ctx, caps: boolean): Block[] {
    const box: Ctx = { ...ctx, box: { fill: hex(colors.bg), edge: hex(colors.border) }, width: Math.max(40, ctx.width - 24) };
    const head = this.para(
      { spacing: { after: 60 }, children: [new TextRun({ text: label, bold: true, allCaps: caps || undefined, color: hex(colors.label), size: halfPoints(DEFAULT_SIZE * 0.8) })], keepNext: true },
      box,
    );
    return [head, ...this.blocks(content, box)];
  }

  blocks(nodes: JSONContent[], ctx: Ctx): Block[] {
    const out: Block[] = [];
    for (const node of nodes) {
      switch (node.type) {
        case 'paragraph':
        case 'heading':
        case 'title':
          out.push(this.textblock(node, ctx));
          break;
        case 'bulletList':
        case 'orderedList':
        case 'taskList':
          out.push(...this.list(node, ctx, 0));
          break;
        case 'blockquote':
          out.push(...this.blocks(node.content ?? [], { ...ctx, quote: true }));
          break;
        case 'pageBreak':
          out.push(new Paragraph({ children: [new PageBreak()] }));
          break;
        case 'table':
          out.push(this.table(node, ctx));
          break;
        case 'blockMath': {
          const latex = String(node.attrs?.latex ?? '');
          const p = this.pictures.get(formulaKey(latex, true, DEFAULT_SIZE));
          const width = p ? Math.min(p.width, ctx.width) : 0;
          const picture = p ? this.picture(p.id, width, (p.height * width) / p.width) : null;
          out.push(this.para({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 120 }, children: [picture ?? new TextRun({ text: latex, font: 'Cambria Math', italics: true })] }, ctx));
          break;
        }
        case 'graph': {
          const attrs = node.attrs ?? {};
          const p = this.pictures.get(graphKey(attrs, this.room, this.language));
          const width = p ? Math.min(p.width, ctx.width) : 0;
          const picture = p ? this.picture(p.id, width, (p.height * width) / p.width) : null;
          // No picture: its title; a kind the charts module doesn't draw yet (8.2): its line, as on the page.
          const data = cleanGraph(attrs);
          const words = canDraw(planGraph(data).spec) ? data.title || 'Graph' : laterLine(data);
          out.push(this.para({ spacing: { before: 60, after: 120 }, children: picture ? [picture] : [new TextRun({ text: words, italics: true, color: SECONDARY })] }, ctx));
          break;
        }
        case 'image': {
          const photo = this.photo(node, ctx.width);
          if (photo) out.push(this.para({ alignment: alignOf(node.attrs?.align), spacing: { after: 120 }, children: [photo] }, ctx));
          break;
        }
        case 'callout': {
          const kind = String(node.attrs?.kind ?? 'definition') as keyof typeof DocColors.callout;
          out.push(...this.boxed(calloutLabel(node.attrs ?? {}), DocColors.callout[kind] ?? DocColors.callout.definition, node.content ?? [], ctx, true));
          break;
        }
        case 'formulaCard': {
          const c = DocColors.formulaCard;
          out.push(...this.boxed(String(node.attrs?.title || 'Formula'), { bg: c.bg, border: c.border, label: c.title }, node.content ?? [], ctx, false));
          break;
        }
        case 'studyModule': {
          // Step 8.1: the summary's text modules as a box with their label; their tables, lists and lines as
          // usual (a code module's lines carry the code mark: monospace in Word).
          const m = DocColors.module;
          out.push(...this.boxed(moduleLabel(node.attrs ?? {}), { bg: m.bg, border: m.border, label: m.label }, node.content ?? [], ctx, true));
          break;
        }
        default:
          // Anything else that holds blocks (a future block): its content.
          if (node.content?.length && !node.content.some((c) => c.type === 'text')) out.push(...this.blocks(node.content, ctx));
          else if (node.content?.length) out.push(this.textblock({ ...node, type: 'paragraph' }, ctx));
      }
    }
    return out;
  }
}

/** Word's number field, centred or on the right. */
function numberParagraph(right: boolean): Paragraph {
  return new Paragraph({
    alignment: right ? AlignmentType.RIGHT : AlignmentType.CENTER,
    children: [new TextRun({ children: [PageNumber.CURRENT], size: halfPoints(11), color: SECONDARY })],
  });
}

/** The .docx of the tabs (built, not yet written: Packer writes it). */
export function buildDocx(tabs: PrintTab[], options: WordOptions, pictures: Picture[]): Document {
  const setup = cleanPageSetup(options.setup);
  const paper = PAPER[setup.size];
  const m = setup.margins;
  const portrait = setup.orientation === 'portrait';
  const room = textWidthPx(setup);
  const builder = new WordBuilder(new Map(pictures.map((p) => [p.id, p])), room, options.language ?? null);
  const place = numberPlace(setup);
  const numbers = options.numbers
    ? place === 'top-right'
      ? { headers: { default: new Header({ children: [numberParagraph(true)] }) } }
      : { footers: { default: new Footer({ children: [numberParagraph(place === 'bottom-right')] }) } }
    : {};

  const sections = tabs.map((tab) => {
    const content: DocJSON = options.tabHeadings ? withTabHeading(tab) : tab.content;
    const children = builder.blocks(content.content ?? [], { width: room });
    return {
      properties: {
        page: {
          size: { width: cmTwips(paper.width), height: cmTwips(paper.height), orientation: portrait ? PageOrientation.PORTRAIT : PageOrientation.LANDSCAPE },
          margin: { top: cmTwips(m.top), bottom: cmTwips(m.bottom), left: cmTwips(m.left), right: cmTwips(m.right), header: cmTwips(Math.min(1.25, m.top / 2)), footer: cmTwips(Math.min(1.25, m.bottom / 2)) },
        },
      },
      ...numbers,
      children: children.length ? children : [new Paragraph({})],
    };
  });

  const heading = (em: number, extra: { color?: string; bold?: boolean } = {}) => ({
    run: { size: halfPoints(DEFAULT_SIZE * em), bold: extra.bold ?? true, color: extra.color ?? TEXT, font: BODY_FONT },
    paragraph: { spacing: { before: 240, after: 120, line: 300 }, keepNext: true },
  });
  return new Document({
    title: options.title,
    creator: 'Studiply',
    styles: {
      default: {
        document: { run: { font: BODY_FONT, size: halfPoints(DEFAULT_SIZE), color: TEXT } },
        title: heading(2.1),
        heading1: heading(1.75),
        heading2: heading(1.4),
        heading3: heading(1.15, { color: SECONDARY }),
        hyperlink: { run: { color: hex(LightColors.accentDark), underline: {} } },
      },
    },
    numbering: builder.numbering(),
    sections,
  });
}
