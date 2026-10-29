/**
 * A graph's data (step 4.7d): what the graph block keeps and the rules for
 * it, shared by both editors and the data form. The drawing itself is the
 * charts module's (src/lib/charts, built separately); graph/charts.ts hands
 * it the spec made here.
 *
 * Cells keep what the student typed (text), so typing "3," or "-" is never
 * lost while the graph redraws at every key; numbers are read when the
 * graph is drawn, with a comma or a point for decimals ("3,5" = "3.5").
 */

export type GraphKind = 'bar' | 'line' | 'pie' | 'scatter';

export const GRAPH_KINDS: { kind: GraphKind; name: string }[] = [
  { kind: 'bar', name: 'Bar' },
  { kind: 'line', name: 'Line' },
  { kind: 'pie', name: 'Pie' },
  { kind: 'scatter', name: 'Scatter' },
];

/** The block's data: series names, then one row per label with a cell per series. */
export interface GraphData {
  kind: GraphKind;
  title: string;
  xLabel: string;
  yLabel: string;
  series: string[];
  rows: string[][];
}

/** SUMMARY-SPEC: at most 3 series. Rows and text are capped so the block stays small (it crosses to the iPhone). */
export const MAX_SERIES = 3;
export const MAX_ROWS = 50;
export const MAX_TEXT = 60;

/** A new graph: an example to replace at once (as Google Docs does). */
export const NEW_GRAPH: GraphData = {
  kind: 'bar',
  title: '',
  xLabel: '',
  yLabel: '',
  series: ['Series 1'],
  rows: [
    ['Item 1', '3'],
    ['Item 2', '5'],
    ['Item 3', '2'],
  ],
};

const isKind = (v: unknown): v is GraphKind => GRAPH_KINDS.some((k) => k.kind === v);
const text = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').slice(0, MAX_TEXT);

/** Any value (pasted HTML, an old version, the bridge) as valid graph data within the limits. */
export function cleanGraph(value: unknown): GraphData {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof GraphData, unknown>>;
  const series = (Array.isArray(v.series) ? v.series : []).slice(0, MAX_SERIES).map(text);
  if (!series.length) series.push('Series 1');
  const rows = (Array.isArray(v.rows) ? v.rows : []).slice(0, MAX_ROWS).map((row) => {
    const cells = Array.isArray(row) ? row : [];
    return Array.from({ length: series.length + 1 }, (_, i) => text(cells[i]));
  });
  return { kind: isKind(v.kind) ? v.kind : 'bar', title: text(v.title), xLabel: text(v.xLabel), yLabel: text(v.yLabel), series, rows };
}

/** A typed number: "3,5", "3.5", "-2", "1 200"; with both marks, the last one is the decimal one. Not a number: null. */
export function readNumber(cell: string): number | null {
  let s = cell.replace(/[\s ]/g, '');
  if (!s) return null;
  const comma = s.lastIndexOf(',');
  const point = s.lastIndexOf('.');
  if (comma >= 0 && point >= 0) s = comma > point ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** What the charts module draws (the interface 4.7d asks of it). */
export interface ChartSpec {
  kind: GraphKind;
  title: string;
  xLabel: string;
  yLabel: string;
  /** The first column: categories, or (scatter) x numbers as text. */
  labels: string[];
  /** One to three series; an empty or unreadable cell is null. */
  series: { name: string; values: (number | null)[] }[];
}

export interface GraphPlan {
  spec: ChartSpec;
  /** Something to draw: at least one number. */
  drawable: boolean;
  /** Said under the table: what the graph leaves out, and why. */
  notes: string[];
}

/** The spec for the drawing, and what the student should know about it. */
export function planGraph(data: GraphData): GraphPlan {
  const notes: string[] = [];
  let rows = data.rows;
  if (data.kind === 'scatter') {
    const kept = rows.filter((r) => readNumber(r[0] ?? '') !== null);
    const skipped = rows.filter((r) => r.some((c) => c.trim())).length - kept.length;
    if (skipped > 0) notes.push(`${skipped} ${skipped === 1 ? 'row' : 'rows'} skipped: X must be a number.`);
    rows = kept;
  }
  const series = (data.kind === 'pie' ? data.series.slice(0, 1) : data.series).map((name, i) => ({ name, values: rows.map((r) => readNumber(r[i + 1] ?? '')) }));
  if (data.kind === 'pie' && data.series.length > 1) notes.push('Pie uses the first series.');
  if (data.kind === 'pie' && series[0].values.some((n) => n !== null && n < 0)) notes.push('Pie leaves out negative numbers.');
  const drawable = series.some((s) => s.values.some((n) => n !== null));
  return { spec: { kind: data.kind, title: data.title, xLabel: data.xLabel, yLabel: data.yLabel, labels: rows.map((r) => r[0] ?? ''), series }, drawable, notes };
}

/**
 * Decimals with a comma (18,5) in the drawing (Lea, 29 Oct): when a number
 * in the graph was typed with one, or when the document is in Spanish
 * (`lang` is the page's language: the lecture's, else the account's).
 */
export function usesDecimalComma(data: GraphData, lang: string | null | undefined): boolean {
  if ((lang ?? '').toLowerCase().startsWith('es')) return true;
  const first = data.kind === 'scatter' ? 0 : 1;
  return data.rows.some((r) => r.slice(first).some((cell) => /\d,\d/.test(cell) && !cell.includes('.')));
}
