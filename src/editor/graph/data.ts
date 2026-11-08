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

/** The kinds the student picks in the form (4.7d). */
export type FormKind = 'bar' | 'line' | 'pie' | 'scatter';
/**
 * Step 8.2: kinds only a summary writes (SUMMARY-SPEC dataChart, functionPlot, modelGraph). The charts
 * module draws them once docs/charts-work-order-8.2.md is merged; until then graph/charts.ts says so.
 * Not in the form in 8.2 (advisor: regenerate-only for now).
 */
export type SummaryKind = 'stackedBar' | 'histogram' | 'function' | 'model';
export type GraphKind = FormKind | SummaryKind;

export const GRAPH_KINDS: { kind: FormKind; name: string }[] = [
  { kind: 'bar', name: 'Bar' },
  { kind: 'line', name: 'Line' },
  { kind: 'pie', name: 'Pie' },
  { kind: 'scatter', name: 'Scatter' },
];
const SUMMARY_KINDS: SummaryKind[] = ['stackedBar', 'histogram', 'function', 'model'];

/**
 * Whether the form edits a graph of this kind: its data is the table (the 4.7d kinds, and a summary's
 * stacked bars and histograms, which keep their kind unless she picks another). A function or a model
 * graph is written again by regenerating (8.2).
 */
export const hasTable = (kind: GraphKind) => kind !== 'function' && kind !== 'model';

/** Words in a graph's place while the charts module can't draw its kind (7.7's placeholder line). */
export const LATER = 'drawn in a later update';
export const TEMPLATE_NAMES: Record<ModelTemplate, string> = {
  supplyDemand: 'Supply and demand',
  islm: 'IS-LM',
  normalCurve: 'Normal curve',
  costCurves: 'Cost curves',
};

/** The graph in one line, for its place while it can't be drawn: "Parábola: y = x^2 - 4 on [-5, 5]", "Supply and demand (D → right)". */
export function graphLine(data: GraphData): string {
  const title = data.title.trim();
  if (data.kind === 'function' && data.func?.expression) {
    const [a, b] = data.func.xRange;
    return `${title || 'Graph'}: y = ${data.func.expression} on [${a}, ${b}]`;
  }
  if (data.kind === 'model' && data.model) return `${title || TEMPLATE_NAMES[data.model.template]}${data.model.shifts.map((s) => ` (${s.curve} → ${s.direction})`).join('')}`;
  return title || 'Graph';
}

export type FunctionMark = 'roots' | 'vertex' | 'extrema' | 'yIntercept';
export const FUNCTION_MARKS: FunctionMark[] = ['roots', 'vertex', 'extrema', 'yIntercept'];
export type ModelTemplate = 'supplyDemand' | 'islm' | 'normalCurve' | 'costCurves';
/** Each template's curves, by the ids the charts module draws (work order, section 1). */
export const MODEL_CURVES: Record<ModelTemplate, string[]> = {
  supplyDemand: ['D', 'S'],
  islm: ['IS', 'LM'],
  normalCurve: ['N'],
  costCurves: ['MC', 'ATC', 'AVC'],
};
export interface ModelShift {
  curve: string;
  direction: 'left' | 'right';
}

/** A curve as a summary names it (any language, "la curva de demanda", "CMg"), by its id. */
const CURVE_WORDS: Record<string, string> = {
  d: 'D', demand: 'D', demanda: 'D',
  s: 'S', supply: 'S', oferta: 'S',
  is: 'IS', lm: 'LM',
  n: 'N', normal: 'N', mean: 'N', media: 'N', mu: 'N', μ: 'N',
  mc: 'MC', cmg: 'MC', 'marginal cost': 'MC', 'coste marginal': 'MC', 'costo marginal': 'MC',
  atc: 'ATC', ac: 'ATC', ctme: 'ATC', ctm: 'ATC', 'average total cost': 'ATC', 'average cost': 'ATC', 'coste total medio': 'ATC', 'costo total medio': 'ATC', 'coste medio': 'ATC', 'costo medio': 'ATC',
  avc: 'AVC', cvme: 'AVC', cvm: 'AVC', 'average variable cost': 'AVC', 'coste variable medio': 'AVC', 'costo variable medio': 'AVC',
};

