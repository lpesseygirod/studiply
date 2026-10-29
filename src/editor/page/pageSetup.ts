/**
 * Page setup (pulled forward from 4.7, Lea after test D), Google Docs style:
 * paper size, orientation, margins, page numbers and the gap between pages.
 * Saved per document (`documents.page_setup`), so the page view and later
 * the export (4.8) follow it. Margins are in cm (as in Spain); everything
 * the view draws is in CSS px at 96 per inch.
 */

export type PaperSize = 'a4' | 'letter';
export type Orientation = 'portrait' | 'landscape';
export type PageNumbers = 'off' | 'bottom-center' | 'bottom-right' | 'top-right';
export type MarginPreset = 'normal' | 'narrow' | 'wide';

/** In cm. */
export interface Margins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PageSetup {
  size: PaperSize;
  orientation: Orientation;
  margins: Margins;
  numbers: PageNumbers;
  /** Between pages on screen, px. */
  gap: number;
}

/** Paper in cm, portrait. */
export const PAPER: Record<PaperSize, { label: string; width: number; height: number }> = {
  a4: { label: 'A4 (21 × 29.7 cm)', width: 21, height: 29.7 },
  letter: { label: 'Letter (21.59 × 27.94 cm)', width: 21.59, height: 27.94 },
};

/** Word's presets. */
export const MARGIN_PRESETS: Record<MarginPreset, { label: string; margins: Margins }> = {
  normal: { label: 'Normal', margins: { top: 2.54, bottom: 2.54, left: 2.54, right: 2.54 } },
  narrow: { label: 'Narrow', margins: { top: 1.27, bottom: 1.27, left: 1.27, right: 1.27 } },
  wide: { label: 'Wide', margins: { top: 2.54, bottom: 2.54, left: 5.08, right: 5.08 } },
};

export const PAGE_NUMBERS: { value: PageNumbers; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'bottom-center', label: 'Bottom centre' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'top-right', label: 'Top right' },
];

export const PAGE_GAPS: { value: number; label: string }[] = [
  { value: 0, label: 'None' },
  { value: 12, label: 'Small' },
  { value: 24, label: 'Medium' },
  { value: 48, label: 'Large' },
];

export const DEFAULT_PAGE_SETUP: PageSetup = {
  size: 'a4',
  orientation: 'portrait',
  margins: MARGIN_PRESETS.normal.margins,
  numbers: 'bottom-center',
  gap: 24,
};

/** The text area is at least this, each way (cm). */
export const MIN_TEXT_CM = 5;
const MAX_MARGIN_CM = 10;
const PX_PER_CM = 96 / 2.54;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The paper as it lies (landscape turns it). */
export function paperCm(setup: Pick<PageSetup, 'size' | 'orientation'>): { width: number; height: number } {
  const p = PAPER[setup.size];
  return setup.orientation === 'landscape' ? { width: p.height, height: p.width } : { width: p.width, height: p.height };
}

/**
 * Margins that fit the paper: none below 0 or above 10 cm, and a text area
 * of at least 5 × 5 cm (a pair that leaves less is lowered in proportion).
 * `lowered` says when anything changed, for a note in the form.
 */
export function fitMargins(margins: Margins, setup: Pick<PageSetup, 'size' | 'orientation'>): { margins: Margins; lowered: boolean } {
  const paper = paperCm(setup);
  const clamp = (n: number) => round2(Math.min(MAX_MARGIN_CM, Math.max(0, Number.isFinite(n) ? n : 0)));
  const m = { top: clamp(margins.top), bottom: clamp(margins.bottom), left: clamp(margins.left), right: clamp(margins.right) };
  const fit = (a: 'top' | 'left', b: 'bottom' | 'right', room: number) => {
    const sum = m[a] + m[b];
    if (sum <= room) return;
    const k = room / sum;
    m[a] = Math.floor(m[a] * k * 100) / 100;
    m[b] = Math.floor(m[b] * k * 100) / 100;
  };
  fit('top', 'bottom', paper.height - MIN_TEXT_CM);
  fit('left', 'right', paper.width - MIN_TEXT_CM);
  const lowered = m.top !== margins.top || m.bottom !== margins.bottom || m.left !== margins.left || m.right !== margins.right;
  return { margins: m, lowered };
}

/** Which preset these margins are, or `custom`. */
export function presetOf(margins: Margins): MarginPreset | 'custom' {
  for (const [key, p] of Object.entries(MARGIN_PRESETS) as [MarginPreset, (typeof MARGIN_PRESETS)[MarginPreset]][]) {
    const q = p.margins;
    if (q.top === margins.top && q.bottom === margins.bottom && q.left === margins.left && q.right === margins.right) return key;
  }
  return 'custom';
}

/** A page setup from anything saved (a row's JSON, the account's default); what doesn't fit falls back. */
export function cleanPageSetup(raw: unknown): PageSetup {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof PageSetup, unknown>>;
  const size: PaperSize = r.size === 'letter' ? 'letter' : 'a4';
  const orientation: Orientation = r.orientation === 'landscape' ? 'landscape' : 'portrait';
  const numbers = PAGE_NUMBERS.some((n) => n.value === r.numbers) ? (r.numbers as PageNumbers) : DEFAULT_PAGE_SETUP.numbers;
  const gap = PAGE_GAPS.some((g) => g.value === r.gap) ? (r.gap as number) : DEFAULT_PAGE_SETUP.gap;
  const m = (r.margins && typeof r.margins === 'object' ? r.margins : {}) as Partial<Margins>;
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const d = DEFAULT_PAGE_SETUP.margins;
  const margins = fitMargins({ top: num(m.top, d.top), bottom: num(m.bottom, d.bottom), left: num(m.left, d.left), right: num(m.right, d.right) }, { size, orientation }).margins;
  return { size, orientation, margins, numbers, gap };
}

export const samePageSetup = (a: PageSetup, b: PageSetup) => JSON.stringify(cleanPageSetup(a)) === JSON.stringify(cleanPageSetup(b));

/** A page as the view draws it, in CSS px. */
export interface SheetGeometry {
  width: number;
  height: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  gap: number;
  numbers: PageNumbers;
}

const px = (cm: number) => Math.round(cm * PX_PER_CM * 10) / 10;

export function sheetGeometry(setup: PageSetup): SheetGeometry {
  const paper = paperCm(setup);
  return {
    width: px(paper.width),
    height: px(paper.height),
    marginTop: px(setup.margins.top),
    marginBottom: px(setup.margins.bottom),
    marginLeft: px(setup.margins.left),
    marginRight: px(setup.margins.right),
    gap: setup.gap,
    numbers: setup.numbers,
  };
}

/** The default page (A4, 2.54 cm margins): 793.7 × 1122.5 px. */
export const DEFAULT_SHEET = sheetGeometry(DEFAULT_PAGE_SETUP);
