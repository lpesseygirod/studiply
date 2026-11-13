import { describeChart, renderChart, type ChartSpec as DrawnChart, type RenderOptions } from '../../lib/charts';
import { graphLine, LATER, readNumber, type ChartSpec, type FunctionMark, type GraphData, type ModelShift, type ModelTemplate } from './data';

/**
 * The graph block's door to the charts module (src/lib/charts, built on
 * branch charts-engine): the only file that knows its API. It turns the
 * block's table into the module's spec (named series of x/y points) and
 * never throws, so a bad cell can't break a document. The module escapes
 * every text it draws, gives the SVG its title and description for screen
 * readers, and leaves out (and notes) values it can't draw.
 *
 * The summary's kinds (function, model, stacked bar, histogram) go
 * to the module as the specs agreed in docs/charts-work-order-8.2.md. Until
 * that is merged the module throws "Unknown chart type" for them: a stacked
 * bar or a histogram is then drawn as bars (as before), a function or a
 * model graph is a line of text in its place (`graphLine`).
 */

/** The work order's specs for the new kinds (the module will export them; then this cast goes). */
type AgreedSpec =
  | (Omit<DrawnChart, 'type'> & { type: 'stackedBar' | 'histogram' })
  | { type: 'function'; title: string; xLabel?: string; yLabel?: string; expression: string; xRange: [number, number]; marks: FunctionMark[] }
  | { type: 'model'; title: string; template: ModelTemplate; shifts: ModelShift[] };
type AnySpec = DrawnChart | AgreedSpec;
const render = renderChart as unknown as (spec: AnySpec, options: RenderOptions) => string;
const describe = describeChart as unknown as (spec: AnySpec) => string;

function toDrawn(spec: ChartSpec): AnySpec {
  const title = spec.title.trim();
  const xLabel = spec.xLabel.trim() || undefined;
  const yLabel = spec.yLabel.trim() || undefined;
  if (spec.kind === 'function') {
    const f = spec.func ?? { expression: '', xRange: [-10, 10] as [number, number], marks: [] };
    return { type: 'function', title, xLabel, yLabel, expression: f.expression, xRange: f.xRange, marks: f.marks };
  }
  if (spec.kind === 'model') return { type: 'model', title, template: spec.model?.template ?? 'supplyDemand', shifts: spec.model?.shifts ?? [] };
  return {
    type: spec.kind,
    title,
    xLabel,
    yLabel,
    series: spec.series.map((s) => ({
      name: s.name.trim() || 'Series',
      points: spec.labels.flatMap((label, i) => {
        const y = s.values[i];
        if (y === null || y === undefined) return [];
        // Scatter's X is a number (rows without one were left out by planGraph).
        return [{ x: spec.kind === 'scatter' ? (readNumber(label) ?? 0) : label, y }];
      }),
    })),
  };
}

/** The module's answer for the spec: a kind it doesn't draw yet as bars when it has a table, else null. */
function withModule<T>(spec: ChartSpec, ask: (drawn: AnySpec) => T): T | null {
  const drawn = toDrawn(spec);
  try {
    return ask(drawn);
  } catch {
    // A kind it doesn't draw yet.
  }
  if (drawn.type !== 'stackedBar' && drawn.type !== 'histogram') return null;
  try {
    return ask({ ...drawn, type: 'bar' });
  } catch {
    return null;
  }
}

/** Whether the charts module draws this graph (a function or a model graph: once the work order is merged). */
export const canDraw = (spec: ChartSpec): boolean => withModule(spec, describe) !== null;

/** What stands in a graph's place while the module can't draw it: "Parábola: y = x^2 - 4 on [-5, 5] · drawn in a later update". */
export const laterLine = (data: GraphData): string => `${graphLine(data)} · ${LATER}`;

/**
 * The drawing's numbers with a decimal comma: "18.5" → "18,5", "12,000" →
 * "12.000". The module writes them with a point; only the SVG's text is
 * changed (between > and <), never its coordinates.
 */
export function commaDecimals(markup: string): string {
  const swap = (text: string) =>
    text.replace(/(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/g, (_m, int: string, dec: string | undefined) => int.replace(/,/g, '.') + (dec ? `,${dec.slice(1)}` : ''));
  return markup.replace(/>([^<]+)</g, (_m, text: string) => `>${swap(text)}<`);
}

/** About the page's proportions: wide graphs are lower, phone-wide ones no lower than this. */
const height = (width: number) => Math.round(Math.max(220, Math.min(400, width * 0.6)));

/**
 * Narrower than this (a phone), the graph is drawn at this width and scaled
 * down to fit (its SVG has a viewBox): labels like "2019" or "Tipo de
 * interés" then keep their line instead of breaking.
 */
const MIN_DRAW_WIDTH = 420;

/**
 * The graph as SVG for a page `width` px wide ('' when the module can't draw
 * it). `id` keeps two graphs in one document from sharing the SVG's pattern
 * ids; `comma`: decimals with a comma.
 */
export function graphMarkup(spec: ChartSpec, width: number, id = '', comma = false): string {
  const w = Math.round(Math.max(MIN_DRAW_WIDTH, width));
  const svg = withModule(spec, (drawn) => render(drawn, { theme: 'light', width: w, height: height(w), idPrefix: id ? `g-${id}` : undefined }));
  if (svg === null) return '';
  return comma ? commaDecimals(svg) : svg;
}

/** What a screen reader says for the graph (also in copied HTML); `data`'s line while the module can't draw it. */
export function graphDescription(spec: ChartSpec, comma = false, data?: GraphData): string {
  const text = withModule(spec, describe);
  if (text === null) return data ? laterLine(data) : 'Graph';
  return comma ? commaDecimals(`>${text}<`).slice(1, -1) : text;
}