/** The template's id for a curve a summary named; null when the template has no such curve. */
export function curveId(template: ModelTemplate, name: string): string | null {
  const plain = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[′'’]/g, '')
    .replace(/\b(the|la|el|curva|curve|de|of)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const id = CURVE_WORDS[plain] ?? plain.toUpperCase();
  return MODEL_CURVES[template].includes(id) ? id : null;
}

/** y as an expression in x on a range, with the points to mark (kind 'function'). */
export interface FunctionData {
  expression: string;
  xRange: [number, number];
  marks: FunctionMark[];
}
/** A model graph's template and its curves' shifts (kind 'model'). */
export interface ModelData {
  template: ModelTemplate;
  shifts: ModelShift[];
}

/**
 * The block's data: series names, then one row per label with a cell per series; a function or a
 * model graph (8.2) carries its own data instead (its series and rows stay the defaults).
 */
export interface GraphData {
  kind: GraphKind;
  title: string;
  xLabel: string;
  yLabel: string;
  series: string[];
  rows: string[][];
  func?: FunctionData;
  model?: ModelData;
}

/** SUMMARY-SPEC: at most 3 series. Rows and text are capped so the block stays small (it crosses to the iPhone). */
export const MAX_SERIES = 3;
export const MAX_ROWS = 50;
export const MAX_TEXT = 60;
/** Step 8.2: a title is a summary's takeaway, a sentence ("Al 5 % anual, 1.000 € se convierten en 1.276 €…"). */
export const MAX_TITLE = 120;

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

const isKind = (v: unknown): v is GraphKind => GRAPH_KINDS.some((k) => k.kind === v) || SUMMARY_KINDS.includes(v as SummaryKind);
const text = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').slice(0, MAX_TEXT);
const obj = (v: unknown) => (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;

/** The work order's limit on an expression (the module refuses longer ones). */
export const MAX_EXPRESSION = 200;
/** The range a function is drawn on when it came without a usable one. */
export const DEFAULT_RANGE: [number, number] = [-10, 10];

/** Two finite numbers, from < to; else the default range. */
export function cleanRange(v: unknown): [number, number] {
  const [a, b] = (Array.isArray(v) ? v : []).map((n) => (typeof n === 'string' ? readNumber(n) : n));
  return typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b) && a < b && Math.abs(a) <= 1e6 && Math.abs(b) <= 1e6 ? [a, b] : [...DEFAULT_RANGE];
}

function cleanFunction(value: unknown): FunctionData {
  const v = obj(value);
  const marks = (Array.isArray(v.marks) ? v.marks : []).filter((m, i, all): m is FunctionMark => FUNCTION_MARKS.includes(m) && all.indexOf(m) === i);
  return { expression: typeof v.expression === 'string' ? v.expression.trim().slice(0, MAX_EXPRESSION) : '', xRange: cleanRange(v.xRange), marks };
}

function cleanModel(value: unknown): ModelData {
  const v = obj(value);
  const template = (Object.keys(MODEL_CURVES) as ModelTemplate[]).find((t) => t === v.template) ?? 'supplyDemand';
  const seen = new Set<string>();
  const shifts = (Array.isArray(v.shifts) ? v.shifts : []).flatMap((raw): ModelShift[] => {
    const s = obj(raw);
    const curve = String(s.curve ?? '');
    if (!MODEL_CURVES[template].includes(curve) || seen.has(curve) || (s.direction !== 'left' && s.direction !== 'right')) return [];
    seen.add(curve);
    return [{ curve, direction: s.direction }];
  });
  return { template, shifts };
}

/** Any value (pasted HTML, an old version, the bridge) as valid graph data within the limits. */
export function cleanGraph(value: unknown): GraphData {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof GraphData, unknown>>;
  const series = (Array.isArray(v.series) ? v.series : []).slice(0, MAX_SERIES).map(text);
  if (!series.length) series.push('Series 1');
  const rows = (Array.isArray(v.rows) ? v.rows : []).slice(0, MAX_ROWS).map((row) => {
    const cells = Array.isArray(row) ? row : [];
    return Array.from({ length: series.length + 1 }, (_, i) => text(cells[i]));
  });
  const kind = isKind(v.kind) ? v.kind : 'bar';
  return {
    kind,
    title: typeof v.title === 'string' ? v.title.slice(0, MAX_TITLE) : text(v.title),
    xLabel: text(v.xLabel),
    yLabel: text(v.yLabel),
    series,
    rows,
    ...(kind === 'function' && { func: cleanFunction(v.func) }),
    ...(kind === 'model' && { model: cleanModel(v.model) }),
  };
}

/** Lea, 6 Nov: a value read off a photo between its gridlines is written "≈7.5" (APPROX + the number). */
export const APPROX = '≈';

/**
 * A typed number: "3,5", "3.5", "-2", "1 200"; with both marks, the last one is the decimal one; an
 * approximate one ("≈7.5", "~7.5") as its number. Not a number: null.
 */
export function readNumber(cell: string): number | null {
  let s = cell.replace(/[\s ]/g, '');
  s = s.replace(/^[≈~]/, '');
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
  /** Kind 'function' / 'model' (8.2): what is drawn instead of the table. */
  func?: FunctionData;
  model?: ModelData;
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
  const plotted = data.kind === 'function' ? !!data.func?.expression : data.kind === 'model';
  const drawable = plotted || series.some((s) => s.values.some((n) => n !== null));
  const spec: ChartSpec = { kind: data.kind, title: data.title, xLabel: data.xLabel, yLabel: data.yLabel, labels: rows.map((r) => r[0] ?? ''), series };
  if (data.func) spec.func = data.func;
  if (data.model) spec.model = data.model;
  return { spec, drawable, notes };
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
